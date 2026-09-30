-- Keep privileged implementations outside the API schema; expose narrow invoker wrappers.
alter function public.configuracao_publica() set schema private;
alter function public.disponibilidade() set schema private;
alter function public.administrar_pedido(uuid,integer,text,jsonb) set schema private;
alter function public.salvar_configuracao(jsonb) set schema private;
alter function public.excluir_dados_cliente(uuid) set schema private;
grant usage on schema private to anon;
create function public.configuracao_publica() returns jsonb language sql stable security invoker set search_path='' as $$select private.configuracao_publica();$$;
create function public.disponibilidade() returns jsonb language sql stable security invoker set search_path='' as $$select private.disponibilidade();$$;
create function public.administrar_pedido(p_id uuid,p_versao integer,p_acao text,p_dados jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.administrar_pedido(p_id,p_versao,p_acao,p_dados);$$;
create function public.salvar_configuracao(p_dados jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.salvar_configuracao(p_dados);$$;
create function public.excluir_dados_cliente(p_id uuid) returns void language sql security invoker set search_path='' as $$select private.excluir_dados_cliente(p_id);$$;
revoke all on function public.configuracao_publica(),public.disponibilidade(),public.administrar_pedido(uuid,integer,text,jsonb),public.salvar_configuracao(jsonb),public.excluir_dados_cliente(uuid) from public,anon,authenticated;
grant execute on function public.configuracao_publica(),public.disponibilidade() to anon,authenticated,service_role;
grant execute on function public.administrar_pedido(uuid,integer,text,jsonb),public.salvar_configuracao(jsonb),public.excluir_dados_cliente(uuid) to authenticated;
do $$declare t text;begin
 foreach t in array array['administrador','instalacao','limites_envio','requisicoes','cache_frete'] loop
 execute format('create policy acesso_somente_servidor on private.%I for all to anon,authenticated using(false) with check(false)',t);
 end loop;
end;$$;
