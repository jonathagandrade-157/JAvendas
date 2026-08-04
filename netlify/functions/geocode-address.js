// netlify/functions/geocode-address.js
//
// Converte um endereço em coordenadas (latitude/longitude). Usado pelo
// painel admin para "verificar" o endereço da loja antes de ativar a
// entrega por Motoboy.

const { geocodeAddress } = require("./utils/geocode");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { address } = JSON.parse(event.body || "{}");
    if (!address) {
      return { statusCode: 400, body: JSON.stringify({ error: "Informe um endereço." }) };
    }

    const coords = await geocodeAddress(address);
    if (!coords) {
      return { statusCode: 200, body: JSON.stringify({ found: false }) };
    }

    return { statusCode: 200, body: JSON.stringify({ found: true, ...coords }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: "Erro ao verificar o endereço." }) };
  }
};
