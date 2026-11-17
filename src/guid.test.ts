import { expect, test } from "bun:test";
import { sqlGuidToBytes, toRef, toUniq, uniqFromSqlGuid } from "./guid";

test("toRef и toUniq взаимно обратны", () => {
  const source = "12345678-90AB-CDEF-1234-567890ABCDEF";
  expect(toUniq(toRef(source))).toBe(source);
});

test("toUniq от uniqueidentifier совпадает с раскладкой SQL Server", () => {
  const guid = "6F9619FF-8B86-D011-B42D-00C04FC964FF";
  expect(sqlGuidToBytes(guid).toString("hex").toUpperCase()).toBe("FF19696F868B11D0B42D00C04FC964FF");
  expect(uniqFromSqlGuid(guid)).toBe("4FC964FF-00C0-B42D-FF19-696F868B11D0");
});
