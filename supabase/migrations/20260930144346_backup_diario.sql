create extension if not exists pg_cron with schema pg_catalog;
create table private.backups (id uuid primary key default gen_random_uuid(),criado_em timestamptz not null default now(),dados jsonb not null);
alter table private.backups enable row level security;
create policy backups_restritos on private.backups for all to anon,authenticated using(false) with check(false);

create function private.exportar_dados() returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('formato','salgados-rosilene-v1','gerado_em',now(),
 'produtos',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.produtos x),
 'clientes',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.clientes x),
 'pedidos',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.pedidos x),
 'grupos_pedido',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.grupos_pedido x),
 'itens_pedido',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.itens_pedido x),
 'eventos_pedido',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.eventos_pedido x),
 'configuracoes',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.configuracoes x),
 'datas_bloqueadas',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.datas_bloqueadas x));
$$;
create function private.backup_diario() returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 insert into private.backups(dados) values(private.exportar_dados()) returning id into result;
 delete from private.backups where criado_em<now()-interval '14 days';
 return result;
end;$$;
create function private.backup_admin(p_exportar boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.e_admin() then raise exception 'Acesso restrito.';end if;
 if p_exportar then return private.exportar_dados();end if;
 return (select jsonb_build_object('ultimo',max(criado_em),'copias',count(*),'retencao_dias',14,'horario','03:00 (Brasília)','local','interno') from private.backups);
end;$$;
revoke all on function private.exportar_dados(),private.backup_diario(),private.backup_admin(boolean) from public,anon,authenticated;
grant execute on function private.backup_admin(boolean) to authenticated;
create function public.backup_admin(p_exportar boolean default false) returns jsonb language sql security invoker set search_path='' as $$select private.backup_admin(p_exportar);$$;
revoke all on function public.backup_admin(boolean) from public,anon;
grant execute on function public.backup_admin(boolean) to authenticated;
select cron.schedule('rosilene-backup-diario','0 6 * * *','select private.backup_diario()');
select private.backup_diario();
