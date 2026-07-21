-- ============================================================
-- EasySell / Tégui — Instagram Módulo 3: sessão assistida de DM
-- Aditiva. Reaproveita dispatch_sessions/queue_items (mesmo timer, mesma
-- lógica de fila) — só ensina o schema a aceitar conteúdo vindo de um
-- script de DM (demos.script_dm) em vez de um template de WhatsApp, e
-- sessão sem chip (Instagram não tem "chip"/número físico).
-- ============================================================

-- novo tipo de sessão (dispatch_sessions.chip_id já é nullable — nada a
-- mudar lá; sessão de DM nasce com chip_id = null)
alter type session_type add value if not exists 'instagram_dm';

-- queue_items precisa aceitar OU um template (WhatsApp) OU uma demo (DM)
alter table queue_items alter column template_id drop not null;
alter table queue_items add column if not exists demo_id uuid references demos(id);
alter table queue_items add constraint queue_items_content_chk
  check (template_id is not null or demo_id is not null);

-- limite diário de DM — conservador por padrão (sem histórico de risco
-- de ban ainda neste canal), configurável em Configurações por vendedor
alter table settings add column if not exists dm_limite_diario int not null default 15;
