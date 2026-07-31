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

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { customer, address, items, shipping, couponCode } = body;

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
      subtotal += Number(product.price) * qty;
      orderItems.push({
        product_id: product.id,
        product_name: product.name,
        unit_price: Number(product.price),
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
      // Regra de desconto ainda não definida (ver apply-coupon.js) — mantém 0 por enquanto.
      if (coupon) discount = 0;
    }

    const shippingPrice = Number(shipping?.price || 0);
    const total = Math.max(0, subtotal - discount + shippingPrice);

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
        discount,
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

    const preferenceItems = orderItems.map((i) => ({
      title: i.product_name,
      quantity: i.quantity,
      unit_price: i.unit_price,
      currency_id: "BRL",
    }));
    if (shippingPrice > 0) {
      preferenceItems.push({
        title: `Frete (${shipping.service || "envio"})`,
        quantity: 1,
        unit_price: shippingPrice,
        currency_id: "BRL",
      });
    }

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
      },
    });

    await supabase
      .from("orders")
      .update({ mp_preference_id: mpResponse.id })
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
