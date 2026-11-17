import { randomUUID } from "node:crypto";
import { findLogin } from "../auth";
import { prisma } from "../db";
import { isGuid } from "../guid";
import { asNumber, dateOnly, parseJson } from "../json";

const ACT_PREFIX: Record<string, string> = {
  actbr: "АКТ-01",
  actmr: "АКТ-02",
  actms: "АКТ-03",
  actplomb: "АКТ-04",
  actsf: "АКТ-05",
  actsge: "АКТ-06",
  actda: "АКТ-07",
  actmrr: "АКТ-08",
  actdo: "АКТ-09",
  predp: "АКТ-10",
  actaad: "АКТ-11",
  actwc: "АКТ-12",
};

const ACT_TITLE: Record<string, string> = {
  actbr: "Акт замены АКБ счетчика",
  actmi: "Акт установки газового счетчика",
  actmr: "Акт замены прибора учета",
  actplomb: "Акт пломбирования",
  actsf: "Акт снятия пломбы",
  actsge: "Акт снятия/ограничения подачи газа",
  actda: "Акт недопуска для проведения проверки (отключения)",
  actmrr: "Акт снятия показаний",
  actdo: "Акт наряд на отключение (Ф29Э)",
  predp: "Предписание",
  actaad: "Акт проверки газифицированного объекта (ААД)",
  actwc: "Акт выполненных работ",
  work_completed_to: "Акт выполненных работ ТО",
};

export async function nextActNumber(actType: string) {
  const prefix = ACT_PREFIX[actType] ?? "АКТ-00";
  const rows = await prisma.d_acts.findMany({
    where: { type: actType, actNumber: { startsWith: `${prefix}-` } },
    select: { actNumber: true },
  });
  let max = 0;
  for (const row of rows) {
    const n = Number.parseInt(row.actNumber.slice(7), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

function actPayload(row: {
  id: string;
  type: string;
  invoiceId: string;
  actNumber: string;
  actDate: Date;
  createdAt: Date;
  updatedAt: Date;
  status: string;
  title: string;
  documentScanPath: string | null;
  details: string | null;
}) {
  return {
    id: row.id,
    type: row.type,
    invoice_id: row.invoiceId,
    act_number: row.actNumber,
    act_date: dateOnly(row.actDate),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    status: row.status,
    title: row.title,
    document_scan_path: row.documentScanPath,
    details: parseJson(row.details),
  };
}

export async function getAct(params: Record<string, unknown>) {
  const user = await findLogin(params.token);
  if (!user) return { success: false, message: "Неверный токен" };

  if (isGuid(params.act_id)) {
    const row = await prisma.d_acts.findUnique({ where: { id: params.act_id.trim() } });
    if (!row) return { success: false, message: "Акт не найден" };
    return { success: true, data: actPayload(row) };
  }

  if (isGuid(params.invoice_id) && typeof params.act_type === "string" && params.act_type) {
    const order = await prisma.t_orders.findFirst({ where: { id: params.invoice_id.trim() } });
    if (!order) return { success: false, message: "Заказ не найден" };

    const agree = await prisma.t_agreements.findFirst({
      where: { subscriberId: order.licId },
      select: { id: true },
    });
    const tariffs = await prisma.t_tarifes.findMany({ where: { lic: order.licId } });
    const equipIds = tariffs.map((row) => row.equip);
    const equips = equipIds.length
      ? await prisma.t_equipments.findMany({ where: { id: { in: equipIds } } })
      : [];
    const equipById = new Map(equips.map((row) => [row.id, row]));
    const now = new Date();

    return {
      success: true,
      data: {
        type: params.act_type,
        invoice_id: order.id,
        act_number: await nextActNumber(params.act_type),
        act_date: dateOnly(now),
        created_at: now,
        updated_at: now,
        status: "draft",
        title: ACT_TITLE[params.act_type] ?? null,
        details: [
          {
            technician_name: user.name,
            technician_position: user.role,
            executor: user.id,
            owner_name: order.applicant,
            owner_phone: order.phone,
            object_address: order.address,
            object_type: "",
            agree: agree?.id ?? null,
            equipments: tariffs.map((row) => {
              const equip = equipById.get(row.equip);
              return {
                id: equip?.id ?? null,
                number: equip?.number ?? null,
                model: equip?.model ?? null,
                type: equip?.type ?? null,
                work: row.worksName,
                amount: asNumber(row.amount),
                tarif: asNumber(row.tarif),
              };
            }),
          },
        ],
      },
    };
  }

  return { success: false, message: "Недостаточно данных. Укажите act_id или invoice_id + act_type" };
}

export async function getActs(params: Record<string, unknown>) {
  const user = await findLogin(params.token);
  if (!user) return { success: false, message: "Неверный токен" };
  if (!isGuid(params.invoice_id)) return { success: true, data: [] };

  const rows = await prisma.d_acts.findMany({
    where: { invoiceId: params.invoice_id.trim() },
    orderBy: { createdAt: "desc" },
  });
  return {
    success: true,
    data: rows.map((row) => ({
      id: row.id,
      type: row.type,
      act_number: row.actNumber,
      act_date: dateOnly(row.actDate),
      status: row.status,
      title: row.title,
      created_at: row.createdAt,
    })),
  };
}

export async function setAct(params: Record<string, unknown>) {
  const user = await findLogin(params.token);
  if (!user) return { success: false, message: "Неверный токен" };

  const actType = typeof params.type === "string" ? params.type : "";
  const invoiceId = isGuid(params.invoice_id) ? params.invoice_id.trim() : "";
  const actNumber =
    typeof params.act_number === "string" && params.act_number
      ? params.act_number
      : await nextActNumber(actType);
  const actDate = params.act_date ? new Date(String(params.act_date)) : new Date();
  const details =
    params.details == null ? null : typeof params.details === "string" ? params.details : JSON.stringify(params.details);
  const now = new Date();

  try {
    const existing = isGuid(params.id)
      ? await prisma.d_acts.findUnique({ where: { id: params.id.trim() } })
      : null;

    const row = existing
      ? await prisma.d_acts.update({
          where: { id: existing.id },
          data: {
            actNumber,
            actDate,
            status: params.status == null ? existing.status : String(params.status),
            title: params.title == null ? existing.title : String(params.title),
            documentScanPath:
              params.document_scan_path == null ? existing.documentScanPath : String(params.document_scan_path),
            details,
            updatedAt: now,
          },
        })
      : await prisma.d_acts.create({
          data: {
            id: randomUUID(),
            type: actType,
            invoiceId,
            actNumber,
            actDate,
            createdAt: now,
            updatedAt: now,
            status: params.status == null ? "" : String(params.status),
            title: params.title == null ? "" : String(params.title),
            documentScanPath: params.document_scan_path == null ? null : String(params.document_scan_path),
            details,
          },
        });

    return { success: true, data: actPayload(row) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, message };
  }
}
