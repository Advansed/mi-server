import { prisma } from "../db";
import { asBuffer, isGuid, toUniq, uniqFromSqlGuid } from "../guid";
import { asNumber } from "../json";

const GAS = Buffer.from("91E7B89A2A5AEBB311EEBE78B5E0602E", "hex");
const MAINTENANCE = Buffer.from("91E7B89A2A5AEBB311EEBE78B5E0602C", "hex");
const VDGO_A = Buffer.from("9EDA61F71DF81F1D41288070723330E8", "hex");
const VDGO_B = Buffer.from("AD75BC209B9CF28F4BDFD82806A8C187", "hex");

type LicRow = {
  id: unknown;
  code: string | null;
  name: string | null;
  address: string | null;
  client: unknown;
};

type CounterRow = {
  id: unknown;
  lc: unknown;
  code: string | null;
  name: string | null;
  number: string | null;
  tip: string | null;
  period: Date | null;
  indice: unknown;
  poverka: Date | null;
  diff: number | null;
  max_period: Date | null;
  max_indice: unknown;
};

type DebtRow = {
  lc: unknown;
  s_id: unknown;
  service: string | null;
  sum: unknown;
};

function sameBytes(left: unknown, right: Buffer) {
  try {
    return asBuffer(left).equals(right);
  } catch {
    return false;
  }
}

function hexOf(value: unknown) {
  return asBuffer(value).toString("hex").toUpperCase();
}

function shift1C(value: Date | null) {
  if (!value) return null;
  const next = new Date(value.getTime());
  next.setUTCFullYear(next.getUTCFullYear() - 2000);
  return next;
}

