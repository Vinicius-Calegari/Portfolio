import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  CheckCircle2,
  Clipboard,
  MapPin,
  MessageCircle,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import QRCode from "qrcode";
import { useCatalog, ErrorBox, Empty, Spinner, ProductPhoto } from "./App";
import { edge } from "./api";
import {
  addDays,
  addressText,
  cents,
  dateBR,
  draftTotal,
  maskPhone,
  money,
  phone,
  summary,
  today,
  validateGroup,
  waLink,
} from "./domain";
import type { Config, DraftGrupo, Endereco, Pedido, Produto } from "./domain";
import { normalizePixKey, pixPayload } from "./pix";
import { copyText, safeUuid } from "./browser";
import { couponDiscount } from "./coupons";
import type { AppliedCoupon } from "./coupons";
import TimePicker from "./TimePicker";
import { isDeliveryTime, isTimeAvailable } from "./schedule";
export function Pix({ pedido, config }: { pedido: Pedido; config: Config }) {
  const [qr, setQr] = useState<{
    payload: string;
    url?: string;
    error?: boolean;
  } | null>(null);
  const [copyStatus, setCopyStatus] = useState<{
    payload: string;
    copied: boolean;
  } | null>(null);
  let payload = "";
  let key = "";
  let pixError = "";
  try {
    if (pedido.frete_modo !== "a_combinar" && pedido.total > 0) {
      key = normalizePixKey(config.pix_chave, config.whatsapp);
      payload = pixPayload(
        key,
        config.pix_nome,
        config.pix_cidade,
        pedido.total,
        `ROS${pedido.numero}`,
      );
    }
  } catch (e) {
    pixError =
      e instanceof Error ? e.message : "Confira os dados do Pix cadastrados.";
  }
  useEffect(() => {
    let active = true;
    setQr(null);
    setCopyStatus(null);
    if (payload)
      void QRCode.toDataURL(payload, { width: 280, margin: 4 })
        .then((url) => {
          if (active) setQr({ payload, url });
        })
        .catch(() => {
          if (active) setQr({ payload, error: true });
        });
    return () => {
      active = false;
    };
  }, [payload]);
  if (!payload)
    return (
      <div className="notice">
        {pedido.frete_modo === "a_combinar"
          ? "O Pix com o valor total estará disponível depois de combinar o frete."
          : pedido.total === 0
            ? "Não há valor a pagar nesta encomenda."
            : pixError || "Combine os dados do Pix pelo WhatsApp."}
      </div>
    );
  return (
    <section className="pix-box">
      <h3>Pagar com Pix</h3>
      <p className="pix-amount">{money(pedido.total)}</p>
      <p>
        Escaneie o QR Code no aplicativo do seu banco ou use o Pix copia e cola
        abaixo.
      </p>
      {pedido.pagar_depois && (
        <p>
          Pagamento combinado para {dateBR(pedido.data_prometida_pagamento)}.
        </p>
      )}
      {qr?.payload === payload && qr.url ? (
        <img
          src={qr.url}
          width={280}
          height={280}
          alt="QR Code Pix do pedido"
        />
      ) : qr?.payload === payload && qr.error ? (
        <p role="status">
          Não foi possível exibir o QR Code. Use o copia e cola abaixo.
        </p>
      ) : (
        <p role="status">Gerando QR Code…</p>
      )}
      <p>
        <strong>Recebedor:</strong> {config.pix_nome}
        <br />
        <strong>Chave:</strong> {key}
      </p>
      <label>
        Pix copia e cola
        <textarea
          readOnly
          value={payload}
          spellCheck={false}
          onFocus={(e) => e.currentTarget.select()}
        />
      </label>
      <button
        type="button"
        className="button secondary"
        onClick={async () => {
          try {
            await copyText(payload);
            setCopyStatus({ payload, copied: true });
          } catch {
            setCopyStatus({ payload, copied: false });
          }
        }}
      >
        <Clipboard size={17} />
        {copyStatus?.payload === payload && copyStatus.copied
          ? "Pix copiado"
          : "Copiar Pix"}
      </button>
      <div aria-live="polite">
        {copyStatus?.payload === payload && !copyStatus.copied && (
          <p>
            Selecione o código acima e copie para colar no aplicativo do banco.
          </p>
        )}
      </div>
      <p className="muted">A confirmação do pagamento é feita pela Rosilene.</p>
    </section>
  );
}
export function GroupBuilder({
  groups,
  onChange,
  products,
  config,
}: {
  groups: DraftGrupo[];
  onChange: (g: DraftGrupo[]) => void;
  products: Produto[];
  config: Config;
}) {
  const [active, setActive] = useState(0);
  const [msg, setMsg] = useState("");
  const g = groups[active] || groups[0];
  const chosen = g.itens.reduce((s, i) => s + i.quantidade, 0);
  const remaining = g.tamanho_total - chosen;
  const update = (next: DraftGrupo) =>
    onChange(groups.map((old, i) => (i === active ? next : old)));
  const qty = (id: string, n: number) => {
    const old = g.itens.find((i) => i.produto_id === id)?.quantidade || 0;
    if (!Number.isInteger(n) || n < 0 || n > remaining + old) return;
    update({
      ...g,
      itens: [
        ...g.itens.filter((i) => i.produto_id !== id),
        ...(n ? [{ produto_id: id, quantidade: n }] : []),
      ],
    });
    setMsg("");
  };
  return (
    <>
      <div
        className="group-tabs"
        role="tablist"
        aria-label="Grupos da encomenda"
      >
        {groups.map((_, i) => (
          <button
            role="tab"
            aria-selected={active === i}
            className={active === i ? "active" : ""}
            onClick={() => {
              setActive(i);
              setMsg("");
            }}
            key={i}
          >
            Grupo {i + 1}
          </button>
        ))}
        <button
          onClick={() => {
            const error = validateGroup(g, products, config.multiplo_pedido);
            if (error) {
              setMsg(error);
              return;
            }
            onChange([
              ...groups,
              {
                tamanho_total:
                  100 % config.multiplo_pedido === 0 ? 100 : config.tamanhos[0],
                itens: [],
              },
            ]);
            setActive(groups.length);
          }}
          disabled={groups.length >= 20}
        >
          <Plus size={16} />
          Adicionar outro cento
        </button>
      </div>
      <div className="builder-heading">
        <div>
          <h2>Qual o tamanho da sua encomenda?</h2>
          <p>
            Primeiro escolha a quantidade. Depois, distribua entre os sabores.
          </p>
        </div>
        {groups.length > 1 && (
          <button
            className="icon-button"
            aria-label={`Remover grupo ${active + 1}`}
            onClick={() => {
              onChange(groups.filter((_, i) => i !== active));
              setActive(Math.max(0, active - 1));
            }}
          >
            <Trash2 size={19} />
          </button>
        )}
      </div>
      <div className="size-options">
        {config.tamanhos.map((n) => (
          <button
            className={g.tamanho_total === n ? "selected" : ""}
            key={n}
            onClick={() => {
              if (chosen > n) {
                setMsg(
                  "Diminua as quantidades dos sabores antes de reduzir o tamanho.",
                );
                return;
              }
              update({ ...g, tamanho_total: n });
            }}
          >
            <strong>{n}</strong>
            <span>
              {n === 50
                ? "meio cento"
                : n === 100
                  ? "1 cento"
                  : `${n / 100} centos`}
            </span>
          </button>
        ))}
        <label className="custom-size">
          Outra quantidade
          <input
            aria-label="Quantidade personalizada"
            type="number"
            min={config.multiplo_pedido}
            max={100000}
            step={config.multiplo_pedido}
            value={g.tamanho_total}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n >= chosen && n > 0) update({ ...g, tamanho_total: n });
            }}
          />
          <small>
            De {config.multiplo_pedido} em {config.multiplo_pedido}
          </small>
        </label>
      </div>
      <ErrorBox text={msg} />
      <h3 className="flavor-title">Agora escolha os sabores</h3>
      <div className="flavor-list">
        {products.map((p) => {
          const count =
            g.itens.find((i) => i.produto_id === p.id)?.quantidade || 0;
          const next = count
            ? count + p.multiplo
            : Math.ceil(p.quantidade_minima / p.multiplo) * p.multiplo;
          return (
            <article className="flavor" key={p.id}>
              <div className="flavor-photo">
                <ProductPhoto product={p} />
              </div>
              <div className="flavor-text">
                <h3>{p.nome}</h3>
                <p>
                  {money(p.preco_cento)} / cento{" "}
                  <span>· {money(p.preco_cento / 100)} / un.</span>
                </p>
                <small>
                  Mínimo {p.quantidade_minima} · múltiplos de {p.multiplo}
                </small>
              </div>
              <div className="quantity">
                <button
                  aria-label={`Diminuir ${p.nome}`}
                  disabled={!count}
                  onClick={() =>
                    qty(
                      p.id,
                      count - p.multiplo < p.quantidade_minima
                        ? 0
                        : count - p.multiplo,
                    )
                  }
                >
                  <Minus size={17} />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max={count + remaining}
                  aria-label={`Quantidade de ${p.nome}`}
                  value={count}
                  onChange={(e) => qty(p.id, Number(e.target.value))}
                />
                <button
                  aria-label={`Aumentar ${p.nome}`}
                  disabled={next - count > remaining}
                  onClick={() => qty(p.id, next)}
                >
                  <Plus size={17} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <div className="group-progress" aria-live="polite">
        <div>
          <strong>
            Escolhidos {chosen} de {g.tamanho_total}.
          </strong>
          <span>
            {remaining === 0 ? (
              <>
                <Check size={17} /> Grupo completo!
              </>
            ) : (
              `Faltam ${remaining}`
            )}
          </span>
        </div>
        <progress max={g.tamanho_total} value={chosen} />
      </div>
    </>
  );
}
interface Quote {
  valor: number;
  km: number | null;
  modo: "nenhum" | "calculado" | "a_combinar";
  config_versao: number;
}
export default function OrderForm({
  manual = false,
  onDone,
}: {
  manual?: boolean;
  onDone?: (p: Pedido) => void;
}) {
  const {
    produtos,
    config: c,
    bloqueadas,
    loading,
    error: loadError,
  } = useCatalog();
  const [groups, setGroups] = useState<DraftGrupo[]>([
    {
      tamanho_total: c.tamanhos.includes(100) ? 100 : c.tamanhos[0],
      itens: [],
    },
  ]);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Pedido | null>(null);
  const [rid] = useState(() => safeUuid());
  const [form, setForm] = useState({
    nome: "",
    whatsapp: "",
    data_entrega: "",
    horario: "",
    tipo: "retirada",
    ponto_referencia: "",
    observacoes: "",
    forma_pagamento: "dinheiro",
    precisa_troco: false,
    troco_para: "",
    pagar_depois: false,
    data_prometida_pagamento: "",
    consentimento: false,
    website: "",
  });
  const [address, setAddress] = useState<Endereco>({
    rua: "",
    numero: "",
    bairro: "",
    cidade: "Ferros",
    uf: "MG",
    cep: "",
    complemento: "",
  });
  const [credit, setCredit] = useState(false);
  const [frete, setFrete] = useState<Quote | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const couponRequest = useRef(0);
  function clearCoupon() {
    couponRequest.current += 1;
    setCoupon(null);
    setCouponInput("");
    setCouponError("");
    setCouponBusy(false);
  }
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    if (k === "pagar_depois" && v) clearCoupon();
    setForm((f) => ({ ...f, [k]: v }));
    setError("");
  };
  const subtotal = draftTotal(groups, produtos);
  const discount = couponDiscount(coupon, subtotal, form.pagar_depois);
  const total = subtotal + (frete?.valor || 0) - discount;
  const min = today();
  const max = addDays(today(), c.antecedencia_max);
  useEffect(
    () => () => {
      couponRequest.current += 1;
    },
    [],
  );
  async function applyCoupon() {
    const code = couponInput.trim().toUpperCase();
    if (!code || form.pagar_depois) {
      clearCoupon();
      return;
    }
    const request = ++couponRequest.current;
    setCouponBusy(true);
    setCouponError("");
    try {
      const result = await edge("cupom", {
        codigo: code,
        subtotal,
        pagar_depois: false,
      });
      if (request === couponRequest.current) {
        setCoupon(result as AppliedCoupon);
        setCouponInput(result.codigo);
      }
    } catch (e) {
      if (request === couponRequest.current) {
        setCoupon(null);
        setCouponError(e instanceof Error ? e.message : "Cupom inválido.");
      }
    } finally {
      if (request === couponRequest.current) setCouponBusy(false);
    }
  }
  useEffect(() => {
    if (!loading)
      setGroups((current) =>
        current.map((group) =>
          !group.itens.length && group.tamanho_total % c.multiplo_pedido !== 0
            ? { ...group, tamanho_total: c.tamanhos[0] }
            : group,
        ),
      );
  }, [loading, c.multiplo_pedido, c.tamanhos]);
  useEffect(() => {
    setFrete(null);
  }, [address, form.tipo, c.versao]);
  useEffect(() => {
    setCredit(c.fiado_todos);
    setForm((f) => ({ ...f, pagar_depois: false }));
    let live = true;
    let normalized;
    try {
      normalized = phone(form.whatsapp);
    } catch {
      return;
    }
    void edge("fiado", { whatsapp: normalized })
      .then((r) => {
        if (live) setCredit(r.liberado);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [form.whatsapp, c.fiado_todos]);
  async function quoteNow() {
    if (form.tipo === "retirada" || c.frete_gratis) {
      const q: Quote = {
        valor: 0,
        km: null,
        modo: "nenhum",
        config_versao: c.versao,
      };
      setFrete(q);
      return q;
    }
    setQuoteBusy(true);
    try {
      const q = await edge("frete", { tipo: form.tipo, endereco: address });
      setFrete(q);
      return q as Quote;
    } finally {
      setQuoteBusy(false);
    }
  }
  async function next() {
    try {
      setError("");
      if (step === 0) {
        for (const g of groups) {
          const e = validateGroup(g, produtos, c.multiplo_pedido);
          if (e) throw new Error(e);
        }
      }
      if (step === 1) {
        if (form.nome.trim().length < 3)
          throw new Error("Informe seu nome completo.");
        phone(form.whatsapp);
        if (
          !form.data_entrega ||
          form.data_entrega < min ||
          form.data_entrega > max ||
          bloqueadas.includes(form.data_entrega)
        )
          throw new Error("Escolha uma data disponível.");
        if (!form.horario) throw new Error("Escolha um horário.");
        if (!isDeliveryTime(form.horario))
          throw new Error("Escolha um horário em intervalos de 20 minutos.");
        if (!isTimeAvailable(form.horario, form.data_entrega, manual))
          throw new Error("Escolha um horário que ainda não passou.");
        if (
          form.tipo === "entrega" &&
          (!address.rua.trim() ||
            !address.numero.trim() ||
            !address.bairro.trim() ||
            !address.cidade.trim() ||
            !form.ponto_referencia.trim())
        )
          throw new Error("Complete o endereço e o ponto de referência.");
        await quoteNow();
      }
      setStep((s) => s + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confira os dados.");
    }
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (!isDeliveryTime(form.horario))
        throw new Error("Escolha um horário em intervalos de 20 minutos.");
      if (!isTimeAvailable(form.horario, form.data_entrega, manual))
        throw new Error("Escolha um horário que ainda não passou.");
      if (!manual && !form.consentimento)
        throw new Error("Aceite o aviso de privacidade para enviar.");
      if (
        form.pagar_depois &&
        (!form.data_prometida_pagamento ||
          form.data_prometida_pagamento < form.data_entrega ||
          form.data_prometida_pagamento >
            addDays(form.data_entrega, c.prazo_fiado))
      )
        throw new Error("Escolha uma data de pagamento dentro do prazo.");
      if (form.precisa_troco && cents(form.troco_para) < total)
        throw new Error("O valor para troco precisa cobrir o total.");
      const p = await edge(
        manual ? "manual" : "criar",
        {
          ...form,
          whatsapp: phone(form.whatsapp),
          endereco: form.tipo === "entrega" ? address : null,
          troco_para: form.precisa_troco ? cents(form.troco_para) : null,
          data_prometida_pagamento: form.pagar_depois
            ? form.data_prometida_pagamento
            : null,
          grupos: groups,
          requisicao_id: rid,
          cupom: form.pagar_depois ? null : coupon?.codigo || null,
        },
        manual,
      );
      setReceipt(p);
      onDone?.(p);
      window.scrollTo(0, 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Spinner />;
  if (loadError) return <ErrorBox text={loadError} />;
  if (receipt)
    return (
      <div className="container receipt">
        <CheckCircle2 className="success-icon" size={54} />
        <span className="eyebrow">PEDIDO #{receipt.numero}</span>
        <h1>Recebemos seu pedido!</h1>
        <p>
          Vamos confirmar pelo WhatsApp{" "}
          <strong>{maskPhone(receipt.whatsapp)}</strong>.
        </p>
        <p>
          Seu pedido já está salvo. A confirmação será combinada com a Rosilene.
        </p>
        {receipt.forma_pagamento === "pix" && (
          <Pix pedido={receipt} config={c} />
        )}
        <pre className="order-summary">{summary(receipt)}</pre>
        <a
          className="button"
          target="_blank"
          rel="noreferrer"
          href={waLink(c.whatsapp, summary(receipt))}
        >
          <MessageCircle size={18} />
          Enviar meu pedido pelo WhatsApp
        </a>
        <Link className="text-button" to={manual ? "/painel" : "/"}>
          Voltar ao início
        </Link>
      </div>
    );
  if (!produtos.length || (!manual && !c.recebendo_pedidos))
    return (
      <div className="container prose">
        <Empty title="Encomendas pelo WhatsApp">
          <p>
            {!produtos.length
              ? "O cardápio on-line está sendo preparado."
              : "As encomendas on-line estão pausadas no momento."}
          </p>
          <a
            className="button"
            href={`https://wa.me/${c.whatsapp}`}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle size={18} />
            Falar com a Rosilene
          </a>
        </Empty>
      </div>
    );
  return (
    <div
      className={manual ? "order-page manual-order" : "container order-page"}
    >
      <div className="page-heading">
        <span className="eyebrow">
          {manual ? "CADASTRO MANUAL" : "DO SEU JEITO, PARA SUA MESA"}
        </span>
        <h1>{manual ? "Novo pedido" : "Monte sua encomenda"}</h1>
        <p>Escolha os sabores e combine os detalhes com a gente.</p>
      </div>
      <div className="steps" aria-label="Etapas">
        {["Salgados", "Data e entrega", "Revisar e enviar"].map((title, i) => (
          <span
            key={title}
            className={step === i ? "current" : step > i ? "done" : ""}
          >
            <b>{step > i ? <Check size={14} /> : i + 1}</b>
            {title}
          </span>
        ))}
      </div>
      <div className="order-layout">
        <section className="panel order-main">
          {step === 0 ? (
            <GroupBuilder
              groups={groups}
              onChange={setGroups}
              products={produtos}
              config={c}
            />
          ) : step === 1 ? (
            <>
              <h2>Quando e onde?</h2>
              <div className="form-grid">
                <label>
                  Nome completo
                  <input
                    value={form.nome}
                    autoComplete="name"
                    maxLength={120}
                    onChange={(e) => set("nome", e.target.value)}
                  />
                </label>
                <label>
                  WhatsApp com DDD
                  <input
                    value={form.whatsapp}
                    type="tel"
                    autoComplete="tel"
                    placeholder="(31) 99999-9999"
                    onChange={(e) => set("whatsapp", maskPhone(e.target.value))}
                  />
                  <small>
                    Use um número com WhatsApp, é por ele que vamos confirmar
                    seu pedido.
                  </small>
                </label>
                <label>
                  Data desejada
                  <select
                    value={form.data_entrega}
                    onChange={(e) => {
                      set("data_entrega", e.target.value);
                      set("data_prometida_pagamento", "");
                    }}
                  >
                    <option value="">Escolha uma data</option>
                    {Array.from(
                      {
                        length: Math.max(0, c.antecedencia_max + 1),
                      },
                      (_, i) => addDays(min, i),
                    ).map((d) => (
                      <option
                        key={d}
                        value={d}
                        disabled={bloqueadas.includes(d)}
                      >
                        {dateBR(d)}
                        {bloqueadas.includes(d) ? " · indisponível" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="time-field">
                  <span>Horário</span>
                  <TimePicker
                    value={form.horario}
                    date={form.data_entrega}
                    manual={manual}
                    onChange={(value) => set("horario", value)}
                  />
                </div>
              </div>
              <fieldset>
                <legend>Como prefere receber?</legend>
                <div className="radio-cards">
                  {["retirada", "entrega"].map((t) => (
                    <label
                      key={t}
                      className={form.tipo === t ? "selected" : ""}
                    >
                      <input
                        type="radio"
                        name="tipo"
                        checked={form.tipo === t}
                        onChange={() => set("tipo", t)}
                      />
                      {t === "retirada" ? "Vou retirar" : "Quero receber"}
                    </label>
                  ))}
                </div>
              </fieldset>
              {form.tipo === "entrega" ? (
                <>
                  <div className="form-grid">
                    {(
                      [
                        ["rua", "Rua"],
                        ["numero", "Número"],
                        ["bairro", "Bairro"],
                        ["cidade", "Cidade"],
                        ["uf", "Estado (UF)"],
                        ["cep", "CEP (opcional)"],
                        ["complemento", "Complemento (opcional)"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <input
                          maxLength={key === "uf" ? 2 : 160}
                          value={address[key]}
                          onChange={(e) =>
                            setAddress((a) => ({ ...a, [key]: e.target.value }))
                          }
                        />
                      </label>
                    ))}
                    <label>
                      Ponto de referência
                      <input
                        value={form.ponto_referencia}
                        placeholder="Portão azul, ao lado da padaria…"
                        onChange={(e) =>
                          set("ponto_referencia", e.target.value)
                        }
                      />
                    </label>
                  </div>
                  {c.frete_gratis ? (
                    <p className="notice">
                      <MapPin size={17} />
                      Entrega sem custo.
                    </p>
                  ) : (
                    <>
                      <button
                        className="button secondary"
                        onClick={() =>
                          void quoteNow().catch((e) => setError(e.message))
                        }
                        disabled={quoteBusy}
                      >
                        {quoteBusy ? "Calculando…" : "Calcular entrega"}
                      </button>
                      {frete && (
                        <p className="notice">
                          {frete.modo === "a_combinar"
                            ? "Não conseguimos calcular o frete automaticamente. Ele será combinado pelo WhatsApp."
                            : `Frete: ${money(frete.valor)}, ${frete.km?.toLocaleString("pt-BR")} km`}
                        </p>
                      )}
                    </>
                  )}
                </>
              ) : (
                <p className="notice">
                  <MapPin size={17} />
                  {c.endereco_saida}
                </p>
              )}
              <label>
                Observações <small>(alergias, embalagem ou recados)</small>
                <textarea
                  value={form.observacoes}
                  maxLength={2000}
                  onChange={(e) => set("observacoes", e.target.value)}
                />
              </label>
            </>
          ) : (
            <>
              <h2>Confira e envie</h2>
              <div className="review-details">
                <strong>{form.nome}</strong>
                <span>{maskPhone(form.whatsapp)}</span>
                <span>
                  {dateBR(form.data_entrega)} às {form.horario} ·{" "}
                  {form.tipo === "entrega" ? "Entrega" : "Retirada"}
                </span>
                {form.tipo === "entrega" && (
                  <span>
                    {addressText(address)} · {form.ponto_referencia}
                  </span>
                )}
              </div>
              <fieldset>
                <legend>Forma de pagamento</legend>
                <div className="radio-cards">
                  <label
                    className={
                      form.forma_pagamento === "dinheiro" ? "selected" : ""
                    }
                  >
                    <input
                      type="radio"
                      checked={form.forma_pagamento === "dinheiro"}
                      onChange={() => set("forma_pagamento", "dinheiro")}
                    />
                    Dinheiro
                  </label>
                  <label
                    className={form.forma_pagamento === "pix" ? "selected" : ""}
                  >
                    <input
                      type="radio"
                      disabled={!c.pix_chave || !c.pix_nome}
                      checked={form.forma_pagamento === "pix"}
                      onChange={() => {
                        set("forma_pagamento", "pix");
                        set("precisa_troco", false);
                      }}
                    />
                    Pix
                    {(!c.pix_chave || !c.pix_nome) && (
                      <small>Em configuração</small>
                    )}
                  </label>
                </div>
              </fieldset>
              {form.forma_pagamento === "dinheiro" && (
                <>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={form.precisa_troco}
                      onChange={(e) => set("precisa_troco", e.target.checked)}
                    />
                    Precisa de troco?
                  </label>
                  {form.precisa_troco && (
                    <label>
                      Troco para quanto? (R$)
                      <input
                        inputMode="decimal"
                        placeholder="100,00"
                        value={form.troco_para}
                        onChange={(e) => set("troco_para", e.target.value)}
                      />
                    </label>
                  )}
                </>
              )}
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.pagar_depois}
                  disabled={!credit}
                  onChange={(e) => set("pagar_depois", e.target.checked)}
                />
                Pagar depois (fiado)
              </label>
              {!credit ? (
                <small>Disponível para clientes liberados pela Rosilene.</small>
              ) : form.pagar_depois ? (
                <label>
                  Em que dia você vai pagar?
                  <input
                    type="date"
                    value={form.data_prometida_pagamento}
                    min={form.data_entrega}
                    max={addDays(form.data_entrega, c.prazo_fiado)}
                    onChange={(e) =>
                      set("data_prometida_pagamento", e.target.value)
                    }
                  />
                  <small>Até {c.prazo_fiado} dias após a entrega.</small>
                </label>
              ) : (
                <p className="muted">Pagamento na entrega ou retirada.</p>
              )}
              {form.pagar_depois ? (
                <p className="notice">
                  Cupons não são válidos para pagamento fiado.
                </p>
              ) : (
                <section className="coupon-box" aria-label="Cupom de desconto">
                  <label htmlFor="coupon-code">
                    Cupom de desconto <small>(opcional)</small>
                  </label>
                  <div className="coupon-controls">
                    <input
                      id="coupon-code"
                      placeholder="Digite seu cupom"
                      maxLength={30}
                      autoCapitalize="characters"
                      autoComplete="off"
                      value={couponInput}
                      disabled={couponBusy || !!coupon || busy}
                      onChange={(e) => {
                        setCouponInput(e.target.value.toUpperCase());
                        setCouponError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (!couponBusy && !coupon) void applyCoupon();
                        }
                      }}
                    />
                    {coupon ? (
                      <button
                        type="button"
                        className="button secondary"
                        onClick={clearCoupon}
                        disabled={busy}
                      >
                        Remover
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => void applyCoupon()}
                        disabled={couponBusy || busy || !couponInput.trim()}
                      >
                        {couponBusy ? "Validando…" : "Aplicar"}
                      </button>
                    )}
                  </div>
                  <div aria-live="polite">
                    {coupon && (
                      <p className="coupon-success">
                        Cupom {coupon.codigo} aplicado: −{money(discount)}.
                      </p>
                    )}
                    {couponError && <ErrorBox text={couponError} />}
                  </div>
                  <small>Você pode concluir o pedido sem cupom.</small>
                </section>
              )}
              {!manual && form.forma_pagamento === "pix" && total > 0 && (
                <p className="notice">
                  {frete?.modo === "a_combinar"
                    ? "O QR Code e o Pix copia e cola estarão disponíveis depois de combinar o frete."
                    : "Ao enviar a encomenda, você verá o QR Code e o Pix copia e cola com o valor final do pedido."}
                </p>
              )}
              {!manual && (
                <label className="check consent">
                  <input
                    type="checkbox"
                    checked={form.consentimento}
                    onChange={(e) => set("consentimento", e.target.checked)}
                  />
                  <span>
                    Li o{" "}
                    <Link target="_blank" to="/privacidade">
                      aviso de privacidade
                    </Link>{" "}
                    e autorizo o contato pelo WhatsApp sobre esta encomenda.
                  </span>
                </label>
              )}
              <div className="honeypot" aria-hidden="true">
                <label>
                  Website
                  <input
                    value={form.website}
                    tabIndex={-1}
                    autoComplete="off"
                    onChange={(e) => set("website", e.target.value)}
                  />
                </label>
              </div>
            </>
          )}
          <ErrorBox text={error} />
          <div className="form-actions">
            {step > 0 && (
              <button
                className="button secondary"
                onClick={() => {
                  setStep((s) => s - 1);
                  setError("");
                }}
              >
                Voltar e editar
              </button>
            )}
            {step < 2 ? (
              <button
                className="button"
                onClick={() => void next()}
                disabled={
                  quoteBusy ||
                  (step === 0 &&
                    groups.some(
                      (g) => !!validateGroup(g, produtos, c.multiplo_pedido),
                    ))
                }
              >
                Continuar
              </button>
            ) : (
              <button
                className="button"
                onClick={() => void submit()}
                disabled={busy || couponBusy}
              >
                {busy
                  ? "Salvando pedido…"
                  : !manual &&
                      form.forma_pagamento === "pix" &&
                      total > 0 &&
                      frete?.modo !== "a_combinar"
                    ? "Enviar encomenda e ver Pix"
                    : "Enviar encomenda"}
              </button>
            )}
          </div>
        </section>
        <aside className="panel basket">
          <div className="basket-title">
            <ShoppingBag size={21} />
            <h3>Sua encomenda</h3>
          </div>
          {groups.map((g, n) => (
            <div className="basket-group" key={n}>
              <strong>
                Grupo {n + 1} · {g.tamanho_total} salgados
              </strong>
              {g.itens.length ? (
                g.itens.map((i) => (
                  <div key={i.produto_id}>
                    <span>
                      {i.quantidade} ×{" "}
                      {produtos.find((p) => p.id === i.produto_id)?.nome}
                    </span>
                  </div>
                ))
              ) : (
                <p>Escolha os seus sabores.</p>
              )}
            </div>
          ))}
          <dl>
            <div>
              <dt>Salgados</dt>
              <dd>{money(subtotal)}</dd>
            </div>
            <div>
              <dt>Entrega</dt>
              <dd>
                {form.tipo === "retirada"
                  ? "Retirada"
                  : c.frete_gratis
                    ? "Sem custo"
                    : !frete
                      ? "A calcular"
                      : frete.modo === "a_combinar"
                        ? "A combinar"
                        : money(frete.valor)}
              </dd>
            </div>
            {discount > 0 && (
              <div className="coupon-success">
                <dt>Desconto ({coupon?.codigo})</dt>
                <dd>−{money(discount)}</dd>
              </div>
            )}
            <div className="grand-total">
              <dt>
                {frete?.modo === "a_combinar" ? "Total parcial" : "Total"}
              </dt>
              <dd>{money(total)}</dd>
            </div>
          </dl>
          <small>Seu pedido será confirmado pelo WhatsApp.</small>
        </aside>
      </div>
      <div className="mobile-counter">
        <div>
          <strong>
            {groups.reduce(
              (s, g) => s + g.itens.reduce((a, i) => a + i.quantidade, 0),
              0,
            )}{" "}
            de {groups.reduce((s, g) => s + g.tamanho_total, 0)} salgados
          </strong>
          <small>
            Faltam{" "}
            {groups.reduce(
              (s, g) =>
                s +
                g.tamanho_total -
                g.itens.reduce((a, i) => a + i.quantidade, 0),
              0,
            )}
          </small>
        </div>
        <strong>{money(total)}</strong>
      </div>
    </div>
  );
}
