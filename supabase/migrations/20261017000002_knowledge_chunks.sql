-- Retrieval store for the assistant. Requires pgvector (enabled by default on Supabase).
create extension if not exists vector with schema extensions;

create table public.knowledge_chunks (
  id         bigint generated always as identity primary key,
  config_id  uuid references public.vehicle_configs on delete cascade,
  family_key text,  -- e.g. 'toyota:rav4:2019-2024' for items spanning years or trims
  kind       text not null check (kind in ('tsb', 'recall', 'complaint_cluster', 'manual', 'spec')),
  content    text not null,
  embedding  extensions.vector(1024),
  fts        tsvector generated always as (to_tsvector('english', content)) stored,
  source_url text,
  source_ref text,
  check (config_id is not null or family_key is not null)
);
create index on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index on public.knowledge_chunks using gin (fts);
create index on public.knowledge_chunks (config_id, kind);

alter table public.knowledge_chunks enable row level security;
create policy read_shared on public.knowledge_chunks for select to authenticated using (true);
