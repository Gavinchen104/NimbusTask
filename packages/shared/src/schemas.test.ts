import assert from "node:assert/strict";
import test from "node:test";
import { createTeamSchema } from "./schemas.js";

test("createTeamSchema accepts name", () => {
  const r = createTeamSchema.parse({ name: "Engineering" });
  assert.equal(r.name, "Engineering");
});
