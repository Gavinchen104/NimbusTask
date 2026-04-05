import assert from "node:assert/strict";
import test from "node:test";
import { json } from "./http.js";

test("json serializes body", () => {
  const r = json(200, { ok: true });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body, '{"ok":true}');
});
