import { describe, expect, it } from "vitest";
import { couponDiscount } from "../src/coupons";

describe("cupom opcional no pagamento", () => {
  it("mantém o valor integral sem cupom, inclusive no fiado", () => {
    expect(couponDiscount(null, 9000, false)).toBe(0);
    expect(couponDiscount(null, 9000, true)).toBe(0);
  });
  it("desconta somente os salgados e acompanha mudanças de quantidade", () => {
    const coupon = {
      codigo: "TESTE10",
      tipo: "percentual" as const,
      valor: 10,
    };
    expect(couponDiscount(coupon, 9011, false)).toBe(901);
    expect(couponDiscount(coupon, 18022, false)).toBe(1802);
    expect(9011 + 800 - couponDiscount(coupon, 9011, false)).toBe(8910);
  });
  it("limita o desconto fixo ao subtotal, preservando o frete", () => {
    const coupon = { codigo: "TESTEFIXO", tipo: "fixo" as const, valor: 10000 };
    expect(couponDiscount(coupon, 9000, false)).toBe(9000);
    expect(9000 + 800 - couponDiscount(coupon, 9000, false)).toBe(800);
  });
  it("impede qualquer desconto no pagamento fiado", () => {
    for (const tipo of ["percentual", "fixo"] as const) {
      expect(
        couponDiscount({ codigo: "TESTE", tipo, valor: 10 }, 9000, true),
      ).toBe(0);
    }
  });
});
