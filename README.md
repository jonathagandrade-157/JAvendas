# JA Store — Loja Virtual Completa

E-commerce completo: catálogo, checkout com frete e pagamento, painel
administrativo com login, controle de estoque e notificação por WhatsApp.

---

## 1. Estrutura do projeto

```
ja-store/
├── index.html                      → Loja (catálogo, carrinho)
├── checkout.html                   → Checkout (endereço, frete, cupom, pagamento)
├── admin/
│   └── index.html                  → Painel administrativo (login + produtos + pedidos)
├── assets/
│   ├── js/supabase-client.js       → Conexão com o banco (URL + chave pública)
│   ├── logo.png                    → (você adiciona) logo da loja
│   └── products/                   → (você adiciona) fotos dos produtos
├── netlify/
│   └── functions/
│       ├── shipping-quote.js       → Calcula frete (Melhor Envio)
│       ├── apply-coupon.js         → Valida cupom de desconto
│       ├── create-payment.js       → Cria o pedido + link de pagamento (Mercado Pago)
│       └── mp-webhook.js           → Recebe confirmação de pagamento, baixa estoque, avisa WhatsApp
├── supabase-schema.sql             → Script para criar as tabelas do banco
├── netlify.toml                    → Configuração da Netlify
├── package.json                    → Dependências das funções serverless
└── .env.example                    → Modelo das variáveis de ambiente
```

### Como as peças se encaixam

