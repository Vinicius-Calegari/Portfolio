import { describe, it, expect } from "vitest";
import {
  addDays,
  phone,
  maskPhone,
  lineTotal,
  validateGroup,
  csv,
  defaultConfig,
} from "../src/domain";
import type { Produto, Pedido } from "../src/domain";
import { crc16, pixPayload } from "../src/pix";
import { quote } from "../supabase/functions/encomendas/maps";
const product: Produto = {
  id: "a",
  nome: "Teste",
  descricao: "",
  foto: null,
  preco_cento: 9011,
  quantidade_minima: 10,
  multiplo: 5,
  categoria: "",
  ativo: true,
  ordem: 0,
};
describe("regras do pedido", () => {
  it("normaliza celular brasileiro com DDD e rejeita número incompleto ou DDD inválido", () => {
    expect(phone("(31) 99899-1812")).toBe("5531998991812");
    expect(phone("5531998991812")).toBe("5531998991812");
    expect(maskPhone("5531998991812")).toBe("(31) 99899-1812");
    expect(() => phone("999991812")).toThrow();
    expect(() => phone("20998991812")).toThrow();
  });
  it("arredonda exatamente uma vez por linha", () => {
    expect(lineTotal(25, 9011)).toBe(2253);
    expect(lineTotal(50, 1)).toBe(1);
    expect(lineTotal(100, 9000)).toBe(9000);
  });
  it("recusa quantidade insuficiente, excessiva ou múltiplo inválido", () => {
    expect(validateGroup({ tamanho_total: 100, itens: [{ produto_id: "a", quantidade: 100 }] }, [product])).toBe("");
    for (const quantity of [99, 101, 0]) expect(validateGroup({ tamanho_total: 100, itens: [{ produto_id: "a", quantidade: quantity }] }, [product])).not.toBe("");
    expect(validateGroup({ tamanho_total: 75, itens: [{ produto_id: "a", quantidade: 75 }] }, [product])).toBe("");
  });
  it("rejeita produto inativo e produto repetido no grupo", () => {
    expect(validateGroup({ tamanho_total: 100, itens: [{ produto_id: "a", quantidade: 100 }] }, [{ ...product, ativo: false }])).not.toBe("");
    expect(validateGroup({ tamanho_total: 100, itens: [{ produto_id: "a", quantidade: 50 }, { produto_id: "a", quantidade: 50 }] }, [product])).not.toBe("");
  });
  it("conta dias independentemente de fuso e atravessa mês e ano", () => {
    expect(addDays("2026-12-31", 30)).toBe("2027-01-30");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("gera Pix com total e checksum consistentes", () => {
    expect(crc16("123456789")).toBe("29B1");
    const p = pixPayload("teste@example.com", "ROSILENE", "FERROS", 9025, "ROS42");
    expect(p).toContain("540590.25");
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)));
    expect(p).toContain("ROS42");
    expect(() => pixPayload("", "ROSILENE", "FERROS", 100)).toThrow();
  });
  it("protege fórmulas em CSV", () => {
    const p = { numero: 1, nome_cliente: "=1+1", whatsapp: "5531998991812", data_entrega: "2026-10-10", horario: "10:00", tipo: "retirada", endereco: null, grupos_pedido: [], status: "pendente", subtotal: 9000, frete_valor: 0, total: 9000, forma_pagamento: "dinheiro", pago: false, data_prometida_pagamento: "2026-10-10" } as unknown as Pedido;
    expect(csv([p])).toContain('"\'=1+1"');
    expect(csv([p])).toContain('"90,00"');
  });
  it("não consulta mapas no modo gratuito ou retirada", async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (() => { calls++; throw new Error("não deve chamar"); }) as typeof fetch;
    try {
      const a = await quote(defaultConfig, "entrega", {} as never, "test");
      const b = await quote({ ...defaultConfig, frete_gratis: false }, "retirada", {} as never, "test");
      expect(a.valor).toBe(0);
      expect(b.modo).toBe("nenhum");
      expect(calls).toBe(0);
    } finally { globalThis.fetch = original; }
  });
  it("permite combinar frete quando mapa não está configurado", async () => {
    expect((await quote({ ...defaultConfig, frete_gratis: false }, "entrega", {} as never, undefined)).modo).toBe("a_combinar");
  });
});
