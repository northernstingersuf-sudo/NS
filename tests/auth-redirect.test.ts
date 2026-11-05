import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "../lib/auth-redirect";

test("bara interna sökvägar tillåts som mål", () => {
  assert.equal(safeNext("/konto"), "/konto");
  assert.equal(safeNext("/order/abc-123"), "/order/abc-123");
  for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "/a?b=c", "", null, undefined]) assert.equal(safeNext(bad as string), "/konto", String(bad));
});
