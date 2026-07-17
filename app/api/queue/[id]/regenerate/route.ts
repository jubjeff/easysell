import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { generateUniqueMessage } from "@/lib/spin";
import { Lead, Template } from "@/lib/types";

export const dynamic = "force-dynamic";

/** POST: regenera a variação da mensagem deste item da fila. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const client = db();

  const { data: item } = await client
    .from("queue_items")
    .select("*, leads(*), templates(*), dispatch_sessions(campaign_id, chip_id)")
    .eq("id", params.id)
    .single();
  if (!item) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });

  // hashes já usados na sessão (exceto o próprio item)
  const { data: siblings } = await client
    .from("queue_items")
    .select("id, msg_hash")
    .eq("session_id", item.session_id);
  const usedHashes = new Set<string>(
    (siblings ?? []).filter((s) => s.id !== item.id).map((s) => s.msg_hash)
  );

  const { mensagem, hash } = generateUniqueMessage(
    item.templates as Template,
    item.leads as Lead,
    usedHashes
  );

  const { data: updated, error } = await client
    .from("queue_items")
    .update({ mensagem, msg_hash: hash, editada: false })
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const session = (item as any).dispatch_sessions;
  await client.from("message_logs").insert({
    lead_id: item.lead_id,
    queue_item_id: item.id,
    campaign_id: session?.campaign_id ?? null,
    chip_id: session?.chip_id ?? null,
    template_id: item.template_id,
    evento: "regenerada",
    texto: mensagem,
  });

  return NextResponse.json({ item: updated });
}
