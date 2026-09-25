import { NextResponse, type NextRequest } from "next/server";
import { isProvider, listModels, ProviderError } from "@/lib/server/providers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider");
  if (!isProvider(provider)) return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  try {
    return NextResponse.json({ models: await listModels(provider) });
  } catch (e) {
    const status = e instanceof ProviderError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
