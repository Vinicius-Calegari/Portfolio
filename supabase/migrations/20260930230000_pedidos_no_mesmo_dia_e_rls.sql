-- Permite pedidos para o mesmo dia e reforça validação de horário no servidor.
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
  minimo integer := case when p_admin then 0 else greatest(coalesce((p_config->>'antecedencia_min')::integer, 0), 0) end;
begin
  perform pg_advisory_xact_lock(72419, p_data - date '2000-01-01');
  if p_data is null
    or p_data < hoje + minimo
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

create or replace function private.validar_horario_publico(p_data date, p_horario time)
returns void
language plpgsql
stable
set search_path=''
as $$
declare
  agora_local timestamp := now() at time zone 'America/Sao_Paulo';
begin
  if p_data is null or p_horario is null then
    raise exception 'Escolha data e horário.';
  end if;
  if (p_data::timestamp + p_horario) <= agora_local then
    raise exception 'Escolha um horário que ainda não passou.';
  end if;
end;
$$;

create or replace function private.validar_pedido_horario_trigger()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.origem = 'site' then
    perform private.validar_horario_publico(new.data_entrega, new.horario);
  end if;
  return new;
end;
$$;

drop trigger if exists validar_horario_pedido_publico on public.pedidos;
create trigger validar_horario_pedido_publico
before insert or update of data_entrega, horario on public.pedidos
for each row execute function private.validar_pedido_horario_trigger();

drop policy if exists admin_leitura on public.datas_bloqueadas;
