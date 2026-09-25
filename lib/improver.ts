import type { ImproveParsed, ImproveRequest, ImproverTestCase } from "./types";

/* Pure helpers for the improver. Used server-side; kept free of server-only imports so they can be unit tested. */

function block(tag: string, text: string): string {
  return `<${tag}>\n${text}\n</${tag}>`;
}

function rating(r: ImproverTestCase["rating"]): string {
  return r ?? "unrated";
}

/** Build the improver's user message. Holdout rows are dropped here, whatever the client sent. */
export function buildImproverMessage(req: ImproveRequest): { message: string; included: number[]; excludedHoldout: number[] } {
  const cases = req.testCases.filter((c) => !c.holdout);
  const excludedHoldout = req.testCases.filter((c) => c.holdout).map((c) => c.row);

  const parts: string[] = [];

  parts.push(`# CURRENT_SYSTEM_PROMPT\n${block("current_system_prompt", req.currentPrompt || "(empty)")}`);
  parts.push(`# TARGET_MODEL\n${req.targetModel || "(unknown)"}`);
  parts.push(`# OVERALL_CONTEXT\n${block("overall_context", req.overallContext.trim() || "(none provided)")}`);

  const caseText = cases.map((c) => {
    const lines = [
      `## Row ${c.row}`,
      `Rating: ${rating(c.rating)}`,
      `Comment: ${c.comment.trim() || "(none)"}`,
      block("input", c.input),
      block("model_output", c.output),
    ];
    if (c.ideal != null) {
      lines.push("The user edited the output above into their ideal output. This is what they wanted instead:");
      lines.push(block("ideal_output", c.ideal));
    }
    return lines.join("\n");
  });
  parts.push(`# TEST_CASES\n${cases.length} test case(s).\n\n${caseText.join("\n\n") || "(none)"}`);

  const history = req.versionHistory.slice(-3);
  if (history.length) {
    const h = history.map((v) => {
      const comments = v.comments.filter((c) => !c.holdout && (c.comment.trim() || c.rating));
      return [
        `## v${v.version} (model: ${v.model || "unknown"})`,
        block("prompt", v.prompt),
        `Feedback: ${v.counts.good} good, ${v.counts.ok} ok, ${v.counts.bad} bad, ${v.counts.unrated} unrated.`,
        comments.length
          ? `Comments:\n${comments.map((c) => `- Row ${c.row} (${rating(c.rating)}): ${c.comment.trim() || "(no comment)"}`).join("\n")}`
          : "Comments: (none)",
        v.diagnosis.length ? `Diagnosed patterns:\n${v.diagnosis.map((d) => `- ${d}`).join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    });
    parts.push(`# VERSION_HISTORY\nOldest first. Do not reintroduce problems that were already fixed.\n\n${h.join("\n\n")}`);
  } else {
    parts.push(`# VERSION_HISTORY\n(none; this is the first version)`);
  }

  parts.push("Return only the JSON object described in your instructions.");

  return { message: parts.join("\n\n"), included: cases.map((c) => c.row), excludedHoldout };
}

export const JSON_RETRY_SUFFIX =
  "\n\n# IMPORTANT\nYour previous reply could not be parsed as JSON. Reply with ONLY one valid JSON object with the keys diagnosis, new_prompt, changes, risks and questions. No prose, no markdown code fences. Escape newlines inside strings as \\n.";

const toRows = (v: unknown): number[] =>
  Array.isArray(v) ? v.map((x) => Number(x)).filter((x) => Number.isFinite(x)) : [];
const toStr = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v));

/** Parse the improver's reply. Tolerates code fences and prose around the object. Returns null if unusable. */
export function parseImproverReply(raw: string): ImproveParsed | null {
  let t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1].includes("{")) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object" || typeof obj.new_prompt !== "string" || !obj.new_prompt.trim()) return null;

  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  return {
    new_prompt: obj.new_prompt,
    diagnosis: arr(obj.diagnosis).map((d) => {
      const o = (d ?? {}) as Record<string, unknown>;
      return { pattern: toStr(o.pattern), rows: toRows(o.rows), root_cause: toStr(o.root_cause) };
    }),
    changes: arr(obj.changes).map((c) => {
      const o = (c ?? {}) as Record<string, unknown>;
      return { change: toStr(o.change), reason: toStr(o.reason), rows: toRows(o.rows) };
    }),
    risks: arr(obj.risks).map(toStr).filter(Boolean),
    questions: arr(obj.questions).map(toStr).filter(Boolean),
  };
}
