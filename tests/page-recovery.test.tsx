// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { installAssetRecovery, PageRecovery } from "../src/PageRecovery";

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it("recarrega a aba antiga quando um arquivo da versão anterior desaparece, sem repetir indefinidamente", () => {
  const reload = vi.fn();
  let remove = installAssetRecovery(reload, "versao-1");
  const oldChunk = new Event("vite:preloadError", { cancelable: true });
  window.dispatchEvent(oldChunk);
  expect(oldChunk.defaultPrevented).toBe(true);
  expect(reload).toHaveBeenCalledTimes(1);
  remove();
  remove = installAssetRecovery(reload, "versao-1");
  const repeatedError = new Event("vite:preloadError", { cancelable: true });
  window.dispatchEvent(repeatedError);
  expect(reload).toHaveBeenCalledTimes(1);
  expect(repeatedError.defaultPrevented).toBe(false);
  remove();
});

it("permite recuperar uma atualização posterior", () => {
  const reload = vi.fn();
  let remove = installAssetRecovery(reload, "versao-1");
  window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
  remove();
  remove = installAssetRecovery(reload, "versao-2");
  window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
  expect(reload).toHaveBeenCalledTimes(2);
  remove();
});

it("mostra uma recuperação visível quando um erro de renderização interrompe o painel", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(console, "error").mockImplementation(() => {});
  function BrokenPanel(): never {
    throw new Error("Falha ao carregar módulo do painel");
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <PageRecovery>
          <BrokenPanel />
        </PageRecovery>,
      ),
    );
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Não foi possível abrir esta página",
    );
    expect(document.querySelector("button")?.textContent).toBe(
      "Recarregar página",
    );
  } finally {
    await act(async () => root.unmount());
  }
});
