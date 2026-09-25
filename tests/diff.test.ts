import { test } from "node:test";
import assert from "node:assert/strict";
import { lineDiff } from "../lib/diff.ts";

test("line diff marks adds and removals", () => {
  const d = lineDiff("a\nb\nc", "a\nx\nc\nd");
  assert.deepEqual(
    d.map((l) => `${l.type}:${l.text}`),
    ["same:a", "del:b", "add:x", "same:c", "add:d"],
  );
});
