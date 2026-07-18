import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { getSettings } from "@/lib/limits";
import { maturationState } from "@/lib/maturacao";
import { requireUser, scopeFilter } from "@/lib/auth";
import { withJsonError } from "@/lib/api";
import { Chip, MaturationDay } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET: chips em maturação do vendedor logado (admin vê todos) + estado. */
export const GET = withJsonError(async function GET() {
  const me = await requireUser();
  const scope = scopeFilter(me);
  const client = db();

  let q = client.from("chips").select("*").eq("maturando", true).order("created_at");
  if (scope) q = q.eq("vendedor_id", scope);
  const { data: chips } = await q;

  const result = await Promise.all(
    ((chips ?? []) as Chip[]).map(async (chip) => {
      const settings = await getSettings(chip.vendedor_id ?? me.id);
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