- **Banco de dados + login do admin:** [Supabase](https://supabase.com) (Postgres + Autenticação, plano grátis).
- **Frete:** [Melhor Envio](https://melhorenvio.com.br).
- **Pagamento:** [Mercado Pago](https://www.mercadopago.com.br) — Checkout Pro (cartão, Pix e boleto numa integração só).
- **WhatsApp automático:** Meta Cloud API (oficial, opcional — sem ela, o site funciona normalmente, só não manda mensagem sozinho).
- **Hospedagem + backend:** Netlify (o site estático + as "Netlify Functions", que são o backend em JavaScript rodando sob demanda).

A loja (`index.html`) nunca fala diretamente com Mercado Pago ou Melhor
Envio — ela sempre passa pelas funções em `netlify/functions/`, que
guardam as chaves secretas no servidor (nunca no navegador).

---

## 2. Dependências instaladas

Definidas em `package.json`:

| Pacote | Para quê |
|---|---|
| `@supabase/supabase-js` | Conectar ao banco de dados e autenticação |
| `mercadopago` | SDK oficial do Mercado Pago (criar pagamentos, consultar status) |
| `node-fetch` | Fazer chamadas HTTP dentro das funções (Melhor Envio, WhatsApp) |
| `netlify-cli` (dev) | Rodar tudo localmente antes de publicar |

No navegador (`index.html`, `checkout.html`, `admin/index.html`), o
SDK do Supabase é carregado direto via CDN (`unpkg.com`) — não precisa
instalar nada para isso.

---

## 3. Passo a passo de instalação

### 3.1 Criar o banco de dados (Supabase)

1. Crie uma conta grátis em [supabase.com](https://supabase.com) e um novo projeto.
2. Vá em **SQL Editor → New query**, cole todo o conteúdo de `supabase-schema.sql` e clique em **Run**.
3. Vá em **Authentication → Users → Add user** e crie o usuário/senha que você vai usar para logar no painel admin.
4. Vá em **Settings → API** e copie:
   - `Project URL`
   - `anon public key`
   - `service_role key` (⚠️ nunca exponha essa no frontend — só é usada dentro das funções serverless)

### 3.2 Configurar o cliente do Supabase no site

Abra `assets/js/supabase-client.js` e preencha:

```js
window.SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
window.SUPABASE_ANON_KEY = "sua-anon-key-aqui";
```

(A "anon key" não é secreta — ela é feita para rodar no navegador. Quem
protege os dados de verdade são as regras de RLS já criadas pelo
`supabase-schema.sql`.)

### 3.3 Criar conta no Mercado Pago

1. Crie uma aplicação em [mercadopago.com.br/developers/panel](https://www.mercadopago.com.br/developers/panel).
2. Copie o **Access Token** (comece com o de teste/sandbox para testar sem cobrar de verdade).

### 3.4 Criar conta no Melhor Envio

1. Crie uma conta em [melhorenvio.com.br](https://melhorenvio.com.br).
2. Gere um **token de API** em "Gerenciar Tokens de API".
3. Anote o CEP de onde os produtos serão enviados (endereço da loja).

### 3.5 (Opcional) WhatsApp automático

Só configure isso se quiser que o site avise sozinho no WhatsApp após o pagamento:

1. Siga o guia oficial: [developers.facebook.com/docs/whatsapp/cloud-api/get-started](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started).
2. Anote o `WHATSAPP_CLOUD_TOKEN` e o `WHATSAPP_PHONE_NUMBER_ID`.

Sem isso configurado, o site funciona 100% normalmente — só não envia a mensagem automática.

### 3.6 Configurar as variáveis de ambiente na Netlify

No painel do seu site na Netlify: **Site settings → Environment variables**,
adicione (usando `.env.example` como referência):

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
MERCADOPAGO_ACCESS_TOKEN
MELHORENVIO_TOKEN
STORE_ORIGIN_CEP
WHATSAPP_CLOUD_TOKEN        (opcional)
WHATSAPP_PHONE_NUMBER_ID    (opcional)
STORE_WHATSAPP_NUMBER
SITE_URL                    (a URL do seu site já publicado, ex: https://ja-store.netlify.app)
```

---

## 4. Deploy na Netlify

1. Baixe/organize esta pasta completa no seu computador.
2. Adicione suas fotos em `assets/products/` e a logo em `assets/logo.png` (veja `product-image-guide.txt`).
3. Acesse [app.netlify.com](https://app.netlify.com) e crie uma conta (se ainda não tiver).
4. A forma mais simples: **arraste a pasta inteira** em [app.netlify.com/drop](https://app.netlify.com/drop) — a Netlify detecta a pasta `netlify/functions` sozinha e já publica tudo, site e backend juntos.
   - Para projetos que você vai atualizar com frequência, o ideal é conectar um repositório do GitHub (**Site settings → Build & deploy → Link repository**), assim toda alteração enviada ao Git publica sozinha.
5. Configure as variáveis de ambiente (passo 3.6) **antes ou depois** do primeiro deploy — depois de configurar, clique em **Deploys → Trigger deploy** para aplicar.

### Testando localmente (opcional, para quem tem Node.js instalado)

```bash
npm install
npx netlify dev
```

Isso roda o site e as funções serverless juntos em `localhost:8888`,
lendo as variáveis do arquivo `.env` (copie de `.env.example`).

---

## 5. Como usar o painel administrativo

Acesse `seusite.netlify.app/admin/` e faça login com o usuário criado no
passo 3.1.3.

- **Produtos:** criar, editar, excluir, ajustar preço e estoque.
- **Pedidos:** ver todos os pedidos, os itens de cada um, e mudar o status
  (Aguardando pagamento → Pago → Enviado → Entregue → Cancelado).

O estoque **desconta sozinho** quando um pagamento é aprovado (via
`mp-webhook.js`) — você só precisa repor estoque quando chegar mercadoria nova.

---

## 6. Sobre o cupom de desconto

A estrutura já está pronta (tabela `coupons`, validação de código/validade/
limite de uso), mas a **regra de quanto descontar ainda não foi definida**
propositalmente, como você pediu. Para ativar:

1. Crie um cupom direto no Supabase (**Table editor → coupons → Insert row**).
2. Edite a lógica marcada com `REGRA DE DESCONTO` em:
   - `netlify/functions/apply-coupon.js`
   - `netlify/functions/create-payment.js`

---

## 7. Limitações importantes (leia antes de ir para produção)

- **Eu não consegui testar as chamadas de API ao vivo** (Mercado Pago, Melhor
  Envio, WhatsApp) neste ambiente, porque ele não tem acesso à internet. O
  código segue exatamente o formato documentado por cada serviço, mas teste
  uma compra de ponta a ponta com valores baixos antes de divulgar o site.
- **Frete:** o cálculo usa peso/dimensões estimados por quantidade de itens
  (não por produto individual). Para mais precisão, adicione peso/dimensões
  reais a cada produto no banco e ajuste `shipping-quote.js`.
- **WhatsApp automático** depende da Meta Cloud API estar configurada e
  aprovada — sem isso, simplesmente não dispara (não quebra o resto do fluxo).
- **CPF:** é aceito no formulário mas não passa por validação de dígito
  verificador — hoje só serve como informação salva no pedido.
- Comece sempre com o **Access Token de teste** do Mercado Pago até validar
  o fluxo completo, antes de trocar pelo de produção.

---

## 8. Onde configurar cada chave — resumo rápido

| Chave | Onde configurar |
|---|---|
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | `assets/js/supabase-client.js` (arquivo do site) |
| `SUPABASE_SERVICE_ROLE_KEY` | Variável de ambiente na Netlify (nunca no código) |
| `MERCADOPAGO_ACCESS_TOKEN` | Variável de ambiente na Netlify |
| `MELHORENVIO_TOKEN` / `STORE_ORIGIN_CEP` | Variável de ambiente na Netlify |
| `WHATSAPP_CLOUD_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | Variável de ambiente na Netlify |
| `SITE_URL` | Variável de ambiente na Netlify |
