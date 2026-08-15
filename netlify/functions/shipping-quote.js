// netlify/functions/shipping-quote.js
const fetch = require("node-fetch");
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
    const { cepDestino, items = [] } = JSON.parse(event.body || "{}");
    if (!cepDestino || !/^\d{8}$/.test(cepDestino.replace(/\D/g, ""))) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "CEP inválido. Envie 8 dígitos, só números." }),
      };
    }

    // ---------- token e CEP de origem: painel tem prioridade sobre a variável de ambiente ----------
    // O painel salva o token do Melhor Envio em "payment_credentials" (tabela
    // protegida, sem leitura pública) e o CEP de origem em "store_settings"
    // (o mesmo "CEP da loja" cadastrado em Configurações → Geral — não
    // duplicamos esse campo). Se qualquer um dos dois estiver vazio no
    // banco, cai automaticamente na variável de ambiente correspondente.
    const [credsRes, settingsRes] = await Promise.all([
      supabase.from("payment_credentials").select("melhor_envio_token").eq("id", 1).maybeSingle(),
      supabase.from("store_settings").select("store_zip_code, melhor_envio_enabled").eq("id", 1).maybeSingle(),
    ]);

    if (settingsRes.data?.melhor_envio_enabled === false) {
      return {
        statusCode: 200,
        body: JSON.stringify({ options: [] }), // desativado no painel: sem opções, sem erro — o checkout só não oferece essa modalidade
      };
    }

    const token = credsRes.data?.melhor_envio_token || process.env.MELHORENVIO_TOKEN;
    const originCep = (settingsRes.data?.store_zip_code || process.env.STORE_ORIGIN_CEP || "").replace(/\D/g, "");

    if (!token || !originCep) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Frete não configurado. Cadastre o token do Melhor Envio em Configurações → Frete, e o CEP da loja em Configurações → Geral (ou defina MELHORENVIO_TOKEN e STORE_ORIGIN_CEP nas variáveis de ambiente).",
        }),
      };
    }

    const totalQty = items.reduce((sum, i) => sum + (i.quantity || 1), 0) || 1;
    const packageEstimate = {
      height: Math.min(2 + totalQty * 2, 60),
      width: 25,
      length: 20,
      weight: Math.max(0.3, totalQty * 0.35),
    };
   const response = await fetch(
      `${process.env.MELHORENVIO_BASE_URL || "https://melhorenvio.com.br"}/api/v2/me/shipment/calculate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "JA Store (contato@jastore.com.br)",
        },
        body: JSON.stringify({
          from: { postal_code: originCep },
          to: { postal_code: cepDestino.replace(/\D/g, "") },
          package: packageEstimate,
        }),
      }
    );
    if (!response.ok) {
      const errText = await response.text();
      console.error("Melhor Envio erro:", errText);
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "Não foi possível calcular o frete agora." }),
      };
    }
    const data = await response.json();
    const options = (Array.isArray(data) ? data : [])
      .filter((opt) => opt.price && !opt.error)
      .map((opt) => ({
        service: `${opt.company?.name || ""} ${opt.name || ""}`.trim(),
        price: Number(opt.price),
        days: opt.delivery_time,
      }))
      .sort((a, b) => a.price - b.price);
    return { statusCode: 200, body: JSON.stringify({ options }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: "Erro interno ao calcular o frete." }) };
  }
};
