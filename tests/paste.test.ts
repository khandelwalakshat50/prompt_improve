import { test } from "node:test";
import assert from "node:assert/strict";
import { splitPaste } from "../lib/paste.ts";

test("single-line paste behaves normally", () => {
  assert.equal(splitPaste("hello world"), null);
});

test("10 lines fill 10 rows, empty lines dropped", () => {
  const text = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n\n");
  const items = splitPaste(text)!;
  assert.equal(items.length, 10);
  assert.equal(items[9], "line 10");
});

test("--- splits into multi-line blocks", () => {
  const items = splitPaste("a1\na2\n---\nb1\n\nb2\n  ---  \nc1\r\nc2\n")!;
  assert.deepEqual(items, ["a1\na2", "b1\n\nb2", "c1\nc2"]);
});

test("multi-line paste that collapses to one item is a normal paste", () => {
  assert.equal(splitPaste("only\n\n"), null);
});
