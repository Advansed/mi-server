import { randomUUID } from "node:crypto";
import { findLogin } from "../auth";
import { prisma } from "../db";
import { isGuid } from "../guid";
import { asNumber } from "../json";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 3;
const hits = new Map<string, number[]>();

function allow(userId: string) {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    hits.set(userId, recent);
    return false;
  }
  recent.push(now);
  hits.set(userId, recent);
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

async function vtbPost(path: string, params: Record<string, string | number>) {
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

  const data = (await response.json()) as Record<string, unknown>;
  const errorCode = data.errorCode;
  if (errorCode != null && String(errorCode) !== "0") {
    const message = typeof data.errorMessage === "string" && data.errorMessage ? data.errorMessage : `ВТБ: код ${errorCode}`;
    throw new Error(message);
  }
  return data;
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

  if (!allow(user.id)) return { success: false, message: "Превышен лимит на создание оплат" };

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
      data: { id, invoiceId, userId: user.id, amount, orderId, payload, formUrl },
    });
    console.log(`[sbp] invoice=${invoiceId} user=${user.name ?? ""} amount=${amount} order=${orderId}`);
    return { success: true, data: { orderId, payload, renderedQr, formUrl } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[sbp] invoice=${invoiceId} failed ${message}`);
    return { success: false, message };
  }
}
