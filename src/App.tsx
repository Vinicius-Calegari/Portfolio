import {
  createContext,
  useContext,
  useEffect,
  useState,
  lazy,
  Suspense,
} from "react";
import type { ReactNode } from "react";
import { Link, Route, Routes, NavLink } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  ChefHat,
  MapPin,
  MessageCircle,
  ShoppingBag,
} from "lucide-react";
import { catalog, configured } from "./api";
import { defaultConfig, maskPhone, money } from "./domain";
import type { Config, Produto } from "./domain";
import OrderForm from "./OrderForm";
const Admin = lazy(() => import("./Admin"));
export interface CatalogContext {
  produtos: Produto[];
  config: Config;
  bloqueadas: string[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}
const Context = createContext<CatalogContext>(null!);
export const useCatalog = () => useContext(Context);
export const ErrorBox = ({ text }: { text: string }) =>
  text ? (
    <div className="notice error" role="alert">
      {text}
    </div>
  ) : null;
export const Empty = ({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) => (
  <div className="empty">
    <ChefHat size={38} />
    <h3>{title}</h3>
    {children}
  </div>
);
export const Spinner = () => (
  <div className="loading" role="status">
    <span className="spinner" />
    Carregando…
  </div>
);
export function ProductPhoto({ product }: { product: Produto }) {
  return product.foto ? (
    <img
      src={product.foto}
      alt={product.nome}
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  ) : (
    <div className="photo-placeholder">
      <ChefHat strokeWidth={1.2} size={42} />
      <span>Foto em breve</span>
    </div>
  );
}
function Header() {
  return (
    <header className="site-header">
      <Link className="wordmark" to="/" aria-label="Salgados Rosilene, início">
        <span className="brand-r">R</span>
        <span>
          Salgados <strong>Rosilene</strong>
        </span>
      </Link>
      <nav>
        <a href="/#cardapio">Cardápio</a>
        <Link to="/encomendar" className="button small">
          <ShoppingBag size={17} /> Fazer encomenda
        </Link>
      </nav>
    </header>
  );
}
function Home() {
  const { config: c, produtos, loading, error, refresh } = useCatalog();
  return (
    <>
      <section className="hero container">
        <div className="hero-copy">
          <span className="eyebrow">SALGADOS E MASSAS · FERROS, MG</span>
          <h1>
            Tem encontro.
            <br />
            Tem conversa.
            <br />
            <em>Tem Rosilene.</em>
          </h1>
          <p>
            Escolha seus sabores, monte seu cento e deixe os salgados com a
            gente.
          </p>
          <div className="actions">
            <Link className="button" to="/encomendar">
              <ShoppingBag size={19} /> Fazer encomenda
            </Link>
            <a
              className="text-button"
              href={`https://wa.me/${c.whatsapp}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={19} /> Fale com a Rosilene
            </a>
          </div>
          <div className="hero-note">
            <CalendarDays size={18} />
            <span>Escolha a melhor data e horário para sua encomenda</span>
          </div>
        </div>
        <div className="hero-image">
          <img src="/logo.jpg" alt="Salgados e Massas Rosilene" />
          <span className="image-caption">
            Uma mesa cheia de bons momentos.
          </span>
        </div>
      </section>
      <section className="service-strip">
        <div className="container">
          <span>
            <ChefHat />
            Monte do seu jeito
          </span>
          <span>
            <CalendarDays />
            Escolha a data
          </span>
          <span>
            <MessageCircle />
            Confirmação pelo WhatsApp
          </span>
        </div>
      </section>
      <section id="cardapio" className="container catalog-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">ESCOLHA OS SEUS FAVORITOS</span>
            <h2>Nosso cardápio</h2>
          </div>
          <p>
            Sabores diferentes no mesmo cento.
            <br />O valor acompanha sua escolha.
          </p>
        </div>
        {loading ? (
          <Spinner />
        ) : error ? (
          <>
            <ErrorBox text={error} />
            <button onClick={() => void refresh()}>Tentar novamente</button>
          </>
        ) : produtos.length ? (
          <div className="catalog-grid">
            {produtos.map((p) => (
              <article className="product-card" key={p.id}>
                <div className="product-image">
                  <ProductPhoto product={p} />
                </div>
                <div className="product-copy">
                  <span className="category">{p.categoria || "Salgados"}</span>
                  <h3>{p.nome}</h3>
                  <p>
                    {p.descricao ||
                      "Escolha este sabor para completar sua encomenda."}
                  </p>
                  <div className="price-line">
                    <strong>
                      {money(p.preco_cento)} <small>/ cento</small>
                    </strong>
                    <Link to="/encomendar" aria-label={`Encomendar ${p.nome}`}>
                      <ShoppingBag size={21} />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty title="Estamos preparando o cardápio on-line.">
            <p>
              Enquanto isso, fale com a Rosilene para consultar sabores e fazer
              sua encomenda.
            </p>
            <a
              className="button secondary"
              href={`https://wa.me/${c.whatsapp}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={18} /> Consultar pelo WhatsApp
            </a>
          </Empty>
        )}
      </section>
      <section className="visit-band container">
        <div>
          <span className="eyebrow">COMBINE COM A GENTE</span>
          <h2>Para retirar ou receber.</h2>
          <p>
            <MapPin size={18} />
            {c.endereco_saida}
          </p>
        </div>
        <a
          className="button secondary"
          href={`https://wa.me/${c.whatsapp}`}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle size={18} />
          {maskPhone(c.whatsapp)}
        </a>
      </section>
    </>
  );
}
function Privacy() {
  const { config } = useCatalog();
  return (
    <article className="container prose">
      <span className="eyebrow">SEUS DADOS</span>
      <h1>Aviso de privacidade</h1>
      <p>{config.aviso_privacidade}</p>
      <h2>O que guardamos</h2>
      <p>
        Nome, WhatsApp, itens escolhidos, datas, informações de pagamento e, em
        entregas, endereço e referência. Registramos também o aceite deste aviso
        e controles técnicos para evitar envios indevidos.
      </p>
      <h2>Contato e exclusão</h2>
      <p>
        Você pode pedir acesso, correção ou exclusão de seus dados pelo WhatsApp{" "}
        <a href={`https://wa.me/${config.whatsapp}`}>
          {maskPhone(config.whatsapp)}
        </a>
        . Os contatos feitos a partir da encomenda são usados para confirmação e
        cobrança, quando necessária.
      </p>
      <p>
        Usamos Supabase para guardar os dados e a hospedagem do site para
        disponibilizar o serviço. Quando o cálculo de entrega estiver ativado, o
        endereço é enviado ao serviço de mapas para estimar a rota.
      </p>
      <Link to="/">Voltar ao início</Link>
    </article>
  );
}
export default function App() {
  const [state, setState] = useState({
    produtos: [] as Produto[],
    config: defaultConfig,
    bloqueadas: [] as string[],
    loading: true,
    error: "",
  });
  const refresh = async () => {
    try {
      if (!configured)
        throw new Error(
          "O site está sendo configurado. Fale conosco pelo WhatsApp.",
        );
      setState((s) => ({ ...s, loading: true, error: "" }));
      const data = await catalog();
      setState({ ...data, loading: false, error: "" });
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error:
          e instanceof Error
            ? e.message
            : "Não foi possível carregar o cardápio.",
      }));
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <Context.Provider value={{ ...state, refresh }}>
      <Routes>
        <Route
          path="/painel/*"
          element={
            <Suspense fallback={<Spinner />}>
              <Admin />
            </Suspense>
          }
        />
        <Route
          path="*"
          element={
            <>
              <Header />
              <main>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/encomendar" element={<OrderForm />} />
                  <Route path="/privacidade" element={<Privacy />} />
                  <Route
                    path="*"
                    element={
                      <Empty title="Página não encontrada">
                        <Link to="/">Voltar ao início</Link>
                      </Empty>
                    }
                  />
                </Routes>
              </main>
              <footer className="site-footer container">
                <div className="wordmark">
                  <span className="brand-r">R</span>
                  <span>
                    Salgados <strong>Rosilene</strong>
                  </span>
                </div>
                <span>Ferros, Minas Gerais</span>
                <div>
                  <Link to="/privacidade">Privacidade</Link>
                  <NavLink to="/painel">
                    Acesso da Rosilene <ArrowUpRight size={14} />
                  </NavLink>
                </div>
              </footer>
            </>
          }
        />
      </Routes>
    </Context.Provider>
  );
}
