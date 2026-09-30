create function private.normalizar_telefone(p text) returns text language plpgsql immutable set search_path='' as $$
declare s text:=regexp_replace(p,'[^0-9]','','g');
begin
 if length(s)=13 and left(s,2)='55' then s:=substr(s,3); end if;
 if s !~ '^(1[1-9]|2[12478]|3[1-578]|4[1-9]|5[13-5]|6[1-9]|7[134579]|8[1-9]|9[1-9])9[0-9]{8}$' then raise exception 'Informe um WhatsApp válido com DDD.'; end if;
 return '55'||s;
end;$$;

create function public.limitar_envio(p_chave text,p_max integer default 40) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 insert into private.limites_envio values(p_chave,now(),1) on conflict(chave) do update set quantidade=case when private.limites_envio.janela < now()-interval '1 hour' then 1 else private.limites_envio.quantidade+1 end, janela=case when private.limites_envio.janela < now()-interval '1 hour' then now() else private.limites_envio.janela end returning quantidade into n;
 delete from private.limites_envio where janela<now()-interval '2 days';
 return n<=p_max;
end;$$;
create function public.consultar_fiado(p_whatsapp text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select fiado_liberado from public.clientes where whatsapp=private.normalizar_telefone(p_whatsapp)),false) or (select (dados->>'fiado_todos')::boolean from public.configuracoes where id=true);
$$;
create function public.cache_frete_ler(p_chave text) returns jsonb language sql stable security definer set search_path='' as $$select valor from private.cache_frete where chave=p_chave and expira_em>now();$$;
create function public.cache_frete_salvar(p_chave text,p_valor jsonb) returns void language plpgsql security definer set search_path='' as $$
begin delete from private.cache_frete where expira_em<now(); insert into private.cache_frete values(p_chave,p_valor,now()+interval '15 minutes') on conflict(chave) do update set valor=excluded.valor, expira_em=excluded.expira_em; end;$$;
create function private.comprovante(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select to_jsonb(p)||jsonb_build_object('grupos_pedido',coalesce((select jsonb_agg(to_jsonb(g)||jsonb_build_object('itens_pedido',(select jsonb_agg(to_jsonb(i) order by nome_produto) from public.itens_pedido i where i.grupo_id=g.id)) order by g.ordem) from public.grupos_pedido g where g.pedido_id=p.id),'[]'::jsonb)) from public.pedidos p where p.id=p_id;
$$;
create function private.validar_data(p_data date,p_config jsonb,p_excluir uuid default null,p_admin boolean default false) returns void language plpgsql set search_path='' as $$
declare hoje date:=(now() at time zone 'America/Sao_Paulo')::date; limite integer:=(p_config->>'limite_dia')::integer;
begin
 perform pg_advisory_xact_lock(72419,p_data-date '2000-01-01');
 if p_data is null or p_data<hoje+(case when p_admin then 0 else (p_config->>'antecedencia_min')::integer end) or p_data>hoje+(p_config->>'antecedencia_max')::integer then raise exception 'Data fora do prazo permitido.'; end if;
 if exists(select 1 from public.datas_bloqueadas where data=p_data) then raise exception 'Essa data está indisponível.'; end if;
 if limite is not null and (select count(*) from public.pedidos where data_entrega=p_data and status<>'cancelado' and (p_excluir is null or id<>p_excluir))>=limite then raise exception 'Essa data atingiu o limite de encomendas.'; end if;
end;$$;
create function private.preencher_grupos(p_pedido uuid,p_grupos jsonb,p_config jsonb,p_antigos jsonb default '{}'::jsonb) returns bigint language plpgsql set search_path='' as $$
declare g jsonb;i jsonb;p public.produtos;gid uuid;ord integer:=0;q integer;t integer;s integer;v bigint;subtotal bigint:=0;preco integer;nome text;anterior jsonb;
begin
 if jsonb_typeof(p_grupos)<>'array' or jsonb_array_length(p_grupos) not between 1 and 20 then raise exception 'Monte de 1 a 20 grupos de salgados.'; end if;
 for g in select value from jsonb_array_elements(p_grupos) loop
 ord:=ord+1;t:=(g->>'tamanho_total')::integer;s:=0;
 if t is null or t not between 1 and 100000 or t%(p_config->>'multiplo_pedido')::integer<>0 then raise exception 'Tamanho do grupo inválido.'; end if;
 if jsonb_typeof(g->'itens')<>'array' or jsonb_array_length(g->'itens') not between 1 and 100 then raise exception 'Escolha os sabores do grupo.'; end if;
 insert into public.grupos_pedido(pedido_id,ordem,tamanho_total) values(p_pedido,ord,t) returning id into gid;
 for i in select value from jsonb_array_elements(g->'itens') loop
 select * into p from public.produtos where id=(i->>'produto_id')::uuid for share;
 anterior:=p_antigos->(ord::text||':'||(i->>'produto_id'));
 if not found or (not p.ativo and anterior is null) then raise exception 'Um sabor não está mais disponível. Atualize o cardápio.'; end if;
 q:=(i->>'quantidade')::integer;
 if q is null or q<p.quantidade_minima or q>100000 or q%p.multiplo<>0 then raise exception 'Confira a quantidade mínima e o múltiplo de %.',p.nome; end if;
 preco:=coalesce((anterior->>'preco')::integer,p.preco_cento);nome:=coalesce(anterior->>'nome',p.nome);
 v:=round(q::numeric*preco/100)::bigint;
 insert into public.itens_pedido(grupo_id,produto_id,nome_produto,quantidade,preco_cento,valor_linha) values(gid,p.id,nome,q,preco,v);
 s:=s+q;subtotal:=subtotal+v;
 end loop;
 if s<>t then raise exception 'A soma dos sabores deve completar exatamente o tamanho escolhido.'; end if;
 end loop; return subtotal;
end;$$;

create function public.registrar_pedido(p_dados jsonb,p_frete jsonb,p_admin boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb;tel text;cliente uuid;pid uuid;d date;sub bigint;frete bigint;modo text;fiado boolean;troco boolean;para bigint;vence date;rid uuid;hash text;rec private.requisicoes;nome text;
begin
 rid:=(p_dados->>'requisicao_id')::uuid;hash:=md5(p_dados::text);
 if rid is null then raise exception 'Identificador do envio ausente.';end if;
 insert into private.requisicoes(id,hash) values(rid,hash) on conflict do nothing;
 select * into rec from private.requisicoes where id=rid for update;
 if rec.hash<>hash then raise exception 'Este envio já foi usado. Atualize a página.'; end if;
 if rec.pedido_id is not null then return private.comprovante(rec.pedido_id);end if;
 select dados into c from public.configuracoes where id=true for share;
 if not p_admin and not (c->>'recebendo_pedidos')::boolean then raise exception 'As encomendas on-line ainda não estão abertas. Fale conosco pelo WhatsApp.';end if;
 if (p_frete->>'config_versao')::integer is distinct from (c->>'versao')::integer then raise exception 'As condições de entrega mudaram. Confira o resumo e tente novamente.';end if;
 tel:=private.normalizar_telefone(p_dados->>'whatsapp');nome:=trim(p_dados->>'nome');
 if nome is null or length(nome) not between 3 and 120 then raise exception 'Informe seu nome completo.';end if;
 if not p_admin and coalesce((p_dados->>'consentimento')::boolean,false) is not true then raise exception 'Aceite o aviso de privacidade para enviar.';end if;
 if coalesce(length(p_dados->>'observacoes'),0)>2000 then raise exception 'Use até 2.000 caracteres nas observações.';end if;
 d:=(p_dados->>'data_entrega')::date;perform private.validar_data(d,c,null,p_admin);
 if p_dados->>'horario' is null then raise exception 'Escolha um horário.';end if;
 if p_dados->>'tipo' not in ('retirada','entrega') then raise exception 'Escolha retirada ou entrega.';end if;
 if p_dados->>'tipo'='entrega' and (coalesce(length(trim(p_dados#>>'{endereco,rua}')),0)<2 or coalesce(length(trim(p_dados#>>'{endereco,numero}')),0)<1 or coalesce(length(trim(p_dados#>>'{endereco,bairro}')),0)<2 or coalesce(length(trim(p_dados#>>'{endereco,cidade}')),0)<2 or coalesce(length(trim(p_dados->>'ponto_referencia')),0)<2) then raise exception 'Preencha o endereço completo e um ponto de referência.';end if;
 fiado:=coalesce((p_dados->>'pagar_depois')::boolean,false);
 if fiado and not public.consultar_fiado(tel) then raise exception 'O fiado ainda não está liberado para este cliente.';end if;
 vence:=case when fiado then (p_dados->>'data_prometida_pagamento')::date else d end;
 if fiado and (vence is null or vence<d or vence>d+(c->>'prazo_fiado')::integer) then raise exception 'Escolha a data de pagamento dentro do prazo permitido.';end if;
 if p_dados->>'forma_pagamento' not in ('pix','dinheiro') then raise exception 'Escolha Pix ou dinheiro.';end if;
 if p_dados->>'forma_pagamento'='pix' and (c->>'pix_chave'='' or c->>'pix_nome'='') then raise exception 'O Pix ainda não foi configurado. Escolha dinheiro ou fale conosco.';end if;
 modo:=p_frete->>'modo';frete:=(p_frete->>'valor')::bigint;
 if p_dados->>'tipo'='retirada' or (c->>'frete_gratis')::boolean then modo:='nenhum';frete:=0;end if;
 if modo not in ('nenhum','calculado','a_combinar') or frete is null or frete<0 then raise exception 'Cotação de frete inválida.';end if;
 insert into public.clientes(nome,whatsapp) values(nome,tel) on conflict(whatsapp) do update set whatsapp=excluded.whatsapp returning id into cliente;
 insert into public.pedidos(cliente_id,nome_cliente,whatsapp,data_entrega,horario,tipo,endereco,ponto_referencia,observacoes,forma_pagamento,pagar_depois,data_prometida_pagamento,consentimento_em,versao_privacidade,origem)
 values(cliente,nome,tel,d,(p_dados->>'horario')::time,p_dados->>'tipo',case when p_dados->>'tipo'='entrega' then p_dados->'endereco' else null end,coalesce(p_dados->>'ponto_referencia',''),coalesce(p_dados->>'observacoes',''),p_dados->>'forma_pagamento',fiado,vence,case when p_admin then null else now() end,(c->>'versao')::integer,case when p_admin then 'manual' else 'site' end) returning id into pid;
 sub:=private.preencher_grupos(pid,p_dados->'grupos',c);
 troco:=coalesce((p_dados->>'precisa_troco')::boolean,false);para:=case when troco then (p_dados->>'troco_para')::bigint else null end;
 if troco and (p_dados->>'forma_pagamento'<>'dinheiro' or para is null or para<sub+frete) then raise exception 'O valor para troco precisa cobrir o total.';end if;
 update public.pedidos set subtotal=sub,frete_valor=frete,frete_km=(p_frete->>'km')::numeric,frete_modo=modo,total=sub+frete,precisa_troco=troco,troco_para=para where id=pid;
 update private.requisicoes set pedido_id=pid where id=rid;
 insert into public.eventos_pedido(pedido_id,tipo) values(pid,'Pedido cadastrado');
 return private.comprovante(pid);
end;$$;

create function public.administrar_pedido(p_id uuid,p_versao integer,p_acao text,p_dados jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.pedidos;c jsonb;novo date;sub bigint;frete bigint;snap jsonb;status_novo text;venc date;
begin
 if not private.e_admin() then raise exception 'Acesso restrito.';end if;
 select * into p from public.pedidos where id=p_id for update;
 if not found then raise exception 'Pedido não encontrado.';end if;
 if p.versao<>p_versao then raise exception 'O pedido mudou em outra tela. Atualize antes de salvar.';end if;
 select dados into c from public.configuracoes where id=true for share;
 if p_acao='status' then
 status_novo:=p_dados->>'status';
 if status_novo not in ('pendente','aguardando_confirmacao','confirmado','cancelado') then raise exception 'Status inválido.';end if;
 if p.status='cancelado' and status_novo<>'cancelado' then perform private.validar_data(p.data_entrega,c,p.id,true);end if;
 update public.pedidos set status=status_novo where id=p_id;
 elsif p_acao='pagamento' then
 update public.pedidos set pago=(p_dados->>'pago')::boolean,data_pagamento=case when (p_dados->>'pago')::boolean then now() else null end where id=p_id;
 elsif p_acao='editar' then
 novo:=(p_dados->>'data_entrega')::date;
 if novo<>p.data_entrega then
 perform pg_advisory_xact_lock(72419,least(novo,p.data_entrega)-date '2000-01-01');
 perform pg_advisory_xact_lock(72419,greatest(novo,p.data_entrega)-date '2000-01-01');
 perform private.validar_data(novo,c,p.id,true);
 end if;
 frete:=coalesce((p_dados->>'frete_valor')::bigint,p.frete_valor);
 if frete<0 or frete>10000000 or (p.tipo='retirada' and frete<>0) then raise exception 'Frete inválido.';end if;
 sub:=p.subtotal;
 if p_dados ? 'grupos' then
 select coalesce(jsonb_object_agg(g.ordem::text||':'||i.produto_id::text,jsonb_build_object('preco',i.preco_cento,'nome',i.nome_produto)),'{}'::jsonb) into snap from public.grupos_pedido g join public.itens_pedido i on i.grupo_id=g.id where g.pedido_id=p_id;
 delete from public.grupos_pedido where pedido_id=p_id;
 sub:=private.preencher_grupos(p_id,p_dados->'grupos',c,snap);
 end if;
 venc:=case when p.pagar_depois then coalesce((p_dados->>'data_prometida_pagamento')::date,p.data_prometida_pagamento) else novo end;
 if p.pagar_depois and (venc<novo or venc>novo+(c->>'prazo_fiado')::integer) then raise exception 'Revise a data prometida de pagamento.';end if;
 if p.precisa_troco and coalesce((p_dados->>'troco_para')::bigint,p.troco_para)<sub+frete then raise exception 'Revise o valor para troco: ele ficou menor que o total.';end if;
 update public.pedidos set data_entrega=novo,horario=(p_dados->>'horario')::time,observacoes=coalesce(p_dados->>'observacoes',observacoes),data_prometida_pagamento=venc,subtotal=sub,frete_valor=frete,total=sub+frete,frete_modo=case when p_dados ? 'frete_valor' then 'manual' else frete_modo end,troco_para=coalesce((p_dados->>'troco_para')::bigint,troco_para) where id=p_id;
 else raise exception 'Operação inválida.';
 end if;
 update public.pedidos set versao=versao+1,atualizado_em=now() where id=p_id;
 insert into public.eventos_pedido(pedido_id,tipo) values(p_id,p_acao);
 return private.comprovante(p_id);
end;$$;

create function public.salvar_configuracao(p_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 c:=jsonb_set(c,'whatsapp',to_jsonb(private.normalizar_telefone(c->>'whatsapp')));
 c:=jsonb_set(c,'versao',to_jsonb((select (dados->>'versao')::integer+1 from public.configuracoes where id=true)));
 update public.configuracoes set dados=c where id=true;return c;
end;$$;

create function public.excluir_dados_cliente(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.e_admin() then raise exception 'Acesso restrito.';end if;
 delete from private.requisicoes where pedido_id in(select id from public.pedidos where cliente_id=p_id);
 update public.pedidos set nome_cliente='Cliente removido',whatsapp='',endereco=null,ponto_referencia='',observacoes='',cliente_id=null,versao=versao+1 where cliente_id=p_id;
 delete from public.clientes where id=p_id;
end;$$;

revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.e_admin() to authenticated,service_role;
revoke all on function public.limitar_envio(text,integer),public.consultar_fiado(text),public.cache_frete_ler(text),public.cache_frete_salvar(text,jsonb),public.registrar_pedido(jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.limitar_envio(text,integer),public.consultar_fiado(text),public.cache_frete_ler(text),public.cache_frete_salvar(text,jsonb),public.registrar_pedido(jsonb,jsonb,boolean) to service_role;
revoke all on function public.administrar_pedido(uuid,integer,text,jsonb),public.salvar_configuracao(jsonb),public.excluir_dados_cliente(uuid) from public,anon;
grant execute on function public.administrar_pedido(uuid,integer,text,jsonb),public.salvar_configuracao(jsonb),public.excluir_dados_cliente(uuid) to authenticated;
