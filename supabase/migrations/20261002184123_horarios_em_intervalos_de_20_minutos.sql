create function private.validar_intervalo_horario_trigger()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.horario is not distinct from old.horario then
      return new;
    end if;
  end if;
  if new.horario is null
    or new.horario >= time '24:00'
    or extract(minute from new.horario)::integer % 20 <> 0
    or extract(second from new.horario) <> 0 then
    raise exception 'Escolha um horário em intervalos de 20 minutos (00, 20 ou 40).'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.validar_intervalo_horario_trigger() from public, anon, authenticated;
create trigger validar_intervalo_horario
before insert or update of horario on public.pedidos
for each row execute function private.validar_intervalo_horario_trigger();

-- Verify the real trigger without creating or modifying customer orders.
create temporary table verificacao_horario_20 (horario time, observacao text) on commit drop;
insert into verificacao_horario_20 values ('14:30', 'horário histórico');
create trigger verificar_intervalo_horario
before insert or update of horario on verificacao_horario_20
for each row execute function private.validar_intervalo_horario_trigger();
do $$
declare
  valor time;
begin
  foreach valor in array array[time '00:00', time '18:00', time '18:20', time '18:40', time '23:40'] loop
    insert into pg_temp.verificacao_horario_20 values (valor, 'teste');
  end loop;
  foreach valor in array array[time '18:10', time '18:30', time '18:20:01', time '24:00'] loop
    begin
      insert into pg_temp.verificacao_horario_20 values (valor, 'inválido');
      raise exception 'Horário inválido aceito: %', valor;
    exception when check_violation then
      null;
    end;
  end loop;
  update pg_temp.verificacao_horario_20 set horario = horario where horario = time '14:30';
  update pg_temp.verificacao_horario_20 set observacao = 'histórico preservado' where horario = time '14:30';
  begin
    update pg_temp.verificacao_horario_20 set horario = time '18:10' where horario = time '14:30';
    raise exception 'Alteração para horário inválido foi aceita';
  exception when check_violation then
    null;
  end;
end;
$$;
