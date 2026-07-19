-- ============================================================
-- EasySell / Tégui — Aba Demos (biblioteca de demonstrações por nicho)
-- Aditiva e não-destrutiva. RLS no mesmo padrão de config compartilhada
-- (templates/campaigns): todo logado LÊ, só o admin ESCREVE.
-- ============================================================

-- estado da captura automática de thumbnail
do $$ begin
  create type thumb_status as enum ('pending','ready','failed');
exception when duplicate_object then null; end $$;

create table if not exists demos (
  id                   uuid primary key default gen_random_uuid(),
  nicho                text not null,                 -- mesma taxonomia de leads/campaigns
  url                  text not null,
  script_padrao        text not null default '',      -- suporta a variável {nome_negocio}
  ativo                boolean not null default true,  -- inativa some pro vendedor, fica no histórico
  ordem                int not null default 0,         -- reordenação manual do admin (independe do uso)
  contador_copias      int not null default 0,         -- +1 a cada "Copiar link"
  thumbnail_url        text,                           -- URL pública do Storage (nunca a da API externa)
  thumbnail_status     thumb_status not null default 'pending',
  thumbnail_updated_at timestamptz,
  criado_por           uuid references profiles(id) on delete set null,
  editado_por          uuid references profiles(id) on delete set null,  -- histórico simples: quem
  atualizado_em        timestamptz not null default now(),               -- histórico simples: quando
  created_at           timestamptz not null default now()
);

-- lista do vendedor: só ativas, ordenadas
create index if not exists demos_ordem_idx on demos (ativo, ordem);
-- uma demo por nicho (case-insensitive) — reaproveita a taxonomia, sem duplicar
create unique index if not exists demos_nicho_uq on demos (lower(nicho));

-- incremento atômico do contador (evita corrida entre vendedores copiando ao mesmo tempo)
create or replace function bump_demo_copias(demo_id uuid) returns void as $$
  update demos set contador_copias = contador_copias + 1 where id = demo_id;
$$ language sql;

-- ---- RLS: idêntico a templates/campaigns (todo logado lê, admin escreve) ----
alter table demos enable row level security;
drop policy if exists demos_read  on demos;
drop policy if exists demos_write on demos;
create policy demos_read  on demos for select to authenticated using (true);
create policy demos_write on demos for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---- Storage: bucket público para as thumbnails ({demo_id}.png) ----
-- Público para leitura (a URL vive nos cards); escrita só via service_role (ignora RLS).
insert into storage.buckets (id, name, public)
  values ('demo-thumbnails', 'demo-thumbnails', true)
  on conflict (id) do nothing;
