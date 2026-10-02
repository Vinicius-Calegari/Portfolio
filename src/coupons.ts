export interface AppliedCoupon {
  codigo: string;
  tipo: "percentual" | "fixo";
  valor: number;
}

export function couponDiscount(
  coupon: AppliedCoupon | null,
  subtotal: number,
  pagarDepois: boolean,
) {
  if (!coupon || pagarDepois) return 0;
  const discount =
    coupon.tipo === "percentual"
      ? Math.round((subtotal * coupon.valor) / 100)
      : coupon.valor;
  return Math.max(0, Math.min(subtotal, discount));
}
