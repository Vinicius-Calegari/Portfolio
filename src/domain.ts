export type Status =
  "pendente" | "aguardando_confirmacao" | "confirmado" | "cancelado";
export const statuses: Record<Status, string> = {
  pendente: "Pendente",
  aguardando_confirmacao: "Aguardando confirmação",
  confirmado: "Confirmado",
  cancelado: "Cancelado",
};
export interface Produto {
  id: string;
  nome: string;
  descricao: string;
  foto: string | null;
  preco_cento: number;
  quantidade_minima: number;
  multiplo: number;
  categoria: string;
  ativo: boolean;
  ordem: number;
}
export interface Config {
  empresa: string;
  whatsapp: string;
  antecedencia_min: number;
  antecedencia_max: number;
  limite_dia: number | null;
  prazo_fiado: number;
  fiado_todos: boolean;
  pix_chave: string;
  pix_nome: string;
  pix_cidade: string;
  tamanhos: number[];
  multiplo_pedido: number;
  frete_gratis: boolean;
  endereco_saida: string;
  saida_lat: number | null;
  saida_lng: number | null;
  frete_tipo: "faixas" | "km";
  faixas: { ate: number; valor: number }[];
  frete_base: number;
  frete_por_km: number;
  frete_minimo: number;
  distancia_max: number;
  mensagem_confirmacao: string;
  mensagem_cobranca: string;
  recebendo_pedidos: boolean;
  aviso_privacidade: string;
  versao: number;
}
export const defaultConfig: Config = {
  empresa: "Salgados Rosilene",
  whatsapp: "5531998991812",
  antecedencia_min: 0,
  antecedencia_max: 60,
  limite_dia: null,
  prazo_fiado: 30,
  fiado_todos: false,
  pix_chave: "",
  pix_nome: "",
  pix_cidade: "FERROS",
  tamanhos: [50, 100, 200],
  multiplo_pedido: 25,
  frete_gratis: true,
  endereco_saida: "Rua Arthur Couto, 238, Padre Alberto, Ferros - MG",
  saida_lat: null,
  saida_lng: null,
  frete_tipo: "km",
  faixas: [],
  frete_base: 0,
  frete_por_km: 0,
  frete_minimo: 0,
  distancia_max: 10,
  mensagem_confirmacao:
    "Olá, {nome}! Podemos confirmar sua encomenda?\n\n{resumo}",
  mensagem_cobranca:
    "Olá, {nome}! Sua encomenda tem o valor de {total}, combinado para {vencimento}.\n\n{resumo}\n\nPix: {pix}",
  recebendo_pedidos: false,
  aviso_privacidade:
    "Usamos seu nome, WhatsApp e endereço para preparar e confirmar a encomenda. Somente a responsável pela Salgados Rosilene acessa esses dados. Para solicitar correção ou exclusão, fale com nosso WhatsApp. Não enviamos publicidade sem autorização.",
  versao: 1,
};
export interface Cliente {
  id: string;
  nome: string;
  whatsapp: string;
  fiado_liberado: boolean;
  observacoes: string;
}
export interface Item {
  id?: string;
  produto_id: string;
  nome_produto: string;
  quantidade: number;
  preco_cento: number;
  valor_linha: number;
}
export interface Grupo {
  id?: string;
  ordem: number;
  tamanho_total: number;
  itens_pedido: Item[];
}
export interface Endereco {
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  complemento: string;
}
export interface Pedido {
  id: string;
  numero: number;
  cliente_id: string | null;
  nome_cliente: string;
  whatsapp: string;
  data_entrega: string;
  horario: string;
  tipo: "retirada" | "entrega";
  endereco: Endereco | null;
  ponto_referencia: string;
  observacoes: string;
  status: Status;
  subtotal: number;
  cupom_codigo?: string | null;
  desconto?: number;
  frete_valor: number;
  frete_km: number | null;
  frete_modo: "nenhum" | "calculado" | "manual" | "a_combinar";
  total: number;
  forma_pagamento: "dinheiro" | "pix";
  precisa_troco: boolean;
  troco_para: number | null;
  pagar_depois: boolean;
  data_prometida_pagamento: string | null;
  pago: boolean;
  data_pagamento: string | null;
  criado_em: string;
  versao: number;
  grupos_pedido: Grupo[];
}
export interface DraftGrupo {
  tamanho_total: number;
  itens: { produto_id: string; quantidade: number }[];
}
export const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
export const dateBR = (date: string | null | undefined) =>
  date ? date.slice(0, 10).split("-").reverse().join("/") : "—";
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function phone(raw: string) {
  let s = raw.replace(/\D/g, "");
  if (s.length === 13 && s.startsWith("55")) s = s.slice(2);
  const ddd =
    /^(1[1-9]|2[12478]|3[1-578]|4[1-9]|5[13-5]|6[1-9]|7[134579]|8[1-9]|9[1-9])9\d{8}$/;
  if (!ddd.test(s))
    throw new Error("Informe um celular válido com DDD e 9 dígitos.");
  return `55${s}`;
}
export function maskPhone(raw: string) {
  let s = raw.replace(/\D/g, "");
  if (s.length === 13 && s.startsWith("55")) s = s.slice(2);
  s = s.slice(0, 11);
  return s.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}
