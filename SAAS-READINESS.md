# SAAS-READINESS.md

Este documento existe por um motivo só: quando a JA Store virar uma
plataforma SaaS (múltiplas lojas), este é o mapa de **tudo que hoje
assume "existe uma loja só no mundo"**. Não é uma tarefa pra fazer
agora — é um atalho pra não precisar re-auditar o projeto inteiro do
zero quando a hora chegar.

Atualize esta lista sempre que adicionar algo novo que só faz sentido
pra uma loja (evita o documento ficar desatualizado).

---

## Banco de dados (Supabase)

- **`store_settings`**: tabela de configuração inteira assume **1 registro
  fixo**, sempre acessado via `.eq('id', 1)`. Isso aparece espalhado em:
  - `index.html` (`loadStoreSettingsPublic`)
  - `checkout.html` (`loadStoreConfig`)
  - `produto.html` (`loadFreeShippingConfig`)
  - `troca-e-devolucao.html` (`loadContactInfo`)
  - `admin/index.html` (várias funções `loadSettings`/`save*`)
  - `netlify/functions/create-payment.js`
  - `netlify/functions/motoboy-quote.js`

  **Migração futura:** essa tabela vira "1 registro por loja" — toda
  ocorrência de `.eq('id', 1)` precisa virar `.eq('id', store_id)` ou
  equivalente com `store_id` como chave.

- **Nenhuma tabela tem `store_id`**: `products`, `orders`, `order_items`,
  `coupons`, `product_variants`, `testimonials`, `product_reviews`,
  `newsletter_subscribers`. Todas precisarão dessa coluna + índice.

- **RLS hoje é "está logado?"**, não "está logado E pertence a essa
  loja?". Toda política precisa ser reescrita na migração.

## Autenticação

- Supabase Auth é usado, mas **não existe vínculo usuário↔loja**. Todo
  usuário autenticado é tratado como dono de tudo.

## Identidade visual / configuração "hardcoded" no código

- Número de WhatsApp aparece **fixo** em vários arquivos (não só via
  `store_settings`) — checar `index.html`, `checkout.html`,
  `admin/index.html` por ocorrências de `5511946790983` /
  `WHATSAPP_NUMBER`.
- Nome "JA Store" aparece direto em `<title>`, headers, e textos fixos
  em vários arquivos, além do campo dinâmico já existente em
  `store_settings.store_name`.
- Cores de marca (`--ink`, `--accent`, `--rust` etc.) são fixas no CSS
  de cada arquivo — não vêm do banco.

## Armazenamento de imagens

- Sem upload real — fotos são referenciadas por URL manual, vivendo na
  pasta `assets/products/` do próprio repositório. Não há isolamento
  nenhum (nem faria sentido isolar hoje, com 1 loja só).

## Pagamentos

- 1 única conta Mercado Pago (`MERCADOPAGO_ACCESS_TOKEN` como variável
  de ambiente global). Todo dinheiro cai numa conta só.

## Frete

- `MELHORENVIO_TOKEN` e `STORE_ORIGIN_CEP` também são globais (variável
  de ambiente), não por loja.

## Infraestrutura

- 1 repositório GitHub, 1 site Netlify, 1 projeto Supabase. Criar uma
  loja nova hoje = duplicar tudo isso manualmente.

---

## Como usar este documento na Fase SaaS

Quando chegar a hora, comece revisando cada seção acima como um
checklist — cada item aqui vira uma tarefa concreta de migração. Isso
evita ter que re-descobrir a arquitetura do zero.
