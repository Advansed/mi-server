const GUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isGuid(value: unknown): value is string {
  return typeof value === "string" && GUID_RE.test(value.trim());
}

export function asBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new Error("Ожидались байты GUID");
}

/** dbo.toRef: строка GUID 1С → binary(16). */
export function toRef(id: string): Buffer {
  const s = id.trim();
  const hex =
    s.slice(-17).slice(0, 4) +
    s.slice(-12) +
    s.slice(-22).slice(0, 4) +
    s.slice(0, 13).slice(-4) +
    s.slice(0, 8);
  return Buffer.from(hex, "hex");
}

/** dbo.toUniq: binary(16) → строка GUID 1С. */
export function toUniq(code: Buffer): string {
  const id = code.toString("hex").toUpperCase();
  const right = (n: number) => id.slice(-n);
  const left = (n: number) => id.slice(0, n);
  return [
    right(8),
    right(12).slice(0, 4),
    right(16).slice(0, 4),
    left(4),
    left(16).slice(-12),
  ].join("-");
}

/** uniqueidentifier SQL Server → байты, которые видит CONVERT(binary(16), guid). */
export function sqlGuidToBytes(guid: string): Buffer {
  const hex = guid.replace(/-/g, "");
  const b = Buffer.from(hex, "hex");
  const out = Buffer.alloc(16);
  out[0] = b[3]!;
  out[1] = b[2]!;
  out[2] = b[1]!;
  out[3] = b[0]!;
  out[4] = b[5]!;
  out[5] = b[4]!;
  out[6] = b[7]!;
  out[7] = b[6]!;
  b.copy(out, 8, 8, 16);
  return out;
}

/** dbo.toUniq от колонки uniqueidentifier. */
export function uniqFromSqlGuid(guid: string): string {
  return toUniq(sqlGuidToBytes(guid));
}