export function cents(raw: string) {
  const n = Number(raw.replace(/\./g, "").replace(",", "."));
  return Math.round(n * 100);
}
export const decimal = (c: number) => (c / 100).toFixed(2).replace(".", ",");
export const lineTotal = (q: number, p: number) =>
  Math.floor((q * p + 50) / 100);
export function draftTotal(groups: DraftGrupo[], products: Produto[]) {
  return groups.reduce(
    (sum, g) =>
      sum +
      g.itens.reduce(
        (s, i) =>
          s +
          lineTotal(
            i.quantidade,
            products.find((p) => p.id === i.produto_id)?.preco_cento || 0,
          ),
        0,
      ),
    0,
  );
}
export function validateGroup(
  g: DraftGrupo,
  products: Produto[],
  multiple = 25,
) {
  if (
    !Number.isInteger(g.tamanho_total) ||
    g.tamanho_total < multiple ||
    g.tamanho_total % multiple
  )
    return `Escolha um tamanho em múltiplos de ${multiple}.`;
  if (g.itens.reduce((s, i) => s + i.quantidade, 0) !== g.tamanho_total)
    return "Complete a quantidade escolhida antes de continuar.";
  if (new Set(g.itens.map((i) => i.produto_id)).size !== g.itens.length)
    return "Há sabores repetidos no grupo.";
  for (const i of g.itens) {
    const p = products.find((p) => p.id === i.produto_id);
    if (
      !p ||
      !p.ativo ||
      !Number.isInteger(i.quantidade) ||
      i.quantidade < p.quantidade_minima ||
      i.quantidade % p.multiplo
    )
      return `Confira o mínimo e o múltiplo de ${p?.nome || "cada sabor"}.`;
  }
  return "";
}
export function addressText(a: Endereco | null) {
  return a
    ? `${a.rua}, ${a.numero}${a.complemento ? `, ${a.complemento}` : ""} - ${a.bairro}, ${a.cidade} - ${a.uf}${a.cep ? `, CEP ${a.cep}` : ""}`
    : "";
}
export function summary(p: Pedido) {
  return `Pedido #${p.numero} • ${p.nome_cliente}\n${p.grupos_pedido.map((g, i) => `Grupo ${i + 1}: ${g.itens_pedido.map((it) => `${it.quantidade} ${it.nome_produto}`).join(", ")}`).join("\n")}\n${dateBR(p.data_entrega)} às ${p.horario.slice(0, 5)} • ${p.tipo === "entrega" ? "Entrega" : "Retirada"}${p.endereco ? `\n${addressText(p.endereco)}\nReferência: ${p.ponto_referencia}` : ""}\nSalgados: ${money(p.subtotal)}${p.desconto ? `\nCupom ${p.cupom_codigo}: −${money(p.desconto)}` : ""}\nFrete: ${p.frete_modo === "a_combinar" ? "a combinar" : money(p.frete_valor)}\n${p.frete_modo === "a_combinar" ? "Total parcial" : "Total"}: ${money(p.total)}\nPagamento: ${p.forma_pagamento === "pix" ? "Pix" : "Dinheiro"}${p.pagar_depois ? ` • fiado até ${dateBR(p.data_prometida_pagamento)}` : " • na entrega/retirada"}${p.precisa_troco ? `\nTroco para ${money(p.troco_para || 0)} (devolver ${money(Math.max(0, (p.troco_para || 0) - p.total))})` : ""}\nSituação: ${p.pago ? "Pago" : "Não pago"}${p.observacoes ? `\nObservações: ${p.observacoes}` : ""}`;
}
export function message(template: string, p: Pedido, pix: string) {
  const vars: Record<string, string> = {
    nome: p.nome_cliente,
    total: money(p.total),
    vencimento: dateBR(p.data_prometida_pagamento || p.data_entrega),
    pix,
    resumo: summary(p),
  };
  return template.replace(
    /\{(nome|total|vencimento|pix|resumo)\}/g,
    (_, k) => vars[k],
  );
}
export const waLink = (number: string, text: string) =>
  `https://wa.me/${phone(number)}?text=${encodeURIComponent(text)}`;
export function csv(orders: Pedido[]) {
  const esc = (s: unknown) => {
    let t = String(s ?? "");
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return `"${t.replace(/"/g, '""')}"`;
  };
  const rows = [
    [
      "Número",
      "Cliente",
      "WhatsApp",
      "Data",
      "Horário",
      "Tipo",
      "Endereço",
      "Itens",
      "Status",
      "Subtotal (R$)",
      "Frete (R$)",
      "Total (R$)",
      "Pagamento",
      "Pago",
      "Vencimento",
    ],
    ...orders.map((p) => [
      p.numero,
      p.nome_cliente,
      p.whatsapp,
      dateBR(p.data_entrega),
      p.horario,
      p.tipo,
      addressText(p.endereco),
      p.grupos_pedido
        .flatMap((g) =>
          g.itens_pedido.map((i) => `${i.quantidade} ${i.nome_produto}`),
        )
        .join("; "),
      statuses[p.status],
      decimal(p.subtotal),
      decimal(p.frete_valor),
      decimal(p.total),
      p.forma_pagamento,
      p.pago ? "Sim" : "Não",
      dateBR(p.data_prometida_pagamento),
    ]),
  ];
  return "\ufeff" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
}
