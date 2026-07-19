import { db } from "./supabase";
import { ThumbStatus } from "./types";

const BUCKET = "demo-thumbnails";

/** Base da API de screenshot. Padrão ScreenshotOne; troque via env p/ outro provedor. */
function apiBase(): string {
  return process.env.SCREENSHOT_API_URL || "https://api.screenshotone.com/take";
}

/**
 * Monta a URL da API externa que devolve o PNG da página.
 * ScreenshotOne aceita `url`, `access_key` e flags de qualidade/limpeza.
 * Para outro provedor, ajuste esta função (o resto do fluxo é agnóstico).
 */
function buildShotUrl(target: string, key: string): string {
  const p = new URLSearchParams({
    access_key: key,
    url: target,
    format: "png",
    viewport_width: "1280",
    viewport_height: "800",
    device_scale_factor: "1",
    image_quality: "80",
    block_ads: "true",
    block_cookie_banners: "true",
    block_trackers: "true",
    cache: "true",
    cache_ttl: "2592000", // 30 dias — a URL da demo quase nunca muda
  });
  return `${apiBase()}?${p.toString()}`;
}

/**
 * Captura o screenshot da `url`, salva no Storage como `{demoId}.png` e
 * devolve a URL pública + status. Nunca lança: em qualquer falha (sem chave,
 * timeout, site fora, erro de upload) retorna status 'failed' para o admin
 * refazer — o card usa o placeholder do nicho, nunca ícone quebrado.
 */
export async function captureThumbnail(
  demoId: string,
  url: string
): Promise<{ thumbnail_url: string | null; thumbnail_status: ThumbStatus }> {
  const key = process.env.SCREENSHOT_API_KEY;
  if (!key) return { thumbnail_url: null, thumbnail_status: "failed" };

  try {
    // timeout defensivo: não deixa a rota do admin pendurar em site lento
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    const res = await fetch(buildShotUrl(url, key), {
      signal: ctrl.signal,
      cache: "no-store",
    }).finally(() => clearTimeout(timer));

    if (!res.ok) return { thumbnail_url: null, thumbnail_status: "failed" };
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0) return { thumbnail_url: null, thumbnail_status: "failed" };

    const path = `${demoId}.png`;
    const { error: upErr } = await db()
      .storage.from(BUCKET)
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (upErr) return { thumbnail_url: null, thumbnail_status: "failed" };

    const { data } = db().storage.from(BUCKET).getPublicUrl(path);
    // cache-buster: a URL do Storage é estável, mas o conteúdo troca ao recapturar
    const publicUrl = `${data.publicUrl}?v=${Date.now()}`;
    return { thumbnail_url: publicUrl, thumbnail_status: "ready" };
  } catch {
    return { thumbnail_url: null, thumbnail_status: "failed" };
  }
}

/** Validação leve de URL (formato). O "link ativo" real é aferido na captura. */
export function isValidHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
