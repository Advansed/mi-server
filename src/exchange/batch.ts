import { prisma, type Tx } from "../db";
import { isGuid } from "../guid";
import { asDate, asNumber, dateOnly, parseJson } from "../json";

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function batchRows(body: unknown): Row[] {
  if (Array.isArray(body)) return body.filter(isRow);
  if (isRow(body) && Array.isArray(body.data)) return body.data.filter(isRow);
  if (isRow(body)) {
    const copy = { ...body };
    delete copy.key;
    delete copy.exchange_key;
    delete copy.token;
    return [copy];
  }
  return [];
}

function actionOf(row: Row) {
  const value = Number(row.action);
  return Number.isFinite(value) ? value : null;
}

function guidOf(value: unknown) {
  return isGuid(value) ? value.trim() : null;
}

function dedupe(rows: Row[], key: (row: Row) => string | null) {
  const ranked = [...rows].sort((a, b) => (actionOf(b) ?? -1) - (actionOf(a) ?? -1));
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const row of ranked) {
    const id = key(row);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

function saved() {
  return { error: false, message: "Данные записаны" };
}

function failed(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { error: true, message };
}

export async function insOrders(body: unknown) {
  const rows = batchRows(body).flatMap((row): Row[] => {
    const id = guidOf(row.id);
    const licId = guidOf(row.lic_id);
    if (!id || !licId) return [];
    return [{ ...row, id, lic_id: licId }];
  });

  try {
    await prisma.$transaction(async (tx) => {
      const drop = rows.filter((row) => actionOf(row) === 0);
      if (drop.length) {
        await tx.t_orders.deleteMany({
          where: { OR: drop.map((row) => ({ id: String(row.id), licId: String(row.lic_id) })) },
        });
      }
      for (const row of rows) {
        const action = actionOf(row);
        if (action !== 1 && action !== 2) continue;
        const id = String(row.id);
        const licId = String(row.lic_id);
        const data = {
          number: row.number == null ? null : String(row.number),
          date: asDate(row.date),
          division: row.division == null ? "" : String(row.division),
          lic: row.lic == null ? null : String(row.lic),
          applicant: row.applicant == null ? null : String(row.applicant),
          phone: row.phone == null ? null : String(row.phone),
          address: row.address == null ? null : String(row.address),
          executor: guidOf(row.executor) ?? "",
          status: guidOf(row.status),
          description: row.description == null ? null : String(row.description),
          planDate: asDate(row.plan_date),
          completeDate: asDate(row.complete_date),
          works: row.works == null ? null : typeof row.works === "string" ? row.works : JSON.stringify(row.works),
          workType: guidOf(row.work_type),
          parent_id: guidOf(row.parent_id),
        };
        const existing = await tx.t_orders.findUnique({ where: { id_licId: { id, licId } } });
        if (!existing) {
          await tx.t_orders.create({ data: { id, licId, ...data } });
        } else {
          await tx.t_orders.update({ where: { id_licId: { id, licId } }, data });
        }
      }
    });
    return saved();
  } catch (err) {
    return failed(err);
  }
}

function textOf(value: unknown) {
  return value == null ? null : String(value);
}

export async function insInvoices(body: unknown) {
  const rows = batchRows(body).flatMap((row): Row[] => {
    const id = guidOf(row.id);
    const licId = guidOf(row.lic_id);
    if (!id || !licId) return [];
    return [{ ...row, id, lic_id: licId }];
  });

  try {
    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const id = String(row.id);
        const licId = String(row.lic_id);
        const data = {
          number: textOf(row.number),
          date: asDate(row.date),
          division: textOf(row.division),
          lic: textOf(row.lic),
          applicant: textOf(row.applicant),
          status: textOf(row.status),
          address: textOf(row.address),
          description: textOf(row.description),
          planDate: asDate(row.plan_date),
        };
        const existing = await tx.t_invoices.findUnique({ where: { id_licId: { id, licId } } });
        if (!existing) {
          await tx.t_invoices.create({ data: { id, licId, ...data } });
        } else {
          await tx.t_invoices.update({ where: { id_licId: { id, licId } }, data });
        }
      }
    });
    return saved();
  } catch (err) {
    return failed(err);
  }
}

