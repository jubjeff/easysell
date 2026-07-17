import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Cliente server-only com service role. Nunca importe em componentes client. */
export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não configuradas. " +
          "No dev: .env.local. Na Vercel: Settings → Environment Variables " +
          "(depois de adicionar, faça Redeploy)."
      );
    }
    client = createClient(url, key, {
      auth: { persistSession: false },
      // Next.js App Router patches o fetch global e cacheia por padrão;
      // sem isso, consultas com filtro (.eq etc) podem devolver resultados
      // presos no cache mesmo com dynamic = "force-dynamic" na rota.
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    });
  }
  return client;
}
