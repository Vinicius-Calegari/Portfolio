import { Component } from "react";
import type { ReactNode } from "react";

const retryKey = "rosilene:asset-recovery";
export function reloadPage() {
  window.location.reload();
}

export function installAssetRecovery(
  reload = reloadPage,
  build = import.meta.url,
) {
  const recover = (event: Event) => {
    try {
      if (sessionStorage.getItem(retryKey) === build) return;
      sessionStorage.setItem(retryKey, build);
    } catch {
      // Without a retry marker, leave recovery to the visible reload button.
      return;
    }
    event.preventDefault();
    reload();
  };
  window.addEventListener("vite:preloadError", recover);
  return () => window.removeEventListener("vite:preloadError", recover);
}

export class PageRecovery extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="admin-login">
          <section className="panel login-card" role="alert">
            <h1>Não foi possível abrir esta página</h1>
            <p>Recarregue a página para tentar novamente.</p>
            <button type="button" className="button" onClick={reloadPage}>
              Recarregar página
            </button>
            <p>
              <a href="/">Voltar ao site</a>
            </p>
          </section>
        </main>
      );
    return this.props.children;
  }
}
