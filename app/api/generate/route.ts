import { NextResponse } from "next/server";
import { generate, parseGenerateRequest, ProviderError } from "@/lib/server/providers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const r = parseGenerateRequest(await req.json());
    const result = await generate(r.provider, r.model, r.system, r.user, r.settings);
    return NextResponse.json(result);
  } catch (e) {
    const status = e instanceof ProviderError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message || "Unknown error" }, { status });
  }
}
