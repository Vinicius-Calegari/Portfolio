-- A operação não exige antecedência mínima: pedidos podem ser feitos para hoje.
update public.configuracoes
set dados = jsonb_set(
  jsonb_set(dados, '{antecedencia_min}', '0'::jsonb, true),
  '{versao}', to_jsonb(coalesce((dados->>'versao')::integer, 0) + 1), true
)
where id = true;

create or replace function private.validar_data(
  p_data date,
  p_config jsonb,
  p_excluir uuid default null,
  p_admin boolean default false
) returns void
language plpgsql
set search_path=''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  limite integer := (p_config->>'limite_dia')::integer;
begin
  perform pg_advisory_xact_lock(72419, p_data - date '2000-01-01');
  if p_data is null
    or p_data < hoje
    or p_data > hoje + (p_config->>'antecedencia_max')::integer
  then
    raise exception 'Data fora do prazo permitido.';
  end if;
  if exists(select 1 from public.datas_bloqueadas where data = p_data) then
    raise exception 'Essa data está indisponível.';
  end if;
  if limite is not null and (
    select count(*) from public.pedidos
    where data_entrega = p_data
      and status <> 'cancelado'
      and (p_excluir is null or id <> p_excluir)
  ) >= limite then
    raise exception 'Essa data atingiu o limite de encomendas.';
  end if;
end;
$$;