export async function insLogins(body: unknown) {
  const rows = batchRows(body).filter((row) => guidOf(row.id));
  if (rows.length === 0) return { error: true, message: "Нет данных для обработки" };

  try {
    await prisma.$transaction(async (tx) => {
      const drop = rows.filter((row) => String(row.action) === "0").map((row) => String(guidOf(row.id)));
      if (drop.length) await tx.t_logins.deleteMany({ where: { id: { in: drop } } });

      const keep = rows.filter((row) => String(row.action) === "1" || String(row.action) === "2");
      for (const row of keep) {
        const id = String(guidOf(row.id));
        if (row.name == null || row.role == null) continue;
        const existing = await tx.t_logins.findUnique({ where: { id } });
        if (!existing) {
          await tx.t_logins.create({
            data: {
              id,
              name: String(row.name),
              role: String(row.role),
              password: "123456",
              division: row.division == null ? null : String(row.division),
            },
          });
        }
      }
      for (const row of keep) {
        const id = String(guidOf(row.id));
        await tx.t_logins.updateMany({
          where: { id },
          data: {
            name: row.name == null ? undefined : String(row.name),
            role: row.role == null ? undefined : String(row.role),
            division: row.division == null ? undefined : String(row.division),
          },
        });
      }
    });
    return saved();
  } catch (err) {
    return failed(err);
  }
}

async function replaceSimple(
  rows: Row[],
  apply: (tx: Tx, row: Row, action: number) => Promise<void>,
) {
  try {
    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const action = actionOf(row);
        if (action == null) continue;
        await apply(tx, row, action);
      }
    });
    return saved();
  } catch (err) {
    return failed(err);
  }
}

export async function insWorks(body: unknown) {
  const rows = dedupe(batchRows(body), (row) => guidOf(row.id));
  return replaceSimple(rows, async (tx, row, action) => {
    const id = guidOf(row.id);
    if (!id) return;
    const existing = action === 2 ? await tx.t_works.findUnique({ where: { id }, select: { division: true } }) : null;
    if (action === 0 || action === 2) await tx.t_works.deleteMany({ where: { id } });
    if (action === 1 || action === 2) {
      await tx.t_works.create({
        data: {
          id,
          code: row.code == null ? null : String(row.code),
          name: String(row.name ?? ""),
          price: asNumber(row.price) ?? 0,
          division: existing?.division ?? null,
        },
      });
    }
  });
}

export async function insWorkTypes(body: unknown) {
  const rows = batchRows(body).filter((row) => guidOf(row.id));
  try {
    await prisma.$transaction(async (tx) => {
      const ids = rows.map((row) => String(guidOf(row.id)));
      const kept = rows.filter((row) => {
        const action = actionOf(row);
        return action === 1 || action === 2;
      });
      const keptIds = kept.map((row) => String(guidOf(row.id)));
      const previous = keptIds.length
        ? await tx.t_work_types.findMany({ where: { id: { in: keptIds } }, select: { id: true, division: true } })
        : [];
      const divisionById = new Map(previous.map((row) => [row.id.toLowerCase(), row.division]));
      if (ids.length) await tx.t_work_types.deleteMany({ where: { id: { in: ids } } });
      for (const row of kept) {
        const id = String(guidOf(row.id));
        await tx.t_work_types.create({
          data: {
            id,
            code: row.code == null ? null : String(row.code),
            name: row.name == null ? null : String(row.name),
            division: divisionById.get(id.toLowerCase()) ?? null,
          },
        });
      }
    });
    return saved();
  } catch (err) {
    return failed(err);
  }
}

export async function insAgreements(body: unknown) {
  const rows = dedupe(batchRows(body), (row) => guidOf(row.id));
  return replaceSimple(rows, async (tx, row, action) => {
    const id = guidOf(row.id);
    if (!id) return;
    const data = {
      name: String(row.name ?? ""),
      subscriberId: String(guidOf(row.subscriber_id) ?? ""),
      personId: String(guidOf(row.person_id) ?? ""),
      startDate: asDate(row.start_date) ?? new Date(0),
      endDate: asDate(row.end_date) ?? new Date(0),
      agreementType: String(row.agreement_type ?? ""),
      agreementVariant: String(row.agreement_variant ?? ""),
      serviceName: String(row.service_name ?? ""),
    };
    if (action === 2) {
      await tx.t_agreements.updateMany({ where: { id }, data });
    }
    if (action === 1) {
      const existing = await tx.t_agreements.findUnique({ where: { id } });
      if (!existing) await tx.t_agreements.create({ data: { id, ...data } });
    }
  });
}

export async function insEquipments(body: unknown) {
  const rows = dedupe(batchRows(body), (row) => guidOf(row.id));
  return replaceSimple(rows, async (tx, row, action) => {
    const id = guidOf(row.id);
    if (!id) return;
    if (action === 3) {
      await tx.t_equipments.deleteMany({ where: { id } });
      return;
    }
    const data = {
      lc: String(guidOf(row.lc) ?? ""),
      code: row.code == null ? null : String(row.code),
      name: row.name == null ? null : String(row.name),
      number: row.number == null ? null : String(row.number),
      releaseDate: asDate(row.release_date),
      type: row.type == null ? null : String(row.type),
      model: row.model == null ? null : String(row.model),
    };
    if (action === 2) await tx.t_equipments.updateMany({ where: { id }, data });
    if (action === 1) {
      const existing = await tx.t_equipments.findUnique({ where: { id } });
      if (!existing) await tx.t_equipments.create({ data: { id, ...data } });
    }
  });
}

