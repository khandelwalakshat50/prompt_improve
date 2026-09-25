import { test } from "node:test";
import assert from "node:assert/strict";
import { buildImproverMessage, parseImproverReply } from "../lib/improver.ts";
import type { ImproveRequest } from "../lib/types.ts";

const req: ImproveRequest = {
  provider: "openai",
  model: "m",
  maxTokens: 1000,
  metaPrompt: "",
  currentPrompt: "Be brief.",
  targetModel: "openai/gpt-x",
  overallContext: "Outputs are too long.",
  testCases: [
    { row: 1, input: "IN-ONE", output: "OUT-ONE", ideal: null, rating: "good", comment: "nice", holdout: false },
    { row: 2, input: "HOLDOUT-SECRET-INPUT", output: "HOLDOUT-SECRET-OUTPUT", ideal: null, rating: "bad", comment: "HOLDOUT-COMMENT", holdout: true },
    { row: 3, input: "IN-THREE", output: "OUT-THREE", ideal: "IDEAL-THREE", rating: "bad", comment: "", holdout: false },
  ],
  versionHistory: [1, 2, 3, 4].map((n) => ({
    version: n,
    prompt: `PROMPT-V${n}`,
    model: "x",
    counts: { good: 1, ok: 0, bad: 1, unrated: 0 },
    comments: [
      { row: 1, rating: "bad" as const, comment: `c${n}`, holdout: false },
      { row: 2, rating: "bad" as const, comment: `HOLDOUT-HIST-${n}`, holdout: true },
    ],
    diagnosis: [],
  })),
};

test("holdout rows never appear in the improver message", () => {
  const { message, included, excludedHoldout } = buildImproverMessage(req);
  assert.deepEqual(included, [1, 3]);
  assert.deepEqual(excludedHoldout, [2]);
  assert.ok(!message.includes("HOLDOUT"), "holdout content leaked");
  assert.ok(message.includes("IDEAL-THREE") && message.includes("OUT-THREE"));
});

test("only the last 3 versions are included in history", () => {
  const { message } = buildImproverMessage(req);
  assert.ok(!message.includes("PROMPT-V1"));
  assert.ok(message.includes("PROMPT-V2") && message.includes("PROMPT-V4"));
});

test("parses fenced JSON with surrounding prose", () => {
  const raw = 'Sure!\n```json\n{"diagnosis":[{"pattern":"too long","rows":[1,"3"],"root_cause":"no limit"}],"new_prompt":"P2","changes":[],"risks":["r"],"questions":[]}\n```';
  const p = parseImproverReply(raw)!;
  assert.equal(p.new_prompt, "P2");
  assert.deepEqual(p.diagnosis[0].rows, [1, 3]);
  assert.deepEqual(p.risks, ["r"]);
});

test("returns null for invalid JSON or missing new_prompt", () => {
  assert.equal(parseImproverReply("not json"), null);
  assert.equal(parseImproverReply('{"diagnosis":[]}'), null);
});
