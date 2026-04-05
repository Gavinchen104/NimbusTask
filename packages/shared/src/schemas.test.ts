import assert from "node:assert/strict";
import test from "node:test";
import {
  createTeamSchema,
  createTaskSchema,
  patchTaskSchema,
} from "./schemas.js";

test("createTeamSchema accepts name", () => {
  const r = createTeamSchema.parse({ name: "Engineering" });
  assert.equal(r.name, "Engineering");
});

test("createTaskSchema defaults status", () => {
  const r = createTaskSchema.parse({
    projectId: "550e8400-e29b-41d4-a716-446655440000",
    title: "Ship feature",
  });
  assert.equal(r.title, "Ship feature");
});

test("patchTaskSchema rejects empty object", () => {
  assert.throws(() => patchTaskSchema.parse({}));
});