export async function insTarifes(body: unknown) {
  const rows = batchRows(body);
  try {
    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const lic = guidOf(row.lic);
        const agree = guidOf(row.agree);
        const equip = guidOf(row.equip);
        const works = guidOf(row.works);
        if (!lic || !agree || !equip || !works) continue;
        await tx.t_tarifes.deleteMany({ where: { lic, agree, equip, works } });
        const action = actionOf(row);
        if (action !== 1 && action !== 2) continue;
        await tx.t_tarifes.create({
          data: {
            period: asDate(row.period) ?? new Date(0),
            lic,
            agree,
            agreeName: row.agree_name == null ? null : String(row.agree_name),
            equip,
            equipName: row.equip_name == null ? null : String(row.equip_name),
            works,
            worksName: String(row.works_name ?? ""),
            amount: asNumber(row.amount),
            tarif: asNumber(row.tarif),
          },
        });
      }
    });
    return saved();
  } catch (err) {
    return failed(err);
  }
}

const ACT_EXPORT: Record<string, string> = {
  "01": "actbr",
  "02": "actmr",
  "03": "actms",
  "04": "actplomb",
  "05": "actsf",
  "06": "actsge",
  "07": "actda",
  "08": "actmrr",
  "09": "actdo",
  "10": "predp",
  "11": "actaad",
  "12": "actwc",
  "13": "work_completed_to",
};

function unposted(value: Uint8Array | Buffer | null) {
  if (!value || value.length === 0) return true;
  return value[0] === 0;
}

function workIdOf(works: string | null) {
  const value = parseJson(works);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = (value as { id?: unknown }).id;
  if (id == null || typeof id === "object") return null;
  return String(id);
}

export async function exInvoices(body: unknown) {
  const keys = batchRows(body).flatMap((row) => {
    const id = guidOf(row.id);
    const licId = guidOf(row.lic_id);
    return id && licId ? [{ id, licId }] : [];
  });

  if (keys.length) {
    await prisma.upd_orders.deleteMany({
      where: { OR: keys.map((key) => ({ id: key.id, licId: key.licId })) },
    });
  }

  const queue = await prisma.upd_orders.findMany({ take: 50 });
  if (queue.length === 0) return { success: true, data: [] };

  const orders = await prisma.t_orders.findMany({
    where: { OR: queue.map((row) => ({ id: row.id, licId: row.licId })) },
    take: 50,
  });
  return {
    success: true,
    data: orders.map((row) => ({
      id: row.id,
      lic_id: row.licId,
      number: row.number,
      date: row.date,
      lic: row.lic,
      applicant: row.applicant,
      status: row.statusEx,
      phone: row.phone,
      address: row.address,
      executor: row.executor,
      work_type: row.workType,
      description: row.description,
      comment: row.comment,
      works: parseJson(row.works),
      plan_date: row.planDate,
      complete_date: row.completeDate,
      parent_id: row.parent_id,
    })),
  };
}

export async function exActs(body: unknown) {
  const source = isRow(body) ? body : {};
  const ids = Array.isArray(source.data)
    ? source.data.flatMap((item) => (isRow(item) && guidOf(item.id) ? [String(guidOf(item.id))] : []))
    : [];
  if (ids.length) {
    await prisma.d_acts.updateMany({
      where: { id: { in: ids } },
      data: { posted: Buffer.from([1]) },
    });
  }

  const actCode = source.act == null || source.act === "" ? null : String(source.act);
  const typeFilter = actCode == null ? undefined : (ACT_EXPORT[actCode] ?? "");
  const rows = await prisma.d_acts.findMany({
    where: typeFilter === undefined ? {} : { type: typeFilter },
    orderBy: { actDate: "desc" },
  });
  const acts = rows.filter((row) => unposted(row.posted)).slice(0, 10);
  const invoiceIds = [...new Set(acts.map((row) => row.invoiceId))];
  const orders = invoiceIds.length
    ? await prisma.t_orders.findMany({
        where: { id: { in: invoiceIds } },
        select: { id: true, works: true },
      })
    : [];
  const workByInvoice = new Map<string, string | null>();
  for (const order of orders) {
    const key = order.id.toLowerCase();
    if (!workByInvoice.has(key)) workByInvoice.set(key, workIdOf(order.works));
  }
  const data = acts.map((row) => ({
    id: row.id,
    act_number: row.actNumber,
    act_date: dateOnly(row.actDate),
    status: row.status,
    invoice_id: row.invoiceId,
    work_id: workByInvoice.get(row.invoiceId.toLowerCase()) ?? null,
    title: row.title,
    details: parseJson(row.details),
  }));
  return { success: true, data };
}
