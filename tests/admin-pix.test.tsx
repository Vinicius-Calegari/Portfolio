// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import QRCode from "qrcode";
import { Agenda } from "../src/Admin";
import { defaultConfig } from "../src/domain";
import type { Pedido } from "../src/domain";

vi.mock("../src/api", () => ({
  db: {},
  allProducts: vi.fn(),
  clients: vi.fn(),
  orderAction: vi.fn(),
  orders: vi.fn(),
  settings: vi.fn(),
  edge: vi.fn(),
}));
vi.mock("../src/App", () => ({
  Empty: () => null,
  ErrorBox: () => null,
  Spinner: () => null,
  useCatalog: vi.fn(),
}));
vi.mock("../src/reports", () => ({ downloadReport: vi.fn() }));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(async () => "data:image/png;base64,pix") },
}));

it("gera Pix atualizado do pedido existente sem criar pedido nem marcar pagamento", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const order: Pedido = {
    id: "pedido-existente",
    numero: 17,
    nome_cliente: "Cliente de teste",
    status: "pendente",
    data_entrega: "2026-10-03",
    horario: "10:00",
    tipo: "retirada",
    total: 7000,
    frete_modo: "nenhum",
    forma_pagamento: "pix",
    pago: false,
    grupos_pedido: [],
    whatsapp: "5531987654322",
    cliente_id: null,
    endereco: null,
    ponto_referencia: "",
    observacoes: "",
    subtotal: 7000,
    frete_valor: 0,
    frete_km: null,
    precisa_troco: false,
    troco_para: null,
    pagar_depois: false,
    data_prometida_pagamento: null,
    data_pagamento: null,
    criado_em: "2026-10-02T15:57:00Z",
    versao: 1,
  };
  const updateOrder = vi.fn();
  try {
    await act(async () =>
      root.render(
        <Agenda
          pedidos={[order]}
          all={[order]}
          config={{
            ...defaultConfig,
            pix_chave: "31987654321",
            whatsapp: "5531987654321",
            pix_nome: "ROSILENE",
          }}
          busy={false}
          filterDate=""
          filterName=""
          filterStatus=""
          setFilterDate={vi.fn()}
          setFilterName={vi.fn()}
          setFilterStatus={vi.fn()}
          act={updateOrder}
        />,
      ),
    );
    expect(document.querySelector(".pix-box")).toBeNull();
    const button = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Ver Pix",
    )!;
    await act(async () => button.click());
    const code = (
      document.querySelector(".pix-box textarea") as HTMLTextAreaElement
    ).value;
    expect(code).toContain("0114+5531987654321");
    expect(code).toContain("540570.00");
    expect(code).toContain("ROS17");
    expect(QRCode.toDataURL).toHaveBeenCalledWith(code, {
      width: 280,
      margin: 4,
    });
    expect(updateOrder).not.toHaveBeenCalled();
    await act(async () => button.click());
    expect(document.querySelector(".pix-box")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    document.body.replaceChildren();
  }
});
