create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table private.administrador (id boolean primary key default true check(id), user_id uuid unique not null references auth.users(id) on delete cascade);
create table private.instalacao (id boolean primary key default true check(id), email text, habilitado boolean not null default false);
insert into private.instalacao(id) values(true);
create table private.limites_envio (chave text primary key, janela timestamptz not null, quantidade integer not null);
create table private.requisicoes (id uuid primary key, hash text not null, pedido_id uuid, criado_em timestamptz not null default now());
create table private.cache_frete (chave text primary key, valor jsonb not null, expira_em timestamptz not null);
alter table private.administrador enable row level security;
alter table private.instalacao enable row level security;
alter table private.limites_envio enable row level security;
alter table private.requisicoes enable row level security;
alter table private.cache_frete enable row level security;

create function private.e_admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from private.administrador where user_id=(select auth.uid()));
$$;
revoke all on function private.e_admin() from public, anon;
grant execute on function private.e_admin() to authenticated, service_role;
create function public.sou_admin() returns boolean language sql stable security invoker set search_path='' as $$select private.e_admin();$$;
revoke all on function public.sou_admin() from public, anon;
grant execute on function public.sou_admin() to authenticated;

create function private.proteger_cadastro() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from private.instalacao where id=true for update;
 if exists(select 1 from private.administrador) or not exists(select 1 from private.instalacao where habilitado and lower(email)=lower(new.email)) then
   raise exception 'Cadastro público indisponível.';
 end if;
 update private.instalacao set habilitado=false,email=null where id=true;
 return new;
end;$$;
create function private.vincular_administrador() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into private.administrador(user_id) values(new.id); return new; end;$$;
revoke all on function private.proteger_cadastro(),private.vincular_administrador() from public,anon,authenticated;
create trigger rosilene_bloquear_cadastro before insert on auth.users for each row execute function private.proteger_cadastro();
create trigger rosilene_vincular_admin after insert on auth.users for each row execute function private.vincular_administrador();

create table public.produtos (
 id uuid primary key default gen_random_uuid(), nome text not null check(length(trim(nome)) between 1 and 120),
 descricao text not null default '' check(length(descricao)<=1000), foto text,
 preco_cento integer not null check(preco_cento between 0 and 10000000),
 quantidade_minima integer not null default 10 check(quantidade_minima between 1 and 100000),
 multiplo integer not null default 1 check(multiplo between 1 and 100000),
 categoria text not null default '', ativo boolean not null default true, ordem integer not null default 0,
 criado_em timestamptz not null default now()
);
create table public.clientes (
 id uuid primary key default gen_random_uuid(), nome text not null, whatsapp text not null unique check(whatsapp ~ '^55[1-9][0-9]9[0-9]{8}$'),
 fiado_liberado boolean not null default false, observacoes text not null default '', criado_em timestamptz not null default now()
);
create table public.configuracoes (id boolean primary key default true check(id), dados jsonb not null);
insert into public.configuracoes(dados) values ('{"empresa":"Salgados Rosilene","whatsapp":"5531998991812","antecedencia_min":3,"antecedencia_max":60,"limite_dia":null,"prazo_fiado":30,"fiado_todos":false,"pix_chave":"","pix_nome":"","pix_cidade":"FERROS","tamanhos":[50,100,200],"multiplo_pedido":25,"frete_gratis":true,"endereco_saida":"Rua Arthur Couto, 238, Padre Alberto, Ferros - MG","saida_lat":null,"saida_lng":null,"frete_tipo":"km","faixas":[],"frete_base":0,"frete_por_km":0,"frete_minimo":0,"distancia_max":10,"mensagem_confirmacao":"Olá, {nome}! Podemos confirmar sua encomenda?\n\n{resumo}","mensagem_cobranca":"Olá, {nome}! Sua encomenda tem o valor de {total}, combinado para {vencimento}.\n\n{resumo}\n\nPix: {pix}","recebendo_pedidos":false,"aviso_privacidade":"Usamos seu nome, WhatsApp e endereço para preparar e confirmar a encomenda. Somente a responsável pela Salgados Rosilene acessa esses dados. Para solicitar correção ou exclusão, fale com nosso WhatsApp. Não enviamos publicidade sem autorização.","versao":1}'::jsonb);
create table public.datas_bloqueadas (data date primary key, motivo text not null default '');
create table public.pedidos (
 id uuid primary key default gen_random_uuid(), numero bigint generated always as identity unique,
 cliente_id uuid references public.clientes(id) on delete set null,
 nome_cliente text not null, whatsapp text not null, data_entrega date not null, horario time not null,
 tipo text not null check(tipo in ('retirada','entrega')), endereco jsonb, ponto_referencia text not null default '', observacoes text not null default '',
 status text not null default 'pendente' check(status in ('pendente','aguardando_confirmacao','confirmado','cancelado')),
 subtotal bigint not null default 0 check(subtotal>=0), frete_valor bigint not null default 0 check(frete_valor>=0), frete_km numeric,
 frete_modo text not null default 'nenhum' check(frete_modo in ('nenhum','calculado','manual','a_combinar')),
 total bigint not null default 0 check(total=subtotal+frete_valor), forma_pagamento text not null check(forma_pagamento in ('dinheiro','pix')),
 precisa_troco boolean not null default false, troco_para bigint,
 pagar_depois boolean not null default false, data_prometida_pagamento date,
 pago boolean not null default false, data_pagamento timestamptz,
 consentimento_em timestamptz, versao_privacidade integer, origem text not null default 'site' check(origem in ('site','manual')),
 criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), versao integer not null default 1,
 check((pago and data_pagamento is not null) or (not pago and data_pagamento is null)),
 check(not pagar_depois or data_prometida_pagamento is not null),
 check(not precisa_troco or (forma_pagamento='dinheiro' and troco_para is not null and troco_para>=total))
);
create table public.grupos_pedido (
 id uuid primary key default gen_random_uuid(), pedido_id uuid not null references public.pedidos(id) on delete cascade,
 ordem integer not null check(ordem>0), tamanho_total integer not null check(tamanho_total between 1 and 100000), unique(pedido_id,ordem)
);
create table public.itens_pedido (
 id uuid primary key default gen_random_uuid(), grupo_id uuid not null references public.grupos_pedido(id) on delete cascade,
 produto_id uuid not null references public.produtos(id), nome_produto text not null, quantidade integer not null check(quantidade>0),
 preco_cento integer not null check(preco_cento>=0), valor_linha bigint not null check(valor_linha>=0), unique(grupo_id,produto_id)
);
create table public.eventos_pedido (id uuid primary key default gen_random_uuid(), pedido_id uuid not null references public.pedidos(id) on delete cascade, tipo text not null, criado_em timestamptz not null default now());
create index pedidos_cliente on public.pedidos(cliente_id);
create index pedidos_agenda on public.pedidos(data_entrega,horario,status);
create index pedidos_receber on public.pedidos(data_prometida_pagamento) where not pago and status<>'cancelado';
create index itens_produto on public.itens_pedido(produto_id);
create index eventos_pedido_idx on public.eventos_pedido(pedido_id);

