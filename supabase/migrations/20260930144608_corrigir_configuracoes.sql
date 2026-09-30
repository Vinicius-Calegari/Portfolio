create or replace function private.salvar_configuracao(p_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb;x jsonb;n integer;anterior numeric:=0;
begin
 if not private.e_admin() then raise exception 'Acesso restrito.';end if;
 select dados into c from public.configuracoes where id=true for update;
 c:=c||p_dados;
 perform private.normalizar_telefone(c->>'whatsapp');
 if (c->>'antecedencia_min')::integer<0 or (c->>'antecedencia_max')::integer<(c->>'antecedencia_min')::integer or (c->>'antecedencia_max')::integer>365 or (c->>'prazo_fiado')::integer not between 1 and 365 or (c->>'multiplo_pedido')::integer not between 1 and 10000 or ((c->>'limite_dia') is not null and (c->>'limite_dia')::integer<1) then raise exception 'Confira os prazos, limites e múltiplos.';end if;
 if jsonb_array_length(c->'tamanhos') not between 1 and 12 then raise exception 'Informe de 1 a 12 tamanhos.';end if;
 for x in select value from jsonb_array_elements(c->'tamanhos') loop n:=x::text::integer;if n<1 or n>100000 or n%(c->>'multiplo_pedido')::integer<>0 then raise exception 'Os tamanhos devem respeitar o múltiplo permitido.';end if;end loop;
 if (c->>'frete_base')::integer<0 or (c->>'frete_por_km')::integer<0 or (c->>'frete_minimo')::integer<0 or (c->>'distancia_max')::numeric<=0 then raise exception 'Confira os valores do frete.';end if;
 for x in select value from jsonb_array_elements(c->'faixas') loop
 if (x->>'ate')::numeric<=anterior or (x->>'valor')::integer<0 then raise exception 'As faixas de distância devem ser crescentes.';end if;anterior:=(x->>'ate')::numeric;end loop;
 if not (c->>'frete_gratis')::boolean and c->>'frete_tipo'='faixas' and anterior<(c->>'distancia_max')::numeric then raise exception 'As faixas precisam cobrir a distância máxima.';end if;
 if (c->>'recebendo_pedidos')::boolean and not exists(select 1 from public.produtos where ativo) then raise exception 'Cadastre pelo menos um salgado ativo antes de abrir as encomendas.';end if;
 c:=jsonb_set(c,'{whatsapp}',to_jsonb(private.normalizar_telefone(c->>'whatsapp')));
 c:=jsonb_set(c,'{versao}',to_jsonb((select (dados->>'versao')::integer+1 from public.configuracoes where id=true)));
 update public.configuracoes set dados=c where id=true;return c;
end;$$;
