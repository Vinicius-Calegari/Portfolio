# Salgados Rosilene

Sistema de encomendas em React + TypeScript + Vite, com Supabase Auth, Postgres, Storage e Edge Functions.

- Site: https://salgados-rosilene.viniciuscalegari036.chatgpt.site
- Painel: https://salgados-rosilene.viniciuscalegari036.chatgpt.site/painel
- [Guia de uso](docs/03-guia-de-uso.md)
- [Publicação e manutenção](docs/04-publicacao-e-manutencao.md)
- [Validação e limites](docs/05-validacao.md)

O catálogo começa vazio e as encomendas ficam pausadas até cadastrar os sabores e preços reais. O WhatsApp funciona nesse período. Nenhum preço, foto de produto ou dado Pix foi inventado. Frete grátis está ligado e não faz chamadas ao Google Maps.

## Regra de datas

Não existe mais antecedência mínima obrigatória. O cliente pode selecionar **hoje** quando ainda existir um horário futuro disponível. Datas bloqueadas, limite diário e a antecedência máxima continuam validados no navegador e no servidor.

## Recursos implementados

Centos mistos e vários grupos; cálculo proporcional no servidor; datas e capacidade diária; retirada/entrega; dinheiro e troco; Pix com QR Code; fiado autorizado e contas a receber. Painel com lista/calendário, pedidos manuais, histórico de clientes, mensagens prontas no WhatsApp, cadastro de produtos/fotos, configurações, anonimização, CSV, quatro PDFs A4 e cópias diárias dos registros.

WhatsApp abre a mensagem para revisão e envio pela pessoa. Pix não tem baixa bancária automática. Existe uma única conta administrativa; cadastro público é bloqueado no banco.

## Rodar localmente

Use Node.js 24 e npm:

```powershell
npm ci
Copy-Item .env.example .env.local
# Preencha .env.local com as três variáveis públicas.
npm run dev
```

Acesse http://127.0.0.1:5173. Nesta instalação, `.env.local` já está configurado. A senha inicial está somente no arquivo local `.admin-access.txt`, ignorado pelo Git. Nunca publique esse arquivo.

```powershell
npm run check
npm test
npm run build
npm run preview
```

## Variáveis

| Variável | Local | Uso |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Build do site | URL do projeto |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Build do site | Chave pública com RLS |
| `VITE_SUPABASE_EDGE_ANON_KEY` | Build do site | JWT público anon para o gateway das Edge Functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Somente Edge Functions | Fornecida pelo ambiente Supabase; nunca expor no navegador |
| `GOOGLE_MAPS_API_KEY` | Somente Edge Functions, opcional | Geocoding e Routes para cobrança automática de frete |

As variáveis `VITE_` são públicas e entram no JavaScript compilado. Senhas e chaves privadas não podem receber esse prefixo. `.env.example` contém apenas os nomes, sem valores reais.

## Banco e segurança

Projeto Supabase `gqhscywjjvvjspajqkgt`, em São Paulo. Migrações em `supabase/migrations`; função de pedidos em `supabase/functions/encomendas`.

O público não lê clientes/pedidos nem grava totais diretamente. O servidor valida quantidades, prazos, consentimento, crédito, capacidade e troco; recalcula preços e frete e congela os valores. Locks transacionais impedem ultrapassar a capacidade com envios simultâneos. Idempotência evita duplicar reenvios. Funções administrativas exigem a conta autorizada.

Ao recriar o projeto, aplique migrações em ordem, desative cadastro no Auth, provisione a conta pelo procedimento restrito e publique `encomendas`. A autorização de instalação de uso único já foi encerrada nesta implantação; a função temporária `setup-admin` responde 410.

## Publicação

Configuração do Sites em `.openai/hosting.json`. A integração solicitada GitHub/Cloudflare Pages ainda depende da autenticação da conta GitHub correta; consulte o guia de manutenção. Não há domínio próprio nem serviço de mapas pago ativado.

## Cópias e imagens

Snapshot diário dos oito conjuntos de dados às 03h de Brasília, retenção de 14 dias, com exportação no painel. Fica no mesmo projeto e não inclui os arquivos binários das fotos ou a conta Auth. Mantenha também exportações e fotos em outro local privado. A restauração dos registros em tabelas temporárias foi testada.

Logo original intacta em `assets/originals/logo-rosilene.jpg`, usada nos PDFs; versão web em `public/logo.webp`. Sem imagens externas de produtos. `node scripts/prepare-assets.mjs` regenera os assets. Documentos 00–02 registram o planejamento inicial; os guias 03–05 descrevem a implementação efetiva.

## Compatibilidade de navegadores

O build é configurado para Chrome, Edge, Firefox e Safari modernos, incluindo iPhone/iPad. O projeto possui fallbacks próprios para UUID, cópia para área de transferência, upload/otimização de imagens e modais, evitando dependência exclusiva de APIs recentes do Chromium.
