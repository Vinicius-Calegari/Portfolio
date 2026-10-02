import { it, expect } from "vitest";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { makeReport } from "../src/reports";
import { defaultConfig } from "../src/domain";
import type { Pedido } from "../src/domain";
it("gera os quatro relatórios A4 com dados longos e quebra de página", async () => {
  const logo = "data:image/jpeg;base64," + (await readFile("public/logo.jpg")).toString("base64");
  const p = {
    id: "qa", numero: 123, nome_cliente: "Cliente de teste - conferência de impressão", whatsapp: "5531999990000", data_entrega: "2026-10-10", horario: "14:30:00", tipo: "entrega",
    endereco: { rua: "Rua de teste para conferir o endereço completo", numero: "238", bairro: "Padre Alberto", cidade: "Ferros", uf: "MG", cep: "35800000", complemento: "Casa dos fundos" },
    ponto_referencia: "Portão azul, ao lado da padaria", observacoes: "Relatório de teste. Não representa uma encomenda real.", status: "confirmado", subtotal: 9753, frete_valor: 800, frete_km: 3.2, frete_modo: "manual", total: 10553, forma_pagamento: "dinheiro", precisa_troco: true, troco_para: 12000, pagar_depois: true, data_prometida_pagamento: "2026-10-20", pago: false,
    grupos_pedido: [{ ordem: 1, tamanho_total: 100, itens_pedido: [
      { produto_id: "a", nome_produto: "Coxinha de teste", quantidade: 25, preco_cento: 9011, valor_linha: 2253 },
      { produto_id: "b", nome_produto: "Bolinha de queijo de teste", quantidade: 75, preco_cento: 10000, valor_linha: 7500 },
    ] }],
  } as Pedido;
  await mkdir("tmp/pdfs", { recursive: true });
  for (const kind of ["producao", "periodo", "individual", "receber"] as const) {
    const list = kind === "individual" ? [p] : Array.from({ length: 15 }, (_, i) => ({ ...p, numero: 123 + i, data_entrega: `2026-10-${String(10 + (i % 5)).padStart(2, "0")}` }));
    const doc = await makeReport(kind, list, defaultConfig, false, logo);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210, 0);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(297, 0);
    expect(doc.getNumberOfPages()).toBeGreaterThan(0);
    await writeFile(`tmp/pdfs/qa-${kind}.pdf`, Buffer.from(doc.output("arraybuffer")));
  }
});

it("identifica cada pedido de produção pelo primeiro nome e destino, mantendo a seleção de status", async () => {
  const logo = "data:image/jpeg;base64," + (await readFile("public/logo.jpg")).toString("base64");
  const base = {
    id: "producao",
    numero: 201,
    nome_cliente: "  Ana   Silva ",
    data_entrega: "2026-10-10",
    horario: "10:00:00",
    tipo: "entrega",
    status: "confirmado",
    endereco: {
      rua: "Rua Primavera",
      numero: "10",
      bairro: "Centro",
      cidade: "Ferros",
      uf: "MG",
      cep: "35800-000",
      complemento: "Casa dos fundos",
    },
    ponto_referencia: "Portao verde",
    grupos_pedido: [{
      ordem: 1,
      tamanho_total: 100,
      itens_pedido: [{ nome_produto: "Coxinha", quantidade: 100 }],
    }],
  } as Pedido;
  const orders = [
    base,
    { ...base, id: "outra-ana", numero: 202, nome_cliente: "Ana Souza", endereco: { ...base.endereco!, rua: "Rua das Flores", numero: "20" } },
    { ...base, id: "retirada", numero: 203, nome_cliente: "Bia Pereira", tipo: "retirada", endereco: null },
    { ...base, id: "pendente", numero: 204, nome_cliente: "Carlos Andrade", status: "pendente" },
    { ...base, id: "cancelado", numero: 205, nome_cliente: "Diego Costa", status: "cancelado" },
  ] as Pedido[];
  const doc = await makeReport("producao", orders, defaultConfig, false, logo);
  const text = (pdf: string) => [...pdf.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)]
    .map((match) => match[1].replace(/\\([()\\])/g, "$1"))
    .join(" ");
  const pdf = text(doc.output());
  expect(pdf.match(/\bAna\b/g)).toHaveLength(2);
  expect(pdf).toContain("#201");
  expect(pdf).toContain("#202");
  expect(pdf).toContain("Bia");
  expect(pdf).toContain("Rua Primavera, 10");
  expect(pdf).toContain("Rua das Flores, 20");
  expect(pdf).toContain("Casa dos fundos");
  expect(pdf).toContain("Portao verde");
  expect(pdf).toContain("Retirada no local");
  for (const excluded of ["Silva", "Souza", "Pereira", "Carlos", "Diego"])
    expect(pdf).not.toContain(excluded);
  const withPending = text((await makeReport("producao", orders, defaultConfig, true, logo)).output());
  expect(withPending).toContain("Carlos");
  expect(withPending).not.toContain("Andrade");
  expect(withPending).not.toContain("Diego");
});
