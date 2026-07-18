import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { db } from "./supabase";
import { Profile } from "./types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Erro de autenticação/autorização que withJsonError converte no status certo. */
export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/**
 * Cliente Supabase com a sessão do usuário logado (respeita RLS).
 * Use em rotas de vendedor para que o Postgres barre acesso cruzado.
 */
export function supabaseSession() {
  const store = cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(list) {
        // Em Server Components o store é read-only; ignoramos (o middleware
        // já cuida de refrescar os cookies de sessão).
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* noop */
        }
      },
    },
  });
}

/** Usuário autenticado (auth.users) ou null. */
export async function getUser() {
  const {
    data: { user },
  } = await supabaseSession().auth.getUser();
  return user;
}

/** Perfil do usuário logado (nome, role, comissão…) ou null. */
export async function getProfile(): Promise<Profile | null> {
  const user = await getUser();
  if (!user) return null;
  const { data } = await db().from("profiles").select("*").eq("id", user.id).single();
  return (data as Profile) ?? null;
}

/** Exige usuário logado e ativo. Lança AuthError caso contrário. */
export async function requireUser(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) throw new AuthError("Não autenticado.", 401);
  if (!profile.ativo) throw new AuthError("Conta desativada. Fale com o admin.", 403);
  return profile;
}

/** Exige que o usuário logado seja admin. */
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireUser();
  if (profile.role !== "admin") throw new AuthError("Acesso restrito ao admin.", 403);
  return profile;
}

/**
 * Escopo de leitura/escrita por vendedor: admin enxerga tudo, vendedor só o
 * que é dele. Retorna o vendedor_id a filtrar (ou null = sem filtro, admin).
 */
export function scopeFilter(profile: Profile): string | null {
  return profile.role === "admin" ? null : profile.id;
}
