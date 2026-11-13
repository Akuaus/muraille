-- =====================================================================
--  MURAILLE — sauvegarde en ligne de la progression (Supabase), ajouté le 13/11/2026
--  À coller une seule fois dans « SQL Editor ».
--  Chaque joueur a un code secret de 12 caractères (créé par le jeu). La table n'est PAS lisible directement :
--  on ne peut sauver ou charger une progression qu'avec son code, par les deux fonctions ci-dessous.
-- =====================================================================
create table if not exists public.sauvegardes (
  cle      text primary key check (cle ~ '^[A-Z0-9]{12}$'),
  pseudo   text not null default '' check (char_length(pseudo) <= 16),
  donnees  jsonb not null check (pg_column_size(donnees) <= 30000),
  maj      timestamptz not null default now()
);
alter table public.sauvegardes enable row level security;  -- aucune règle : aucun accès direct

create or replace function public.sauver_profil(p_cle text, p_pseudo text, p_donnees jsonb)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare t timestamptz := now();
begin
  insert into sauvegardes (cle, pseudo, donnees, maj) values (p_cle, left(coalesce(p_pseudo, ''), 16), p_donnees, t)
  on conflict (cle) do update set pseudo = excluded.pseudo, donnees = excluded.donnees, maj = t;
  return t;
end $$;

create or replace function public.charger_profil(p_cle text)
returns table (donnees jsonb, maj timestamptz) language sql security definer set search_path = public as $$
  select donnees, maj from sauvegardes where cle = p_cle
$$;

grant execute on function public.sauver_profil(text, text, jsonb) to anon;
grant execute on function public.charger_profil(text) to anon;
