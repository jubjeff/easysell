-- ============================================================
-- EasySell / Tégui — Migração multi-vendedor (Módulo A)
-- Não-destrutiva: só adiciona estrutura. RLS é habilitado em
-- passo separado (003) após criar o admin e fazer o backfill.
-- ============================================================

-- 1. PROFILES — estende auth.users (1:1)
create table if not exists profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  nome                 text not null,
  role                 text not null default 'vendedor' check (role in ('admin','vendedor')),
  whatsapp_numero      text,
  comissao_percentual  numeric(5,2) not null default 0,
  ativo                boolean not null default true,
  created_at           timestamptz not null default now()
);

-- 2. COMMISSION_RULES — faixas de comissão (vendedor_id null = regra padrão)
create table if not exists commission_rules (
  id           uuid primary key default gen_random_uuid(),
  vendedor_id  uuid references profiles(id) on delete cascade,
  valor_min    numeric(10,2) not null default 0,
  valor_max    numeric(10,2),                 -- null = sem teto
  percentual   numeric(5,2) not null,
  created_at   timestamptz not null default now()
);

-- 3. COMMISSIONS — 1 registro por venda fechada
create table if not exists commissions (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references leads(id) on delete cascade,
  vendedor_id     uuid not null references profiles(id) on delete cascade,
  valor_venda     numeric(10,2) not null,
  percentual      numeric(5,2) not null,
  valor_comissao  numeric(10,2) not null,
  status          text not null default 'a_pagar' check (status in ('a_pagar','pago')),
  fechado_em      timestamptz not null default now(),
  pago_em         timestamptz,
  unique (lead_id)
);
create index if not exists commissions_vendedor_idx on commissions (vendedor_id, status);

-- 4. Colunas novas em tabelas existentes (aditivas)
alter table leads             add column if not exists vendedor_id uuid references profiles(id) on delete set null;
alter table leads             add column if not exists valor_venda numeric(10,2);
alter table chips             add column if not exists vendedor_id uuid references profiles(id) on delete cascade;
alter table dispatch_sessions add column if not exists vendedor_id uuid references profiles(id) on delete cascade;
alter table message_logs      add column if not exists vendedor_id uuid references profiles(id) on delete set null;

create index if not exists leads_vendedor_idx    on leads (vendedor_id, stage);
create index if not exists chips_vendedor_idx    on chips (vendedor_id);
create index if not exists sessions_vendedor_idx on dispatch_sessions (vendedor_id);
create index if not exists msg_logs_vendedor_idx on message_logs (vendedor_id, evento);

-- 5. SETTINGS deixa de ser singleton (id=1) e passa a ser 1 linha por vendedor
alter table settings drop constraint if exists settings_id_check;
create sequence if not exists settings_id_seq owned by settings.id;
alter table settings alter column id set default nextval('settings_id_seq');
select setval('settings_id_seq', greatest((select coalesce(max(id),1) from settings), 1));
alter table settings add column if not exists vendedor_id uuid references profiles(id) on delete cascade;
create unique index if not exists settings_vendedor_uq on settings (vendedor_id);
