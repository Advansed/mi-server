import { findLogin } from "../auth";
import { prisma, type Tx } from "../db";
import { isGuid } from "../guid";
import { asDate, asNumber, parseJson } from "../json";
import { licCodeByRef } from "../sql/vesta";

const NEW_ORDER_STATUS = "323A837E-9715-4A95-B63C-E44D57C461E2";

function orderView(row: {
  id: string;
  licId: string;
  number: string | null;
  date: Date | null;
  lic: string | null;
  applicant: string | null;
  phone: string | null;
  address: string | null;
  workType: string | null;
  executor: string;
  description: string | null;
  comment: string | null;
  works: string | null;
  statusEx: string | null;
  planDate: Date | null;
  completeDate: Date | null;
  parent_id: string | null;
}) {
  return {
    id: row.id,
    lic_id: row.licId,
    number: row.number,
    date: row.date,
    lic: row.lic,
    applicant: row.applicant,
    phone: row.phone,
    address: row.address,
    work_type_id: row.workType,
    executor: row.executor,
    description: row.description,
    comment: row.comment,
    works: parseJson(row.works),
    status: row.statusEx,
    plan_date: row.planDate,
    complete_date: row.completeDate,
    parent_id: row.parent_id,
  };
}

export async function listInvoices(token: string) {
  if (!isGuid(token)) return { success: false, message: "Не верный токен" };
  const user = await findLogin(token);
  if (!user) return { success: false, message: "Токен не найден или невалиден" };

  const rows = await prisma.t_orders.findMany({
    where: user.division ? { division: { contains: user.division } } : {},
    orderBy: { date: "desc" },
    take: 50,
  });
  return { success: true, data: rows.map(orderView) };
}

export async function listMpInvoices(params: Record<string, unknown>) {
  if (params.token == null) return { success: false, message: "Не верный токен" };
  const user = await findLogin(params.token);
  if (!user) return { success: false, message: "Токен не найден или невалиден" };

  const rows = await prisma.t_orders.findMany({
    where: { executor: user.id, statusEx: { in: ["Назначен", "В работе"] } },
    orderBy: { date: "desc" },
    take: 50,
  });
  return {
    success: true,
    data: rows.map((row) => ({
      id: row.id,
      lic_id: row.licId,
      number: row.number,
      date: row.date,
      applicant: row.applicant,
      phone: row.phone,
      address: { address: row.address, lat: asNumber(row.lat), lon: asNumber(row.lon) },
      lic: row.lic,
      service: row.description,
      status: row.statusEx,
      plan_date: row.planDate,
      complete_date: row.completeDate,
      comment: row.comment,
      works: parseJson(row.works),
      parent_id: row.parent_id,
    })),
  };
}

async function nextInvNumber(tx: Tx) {
  const rows = await tx.t_orders.findMany({
    where: { number: { startsWith: "СТГО-ТО" } },
    select: { number: true },
  });
  let max = 0;
  for (const row of rows) {
    if (!row.number || row.number.slice(0, 7) !== "СТГО-ТО") continue;
    const n = Number.parseInt(row.number.slice(8), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `СТГО-ТО-${String(max + 1).padStart(4, "0")}`;
}

export async function setInvoice(params: Record<string, unknown>) {
  if (params.token == null) return { success: false, message: "Не верный токен" };
  const user = await findLogin(params.token);
  if (!user) return { success: false, message: "Токен не найден или невалиден" };
  if (!isGuid(params.id) || !isGuid(params.lic_id)) {
    return { success: false, message: "Нет данных для обработки" };
  }

  const id = params.id.trim();
  const licId = params.lic_id.trim();
  const division = user.division || "";

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.t_orders.findUnique({ where: { id_licId: { id, licId } } });
      const works =
        params.works == null ? null : typeof params.works === "string" ? params.works : JSON.stringify(params.works);
      if (existing) {
        await tx.t_orders.update({
          where: { id_licId: { id, licId } },
          data: {
            applicant: params.applicant == null ? existing.applicant : String(params.applicant),
            phone: params.phone == null ? existing.phone : String(params.phone),
            address: params.address == null ? existing.address : String(params.address),
            lat: params.lat == null ? existing.lat : asNumber(params.lat),
            lon: params.lon == null ? existing.lon : asNumber(params.lon),
            description: params.service == null ? existing.description : String(params.service),
            comment: params.comment == null ? existing.comment : String(params.comment),
            works: works == null ? existing.works : works,
            workType: params.work_type_id == null ? existing.workType : String(params.work_type_id),
            planDate: params.plan_date == null ? existing.planDate : asDate(params.plan_date),
            division: user.division || existing.division,
            statusEx: params.status == null ? existing.statusEx : String(params.status),
            executor: params.executor == null ? existing.executor : String(params.executor),
          },
        });
      } else {
        await tx.t_orders.create({
          data: {
            id,
            licId,
            number: await nextInvNumber(tx),
            date: new Date(),
            applicant: params.applicant == null ? null : String(params.applicant),
            phone: params.phone == null ? null : String(params.phone),
            address: params.address == null ? null : String(params.address),
            lat: asNumber(params.lat),
            lon: asNumber(params.lon),
            lic: params.lic == null ? "" : String(params.lic),
            description: params.service == null ? null : String(params.service),
            comment: params.comment == null ? null : String(params.comment),
            works,
            workType: params.work_type_id == null ? null : String(params.work_type_id),
            status: NEW_ORDER_STATUS,
            planDate: asDate(params.plan_date),
            division,
            statusEx: params.status == null ? null : String(params.status),
            executor: String(params.executor ?? ""),
          },
        });
      }

      const queued = await tx.upd_orders.findUnique({ where: { id_licId: { id, licId } } });
      if (!queued) await tx.upd_orders.create({ data: { id, licId, action: 1 } });
    });
    return { success: true, message: "Данные успешно сохранены" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, message: message.replaceAll('"', '\\"') };
  }
}

