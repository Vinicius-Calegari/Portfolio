-- Versiona a estrutura de cupons já existente em produção.
-- O cliente pode comprar sem cupom; descontos nunca são aceitos no fiado.
create table if not exists public.cupons (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo = upper(trim(codigo)) and codigo ~ '^[A-Z0-9_-]{3,30}$'),
  tipo text not null check (tipo in ('percentual','fixo')),
  valor integer not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  check ((tipo='percentual' and valor between 1 and 100) or (tipo='fixo' and valor between 1 and 10000000))
);
alter table public.cupons enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cupons' and policyname='admin_cupons_select') then
    create policy admin_cupons_select on public.cupons for select to authenticated using ((select private.e_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cupons' and policyname='admin_cupons_insert') then
    create policy admin_cupons_insert on public.cupons for insert to authenticated with check ((select private.e_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cupons' and policyname='admin_cupons_update') then
    create policy admin_cupons_update on public.cupons for update to authenticated using ((select private.e_admin())) with check ((select private.e_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cupons' and policyname='admin_cupons_delete') then
    create policy admin_cupons_delete on public.cupons for delete to authenticated using ((select private.e_admin()));
  end if;
end;
$$;
revoke all on public.cupons from public, anon;
grant select, insert, update, delete on public.cupons to authenticated;
grant all on public.cupons to service_role;

alter table public.pedidos add column if not exists cupom_codigo text;
alter table public.pedidos add column if not exists desconto bigint not null default 0;
alter table public.pedidos drop constraint if exists pedidos_total_check;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.pedidos'::regclass and conname='pedidos_desconto_check') then
    alter table public.pedidos add constraint pedidos_desconto_check
      check (desconto>=0 and desconto<=subtotal and total=subtotal+frete_valor-desconto and total>=0);
  end if;
end;
$$;
alter table public.pedidos add constraint pedidos_sem_cupom_no_fiado
  check (not pagar_depois or (cupom_codigo is null and desconto=0));

CREATE OR REPLACE FUNCTION public.validar_cupom(p_codigo text, p_subtotal bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.cupons; cod text := upper(trim(coalesce(p_codigo,''))); d bigint;
begin
  if p_subtotal is null or p_subtotal < 0 then raise exception 'Subtotal inválido.'; end if;
  select * into c from public.cupons where codigo=cod and ativo for share;
  if not found then raise exception 'Cupom inválido ou indisponível.'; end if;
  d := case when c.tipo='percentual' then round(p_subtotal::numeric*c.valor/100)::bigint else least(c.valor::bigint,p_subtotal) end;
  return jsonb_build_object('codigo',c.codigo,'tipo',c.tipo,'valor',c.valor,'desconto',d);
end;$function$;

CREATE OR REPLACE FUNCTION public.registrar_pedido(p_dados jsonb, p_frete jsonb, p_admin boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c jsonb;tel text;cliente uuid;pid uuid;d date;sub bigint;frete bigint;modo text;fiado boolean;troco boolean;para bigint;vence date;rid uuid;hash text;rec private.requisicoes;nome text;cup jsonb;desc_val bigint:=0;cup_codigo text;
begin
 fiado:=coalesce((p_dados->>'pagar_depois')::boolean,false);
 cup_codigo:=upper(coalesce(nullif(trim(p_dados->>'cupom'),''),nullif(trim(p_dados->>'cupom_codigo'),'')));
 if fiado and cup_codigo is not null then
   raise exception 'Cupons não são válidos para pagamento fiado.';
 end if;
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
 if p_dados->>'tipo'='entrega' and (coalesce(length(trim(p_dados#>>'{endereco,rua}')),0)<2 or coalesce(length(trim(p_dados#>>'{endereco,numero}')),0)<1 or coalesce(length(trim(p_dados#>>'{endereco,bairro}')),0)<2 or coalesce(length(trim(p_dados#>>'{endereco,cidade}')),0)<2) then raise exception 'Preencha o endereço completo.';end if;
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
 if cup_codigo is not null then
   cup:=public.validar_cupom(cup_codigo,sub); desc_val:=(cup->>'desconto')::bigint; cup_codigo:=cup->>'codigo';
 end if;
 troco:=coalesce((p_dados->>'precisa_troco')::boolean,false);para:=case when troco then (p_dados->>'troco_para')::bigint else null end;
 if troco and (p_dados->>'forma_pagamento'<>'dinheiro' or para is null or para<sub+frete-desc_val) then raise exception 'O valor para troco precisa cobrir o total.';end if;
 update public.pedidos set subtotal=sub,frete_valor=frete,frete_km=(p_frete->>'km')::numeric,frete_modo=modo,cupom_codigo=cup_codigo,desconto=desc_val,total=sub+frete-desc_val,precisa_troco=troco,troco_para=para where id=pid;
 update private.requisicoes set pedido_id=pid where id=rid;
 insert into public.eventos_pedido(pedido_id,tipo) values(pid,'Pedido cadastrado');
 return private.comprovante(pid);
end;$function$;

-- Estas funções privilegiadas só podem ser chamadas pelo servidor.
revoke all on function public.validar_cupom(text,bigint), public.registrar_pedido(jsonb,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.validar_cupom(text,bigint), public.registrar_pedido(jsonb,jsonb,boolean) to service_role;
