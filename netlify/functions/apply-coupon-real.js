// netlify/functions/apply-coupon.js
//
// Valida um cupom de desconto. A ESTRUTURA já está pronta (tabela `coupons`
// no banco, validação de existência/validade/uso), mas as REGRAS de negócio
// (quanto de desconto, em quais produtos, combinação com frete, etc.) ainda
// não foram definidas — por enquanto, todo cupom válido retorna 0 de desconto.
// Edite a lógica marcada com "REGRA DE DESCONTO" abaixo quando decidir as regras.

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { code, subtotal = 0 } = JSON.parse(event.body || "{}");

    if (!code) {
      return { statusCode: 400, body: JSON.stringify({ error: "Informe um código de cupom." }) };
    }

    const { data: coupon, error } = await supabase
      .from("coupons")
      .select("*")
      .eq("code", code.trim().toUpperCase())
      .eq("active", true)
      .maybeSingle();

    if (error) throw error;

    if (!coupon) {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: false, message: "Cupom inválido ou expirado." }),
      };
    }

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: false, message: "Este cupom expirou." }),
      };
    }

    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: false, message: "Este cupom já atingiu o limite de uso." }),
      };
    }

    // ---------- REGRA DE DESCONTO ----------
    let discount = 0;
    if (coupon.discount_type === "percent") {
      discount = (subtotal * Number(coupon.discount_value)) / 100;
    } else if (coupon.discount_type === "fixed") {
      discount = Number(coupon.discount_value);
    }
    discount = Math.min(discount, subtotal); // nunca descontar mais que o subtotal
    discount = Math.round(discount * 100) / 100;
    // ---------------------------------------------------------------------------

    return {
      statusCode: 200,
      body: JSON.stringify({
        valid: true,
        code: coupon.code,
        discount,
        message:
          discount > 0
            ? "Cupom aplicado!"
            : "Cupom reconhecido, mas o desconto calculado foi zero.",
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: "Erro ao validar cupom." }) };
  }
};