do $$ declare t text; begin
 foreach t in array array['produtos','clientes','configuracoes','datas_bloqueadas','pedidos','grupos_pedido','itens_pedido','eventos_pedido'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from anon,authenticated',t);
   execute format('grant select on public.%I to authenticated',t);
   execute format('grant all on public.%I to service_role',t);
   execute format('create policy admin_leitura on public.%I for select to authenticated using ((select private.e_admin()))',t);
 end loop;
end;$$;
grant select on public.produtos to anon;
create policy produtos_publicos on public.produtos for select to anon using(ativo);
grant insert,update on public.produtos to authenticated;
create policy admin_produtos_insert on public.produtos for insert to authenticated with check((select private.e_admin()));
create policy admin_produtos_update on public.produtos for update to authenticated using((select private.e_admin())) with check((select private.e_admin()));
grant update(nome,fiado_liberado,observacoes) on public.clientes to authenticated;
create policy admin_clientes_update on public.clientes for update to authenticated using((select private.e_admin())) with check((select private.e_admin()));
grant insert,delete on public.datas_bloqueadas to authenticated;
create policy admin_datas on public.datas_bloqueadas for all to authenticated using((select private.e_admin())) with check((select private.e_admin()));
grant usage,select on all sequences in schema public to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('salgados','salgados',true,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy fotos_admin on storage.objects for all to authenticated using(bucket_id='salgados' and (select private.e_admin())) with check(bucket_id='salgados' and (select private.e_admin()));

create function public.configuracao_publica() returns jsonb language sql stable security definer set search_path='' as $$
select dados - array['mensagem_confirmacao','mensagem_cobranca','saida_lat','saida_lng','faixas','frete_base','frete_por_km','frete_minimo'] from public.configuracoes where id=true;
$$;
create function public.disponibilidade() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(d::text),'[]'::jsonb) from (
 select data as d from public.datas_bloqueadas
 union select data_entrega from public.pedidos where status<>'cancelado' group by data_entrega having count(*) >= (select (dados->>'limite_dia')::integer from public.configuracoes where id=true)
 ) x where d >= (now() at time zone 'America/Sao_Paulo')::date;
$$;
revoke all on function public.configuracao_publica(),public.disponibilidade() from public;
grant execute on function public.configuracao_publica(),public.disponibilidade() to anon,authenticated,service_role;

create function private.conferir_grupo() returns trigger language plpgsql security definer set search_path='' as $$
declare gid uuid; expected integer; actual bigint;
begin
 if tg_table_name='grupos_pedido' then gid:=coalesce(new.id,old.id); else gid:=coalesce(new.grupo_id,old.grupo_id); end if;
 select tamanho_total into expected from public.grupos_pedido where id=gid;
 if expected is not null then
 select coalesce(sum(quantidade),0) into actual from public.itens_pedido where grupo_id=gid;
 if actual<>expected then raise exception 'A soma dos sabores deve ser igual ao tamanho do grupo.'; end if;
 end if; return null;
end;$$;
revoke all on function private.conferir_grupo() from public,anon,authenticated;
create constraint trigger conferir_grupo after insert or update on public.grupos_pedido deferrable initially deferred for each row execute function private.conferir_grupo();
create constraint trigger conferir_itens after insert or update or delete on public.itens_pedido deferrable initially deferred for each row execute function private.conferir_grupo();
