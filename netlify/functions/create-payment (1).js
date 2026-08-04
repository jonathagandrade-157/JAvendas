// netlify/functions/create-payment.js
//
// Recebe o carrinho + dados do cliente, RECALCULA tudo no servidor
// (nunca confia em preço vindo do navegador), cria o pedido no banco
// com status "pendente" e gera o link de pagamento do Mercado Pago
// (Checkout Pro — cobre cartão, Pix e boleto numa única integração).
//
// Body esperado (POST):
// {
//   customer: { name, cpf, email, phone },
//   address: { street, number, complement, neighborhood, city, state, cep },
//   items: [ { id, quantity, size } ],
//   shipping: { service, price, days },
//   couponCode: "OPCIONAL"
// }
//
// Resposta:
// { orderId, initPoint }   <- redirecione o navegador para initPoint

const { createClient } = require("@supabase/supabase-js");
const mercadopago = require("mercadopago");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const client = new mercadopago.MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
});

function formatBRLServer(v) {
  return "R$ " + Number(v).toFixed(2).replace(".", ",");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { customer, address, items, shipping, couponCode, preferredMethod } = body;

    // ---------- validação básica ----------
    if (!customer?.name || !customer?.email || !customer?.phone) {
      return { statusCode: 400, body: JSON.stringify({ error: "Dados do cliente incompletos." }) };
    }
    if (!address?.cep || !address?.street || !address?.number || !address?.city || !address?.state) {
      return { statusCode: 400, body: JSON.stringify({ error: "Endereço incompleto." }) };
    }
    if (!Array.isArray(items) || items.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "Carrinho vazio." }) };
    }

    // ---------- busca produtos reais no banco (preço e estoque nunca vêm do cliente) ----------
    const ids = items.map((i) => i.id);
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select("*")
      .in("id", ids)
      .eq("active", true);

    if (prodErr) throw prodErr;

    const orderItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = products.find((p) => p.id === item.id);
      if (!product) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: `Produto não encontrado ou indisponível (id ${item.id}).` }),
        };
      }
      const qty = Math.max(1, Number(item.quantity) || 1);
      if (product.stock < qty) {
        return {
          statusCode: 409,
          body: JSON.stringify({ error: `Estoque insuficiente para "${product.name}".` }),
        };
      }
      const salePrice = Number(product.sale_price);
      const unitPrice =
        salePrice && salePrice > 0 && salePrice < Number(product.price)
          ? salePrice
          : Number(product.price);
      subtotal += unitPrice * qty;
      orderItems.push({
        product_id: product.id,
        product_name: product.name,
        unit_price: unitPrice,
        quantity: qty,
        size: item.size || null,
      });
    }

    // ---------- cupom (se informado) ----------
    let discount = 0;
    if (couponCode) {
      const { data: coupon } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", couponCode.trim().toUpperCase())
        .eq("active", true)
        .maybeSingle();

      if (coupon) {
        // Mesma correção de fuso horário do apply-coupon.js: trata a validade
        // como "até o fim do dia no horário de Brasília", não meia-noite UTC.
        const expired = coupon.expires_at &&
          new Date(new Date(coupon.expires_at).getTime() + 27 * 60 * 60 * 1000 - 1000) < new Date();
        const notStartedYet = coupon.starts_at && new Date(coupon.starts_at) > new Date();
        const belowMinimum = coupon.min_purchase && subtotal < Number(coupon.min_purchase);
        const overLimit = coupon.usage_limit && coupon.used_count >= coupon.usage_limit;
        if (!expired && !notStartedYet && !belowMinimum && !overLimit) {
          if (coupon.discount_type === "percent") {
            discount = (subtotal * Number(coupon.discount_value)) / 100;
          } else if (coupon.discount_type === "fixed") {
            discount = Number(coupon.discount_value);
          }
          discount = Math.min(discount, subtotal);
          discount = Math.round(discount * 100) / 100;

          // contabiliza o uso do cupom
          await supabase
            .from("coupons")
            .update({ used_count: (coupon.used_count || 0) + 1 })
            .eq("id", coupon.id);
        }
      }
    }

    const FREE_SHIPPING_THRESHOLD = 300;
    const shippingPrice = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : Number(shipping?.price || 0);

    // Desconto de 5% para pagamento via Pix — calculado aqui no servidor
    // (nunca a partir de um valor vindo do navegador), com base no método
    // que o cliente escolheu no checkout.
    const PIX_DISCOUNT_RATE = 0.05;
    const pixDiscount = preferredMethod === "pix" ? Math.round(subtotal * PIX_DISCOUNT_RATE * 100) / 100 : 0;

    const total = Math.max(0, subtotal - discount - pixDiscount + shippingPrice);

    // ---------- cria o pedido (status inicial: pendente) ----------
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        customer_name: customer.name,
        customer_cpf: customer.cpf || null,
        customer_email: customer.email,
        customer_phone: customer.phone,
        address,
        shipping_service: shipping?.service || null,
        shipping_price: shippingPrice,
        shipping_days: shipping?.days || null,
        subtotal,
        discount: discount + pixDiscount,
        total,
        coupon_code: couponCode || null,
        payment_status: "pendente",
        order_status: "Aguardando pagamento",
      })
      .select()
      .single();

    if (orderErr) throw orderErr;

    const itemsWithOrder = orderItems.map((i) => ({ ...i, order_id: order.id }));
    const { error: itemsErr } = await supabase.from("order_items").insert(itemsWithOrder);
    if (itemsErr) throw itemsErr;

    // ---------- monta a preferência do Mercado Pago (Checkout Pro) ----------
    const siteUrl = process.env.SITE_URL || "https://seu-site.netlify.app";

    // O total dos itens enviados ao Mercado Pago PRECISA bater exatamente
    // com o valor cobrado. Como nem toda conta do Mercado Pago aceita um
    // item de valor negativo para representar "desconto", ajustamos o
    // preço de cada item proporcionalmente, e corrigimos qualquer diferença
    // de centavos (por arredondamento) no último item.
    const totalDiscount = discount + pixDiscount;
    const effectiveMerchandiseTotal = Math.max(0, subtotal - totalDiscount);
    const scale = subtotal > 0 ? effectiveMerchandiseTotal / subtotal : 1;

    const preferenceItems = orderItems.map((i) => ({
      title: i.product_name,
      quantity: i.quantity,
      unit_price: Math.round(i.unit_price * scale * 100) / 100,
      currency_id: "BRL",
    }));

    // corrige a diferença de centavos por arredondamento, ajustando o último item
    const roundedSum = preferenceItems.reduce((s, i) => s + i.unit_price * i.quantity, 0);
    const centsDiff = Math.round((effectiveMerchandiseTotal - roundedSum) * 100) / 100;
    if (centsDiff !== 0 && preferenceItems.length > 0) {
      const last = preferenceItems[preferenceItems.length - 1];
      last.unit_price = Math.round((last.unit_price + centsDiff / last.quantity) * 100) / 100;
    }

    if (shippingPrice > 0) {
      preferenceItems.push({
        title: `Frete (${shipping.service || "envio"})`,
        quantity: 1,
        unit_price: shippingPrice,
        currency_id: "BRL",
      });
    }
    if (totalDiscount > 0) {
      // Item informativo (valor R$ 0) só para deixar claro no comprovante
      // que houve desconto — o valor real já foi embutido nos preços acima.
      preferenceItems.push({
        title: `Desconto aplicado: ${formatBRLServer(totalDiscount)}`,
        quantity: 1,
        unit_price: 0,
        currency_id: "BRL",
      });
    }

    // Se o cliente já escolheu a forma de pagamento no nosso checkout,
    // pulamos direto pra essa tela no Mercado Pago (em vez de mostrar tudo de novo).
    const excludedByMethod = {
      pix: [{ id: "credit_card" }, { id: "debit_card" }, { id: "ticket" }, { id: "prepaid_card" }],
      credit_card: [{ id: "ticket" }, { id: "bank_transfer" }],
      boleto: [{ id: "credit_card" }, { id: "debit_card" }, { id: "bank_transfer" }, { id: "prepaid_card" }],
    };
    const paymentMethods = excludedByMethod[preferredMethod]
      ? { excluded_payment_types: excludedByMethod[preferredMethod] }
      : undefined;

    const preference = new mercadopago.Preference(client);
    const mpResponse = await preference.create({
      body: {
        items: preferenceItems,
        payer: {
          name: customer.name,
          email: customer.email,
        },
        external_reference: order.id,
        notification_url: `${siteUrl}/.netlify/functions/mp-webhook`,
        back_urls: {
          success: `${siteUrl}/checkout.html?status=success&order=${order.id}`,
          pending: `${siteUrl}/checkout.html?status=pending&order=${order.id}`,
          failure: `${siteUrl}/checkout.html?status=failure&order=${order.id}`,
        },
        auto_return: "approved",
        ...(paymentMethods ? { payment_methods: paymentMethods } : {}),
      },
    });

    await supabase
      .from("orders")
      .update({ mp_preference_id: mpResponse.id, payment_method: preferredMethod || null })
      .eq("id", order.id);

    return {
      statusCode: 200,
      body: JSON.stringify({
        orderId: order.id,
        initPoint: mpResponse.init_point,
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: "Erro ao criar o pagamento." }) };
  }
};
