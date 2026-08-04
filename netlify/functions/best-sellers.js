// netlify/functions/best-sellers.js
//
// Calcula os produtos mais vendidos de verdade, com base nos pedidos PAGOS
// no banco. Função pública (sem login) — só devolve IDs de produto e
// quantidade vendida, nada sensível.

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async () => {
  try {
    const { data: orders, error } = await supabase
      .from("orders")
      .select("order_items(product_id, quantity)")
      .eq("payment_status", "pago");

    if (error) throw error;

    const totals = {};
    orders.forEach((o) => {
      (o.order_items || []).forEach((item) => {
        if (!item.product_id) return;
        totals[item.product_id] = (totals[item.product_id] || 0) + item.quantity;
      });
    });

    const ranked = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([productId, qty]) => ({ productId, qty }));

    return {
      statusCode: 200,
      headers: { "Cache-Control": "public, max-age=300" },
      body: JSON.stringify({ bestSellers: ranked }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 200, body: JSON.stringify({ bestSellers: [] }) };
  }
};
