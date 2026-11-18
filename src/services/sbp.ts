import { randomUUID } from "node:crypto";
import { findLogin } from "../auth";
import { prisma } from "../db";
import { isGuid } from "../guid";
import { asNumber } from "../json";

const WINDOW_MS = 60_000;
const CREATE_LIMIT = 3;
const STATUS_LIMIT = 10;
const FINAL_STATUS = new Set([2, 3, 4, 6]);
const hits = new Map<string, number[]>();

function allow(userId: string, limit: number) {
  const now = Date.now();
  const key = `${userId}:${limit}`;
  const recent = (hits.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

function vtbConfig() {
  const baseUrl = process.env.VTB_URL?.replace(/\/$/, "") ?? "";
  const userName = process.env.VTB_USER ?? "";
  const password = process.env.VTB_PASS ?? "";
  const returnUrl = process.env.VTB_RETURN_URL ?? "";
  const failUrl = process.env.VTB_FAIL_URL ?? "";
  if (!baseUrl || !userName || !password || !returnUrl || !failUrl) {
    throw new Error("Не заданы параметры ВТБ");
  }
  return { baseUrl, userName, password, returnUrl, failUrl };
}

function vtbMessage(data: Record<string, unknown>, fallback: string) {
  const action = typeof data.actionCodeDescription === "string" ? data.actionCodeDescription.trim() : "";
  const message = typeof data.errorMessage === "string" ? data.errorMessage.trim() : "";
  return action || message || fallback;
}

async function vtbCall(path: string, params: Record<string, string | number>) {
  const { baseUrl, userName, password } = vtbConfig();
  const body = new URLSearchParams({ userName, password });
  for (const [key, value] of Object.entries(params)) body.set(key, String(value));

  const response = await fetch(`${baseUrl}/${path.replace(/^\//, "")}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`ВТБ ответил HTTP ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}

async function vtbPost(path: string, params: Record<string, string | number>) {
  const data = await vtbCall(path, params);
  const errorCode = data.errorCode;
  if (errorCode != null && String(errorCode) !== "0") throw new Error(vtbMessage(data, `ВТБ: код ${errorCode}`));
  return data;
}

function paymentView(row: { id: string; orderId: string; amount: { toNumber?: () => number } | number; status: number | null; error: string | null }) {
  const amount = typeof row.amount === "number" ? row.amount : row.amount.toNumber?.() ?? Number(row.amount);
  return { id: row.id, orderId: row.orderId, amount, status: row.status, error: row.error };
}

export async function createSbpPayment(params: Record<string, unknown>) {
  const user = await findLogin(params.token);
  if (!user) return { success: false, message: "Неверный токен" };

  const invoiceId = isGuid(params.invoice_id) ? params.invoice_id.trim() : "";
  if (!invoiceId) return { success: false, message: "Не указана заявка" };

  const amount = asNumber(params.amount);
  const kopecks = amount == null ? 0 : Math.round(amount * 100);
  if (amount == null || amount <= 0 || kopecks < 1) return { success: false, message: "Неверная сумма" };

  const order = await prisma.t_orders.findFirst({ where: { id: invoiceId }, select: { id: true } });
  if (!order) return { success: false, message: "Заявка не найдена" };

  if (!allow(user.id, CREATE_LIMIT)) return { success: false, message: "Превышен лимит на создание оплат" };

  const description =
    typeof params.description === "string" && params.description.trim() ? params.description.trim() : "Оплата работ";
  const id = randomUUID();

  try {
    const { returnUrl, failUrl } = vtbConfig();
    const registered = await vtbPost("register.do", {
      orderNumber: id,
      amount: kopecks,
      returnUrl,
      failUrl,
      description,
      currency: 643,
      language: "ru",
    });
    const orderId = typeof registered.orderId === "string" ? registered.orderId : "";
    if (!orderId) throw new Error("ВТБ не вернул номер заказа");

    const qr = await vtbPost("sbp/c2b/qr/dynamic/get.do", { mdOrder: orderId });
    const payload = typeof qr.payload === "string" ? qr.payload : "";
    const formUrl = typeof qr.formUrl === "string" ? qr.formUrl : null;
    const renderedQr = typeof qr.renderedQr === "string" ? qr.renderedQr : null;
    if (!payload) throw new Error("ВТБ не вернул ссылку СБП");

    await prisma.t_payments.create({
      data: { id, invoiceId, userId: user.id, amount, orderId, payload, formUrl, status: 0, error: null },
    });
    console.log(`[sbp] invoice=${invoiceId} user=${user.name ?? ""} amount=${amount} order=${orderId}`);
    return { success: true, data: { orderId, payload, renderedQr, formUrl } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[sbp] invoice=${invoiceId} failed ${message}`);
    return { success: false, message };
  }
}

export async function checkSbpStatus(params: Record<string, unknown>) {
  const user = await findLogin(params.token);
  if (!user) return { success: false, message: "Неверный токен" };

  const invoiceId = isGuid(params.invoice_id) ? params.invoice_id.trim() : "";
  if (!invoiceId) return { success: false, message: "Не указана заявка" };

  const rows = await prisma.t_payments.findMany({
    where: { invoiceId },
    orderBy: { createdAt: "desc" },
  });
  if (rows.length === 0) return { success: false, message: "Оплата не найдена" };

  const pending = rows.filter((row) => row.status == null || !FINAL_STATUS.has(row.status));
  if (pending.length === 0) return { success: true, data: rows.map(paymentView) };
  if (!allow(user.id, STATUS_LIMIT)) return { success: false, message: "Превышен лимит на проверку оплат" };

  for (const row of pending) {
    try {
      const data = await vtbCall("getOrderStatusExtended.do", { orderId: row.orderId });
      const errorCode = data.errorCode;
      if (errorCode != null && String(errorCode) !== "0") {
        await prisma.t_payments.update({
          where: { id: row.id },
          data: { error: vtbMessage(data, `ВТБ: код ${errorCode}`), updatedAt: new Date() },
        });
        continue;
      }
      const status = asNumber(data.orderStatus);
      if (status == null) {
        await prisma.t_payments.update({
          where: { id: row.id },
          data: { error: "ВТБ не вернул статус заказа", updatedAt: new Date() },
        });
        continue;
      }
      const failed = status === 3 || status === 6;
      await prisma.t_payments.update({
        where: { id: row.id },
        data: {
          status,
          error: failed ? vtbMessage(data, status === 6 ? "Оплата отклонена" : "Оплата отменена") : null,
          updatedAt: new Date(),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`[sbp] status invoice=${invoiceId} order=${row.orderId} failed ${message}`);
      await prisma.t_payments.update({
        where: { id: row.id },
        data: { error: message, updatedAt: new Date() },
      });
    }
  }

  const fresh = await prisma.t_payments.findMany({
    where: { invoiceId },
    orderBy: { createdAt: "desc" },
  });
  return { success: true, data: fresh.map(paymentView) };
}
