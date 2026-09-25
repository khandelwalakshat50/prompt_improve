import { NextResponse } from "next/server";
import { availableProviders } from "@/lib/server/providers";

export const dynamic = "force-dynamic";

/** Lists providers that have a key in .env. Returns ids only, never keys. */
export async function GET() {
  return NextResponse.json({ providers: availableProviders() });
}
