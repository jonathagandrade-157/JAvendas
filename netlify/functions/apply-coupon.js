// netlify/functions/apply-coupon.js
//
// Valida um cupom de desconto ANTES do pagamento — é a prévia que o cliente
// vê no checkout. A validação DEFINITIVA (a que realmente vale pra cobrança)
// roda de novo, do zero, em create-payment.js — essa função aqui é só pra
// dar feedback rápido na tela, sem cobrar nada ainda.
//
// Body esperado (POST):
// { code, subtotal, items: [{id, price, qty}], customerEmail (opcional) }

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
    const { code, subtotal = 0, items = [], customerEmail } = JSON.parse(event.body || "{}");

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

    // O campo de validade guarda só a data (ex: 2026-08-04), que o banco
    // interpreta como meia-noite em UTC. Como o Brasil está 3h atrás do UTC,
    // tratamos o cupom como válido até o FIM do dia escolhido no horário de
    // Brasília (UTC-3) — não até a meia-noite UTC, que expiraria cedo demais.
    const isExpired = (expiresAt) => {
      if (!expiresAt) return false;
      const cutoff = new Date(new Date(expiresAt).getTime() + 27 * 60 * 60 * 1000 - 1000);
      return cutoff < new Date();
    };

    if (isExpired(coupon.expires_at)) {
      return { statusCode: 200, body: JSON.stringify({ valid: false, message: "Este cupom expirou." }) };
    }

    if (coupon.starts_at && new Date(coupon.starts_at) > new Date()) {
      return { statusCode: 200, body: JSON.stringify({ valid: false, message: "Este cupom ainda não está disponível." }) };
    }

    if (coupon.min_purchase && subtotal < Number(coupon.min_purchase)) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          valid: false,
          message: `Esse cupom exige compra mínima de R$ ${Number(coupon.min_purchase).toFixed(2)}.`,
        }),
      };
    }

    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
      return { statusCode: 200, body: JSON.stringify({ valid: false, message: "Este cupom já atingiu o limite de uso." }) };
    }

    // ---------- horário válido ----------
    if (coupon.time_start && coupon.time_end) {
      const nowBrasilia = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const hhmm = nowBrasilia.toISOString().slice(11, 16);
      if (hhmm < coupon.time_start.slice(0, 5) || hhmm > coupon.time_end.slice(0, 5)) {
        return { statusCode: 200, body: JSON.stringify({ valid: false, message: "Este cupom não está disponível neste horário." }) };
      }
    }

    // ---------- só primeira compra / limite por cliente (só dá pra checar se já sabemos o e-mail) ----------
    if (customerEmail) {
      if (coupon.first_purchase_only) {
        const { count } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("customer_email", customerEmail)
          .eq("payment_status", "pago");
        if ((count || 0) > 0) {
          return { statusCode: 200, body: JSON.stringify({ valid: false, message: "Este cupom vale só na primeira compra." }) };
        }
      }
      if (coupon.per_customer_limit) {
        const { count } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("customer_email", customerEmail)
          .eq("coupon_code", coupon.code)
          .eq("payment_status", "pago");
        if ((count || 0) >= coupon.per_customer_limit) {
          return { statusCode: 200, body: JSON.stringify({ valid: false, message: "Você já utilizou esse cupom o número máximo de vezes." }) };
        }
      }
    }

    // ---------- escopo do desconto (produtos específicos ou 1 categoria) ----------
    const hasProductScope = Array.isArray(coupon.product_ids) && coupon.product_ids.length > 0;
    const hasCategoryScope = !!coupon.category_slug;
    let eligibleSubtotal = subtotal;

    if ((hasProductScope || hasCategoryScope) && items.length > 0) {
      let matchedItems = items;
      if (hasProductScope) {
        matchedItems = items.filter((i) => coupon.product_ids.includes(i.id));
      } else if (hasCategoryScope) {
        const ids = items.map((i) => i.id);
        const { data: prods } = await supabase.from("products").select("id, category").in("id", ids);
        const categoryById = Object.fromEntries((prods || []).map((p) => [p.id, p.category]));
        matchedItems = items.filter((i) => categoryById[i.id] === coupon.category_slug);
      }
      eligibleSubtotal = matchedItems.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0);

      if (eligibleSubtotal <= 0) {
        return {
          statusCode: 200,
          body: JSON.stringify({ valid: false, message: "Este cupom não se aplica aos produtos do seu carrinho." }),
        };
      }
    }

    // ---------- cálculo do desconto ----------
    let discount = 0;
    if (coupon.discount_type === "percent") {
      discount = (eligibleSubtotal * Number(coupon.discount_value)) / 100;
    } else if (coupon.discount_type === "fixed") {
      discount = Number(coupon.discount_value);
    }
    discount = Math.min(discount, eligibleSubtotal);
    discount = Math.round(discount * 100) / 100;

    const messageParts = [];
    if (discount > 0) messageParts.push("Cupom aplicado!");
    if (coupon.free_shipping) messageParts.push("Frete grátis incluso!");
    if (!discount && !coupon.free_shipping) messageParts.push("Cupom reconhecido, mas o desconto calculado foi zero.");

    return {
      statusCode: 200,
      body: JSON.stringify({
        valid: true,
        code: coupon.code,
        discount,
        freeShipping: !!coupon.free_shipping,
        message: messageParts.join(" "),
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: "Erro ao validar cupom." }) };
  }
};
