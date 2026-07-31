-- =============================================================
-- JA STORE — Schema do banco de dados (Supabase / Postgres)
-- =============================================================
-- Como usar:
-- 1. Crie um projeto grátis em https://supabase.com
-- 2. Vá em "SQL Editor" -> "New query"
-- 3. Cole este arquivo inteiro e clique em "Run"
-- =============================================================

-- ---------- PRODUTOS ----------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  category text not null,
  price numeric(10,2) not null,
  cost numeric(10,2),
  stock integer not null default 0,
  size_type text not null default 'clothing', -- 'shoe' | 'clothing' | 'none'
  tone integer not null default 0,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- CUPONS (estrutura pronta, sem regras de negócio ainda) ----------
create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  discount_type text not null default 'percent', -- 'percent' | 'fixed'
  discount_value numeric(10,2) not null default 0,
  active boolean not null default false,
  usage_limit integer,
  used_count integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- PEDIDOS ----------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_cpf text,
  customer_email text not null,
  customer_phone text not null,
  address jsonb not null, -- { street, number, complement, neighborhood, city, state, cep }
  shipping_service text,
  shipping_price numeric(10,2) not null default 0,
  shipping_days integer,
  subtotal numeric(10,2) not null,
  discount numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  coupon_code text,
  payment_method text, -- 'credit_card' | 'pix' | 'boleto'
  payment_status text not null default 'pendente', -- 'pendente' | 'pago' | 'recusado'
  order_status text not null default 'Aguardando pagamento', -- 'Pago' | 'Enviado' | 'Entregue' | 'Cancelado'
  mp_payment_id text,
  mp_preference_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- ITENS DO PEDIDO ----------
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  product_name text not null,
  unit_price numeric(10,2) not null,
  quantity integer not null,
  size text,
  created_at timestamptz not null default now()
);

-- =============================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================
alter table products enable row level security;
alter table coupons enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

-- Qualquer visitante (chave anon) pode LER produtos ativos
create policy "Produtos ativos são públicos"
  on products for select
  using (active = true);

-- Só usuários autenticados (o admin logado) podem criar/editar/excluir produtos
create policy "Admin gerencia produtos"
  on products for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Cupons: ninguém lê/escreve direto pelo frontend (só via função serverless com service_role)
-- Nenhuma policy de select para o público = bloqueado por padrão.
create policy "Admin gerencia cupons"
  on coupons for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Pedidos: só o admin autenticado pode ler/gerenciar.
-- A criação de pedidos acontece só via função serverless (service_role), nunca do frontend.
create policy "Admin gerencia pedidos"
  on orders for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Admin gerencia itens de pedido"
  on order_items for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- =============================================================
-- Índices úteis
-- =============================================================
create index if not exists idx_orders_status on orders(order_status);
create index if not exists idx_orders_created on orders(created_at desc);
create index if not exists idx_products_category on products(category);

-- =============================================================
-- Seed inicial de produtos (opcional — pode editar/apagar depois pelo painel admin)
-- =============================================================
insert into products (name, slug, category, price, cost, stock, size_type, tone, image_url)
values
  ('Tênis Running Leve — Cinza', 'tenis-running-leve-cinza', 'calcados', 159.90, 90, 12, 'shoe', 1, 'assets/products/tenis-running-leve-cinza.jpg'),
  ('Camiseta Oversized Estampada — Branca', 'camiseta-oversized-estampada-branca', 'camisetas', 64.90, 35, 20, 'clothing', 4, 'assets/products/camiseta-oversized-estampada-branca.jpg'),
  ('Conjunto Tactel Premium — Preto', 'conjunto-tactel-premium-preto', 'tactel', 149.90, 85, 8, 'clothing', 3, 'assets/products/conjunto-tactel-premium-preto.jpg')
on conflict (slug) do nothing;
