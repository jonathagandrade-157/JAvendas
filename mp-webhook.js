// netlify/functions/mp-webhook.js
//
// O Mercado Pago chama esta URL automaticamente sempre que um pagamento
// muda de status. Aqui nós:
//   1. Confirmamos o status real direto na API do Mercado Pago (nunca
//      confiamos apenas no que veio na notificação, por segurança).
//   2. Se aprovado: marcamos o pedido como pago, baixamos o estoque e
//      avisamos a loja (e o cliente, se configurado) no WhatsApp.
//
// Configure esta URL no seu app do Mercado Pago (ou ela já é enviada
// automaticamente via notification_url em create-payment.js).

const { createClient } = require("@supabase/supabase-js");
const mercadopago = require("mercadopago");
const fetch = require("node-fetch");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const client = new mercadopago.MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
});

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const body = event.body ? JSON.parse(event.body) : {};

    // O Mercado Pago manda o id do pagamento tanto na query quanto no corpo,
    // dependendo do tipo de notificação (webhook novo vs. IPN antigo).
    const paymentId = params["data.id"] || body?.data?.id || params.id;
    const topic = params.type || body.type;

    if (!paymentId || topic !== "payment") {
      // Outras notificações (ex: merchant_order) — apenas confirmamos recebimento.
      return { statusCode: 200, body: "ok" };
    }

    // ---------- busca o pagamento real na API do Mercado Pago ----------
    const payment = new mercadopago.Payment(client);
    const paymentData = await payment.get({ id: paymentId });

    const orderId = paymentData.external_reference;
    const status = paymentData.status; // approved | rejected | pending | in_process | ...

    if (!orderId) {
      console.warn("Webhook sem external_reference — ignorado.");
      return { statusCode: 200, body: "ok" };
    }

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      console.error("Pedido não encontrado para webhook:", orderId);
      return { statusCode: 200, body: "ok" };
    }

    // Evita processar duas vezes o mesmo pagamento aprovado (idempotência)
    if (order.payment_status === "pago" && status === "approved") {
      return { statusCode: 200, body: "ok" };
    }

    if (status === "approved") {
      // ---------- marca como pago ----------
      await supabase
        .from("orders")
        .update({
          payment_status: "pago",
          order_status: "Pago",
          payment_method: paymentData.payment_type_id,
          mp_payment_id: String(paymentId),
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      // ---------- baixa o estoque de cada item ----------
      for (const item of order.order_items) {
        if (!item.product_id) continue;
        const { data: product } = await supabase
          .from("products")
          .select("stock")
          .eq("id", item.product_id)
          .single();
        if (product) {
          const newStock = Math.max(0, product.stock - item.quantity);
          await supabase.from("products").update({ stock: newStock }).eq("id", item.product_id);
        }
      }

      // ---------- notifica WhatsApp (loja + cliente, se configurado) ----------
      await notifyWhatsApp(order);
    } else if (status === "rejected") {
      await supabase
        .from("orders")
        .update({ payment_status: "recusado", updated_at: new Date().toISOString() })
        .eq("id", orderId);
    }

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error(err);
    // Retornamos 200 mesmo em erro interno para o Mercado Pago não ficar
    // reenviando infinitamente — o erro já foi logado para investigação.
    return { statusCode: 200, body: "ok" };
  }
};

// -----------------------------------------------------------------
// Envio de WhatsApp via Meta Cloud API (oficial).
// Só funciona se WHATSAPP_CLOUD_TOKEN e WHATSAPP_PHONE_NUMBER_ID
// estiverem configurados nas variáveis de ambiente. Sem isso, a
// função simplesmente não envia nada (não quebra o resto do fluxo).
// Guia de configuração: https://developers.facebook.com/docs/whatsapp/cloud-api/get-started
// -----------------------------------------------------------------
async function notifyWhatsApp(order) {
  const token = process.env.WHATSAPP_CLOUD_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const storeNumber = process.env.STORE_WHATSAPP_NUMBER;

  if (!token || !phoneNumberId) {
    console.log("WhatsApp Cloud API não configurado — pulando notificação automática.");
    return;
  }

  const itemsText = order.order_items
    .map((i) => `• ${i.quantity}x ${i.product_name}${i.size ? ` (Tam ${i.size})` : ""}`)
    .join("\n");

  const storeMessage =
    `🛍️ Novo pedido pago!\n\n` +
    `Cliente: ${order.customer_name}\n` +
    `Telefone: ${order.customer_phone}\n\n` +
    `${itemsText}\n\n` +
    `Frete: R$ ${Number(order.shipping_price).toFixed(2)}\n` +
    `Total: R$ ${Number(order.total).toFixed(2)}\n` +
    `Pedido: ${order.id}`;

  const customerMessage =
    `Olá, ${order.customer_name}! ✅\n\n` +
    `Recebemos o pagamento do seu pedido na JA Store.\n` +
    `Total: R$ ${Number(order.total).toFixed(2)}\n\n` +
    `Assim que enviarmos, você recebe o código de rastreio por aqui. Obrigado pela compra!`;

  const sends = [];

  if (storeNumber) {
    sends.push(sendWhatsAppMessage(token, phoneNumberId, storeNumber, storeMessage));
  }
  if (order.customer_phone) {
    sends.push(sendWhatsAppMessage(token, phoneNumberId, order.customer_phone, customerMessage));
  }

  await Promise.allSettled(sends);
}

async function sendWhatsAppMessage(token, phoneNumberId, to, text) {
  try {
    const digits = to.replace(/\D/g, "");
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: digits,
        type: "text",
        text: { body: text },
      }),
    });
    if (!res.ok) {
      console.error("Falha ao enviar WhatsApp:", await res.text());
    }
  } catch (err) {
    console.error("Erro ao enviar WhatsApp:", err);
  }
}
