import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  LogOut,
  MessageCircle,
  PackagePlus,
  RefreshCw,
  Settings,
  ShoppingBag,
  Users,
  XCircle,
} from "lucide-react";
import {
  allProducts,
  clients,
  db,
  orderAction,
  orders,
  settings,
} from "./api";
import type { Cliente, Config, Pedido, Produto, Status } from "./domain";
import {
  cents,
  csv,
  dateBR,
  decimal,
  maskPhone,
  message,
  money,
  statuses,
  today,
  waLink,
} from "./domain";
import { imageFileToWebp, safeUuid } from "./browser";
import { downloadReport } from "./reports";
import { Empty, ErrorBox, Spinner, useCatalog } from "./App";
import OrderForm from "./OrderForm";

type Tab = "agenda" | "manual" | "produtos" | "clientes" | "relatorios" | "config";

function download(name: string, content: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Admin() {
  const catalog = useCatalog();
  const [session, setSession] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("agenda");
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [config, setConfig] = useState<Config>(catalog.config);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filterDate, setFilterDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterName, setFilterName] = useState("");
  const [product, setProduct] = useState<Partial<Produto> | null>(null);
  const [blockedDate, setBlockedDate] = useState("");
  const [blocked, setBlocked] = useState<{ data: string; motivo: string }[]>([]);

  const load = useCallback(async () => {
    setError("");
    try {
      const [o, p, c, cfg, dates] = await Promise.all([
        orders(),
        allProducts(),
        clients(),
        settings(),
        db.from("datas_bloqueadas").select("*").order("data"),
      ]);
      if (dates.error) throw dates.error;
      setPedidos(o);
      setProdutos(p);
      setClientes(c);
      setConfig(cfg);
      setBlocked(dates.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar o painel.");
    }
  }, []);

  useEffect(() => {
    void db.auth.getSession().then(async ({ data }) => {
      if (!data.session) return setSession(false);
      const check = await db.rpc("sou_admin");
      setSession(!check.error && !!check.data);
      if (!check.error && check.data) void load();
    });
    const { data } = db.auth.onAuthStateChange((_event, current) => {
      if (!current) setSession(false);
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginBusy(true);
    setError("");
    try {
      const result = await db.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw new Error("E-mail ou senha incorretos.");
      const check = await db.rpc("sou_admin");
      if (check.error || !check.data) {
        await db.auth.signOut();
        throw new Error("Esta conta não tem acesso administrativo.");
      }
      setSession(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível entrar.");
    } finally {
      setLoginBusy(false);
    }
  }

  async function act(p: Pedido, action: string, data: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      await orderAction(p.id, p.versao, action, data);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível atualizar o pedido.");
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(
    () =>
      pedidos.filter((p) =>
        (!filterDate || p.data_entrega === filterDate) &&
        (!filterStatus || p.status === filterStatus) &&
        (!filterName || `${p.nome_cliente} ${p.whatsapp}`.toLowerCase().includes(filterName.toLowerCase())),
      ),
    [pedidos, filterDate, filterStatus, filterName],
  );

  if (session === null) return <Spinner />;
  if (!session)
    return (
      <main className="admin-login">
        <form className="panel login-card" onSubmit={login}>
          <span className="eyebrow">ÁREA RESTRITA</span>
          <h1>Painel Rosilene</h1>
          <p>Entre com a conta administrativa cadastrada no Supabase.</p>
          <label>E-mail<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <ErrorBox text={error} />
          <button className="button" disabled={loginBusy}>{loginBusy ? "Entrando…" : "Entrar"}</button>
          <a href="/">Voltar ao site</a>
        </form>
      </main>
    );

  return (
    <div className="admin-shell">
      <aside className="admin-nav">
        <div className="wordmark"><span className="brand-r">R</span><span>Salgados <strong>Rosilene</strong></span></div>
        <nav>
          <button className={tab === "agenda" ? "active" : ""} onClick={() => setTab("agenda")}><CalendarDays /> Agenda</button>
          <button className={tab === "manual" ? "active" : ""} onClick={() => setTab("manual")}><PackagePlus /> Novo pedido</button>
          <button className={tab === "produtos" ? "active" : ""} onClick={() => setTab("produtos")}><ShoppingBag /> Salgados</button>
          <button className={tab === "clientes" ? "active" : ""} onClick={() => setTab("clientes")}><Users /> Clientes</button>
          <button className={tab === "relatorios" ? "active" : ""} onClick={() => setTab("relatorios")}><FileText /> Relatórios</button>
          <button className={tab === "config" ? "active" : ""} onClick={() => setTab("config")}><Settings /> Configurações</button>
        </nav>
        <button className="logout" onClick={() => void db.auth.signOut()}><LogOut /> Sair</button>
      </aside>
      <main className="admin-main">
        <div className="admin-top"><div><span className="eyebrow">GESTÃO</span><h1>{({agenda:"Agenda",manual:"Novo pedido",produtos:"Salgados",clientes:"Clientes",relatorios:"Relatórios",config:"Configurações"} as Record<Tab,string>)[tab]}</h1></div><button className="icon-button" title="Atualizar" onClick={() => void load()}><RefreshCw /></button></div>
        <ErrorBox text={error} />
        {tab === "agenda" && <Agenda pedidos={visible} all={pedidos} config={config} busy={busy} filterDate={filterDate} setFilterDate={setFilterDate} filterStatus={filterStatus} setFilterStatus={setFilterStatus} filterName={filterName} setFilterName={setFilterName} act={act} />}
        {tab === "manual" && <OrderForm manual onDone={() => { void load(); setTab("agenda"); }} />}
        {tab === "produtos" && <Products produtos={produtos} editing={product} setEditing={setProduct} onSaved={load} setError={setError} />}
        {tab === "clientes" && <ClientsView clientes={clientes} setError={setError} onSaved={load} />}
        {tab === "relatorios" && <Reports pedidos={pedidos} config={config} setError={setError} />}
        {tab === "config" && <ConfigView config={config} setConfig={setConfig} blocked={blocked} blockedDate={blockedDate} setBlockedDate={setBlockedDate} setError={setError} onSaved={async () => { await load(); await catalog.refresh(); }} />}
      </main>
    </div>
  );
}

function Agenda({ pedidos, all, config, busy, filterDate, setFilterDate, filterStatus, setFilterStatus, filterName, setFilterName, act }: {
  pedidos: Pedido[]; all: Pedido[]; config: Config; busy: boolean;
  filterDate: string; setFilterDate: (v:string)=>void; filterStatus:string; setFilterStatus:(v:string)=>void; filterName:string; setFilterName:(v:string)=>void;
  act: (p:Pedido,a:string,d?:Record<string,unknown>)=>Promise<void>;
}) {
  const now = today();
  const week = all.filter((p) => p.data_entrega >= now && p.status !== "cancelado").slice(0, 20);
  const receive = all.filter((p) => !p.pago && p.status !== "cancelado").reduce((s,p)=>s+p.total,0);
  return <>
    <section className="metric-grid">
      <div className="metric"><small>Próximos pedidos</small><strong>{week.length}</strong></div>
      <div className="metric"><small>Confirmados</small><strong>{all.filter(p=>p.status==="confirmado" && p.data_entrega>=now).length}</strong></div>
      <div className="metric"><small>A receber</small><strong>{money(receive)}</strong></div>
    </section>
    <section className="panel filters"><input type="date" value={filterDate} onChange={(e)=>setFilterDate(e.target.value)} /><select value={filterStatus} onChange={(e)=>setFilterStatus(e.target.value)}><option value="">Todos os status</option>{Object.entries(statuses).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><input placeholder="Cliente ou WhatsApp" value={filterName} onChange={(e)=>setFilterName(e.target.value)} /></section>
    {!pedidos.length ? <Empty title="Nenhum pedido encontrado" /> : <div className="admin-order-list">{pedidos.map((p)=><article className="panel admin-order" key={p.id}>
      <div className="order-head"><div><span className={`status ${p.status}`}>{statuses[p.status]}</span><h3>#{p.numero} · {p.nome_cliente}</h3><p>{dateBR(p.data_entrega)} às {p.horario.slice(0,5)} · {p.tipo === "entrega" ? "Entrega" : "Retirada"}</p></div><strong>{money(p.total)}{p.frete_modo === "a_combinar" ? " + frete" : ""}</strong></div>
      <div className="order-items">{p.grupos_pedido.map((g,n)=><p key={g.id || n}><b>Grupo {n+1}:</b> {g.itens_pedido.map(i=>`${i.quantidade} ${i.nome_produto}`).join(", ")}</p>)}</div>
      <p><b>{maskPhone(p.whatsapp)}</b> · {p.forma_pagamento === "pix" ? "Pix" : "Dinheiro"} · {p.pago ? "Pago" : "Não pago"}</p>
      {p.observacoes && <p className="muted">{p.observacoes}</p>}
      <div className="order-actions">
        {p.status !== "confirmado" && p.status !== "cancelado" && <button disabled={busy} onClick={()=>void act(p,"status",{status:"confirmado"})}><CheckCircle2 /> Confirmar</button>}
        {p.status !== "cancelado" && <button disabled={busy} onClick={()=>void act(p,"status",{status:"cancelado"})}><XCircle /> Cancelar</button>}
        {!p.pago && <button disabled={busy} onClick={()=>void act(p,"pagamento",{pago:true})}>Marcar pago</button>}
        {p.pago && <button disabled={busy} onClick={()=>void act(p,"pagamento",{pago:false})}>Desmarcar pago</button>}
        <a href={waLink(p.whatsapp,message(config.mensagem_confirmacao,p,config.pix_chave))} target="_blank" rel="noreferrer" onClick={()=>{if(p.status==="pendente") void act(p,"status",{status:"aguardando_confirmacao"});}}><MessageCircle /> WhatsApp</a>
      </div>
    </article>)}</div>}
  </>;
}

function Products({ produtos, editing, setEditing, onSaved, setError }: { produtos:Produto[]; editing:Partial<Produto>|null; setEditing:(p:Partial<Produto>|null)=>void; onSaved:()=>Promise<void>; setError:(e:string)=>void }) {
  const blank: Partial<Produto> = { nome:"", descricao:"", categoria:"Salgados", preco_cento:0, quantidade_minima:10, multiplo:10, ativo:true, ordem:0, foto:null };
  const [saving,setSaving]=useState(false);
  const p=editing;
  async function save(e:React.FormEvent){e.preventDefault();if(!p)return;setSaving(true);setError("");try{if(!p.nome?.trim())throw new Error("Informe o nome do salgado.");if(!Number.isInteger(p.preco_cento)||Number(p.preco_cento)<0)throw new Error("Informe o preço do cento.");const payload={...p,id:p.id||safeUuid(),nome:p.nome.trim(),descricao:p.descricao||"",categoria:p.categoria||"",preco_cento:Number(p.preco_cento),quantidade_minima:Number(p.quantidade_minima)||1,multiplo:Number(p.multiplo)||1,ordem:Number(p.ordem)||0,ativo:p.ativo!==false};const r=await db.from("produtos").upsert(payload);if(r.error)throw r.error;setEditing(null);await onSaved();}catch(e){setError(e instanceof Error?e.message:"Não foi possível salvar.");}finally{setSaving(false)}}
  async function photo(file:File){if(!p)return;setSaving(true);setError("");try{const id=p.id||safeUuid();const blob=await imageFileToWebp(file);const path=`${id}.webp`;const r=await db.storage.from("salgados").upload(path,blob,{upsert:true,contentType:"image/webp"});if(r.error)throw r.error;const url=db.storage.from("salgados").getPublicUrl(path).data.publicUrl;setEditing({...p,id,foto:url});}catch(e){setError(e instanceof Error?e.message:"Não foi possível enviar a foto.");}finally{setSaving(false)}}
  return <>
    <button className="button" onClick={()=>setEditing(blank)}><PackagePlus /> Novo salgado</button>
    {p && <form className="panel editor" onSubmit={save}><h2>{p.id?"Editar salgado":"Novo salgado"}</h2><div className="form-grid"><label>Nome<input value={p.nome||""} onChange={e=>setEditing({...p,nome:e.target.value})}/></label><label>Categoria<input value={p.categoria||""} onChange={e=>setEditing({...p,categoria:e.target.value})}/></label><label>Preço do cento (R$)<input inputMode="decimal" value={decimal(Number(p.preco_cento)||0)} onChange={e=>setEditing({...p,preco_cento:cents(e.target.value)})}/></label><label>Mínimo por sabor<input type="number" value={p.quantidade_minima||10} onChange={e=>setEditing({...p,quantidade_minima:Number(e.target.value)})}/></label><label>Múltiplo por sabor<input type="number" value={p.multiplo||1} onChange={e=>setEditing({...p,multiplo:Number(e.target.value)})}/></label><label>Ordem<input type="number" value={p.ordem||0} onChange={e=>setEditing({...p,ordem:Number(e.target.value)})}/></label></div><label>Descrição<textarea value={p.descricao||""} onChange={e=>setEditing({...p,descricao:e.target.value})}/></label><label>Foto<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f)void photo(f)}}/></label><label className="check"><input type="checkbox" checked={p.ativo!==false} onChange={e=>setEditing({...p,ativo:e.target.checked})}/> Ativo no site</label><div className="form-actions"><button type="button" className="button secondary" onClick={()=>setEditing(null)}>Cancelar</button><button className="button" disabled={saving}>{saving?"Salvando…":"Salvar"}</button></div></form>}
    <div className="admin-product-grid">{produtos.map((item)=><article className="panel admin-product" key={item.id}>{item.foto?<img src={item.foto} alt=""/>:<div className="photo-placeholder">Sem foto</div>}<div><span className="category">{item.categoria||"Salgados"}</span><h3>{item.nome}</h3><p>{money(item.preco_cento)} / cento · mínimo {item.quantidade_minima}</p><p>{item.ativo?"Ativo":"Desativado"}</p></div><button onClick={()=>setEditing(item)}>Editar</button></article>)}</div>
  </>;
}

function ClientsView({clientes,setError,onSaved}:{clientes:Cliente[];setError:(e:string)=>void;onSaved:()=>Promise<void>}){
  async function update(c:Cliente,patch:Partial<Cliente>){try{const r=await db.from("clientes").update(patch).eq("id",c.id);if(r.error)throw r.error;await onSaved();}catch(e){setError(e instanceof Error?e.message:"Não foi possível atualizar o cliente.")}}
  async function anonymize(c:Cliente){if(!confirm(`Excluir os dados pessoais de ${c.nome}? O histórico financeiro será anonimizado.`))return;try{const r=await db.rpc("excluir_dados_cliente",{p_id:c.id});if(r.error)throw r.error;await onSaved();}catch(e){setError(e instanceof Error?e.message:"Não foi possível excluir os dados.")}}
  return !clientes.length?<Empty title="Nenhum cliente cadastrado"/>:<div className="client-grid">{clientes.map(c=><article className="panel client-card" key={c.id}><h3>{c.nome}</h3><p>{maskPhone(c.whatsapp)}</p><label className="check"><input type="checkbox" checked={c.fiado_liberado} onChange={e=>void update(c,{fiado_liberado:e.target.checked})}/> Fiado liberado</label><label>Observações<textarea defaultValue={c.observacoes} onBlur={e=>{if(e.target.value!==c.observacoes)void update(c,{observacoes:e.target.value})}}/></label><button className="danger-link" onClick={()=>void anonymize(c)}>Excluir dados pessoais</button></article>)}</div>;
}

function Reports({pedidos,config,setError}:{pedidos:Pedido[];config:Config;setError:(e:string)=>void}){
  const [pending,setPending]=useState(false);
  const run=(kind:"producao"|"periodo"|"individual"|"receber", list=pedidos)=>void downloadReport(kind,list,config,pending).catch(e=>setError(e.message));
  async function backup(){try{const r=await db.rpc("backup_admin",{p_exportar:true});if(r.error)throw r.error;download(`rosilene-backup-${today()}.json`,JSON.stringify(r.data,null,2),"application/json");}catch(e){setError(e instanceof Error?e.message:"Não foi possível exportar o backup.")}}
  return <div className="panel report-panel"><h2>Relatórios e exportações</h2><label className="check"><input type="checkbox" checked={pending} onChange={e=>setPending(e.target.checked)}/> Incluir pendentes na lista de produção</label><div className="report-buttons"><button onClick={()=>run("producao")}><FileText/> Lista de produção</button><button onClick={()=>run("periodo")}><FileText/> Pedidos do período</button><button onClick={()=>run("receber")}><FileText/> Contas a receber</button><button onClick={()=>download(`pedidos-${today()}.csv`,csv(pedidos),"text/csv;charset=utf-8")}><Download/> Exportar CSV</button><button onClick={()=>void backup()}><Download/> Exportar backup JSON</button></div><p className="muted">O pedido individual pode ser impresso selecionando um pedido na agenda e usando o relatório por período como registro operacional.</p></div>;
}

function ConfigView({config,setConfig,blocked,blockedDate,setBlockedDate,setError,onSaved}:{config:Config;setConfig:(c:Config)=>void;blocked:{data:string;motivo:string}[];blockedDate:string;setBlockedDate:(v:string)=>void;setError:(e:string)=>void;onSaved:()=>Promise<void>}){
  const [saving,setSaving]=useState(false);
  const set=<K extends keyof Config>(k:K,v:Config[K])=>setConfig({...config,[k]:v});
  async function save(e:React.FormEvent){e.preventDefault();setSaving(true);setError("");try{const payload={...config,antecedencia_min:0};const r=await db.rpc("salvar_configuracao",{p_dados:payload});if(r.error)throw r.error;await onSaved();}catch(e){setError(e instanceof Error?e.message:"Não foi possível salvar as configurações.");}finally{setSaving(false)}}
  async function addBlock(){if(!blockedDate)return;try{const r=await db.from("datas_bloqueadas").upsert({data:blockedDate,motivo:"Bloqueada pela Rosilene"});if(r.error)throw r.error;setBlockedDate("");await onSaved();}catch(e){setError(e instanceof Error?e.message:"Não foi possível bloquear a data.")}}
  async function removeBlock(date:string){try{const r=await db.from("datas_bloqueadas").delete().eq("data",date);if(r.error)throw r.error;await onSaved();}catch(e){setError(e instanceof Error?e.message:"Não foi possível liberar a data.")}}
  return <form className="panel config-form" onSubmit={save}><h2>Operação</h2><p className="notice">Pedidos podem ser feitos para hoje; o sistema bloqueia apenas horários que já passaram.</p><label className="check"><input type="checkbox" checked={config.recebendo_pedidos} onChange={e=>set("recebendo_pedidos",e.target.checked)}/> Receber encomendas pelo site</label><div className="form-grid"><label>Antecedência máxima (dias)<input type="number" min="0" max="365" value={config.antecedencia_max} onChange={e=>set("antecedencia_max",Number(e.target.value))}/></label><label>Limite por dia (vazio = sem limite)<input type="number" min="1" value={config.limite_dia??""} onChange={e=>set("limite_dia",e.target.value?Number(e.target.value):null)}/></label><label>Prazo máximo do fiado (dias)<input type="number" min="1" max="365" value={config.prazo_fiado} onChange={e=>set("prazo_fiado",Number(e.target.value))}/></label><label>Múltiplo do pedido<input type="number" min="1" value={config.multiplo_pedido} onChange={e=>set("multiplo_pedido",Number(e.target.value))}/></label><label>WhatsApp<input value={config.whatsapp} onChange={e=>set("whatsapp",e.target.value)}/></label><label>Chave Pix<input value={config.pix_chave} onChange={e=>set("pix_chave",e.target.value)}/></label><label>Nome do Pix<input value={config.pix_nome} onChange={e=>set("pix_nome",e.target.value)}/></label><label>Cidade do Pix<input value={config.pix_cidade} onChange={e=>set("pix_cidade",e.target.value.toUpperCase())}/></label></div><label className="check"><input type="checkbox" checked={config.fiado_todos} onChange={e=>set("fiado_todos",e.target.checked)}/> Liberar fiado para todos</label><h2>Entrega</h2><label className="check"><input type="checkbox" checked={config.frete_gratis} onChange={e=>set("frete_gratis",e.target.checked)}/> Não cobramos frete</label><label>Endereço de saída<input value={config.endereco_saida} onChange={e=>set("endereco_saida",e.target.value)}/></label><h2>Tamanhos</h2><label>Tamanhos disponíveis (separados por vírgula)<input value={config.tamanhos.join(", ")} onChange={e=>set("tamanhos",e.target.value.split(",").map(x=>Number(x.trim())).filter(Boolean))}/></label><h2>Mensagens</h2><label>Confirmação<textarea value={config.mensagem_confirmacao} onChange={e=>set("mensagem_confirmacao",e.target.value)}/></label><label>Cobrança<textarea value={config.mensagem_cobranca} onChange={e=>set("mensagem_cobranca",e.target.value)}/></label><h2>Datas bloqueadas</h2><div className="inline"><input type="date" value={blockedDate} onChange={e=>setBlockedDate(e.target.value)}/><button type="button" onClick={()=>void addBlock()}>Bloquear</button></div><div className="chips">{blocked.map(d=><button type="button" key={d.data} onClick={()=>void removeBlock(d.data)}>{dateBR(d.data)} ×</button>)}</div><div className="form-actions"><button className="button" disabled={saving}>{saving?"Salvando…":"Salvar configurações"}</button></div></form>;
}
