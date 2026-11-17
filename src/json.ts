const GUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isDecimal(value: object): value is { toNumber: () => number } {
  return "toNumber" in value && typeof (value as { toNumber?: unknown }).toNumber === "function";
}

/** Приводит значения Prisma к JSON, близкому к FOR JSON SQL Server. */
export function toJsonValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) {
    return value.toISOString().replace(/\.\d{3}Z$/, "");
  }
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object" && value !== null && isDecimal(value)) {
    return value.toNumber();
  }
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) continue;
      out[key] = toJsonValue(item);
    }
    return out;
  }
  if (typeof value === "string" && GUID_RE.test(value)) return value.toUpperCase();
  return value;
}

export function parseJson(value: string | null | undefined): unknown {
  if (value == null || value === "") return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function asNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object" && value !== null && isDecimal(value)) return value.toNumber();
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function asDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dateOnly(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}
