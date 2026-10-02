// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Admin from "../src/Admin";
import { downloadReport } from "../src/reports";

const api = vi.hoisted(() => ({
  getSession: vi.fn(),
  rpc: vi.fn(),
  unsubscribe: vi.fn(),
  orders: vi.fn(),
  products: vi.fn(),
  clients: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("../src/api", () => ({
  db: {
    auth: {
      getSession: api.getSession,
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: api.unsubscribe } },
      }),
    },
    rpc: api.rpc,
    from: () => ({
      select: () => ({ order: async () => ({ data: [], error: null }) }),
    }),
  },
  orders: api.orders,
  allProducts: api.products,
  clients: api.clients,
  settings: api.settings,
  orderAction: vi.fn(),
  edge: vi.fn(),
}));
vi.mock("../src/App", async () => {
  const { defaultConfig } = await import("../src/domain");
  return {
    useCatalog: () => ({ config: defaultConfig, refresh: vi.fn() }),
    Spinner: () => <p role="status">Carregando…</p>,
    ErrorBox: ({ text }: { text: string }) =>
      text ? <p role="alert">{text}</p> : null,
    Empty: () => <p>Nenhum pedido encontrado</p>,
  };
});
vi.mock("../src/reports", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/reports")>()),
  downloadReport: vi.fn(),
}));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(async () => "data:image/png;base64,pix") },
}));

let root: Root;
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.resetAllMocks();
  vi.mocked(downloadReport).mockResolvedValue();
  api.getSession.mockResolvedValue({
    data: { session: { access_token: "sessao-de-teste" } },
    error: null,
  });
  api.rpc.mockResolvedValue({ data: true, error: null });
  api.products.mockResolvedValue([]);
  api.clients.mockResolvedValue([]);
  const { defaultConfig } = await import("../src/domain");
  api.settings.mockResolvedValue({
    ...defaultConfig,
    pix_chave: "31987654321",
    whatsapp: "5531987654321",
    pix_nome: "ROSILENE",
  });
  api.orders.mockResolvedValue(
    [
      {
        id: "pedido-13",
        numero: 13,
        status: "aguardando_confirmacao",
        forma_pagamento: "dinheiro",
      },
      {
        id: "pedido-17",
        numero: 17,
        status: "cancelado",
        forma_pagamento: "pix",
      },
      {
        id: "pedido-18",
        numero: 18,
        status: "pendente",
        forma_pagamento: "pix",
      },
    ].map((order) => ({
      ...order,
      nome_cliente: "Cliente de teste",
      whatsapp: "5531987654321",
      data_entrega: "2026-10-19",
      horario: "10:00:00",
      tipo: "retirada",
      total: 7000,
      pago: false,
      frete_modo: "nenhum",
      observacoes: "",
      grupos_pedido: [
        {
          id: `${order.id}-grupo`,
          itens_pedido: [{ quantidade: 100, nome_produto: "Bolinho" }],
        },
      ],
    })),
  );
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
});
async function open() {
  await act(async () => root.render(<Admin />));
}

it("abre o painel com sessão ativa e os formatos atuais dos pedidos", async () => {
  await open();
  expect(document.querySelector(".admin-shell")).not.toBeNull();
  expect(document.querySelectorAll(".admin-order")).toHaveLength(3);
  expect(document.querySelectorAll(".order-items")[0].textContent).toContain(
    "100 Bolinho",
  );
  expect(document.body.textContent).toContain("#18");
  expect(
    [...document.querySelectorAll("button")].filter(
      (b) => b.textContent === "Ver Pix",
    ),
  ).toHaveLength(1);
});
it("abre o formulário de login quando não há sessão salva", async () => {
  api.getSession.mockResolvedValueOnce({
    data: { session: null },
    error: null,
  });
  await open();
  expect(document.querySelector(".login-card")).not.toBeNull();
  expect(api.rpc).not.toHaveBeenCalled();
});
it.each(["", "319999", "20987654321"])(
  "abre a agenda com contato ausente ou inválido (%s)",
  async (whatsapp) => {
    const savedOrders = await api.orders();
    api.orders.mockResolvedValue(
      savedOrders.map((order: { numero: number }) =>
        order.numero === 13
          ? order
          : { ...order, nome_cliente: "Cliente removido", whatsapp },
      ),
    );
    await open();
    expect(document.querySelector(".admin-shell")).not.toBeNull();
    expect(document.querySelectorAll(".admin-order")).toHaveLength(3);
    expect(document.querySelectorAll('a[href^="https://wa.me/"]')).toHaveLength(
      1,
    );
    const unavailable = [...document.querySelectorAll("button")].filter(
      (button) => button.textContent?.trim() === "WhatsApp indisponível",
    );
    expect(unavailable).toHaveLength(2);
    expect(unavailable.every((button) => button.disabled)).toBe(true);
    expect(document.body.textContent).toContain("#18");
    expect(document.body.textContent).toContain("Ver Pix");
  },
);
it("mostra erro e login quando a consulta da sessão rejeita, sem deixar a tela carregando", async () => {
  api.getSession.mockRejectedValueOnce(new Error("Falha de rede"));
  await open();
  expect(document.querySelector('[role="status"]')).toBeNull();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "verificar sua sessão",
  );
  expect(document.querySelector(".login-card")).not.toBeNull();
});
it("não abre o painel se não conseguir verificar a permissão administrativa", async () => {
  api.rpc.mockResolvedValueOnce({
    data: null,
    error: { message: "Falha de rede" },
  });
  await open();
  expect(document.querySelector(".admin-shell")).toBeNull();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "verificar sua sessão",
  );
  expect(api.orders).not.toHaveBeenCalled();
});

async function openReports() {
  await open();
  const nav = [...document.querySelectorAll<HTMLButtonElement>("nav button")].find(
    (b) => b.textContent?.trim() === "Relatórios",
  )!;
  await act(async () => nav.click());
}
const productionButton = () =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === "Lista de produção · checklist",
  )!;
it("explica a seleção vazia e inclui pendentes e aguardando confirmação somente quando solicitado", async () => {
  await openReports();
  expect(productionButton().disabled).toBe(true);
  expect(document.body.textContent).toContain("Nenhum pedido confirmado");
  await act(async () =>
    document
      .querySelector<HTMLInputElement>('.report-panel input[type="checkbox"]')!
      .click(),
  );
  expect(
    document.querySelector('.report-panel [role="status"]')?.textContent,
  ).toContain("2 pedidos selecionados");
  expect(productionButton().disabled).toBe(false);
  await act(async () => productionButton().click());
  expect(downloadReport).toHaveBeenCalledWith(
    "producao",
    expect.any(Array),
    expect.any(Object),
    true,
  );
});
it("explica que todos os pedidos estão cancelados e não gera um PDF de produção vazio", async () => {
  const saved = await api.orders();
  api.orders.mockResolvedValue(
    saved.map((p: object) => ({ ...p, status: "cancelado" })),
  );
  await openReports();
  expect(document.body.textContent).toContain(
    "Todos os pedidos estão cancelados",
  );
  await act(async () =>
    document
      .querySelector<HTMLInputElement>('.report-panel input[type="checkbox"]')!
      .click(),
  );
  await act(async () => productionButton().click());
  expect(productionButton().disabled).toBe(true);
  expect(downloadReport).not.toHaveBeenCalled();
});
