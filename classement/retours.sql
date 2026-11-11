-- =====================================================================
--  MURAILLE — idées et bugs envoyés par les joueurs (Supabase)
--  À coller une seule fois dans Supabase : « SQL Editor » → « New query » → coller → « Run ».
--  Les joueurs peuvent seulement AJOUTER un message (ni lire, ni modifier, ni effacer).
--  Pour les lire : « Table Editor » → table « retours ».
-- =====================================================================
create table if not exists public.retours (
  id       bigint generated always as identity primary key,
  type     text        not null check (type in ('idee', 'bug')),
  texte    text        not null check (char_length(texte) between 1 and 4000),
  contexte jsonb       not null default '{}'::jsonb check (pg_column_size(contexte) <= 4000),
  cree_le  timestamptz not null default now()
);

alter table public.retours enable row level security;
drop policy if exists "ajout public" on public.retours;
create policy "ajout public" on public.retours for insert to anon with check (true);
-- (aucune règle de lecture : seuls vous, depuis le tableau de bord, voyez les messages)