export async function setInvAddress(params: Record<string, unknown>) {
  const user = params.token == null ? null : await findLogin(params.token);
  if (!user) return { success: false, message: "Не верный токен" };
  if (!isGuid(params.id)) return { success: false, message: "Заявка не найдена" };

  const found = await prisma.t_orders.findFirst({ where: { id: params.id.trim() } });
  if (!found) return { success: false, message: "Заявка не найдена" };

  await prisma.t_orders.updateMany({
    where: { id: params.id.trim() },
    data: {
      address: params.address == null ? undefined : String(params.address),
      lat: asNumber(params.lat),
      lon: asNumber(params.lon),
    },
  });
  return { success: true, message: "Заявка обновлена" };
}

export async function setInvWorker(params: Record<string, unknown>) {
  const user = params.token == null ? null : await findLogin(params.token);
  if (!user) return { success: false, message: "Не верный токен" };
  if (!isGuid(params.id)) return { success: false, message: "Заявка не найдена" };

  const found = await prisma.t_orders.findFirst({ where: { id: params.id.trim() } });
  if (!found) return { success: false, message: "Заявка не найдена" };

  const status = params.status == null ? null : String(params.status);
  await prisma.t_orders.updateMany({
    where: { id: params.id.trim() },
    data: {
      executor: params.worker == null ? undefined : String(params.worker),
      ...(status == null ? {} : isGuid(status) ? { status } : { statusEx: status }),
    },
  });
  return { success: true, message: "Заявка обновлена" };
}

export async function setInvLic(params: Record<string, unknown>) {
  const user = params.token == null ? null : await findLogin(params.token);
  if (!user) return { success: false, message: "Не верный токен" };
  if (!isGuid(params.id)) return { success: false, message: "Заявка не найдена" };

  const found = await prisma.t_orders.findFirst({ where: { id: params.id.trim() } });
  if (!found) return { success: false, message: "Заявка не найдена" };

  const code = isGuid(params.lic) ? await licCodeByRef(String(params.lic)) : "";
  await prisma.t_orders.updateMany({
    where: { id: params.id.trim() },
    data: { lic: code || "" },
  });
  return { success: true, message: "Заявка обновлена" };
}

export async function setMpInv(params: Record<string, unknown>) {
  if (params.token == null) return { success: false, message: "Не верный токен" };
  const user = await findLogin(params.token);
  if (!user) return { success: false, message: "Токен не найден или невалиден" };
  if (!isGuid(params.id)) return { success: false, message: "Заявка не найдена или доступ запрещен" };

  const found = await prisma.t_orders.findFirst({
    where: { id: params.id.trim(), executor: user.id },
  });
  if (!found) return { success: false, message: "Заявка не найдена или доступ запрещен" };

  const result = await prisma.t_orders.updateMany({
    where: { id: params.id.trim(), executor: user.id },
    data: {
      statusEx: params.status == null ? undefined : String(params.status),
      completeDate: params.complete_date == null ? undefined : asDate(params.complete_date) ?? undefined,
      completeText: params.complete_text == null ? undefined : String(params.complete_text),
    },
  });
  if (result.count > 0) return { success: true, message: "Заявка обновлена" };
  return { success: false, message: "Не удалось обновить заявку" };
}
