// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QRCode from "qrcode";
import OrderForm from "../src/OrderForm";
import { edge } from "../src/api";
import { copyText } from "../src/browser";
import { addDays, today } from "../src/domain";
import { pixPayload } from "../src/pix";

vi.mock("../src/api", () => ({ edge: vi.fn() }));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn() } }));
vi.mock("../src/browser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/browser")>()),
  copyText: vi.fn(),
}));
vi.mock("../src/App", async () => {
  const { defaultConfig } = await import("../src/domain");
  const catalog = {
    config: {
      ...defaultConfig,
      recebendo_pedidos: true,
      fiado_todos: true,
      pix_chave: "teste@example.com",
      pix_nome: "ROSILENE",
      pix_cidade: "FERROS",
    },
    produtos: [
      {
        id: "teste",
        nome: "Salgado de teste",
        preco_cento: 9000,
        quantidade_minima: 25,
        multiplo: 25,
        ativo: true,
      },
    ],
    bloqueadas: [],
    loading: false,
    error: "",
  };
  return {
    useCatalog: () => catalog,
    ErrorBox: ({ text }: { text: string }) =>
      text ? <p role="alert">{text}</p> : null,
    Empty: () => null,
    Spinner: () => null,
    ProductPhoto: () => null,
  };
});

const generateQr = vi.mocked(
  QRCode.toDataURL as (
    text: string,
    options: { width: number; margin: number },
  ) => Promise<string>,
);

const coupon = {
  codigo: "TESTE10",
  tipo: "percentual",
  valor: 10,
  desconto: 900,
};
let root: Root;
function inputFor(text: string) {
  const label = [...document.querySelectorAll("label")].find((l) =>
    l.textContent?.trim().startsWith(text),
  );
  const input = label?.querySelector("input,select") as
    HTMLInputElement | HTMLSelectElement;
  if (!input) throw new Error(`Campo ausente: ${text}`);
  return input;
}
async function fill(
  input: HTMLInputElement | HTMLSelectElement,
  value: string,
) {
  await act(async () => {
    const proto =
      input.tagName === "SELECT"
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value);
    input.dispatchEvent(
      new Event(input.tagName === "SELECT" ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}
async function click(text: string) {
  const button = [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text,
  );
  if (!button || button.disabled)
    throw new Error(`Botão indisponível: ${text}`);
  await act(async () => {
    button.click();
  });
}
async function toggleCredit() {
  await act(async () => {
    (inputFor("Pagar depois") as HTMLInputElement).click();
  });
}
const total = () =>
  document
    .querySelector(".basket .grand-total dd")
    ?.textContent?.replace(/\s/g, "");
const sent = () =>
  vi
    .mocked(edge)
    .mock.calls.find(([action]) => action === "criar")?.[1] as Record<
    string,
    unknown
  >;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.scrollTo = vi.fn();
  generateQr.mockReset().mockResolvedValue("data:image/png;base64,teste");
  vi.mocked(copyText).mockReset().mockResolvedValue();
  vi.mocked(edge)
    .mockReset()
    .mockImplementation(async (action, data) => {
      if (action === "fiado") return { liberado: true };
      if (action === "cupom") return coupon;
      if (action === "criar") {
        const order = data as Record<string, unknown>;
        return {
          numero: 1,
          nome_cliente: order.nome,
          whatsapp: order.whatsapp,
          data_entrega: order.data_entrega,
          horario: order.horario,
          tipo: "retirada",
          grupos_pedido: [],
          subtotal: 9000,
          total: order.cupom ? 8100 : 9000,
          frete_modo: "nenhum",
          frete_valor: 0,
          forma_pagamento: order.forma_pagamento,
          cupom_codigo: order.cupom,
          desconto: order.cupom ? 900 : 0,
          pagar_depois: order.pagar_depois,
          data_prometida_pagamento: order.data_prometida_pagamento,
          pago: false,
        };
      }
      throw new Error(`Operação de teste inesperada: ${action}`);
    });
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <OrderForm />
      </MemoryRouter>,
    );
  });
  await fill(
    document.querySelector('[aria-label="Quantidade de Salgado de teste"]')!,
    "100",
  );
  await click("Continuar");
  await fill(inputFor("Nome completo"), "Cliente de teste");
  await fill(inputFor("WhatsApp com DDD"), "31990000001");
  await fill(inputFor("Data desejada"), addDays(today(), 1));
  await click("Escolha um horário");
  await click("18");
  await act(async () => {
    document.querySelector<HTMLButtonElement>('[aria-label="Minuto 20"]')!.click();
  });
  await click("Continuar");
  await act(async () => {
    (document.querySelector(".consent input") as HTMLInputElement).click();
  });
});

