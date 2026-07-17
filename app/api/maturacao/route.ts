import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { getSettings } from "@/lib/limits";
import { maturationState } from "@/lib/maturacao";
import { withJsonError } from "@/lib/api";
import { Chip, MaturationDay } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET: chips em maturação com estado computado + registros diários. */
export const GET = withJsonError(async function GET() {
  const client = db();
  const [{ data: chips }, settings] = await Promise.all([
    client.from("chips").select("*").eq("maturando", true).order("created_at"),
    getSettings(),
  ]);

  const result = await Promise.all(
    ((chips ?? []) as Chip[]).map(async (chip) => {
      const { data: days } = await client
        .from("maturation_days")
        .select("*")
        .eq("chip_id", chip.id)
        .order("created_at");
      const list = (days ?? []) as MaturationDay[];
      return { ...chip, days: list, state: maturationState(chip, list, settings) };
    })
  );

  return NextResponse.json({ chips: result });
});
