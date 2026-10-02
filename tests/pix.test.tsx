// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import QRCode from "qrcode";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pix } from "../src/OrderForm";
import { copyText } from "../src/browser";
import { defaultConfig } from "../src/domain";
import type { Pedido } from "../src/domain";
import { pixPayload } from "../src/pix";

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn() } }));
vi.mock("../src/api", () => ({ edge: vi.fn() }));
vi.mock("../src/App", () => ({}));
vi.mock("../src/browser", () => ({ copyText: vi.fn(), safeUuid: vi.fn() }));

const generateQr = vi.mocked(
  QRCode.toDataURL as (
    text: string,
    options: { width: number; margin: number },
  ) => Promise<string>,
);

const config = {
  ...defaultConfig,
  pix_chave: "teste@example.com",
  pix_nome: "ROSILENE",
  pix_cidade: "FERROS",
};
const pedido = {
  numero: 42,
  total: 9025,
  frete_modo: "calculado",
  pagar_depois: false,
} as Pedido;
let root: Root;
async function render(overrides: Partial<Pedido> = {}) {
  await act(async () => {
    root.render(<Pix pedido={{ ...pedido, ...overrides }} config={config} />);
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  generateQr.mockReset().mockResolvedValue("data:image/png;base64,atual");
  vi.mocked(copyText).mockReset().mockResolvedValue();
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
});

describe("QR Code e Pix copia e cola", () => {
  it("normaliza a chave de celular cadastrada antes de gerar a imagem e copiar", async () => {
    await act(async () => {
      root.render(
        <Pix
          pedido={pedido}
          config={{
            ...config,
            pix_chave: "31987654321",
            whatsapp: "5531987654321",
          }}
        />,
      );
    });
    const payload = (document.querySelector("textarea") as HTMLTextAreaElement)
      .value;
    expect(payload).toContain("0114+5531987654321");
    expect(document.body.textContent).toContain("Chave: +5531987654321");
    expect(QRCode.toDataURL).toHaveBeenCalledWith(payload, {
      width: 280,
      margin: 4,
    });
    await act(async () =>
      (document.querySelector("button") as HTMLButtonElement).click(),
    );
    expect(copyText).toHaveBeenCalledWith(payload);
  });
  it("usa o total final com frete no mesmo código para QR e cópia", async () => {
    await render();
    const payload = pixPayload(
      config.pix_chave,
      config.pix_nome,
      config.pix_cidade,
      9025,
      "ROS42",
    );
    expect(
      (document.querySelector("textarea") as HTMLTextAreaElement).value,
    ).toBe(payload);
    expect(QRCode.toDataURL).toHaveBeenCalledWith(payload, {
      width: 280,
      margin: 4,
    });
  });
  it("ignora QR antigo quando o valor muda e reinicia a confirmação de cópia", async () => {
    let finishOld!: (value: string) => void;
    generateQr.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finishOld = resolve;
        }),
    );
    await render();
    await act(async () =>
      (document.querySelector("button") as HTMLButtonElement).click(),
    );
    expect(document.body.textContent).toContain("Pix copiado");
    await render({ total: 10000 });
    await act(async () => finishOld("data:image/png;base64,antigo"));
    expect(document.querySelector("img")?.getAttribute("src")).toBe(
      "data:image/png;base64,atual",
    );
    expect(document.body.textContent).not.toContain("Pix copiado");
    expect(
      (document.querySelector("textarea") as HTMLTextAreaElement).value,
    ).toContain("5406100.00");
  });
  it("mantém copia e cola disponível se a imagem do QR falhar", async () => {
    generateQr.mockRejectedValueOnce(new Error("Falha de imagem"));
    await render();
    expect(document.querySelector("img")).toBeNull();
    expect(document.body.textContent).toContain("Use o copia e cola abaixo");
    expect(document.querySelector("textarea")).not.toBeNull();
  });
  it("orienta a copiar manualmente quando a área de transferência falha", async () => {
    await render();
    vi.mocked(copyText).mockRejectedValueOnce(new Error("Permissão negada"));
    await act(async () =>
      (document.querySelector("button") as HTMLButtonElement).click(),
    );
    expect(document.body.textContent).toContain("Selecione o código acima");
    expect(document.body.textContent).not.toContain("Pix copiado");
  });
  it("aguarda o frete combinado e não gera cobrança com total parcial", async () => {
    await render({ frete_modo: "a_combinar" });
    expect(QRCode.toDataURL).not.toHaveBeenCalled();
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.body.textContent).toContain("depois de combinar o frete");
  });
  it("informa que não há valor a pagar quando o cupom cobre todo o pedido", async () => {
    await render({ total: 0 });
    expect(QRCode.toDataURL).not.toHaveBeenCalled();
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.body.textContent).toContain("Não há valor a pagar");
  });
});
