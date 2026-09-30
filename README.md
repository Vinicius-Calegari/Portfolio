# Salgados Rosilene

Sistema de encomendas em **React + TypeScript + Vite**, com backend no **Supabase** (Postgres, Auth, Storage e Edge Functions) e deploy no **Railway**.

- **Produção:** https://salgados-rosilene-production.up.railway.app
- **Painel:** https://salgados-rosilene-production.up.railway.app/painel
- **Código:** branch `salgados-rosilene` deste repositório

## Estado do projeto

O catálogo começa vazio e as encomendas on-line permanecem pausadas até a Rosilene cadastrar sabores e preços reais no painel. Nenhum preço, foto de produto ou dado Pix foi inventado.

O sistema já está preparado para:

- montar meio cento, cento e quantidades personalizadas;
- misturar sabores com contador de unidades restantes;
- recalcular preços no servidor e congelar o valor de cada item no pedido;
- retirada ou entrega;
- Pix, dinheiro e troco;
- fiado por cliente;
- cadastro manual de pedidos;
- agenda e filtros administrativos;
- confirmação e cobrança por WhatsApp;
- clientes, produtos, fotos e configurações;
- CSV, PDFs A4 e backup de registros;
- RLS e operações sensíveis validadas no servidor.

## Pedidos para hoje

**Não existe antecedência mínima obrigatória.**

O cliente pode selecionar o próprio dia, desde que escolha um horário que ainda não tenha passado. A mesma regra é validada no navegador e no banco. Datas bloqueadas, limite diário e antecedência máxima continuam válidos.

## Desenvolvimento

Requisitos: Node.js 24 e npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Validação:

```bash
npm run check
npm test
npm run build
```

O GitHub Actions executa essas verificações automaticamente na branch `salgados-rosilene`.

## Variáveis públicas do frontend

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_EDGE_ANON_KEY=
```

As variáveis `VITE_*` fazem parte do bundle do navegador e, portanto, só recebem valores públicos. `service_role`, senhas administrativas e outras credenciais privadas **não podem** ser colocadas no frontend ou no GitHub.

## Supabase

Projeto: `gqhscywjjvvjspajqkgt` — região São Paulo.

A pasta `supabase/migrations` contém o schema e as regras de negócio versionadas. A função `supabase/functions/encomendas` centraliza operações públicas de pedido, cálculo de frete e validações server-side.

O público não possui acesso direto a clientes e pedidos. O servidor recalcula total/preços, verifica grupos, prazo, horário, limite diário, fiado e entrega. Locks transacionais e idempotência ajudam a impedir duplicidade e excesso de capacidade em envios concorrentes.

## Produção

O Railway usa:

```text
npm install && npm run build
npx vite preview --host 0.0.0.0 --port $PORT
```

O serviço possui healthcheck em `/` e variáveis do Supabase configuradas na plataforma.

## Compatibilidade

O bundle é direcionado a Chrome, Edge, Firefox e Safari, incluindo iPhone/iPad. Há fallbacks para APIs que podem variar entre navegadores, como UUID, Clipboard e processamento de imagem.

## Observações

- O frete está inicialmente configurado como gratuito.
- O Google Maps só é necessário se a cobrança automática por distância for ativada.
- O Pix não possui baixa bancária automática.
- As mensagens do WhatsApp são abertas prontas para revisão e envio humano.
- A logo usada no frontend está em `public/logo.jpg`.
