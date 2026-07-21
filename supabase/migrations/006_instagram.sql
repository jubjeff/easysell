-- ============================================================
-- EasySell / Tégui — Instagram: captação manual + rastreamento de origem
-- Aditiva. Escopo desta migration: campos em `leads` + script de DM em
-- `demos`. Fila/sessão de DM (Módulo 3) vem em migration própria depois.
-- ============================================================

-- canal de marketing (distinto de `source`, que é o MECANISMO de
-- importação — places/csv/manual). `origem` é de ONDE o lead veio,
-- pro dashboard de performance por canal (Módulo 2).
do $$ begin
  create type lead_origem as enum ('google', 'instagram', 'manual');
exception when duplicate_object then null; end $$;

-- qual canal usar para abordar este lead especificamente
do $$ begin
  create type canal_contato as enum ('whatsapp', 'instagram_dm');
exception when duplicate_object then null; end $$;

alter table leads add column if not exists origem lead_origem not null default 'manual';
alter table leads add column if not exists instagram_handle text;
alter table leads add column if not exists tem_whatsapp_na_bio boolean not null default false;
alter table leads add column if not exists canal_contato_ativo canal_contato not null default 'whatsapp';

-- backfill: leads que já existem viram 'google' se vieram do Places,
-- 'manual' nos demais casos (csv/manual) — ponto de partida razoável
-- para o dashboard de performance por origem não nascer distorcido
update leads set origem = 'google' where source = 'places';

-- leads só-Instagram não têm telefone — a coluna precisa aceitar nulo
-- (o índice único já convive bem com múltiplos nulos, nada a mudar nele)
alter table leads alter column telefone drop not null;

-- dedupe de perfil (case-insensitive), evita capturar o mesmo @ 2x
create unique index if not exists leads_instagram_handle_uq
  on leads (lower(instagram_handle)) where instagram_handle is not null;

create index if not exists leads_origem_idx on leads (origem);

-- script de DM por nicho: reaproveita `demos` (já é 1 linha por nicho,
-- com unique constraint) em vez de criar tabela paralela
alter table demos add column if not exists script_dm text;
