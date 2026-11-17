import assert from "node:assert/strict";
import { test } from "node:test";
import { sqlGuidToBytes, toRef, toUniq, uniqFromSqlGuid } from "./guid";

test("toRef и toUniq взаимно обратны", () => {
  const source = "12345678-90AB-CDEF-1234-567890ABCDEF";
  assert.equal(toUniq(toRef(source)), source);
});

test("toUniq от uniqueidentifier совпадает с раскладкой SQL Server", () => {
  const guid = "6F9619FF-8B86-D011-B42D-00C04FC964FF";
  assert.equal(sqlGuidToBytes(guid).toString("hex").toUpperCase(), "FF19966F868B11D0B42D00C04FC964FF");
  assert.equal(uniqFromSqlGuid(guid), "4FC964FF-00C0-B42D-FF19-966F868B11D0");
});