function format104(value: Date) {
  const dd = String(value.getUTCDate()).padStart(2, "0");
  const mm = String(value.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${value.getUTCFullYear()}`;
}

function predPeriod(value: Date) {
  const next = new Date(value.getTime());
  const day = next.getUTCDate();
  if (day === 1 || day === 2) next.setUTCDate(day - day);
  return format104(next);
}

function poverkaState(diff: number | null) {
  if (diff == null) return 2;
  if (diff > 6) return 0;
  if (diff > 3) return 1;
  if (diff > 0) return 3;
  return 2;
}

function pText(state: number, pData: string, strict: boolean) {
  if (state === 0) return "";
  const tail = strict
    ? "С даты истечения срока поверки объем потребляемого газа определяется в соответствии с нормативами потребления"
    : "С даты истечения срока поверки объем потребляемого газа определяется соответствии с нормативами потребления";
  if (state === 1 || state === 3) {
    return `Истекает срок поверки прибора учета газа ${pData}. Необходимо поверить или заменить. ${tail}`;
  }
  return `Истек срок поверки прибора учета газа ${pData}. Необходимо поверить или заменить. ${tail}`;
}

async function loadSide(ids: Buffer[]) {
  if (ids.length === 0) return { counters: [] as CounterRow[], debts: [] as DebtRow[] };
  const payload = JSON.stringify(ids.map((id) => id.toString("hex")));
  const [counters, debts] = await Promise.all([
    prisma.$queryRaw<CounterRow[]>`
      SELECT
        b1.id,
        b1.lc,
        b1.code,
        b1.name,
        b1.number,
        b1.tip,
        b1.period,
        b1.indice,
        b1.Poverka AS poverka,
        inter_vesta.dbo.date_diff(b1.Poverka) AS diff,
        t1.max_period,
        t1.max_indice
      FROM inter_vesta.dbo.t_counters b1
      INNER JOIN OPENJSON(${payload}) j
        ON b1.lc = CONVERT(binary(16), j.[value], 2)
      LEFT JOIN (
        SELECT counter, MAX(period) AS max_period, MAX(indice) AS max_indice
        FROM inter_vesta.dbo.t_indices
        GROUP BY counter
      ) t1 ON b1.id = t1.counter
      WHERE b1.active = 0x01
    `,
    prisma.$queryRaw<DebtRow[]>`
      SELECT d.lc, d.s_id, d.service, d.[sum] AS [sum]
      FROM inter_vesta.dbo.t_debts d
      INNER JOIN OPENJSON(${payload}) j
        ON d.lc = CONVERT(binary(16), j.[value], 2)
    `,
  ]);
  return { counters, debts };
}

function countersOf(rows: CounterRow[], licId: Buffer, strict: boolean) {
  return rows
    .filter((row) => sameBytes(row.lc, licId))
    .map((row) => {
      const useMax = row.max_period != null && row.period != null && row.max_period > row.period;
      const base = shift1C(useMax ? row.max_period : row.period);
      const state = poverkaState(row.diff == null ? null : Number(row.diff));
      const shown = shift1C(row.poverka);
      const pData = state <= 1 || !shown ? "" : format104(shown);
      return {
        counterId: hexOf(row.id),
        code: row.code,
        name: row.name,
        number: row.number,
        tip: row.tip,
        poverka: state,
        p_data: pData,
        p_text: pText(state, pData, strict),
        predIndice: asNumber(useMax ? row.max_indice : row.indice),
        predPeriod: base ? predPeriod(base) : null,
      };
    });
}

function debtsOf(rows: DebtRow[], licId: Buffer) {
  const own = rows.filter((row) => sameBytes(row.lc, licId));
  const buckets = new Map<string, { id: string; label: string; sum: number }>();
  const add = (id: Buffer, label: string, sum: number) => {
    const key = `${id.toString("hex")}|${label}`;
    const current = buckets.get(key);
    if (current) current.sum += sum;
    else buckets.set(key, { id: toUniq(id), label, sum });
  };

  for (const row of own) {
    const id = asBuffer(row.s_id);
    if (sameBytes(id, GAS) || sameBytes(id, MAINTENANCE)) continue;
    add(id, row.service ?? "", asNumber(row.sum) ?? 0);
  }
  add(GAS, "Газоснабжение природным газом", 0);
  for (const row of own) {
    if (!sameBytes(row.s_id, GAS)) continue;
    add(GAS, row.service ?? "", asNumber(row.sum) ?? 0);
  }
  add(MAINTENANCE, "Техническое обслуживание", 0);
  for (const row of own) {
    if (!sameBytes(row.s_id, MAINTENANCE)) continue;
    add(MAINTENANCE, row.service ?? "", asNumber(row.sum) ?? 0);
  }
  return [...buckets.values()];
}

async function enrich(lic: LicRow, counters: CounterRow[], debts: DebtRow[], idMode: "uniq" | "hex", strict: boolean) {
  const id = asBuffer(lic.id);
  const subscriberId = toUniq(id);
  const [agreements, tariffs, activeCount] = await Promise.all([
    prisma.t_agreements.findMany({ where: { subscriberId } }),
    prisma.t_tarifes.findMany({ where: { lic: subscriberId } }),
    Promise.resolve(counters.filter((row) => sameBytes(row.lc, id)).length),
  ]);
  const equips = tariffs.length
    ? await prisma.t_equipments.findMany({ where: { id: { in: tariffs.map((row) => row.equip) } } })
    : [];
  const equipById = new Map(equips.map((row) => [row.id, row]));
  const client = sameBytes(lic.client, VDGO_A) || sameBytes(lic.client, VDGO_B) ? "ВДГО" : "Газоснабжение";

  let notice: { type: string; label: string };
  if (lic.code === "10100130028") {
    notice = { type: "Уведомление", label: "не забудьте до 31.10.2025 перезаключить договор" };
  } else if (activeCount === 0) {
    notice = { type: "Напоминание", label: "Оплачивайте за газ своевременно" };
  } else {
    notice = { type: "Напоминание", label: "Не забывайте передать показания" };
  }

  return {
    id: idMode === "uniq" ? subscriberId : hexOf(id),
    code: lic.code,
    name: lic.name,
    address: lic.address,
    client,
    counters: countersOf(counters, id, strict),
    debts: debtsOf(debts, id),
    notice,
    agreements: agreements.map((row) => ({
      id: uniqFromSqlGuid(row.id),
      name: row.name,
      agreement_type: row.agreementType,
      service_name: row.serviceName,
      start_date: shift1C(row.startDate),
      end_date: row.endDate,
    })),
    equipments: tariffs.map((row) => {
      const equip = equipById.get(row.equip);
      return {
        equip_id: equip?.id ?? null,
        work_id: row.works,
        work: row.worksName,
        equipment: equip?.name ?? null,
        number: equip?.number ?? null,
        model: equip?.model ?? null,
        type: equip?.type ?? null,
        release_year: equip?.releaseDate ?? null,
        amount: (asNumber(row.amount) ?? 0) / 3,
        price: asNumber(row.tarif),
      };
    }),
  };
}

async function cards(lics: LicRow[], idMode: "uniq" | "hex", strict: boolean) {
  const ids = lics.map((lic) => asBuffer(lic.id));
  const { counters, debts } = await loadSide(ids);
  return Promise.all(lics.map((lic) => enrich(lic, counters, debts, idMode, strict)));
}

export async function accountByCode(code: string, idMode: "uniq" | "hex") {
  const rows = await prisma.$queryRaw<LicRow[]>`
    SELECT TOP 1 id, code, name, address_go AS address, client
    FROM inter_vesta.dbo.t_lics
    WHERE code = ${code}
  `;
  const lic = rows[0];
  if (!lic) return null;
  const [card] = await cards([lic], idMode, true);
  return card ?? null;
}

export async function accountsByIds(ids: Buffer[]) {
  if (ids.length === 0) return [];
  const payload = JSON.stringify(ids.map((id) => id.toString("hex")));
  const rows = await prisma.$queryRaw<LicRow[]>`
    SELECT b.id, b.code, b.name, b.address_go AS address, b.client
    FROM inter_vesta.dbo.t_lics b
    INNER JOIN OPENJSON(${payload}) j
      ON b.id = CONVERT(binary(16), j.[value], 2)
  `;
  return cards(rows, "hex", false);
}

export async function findLics(params: Record<string, unknown>) {
  const plotRaw = typeof params.plot === "string" ? params.plot.trim() : "";
  const addressRaw = typeof params.address === "string" ? params.address.trim() : "";
  const plot = plotRaw ? `%${plotRaw}%` : null;
  const address = addressRaw ? `%${addressRaw.replace(/\s+/g, "%")}%` : null;

  const rows = await prisma.$queryRaw<Array<{ code: string | null; address_go: string | null; plot: string | null }>>`
    SELECT code, address_go, plot
    FROM inter_vesta.dbo.t_lics
    WHERE (${plot} IS NULL OR plot LIKE ${plot})
      AND (${address} IS NULL OR address_go LIKE ${address})
  `;
  return { success: true, data: rows };
}

export async function licIdByCode(code: string) {
  const rows = await prisma.$queryRaw<Array<{ id: unknown }>>`
    SELECT TOP 1 id
    FROM inter_vesta.dbo.t_lics
    WHERE code = ${code}
  `;
  const id = rows[0]?.id;
  return id == null ? null : asBuffer(id);
}

export async function licCodeByRef(guid: string) {
  if (!isGuid(guid)) return "";
  const hex = toRef(guid).toString("hex");
  const rows = await prisma.$queryRaw<Array<{ code: string | null }>>`
    SELECT TOP 1 code
    FROM inter_vesta.dbo.t_lics
    WHERE id = CONVERT(binary(16), ${hex}, 2)
  `;
  return rows[0]?.code ?? "";
}
