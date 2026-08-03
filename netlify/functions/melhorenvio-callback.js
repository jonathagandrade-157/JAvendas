// netlify/functions/melhorenvio-callback.js
const fetch = require("node-fetch");

exports.handler = async (event) => {
  const code = event.queryStringParameters?.code;

  if (!code) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: "<p>Nenhum código recebido. Acesse primeiro a URL de autorização do Melhor Envio.</p>",
    };
  }

  const baseUrl = process.env.MELHORENVIO_BASE_URL || "https://sandbox.melhorenvio.com.br";

  try {
    const response = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: process.env.MELHORENVIO_CLIENT_ID,
        client_secret: process.env.MELHORENVIO_CLIENT_SECRET,
        redirect_uri: process.env.MELHORENVIO_REDIRECT_URI,
        code,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: 502,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: `<p>Erro ao trocar o código pelo token:</p><pre>${JSON.stringify(data, null, 2)}</pre>`,
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: `
        <div style="font-family: sans-serif; max-width: 700px; margin: 40px auto; line-height:1.6;">
          <h2>✅ Token gerado com sucesso!</h2>
          <p>Copie o valor abaixo e cole na variável <b>MELHORENVIO_TOKEN</b> na Netlify:</p>
          <textarea style="width:100%; height:120px; font-size:12px;" readonly>${data.access_token}</textarea>
          <p style="color:#888; font-size:13px;">Esse token expira em aproximadamente ${Math.round((data.expires_in||0)/86400)} dias. Quando expirar, repita esse mesmo processo de autorização para gerar um novo.</p>
        </div>
      `,
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: "<p>Erro interno ao trocar o token. Veja os logs da função na Netlify.</p>",
    };
  }
};