describe("pagamento com Pix", () => {
  async function choosePix() {
    await act(async () => {
      (inputFor("Pix") as HTMLInputElement).click();
    });
  }
  it("mostra QR e copia e cola após salvar, com o desconto confirmado pelo servidor", async () => {
    await choosePix();
    expect(document.querySelector(".pix-box")).toBeNull();
    expect(QRCode.toDataURL).not.toHaveBeenCalled();
    await fill(document.querySelector("#coupon-code")!, "TESTE10");
    await click("Aplicar");
    await click("Enviar encomenda e ver Pix");
    const code = document.querySelector(
      ".pix-box textarea",
    ) as HTMLTextAreaElement;
    const payload = pixPayload(
      "teste@example.com",
      "ROSILENE",
      "FERROS",
      8100,
      "ROS1",
    );
    expect(sent().forma_pagamento).toBe("pix");
    expect(sent().cupom).toBe("TESTE10");
    expect(code.value).toBe(payload);
    expect(QRCode.toDataURL).toHaveBeenCalledWith(payload, {
      width: 280,
      margin: 4,
    });
    expect(document.querySelector(".pix-box img")?.getAttribute("src")).toBe(
      "data:image/png;base64,teste",
    );
    expect(
      document.querySelector(".pix-amount")?.textContent?.replace(/\s/g, ""),
    ).toBe("R$81,00");
    expect(
      document
        .querySelector(".pix-box")!
        .compareDocumentPosition(document.querySelector(".order-summary")!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await click("Copiar Pix");
    expect(copyText).toHaveBeenCalledWith(payload);
    expect(document.body.textContent).toContain("Pix copiado");
  });
  it("não oferece pagamento quando o pedido não foi salvo", async () => {
    await choosePix();
    vi.mocked(edge).mockRejectedValueOnce(
      new Error("Não foi possível salvar."),
    );
    await click("Enviar encomenda e ver Pix");
    expect(document.querySelector(".pix-box")).toBeNull();
    expect(QRCode.toDataURL).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Não foi possível salvar.");
  });
  it("gera Pix sem desconto para fiado e preserva a data combinada", async () => {
    await choosePix();
    await fill(document.querySelector("#coupon-code")!, "TESTE10");
    await click("Aplicar");
    await toggleCredit();
    await fill(inputFor("Em que dia você vai pagar?"), addDays(today(), 1));
    await click("Enviar encomenda e ver Pix");
    expect(sent().cupom).toBeNull();
    expect(
      (document.querySelector(".pix-box textarea") as HTMLTextAreaElement)
        .value,
    ).toBe(pixPayload("teste@example.com", "ROSILENE", "FERROS", 9000, "ROS1"));
    expect(document.querySelector(".pix-box")?.textContent).toContain(
      "Pagamento combinado para",
    );
  });
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  document.body.replaceChildren();
});

describe("checkout com cupom opcional", () => {
  it("exibe o campo sem obrigatoriedade e conclui sem cupom", async () => {
    const input = document.querySelector("#coupon-code") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.required).toBe(false);
    await click("Enviar encomenda");
    expect(sent().cupom).toBeNull();
    expect(document.body.textContent).toContain("Recebemos seu pedido!");
  });
  it("aplica o desconto no total e envia o código esperado pelo servidor", async () => {
    await fill(document.querySelector("#coupon-code")!, "teste10");
    await click("Aplicar");
    expect(total()).toBe("R$81,00");
    await click("Enviar encomenda");
    expect(sent().cupom).toBe("TESTE10");
  });
  it("remove o campo e o desconto ao escolher fiado e envia sem cupom", async () => {
    await fill(document.querySelector("#coupon-code")!, "TESTE10");
    await click("Aplicar");
    await toggleCredit();
    expect(document.querySelector("#coupon-code")).toBeNull();
    expect(total()).toBe("R$90,00");
    await fill(inputFor("Em que dia você vai pagar?"), addDays(today(), 1));
    await click("Enviar encomenda");
    expect(sent().pagar_depois).toBe(true);
    expect(sent().cupom).toBeNull();
  });
  it("ignora validação pendente ao alternar para fiado e voltar", async () => {
    let resolveCoupon!: (value: unknown) => void;
    vi.mocked(edge).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCoupon = resolve;
        }),
    );
    await fill(document.querySelector("#coupon-code")!, "TESTE10");
    await click("Aplicar");
    await toggleCredit();
    await toggleCredit();
    await act(async () => {
      resolveCoupon(coupon);
    });
    expect(
      (document.querySelector("#coupon-code") as HTMLInputElement).value,
    ).toBe("");
    expect(total()).toBe("R$90,00");
    expect(document.querySelector(".coupon-success")).toBeNull();
  });
  it("permite concluir sem desconto depois de informar um cupom inválido", async () => {
    vi.mocked(edge).mockRejectedValueOnce(
      new Error("Cupom inválido ou indisponível."),
    );
    await fill(document.querySelector("#coupon-code")!, "INVALIDO");
    await click("Aplicar");
    expect(document.body.textContent).toContain("Cupom inválido");
    await click("Enviar encomenda");
    expect(sent().cupom).toBeNull();
  });
});
