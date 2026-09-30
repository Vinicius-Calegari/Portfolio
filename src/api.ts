import { createClient } from "@supabase/supabase-js";
import { defaultConfig } from "./domain";
import type { Config, Pedido, Produto, Cliente } from "./domain";
const url = import.meta.env.VITE_SUPABASE_URL || "";
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
export const configured = !!url && !!key;
export const db = createClient(
  url || "https://not-configured.supabase.co",
  key || "not-configured",
);
export function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
export async function catalog() {
  const [p, c, d] = await Promise.all([
    db
      .from("produtos")
      .select("*")
      .eq("ativo", true)
      .order("ordem")
      .order("nome"),
    db.rpc("configuracao_publica"),
    db.rpc("disponibilidade"),
  ]);
  fail(p.error);
  fail(c.error);
  fail(d.error);
  return {
    produtos: p.data as Produto[],
    config: { ...defaultConfig, ...c.data } as Config,
    bloqueadas: (d.data || []) as string[],
  };
}
export async function edge(action: string, data: unknown, admin = false) {
  const token = admin
    ? (await db.auth.getSession()).data.session?.access_token
    : import.meta.env.VITE_SUPABASE_EDGE_ANON_KEY;
  const res = await fetch(`${url}/functions/v1/encomendas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_EDGE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, data }),
  });
  const result = await res.json();
  if (!res.ok)
    throw new Error(
      result.error || "Não foi possível concluir. Tente novamente.",
    );
  return result;
}
export async function orders() {
  const { data, error } = await db
    .from("pedidos")
    .select("*, grupos_pedido(*, itens_pedido(*))")
    .order("data_entrega")
    .order("horario");
  fail(error);
  return (data || []).map((p) => ({
    ...p,
    grupos_pedido: p.grupos_pedido.sort(
      (a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem,
    ),
  })) as Pedido[];
}
export async function allProducts() {
  const { data, error } = await db
    .from("produtos")
    .select("*")
    .order("ordem")
    .order("nome");
  fail(error);
  return data as Produto[];
}
export async function clients() {
  const { data, error } = await db.from("clientes").select("*").order("nome");
  fail(error);
  return data as Cliente[];
}
export async function settings() {
  const { data, error } = await db
    .from("configuracoes")
    .select("dados")
    .eq("id", true)
    .single();
  fail(error);
  return { ...defaultConfig, ...data?.dados } as Config;
}
export async function orderAction(
  id: string,
  versao: number,
  action: string,
  data: unknown = {},
) {
  const r = await db.rpc("administrar_pedido", {
    p_id: id,
    p_versao: versao,
    p_acao: action,
    p_dados: data,
  });
  fail(r.error);
  return r.data;
}
