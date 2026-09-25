import { NextResponse } from "next/server";
import { generate, isProvider, ProviderError } from "@/lib/server/providers";
import { buildImproverMessage, JSON_RETRY_SUFFIX, parseImproverReply } from "@/lib/improver";
import { DEFAULT_IMPROVER_MAX_TOKENS, DEFAULT_META_PROMPT } from "@/lib/defaults";
import type { ImproveRequest, ImproveResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(req: Request) {
  let body: ImproveRequest;
  try {
    body = (await req.json()) as ImproveRequest;
  } catch {
    return NextResponse.json({ parsed: null, raw: "", error: "Invalid request body." } satisfies ImproveResponse, { status: 400 });
  }
  if (!isProvider(body.provider)) {
    return NextResponse.json({ parsed: null, raw: "", error: "Pick an improver provider." } satisfies ImproveResponse, { status: 400 });
  }

  const system = body.metaPrompt?.trim() ? body.metaPrompt : DEFAULT_META_PROMPT;
  const { message, included, excludedHoldout } = buildImproverMessage({
    ...body,
    testCases: Array.isArray(body.testCases) ? body.testCases : [],
    versionHistory: Array.isArray(body.versionHistory) ? body.versionHistory : [],
    overallContext: String(body.overallContext ?? ""),
    currentPrompt: String(body.currentPrompt ?? ""),
  });
  const settings = { temperature: null, maxTokens: body.maxTokens ?? DEFAULT_IMPROVER_MAX_TOKENS };

  if (process.env.NODE_ENV !== "production") {
    console.log(
      [
        "",
        "================ [prompt-lab] improver request ================",
        `provider: ${body.provider}   model: ${body.model}   max_tokens: ${settings.maxTokens}`,
        `rows sent: [${included.join(", ")}]   holdout rows excluded: [${excludedHoldout.join(", ")}]`,
        `system prompt: ${system.length} chars (meta-prompt)`,
        "---------------- user message ----------------",
        message,
        "================================================================",
      ].join("\n"),
    );
  }

  let raw = "";
  try {
    raw = (await generate(body.provider, body.model, system, message, settings)).text;
    let parsed = parseImproverReply(raw);
    if (!parsed) {
      if (process.env.NODE_ENV !== "production") console.log("[prompt-lab] improver reply was not valid JSON, retrying once");
      raw = (await generate(body.provider, body.model, system, message + JSON_RETRY_SUFFIX, settings)).text;
      parsed = parseImproverReply(raw);
    }
    return NextResponse.json({ parsed, raw, error: null } satisfies ImproveResponse);
  } catch (e) {
    const status = e instanceof ProviderError ? e.status : 500;
    return NextResponse.json({ parsed: null, raw, error: (e as Error).message } satisfies ImproveResponse, { status });
  }
}
