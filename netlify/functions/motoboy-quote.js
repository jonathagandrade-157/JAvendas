// netlify/functions/motoboy-quote.js
//
// Calcula o valor da entrega por Motoboy com base na distância real entre
// a loja e o endereço do cliente. Função pública (chamada direto do
// checkout, sem precisar de login).
//
// Body esperado (POST): { "address": "Rua X, 123, Bairro, Cidade - UF, 00000-000" }

const { createClient } = require("@supabase/supabase-js");
const { geocodeAddress, haversineKm } = require("./utils/geocode");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { address } = JSON.parse(event.body || "{}");
    if (!address) {
      return { statusCode: 400, body: JSON.stringify({ available: false, reason: "no_address" }) };
    }

    const { data: settings, error } = await supabase
      .from("store_settings")
      .select("motoboy_enabled, motoboy_radius_km, motoboy_base_fee, motoboy_per_km, motoboy_origin_lat, motoboy_origin_lng")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw error;

    if (!settings || !settings.motoboy_enabled) {
      return { statusCode: 200, body: JSON.stringify({ available: false, reason: "disabled" }) };
    }
    if (!settings.motoboy_origin_lat || !settings.motoboy_origin_lng) {
      // Loja ainda não teve o endereço verificado/geocodificado no admin.
      return { statusCode: 200, body: JSON.stringify({ available: false, reason: "origin_not_set" }) };
    }

    const destCoords = await geocodeAddress(address);
    if (!destCoords) {
      return { statusCode: 200, body: JSON.stringify({ available: false, reason: "address_not_found" }) };
    }

    const distanceKm = haversineKm(
      settings.motoboy_origin_lat,
      settings.motoboy_origin_lng,
      destCoords.lat,
      destCoords.lng
    );

    const radius = Number(settings.motoboy_radius_km || 15);
    if (distanceKm > radius) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          available: false,
          reason: "out_of_range",
          message: "Entrega por motoboy indisponível para este endereço.",
        }),
      };
    }

    const baseFee = Number(settings.motoboy_base_fee || 9.9);
    const perKm = Number(settings.motoboy_per_km || 2.5);
    const price = Math.round((baseFee + perKm * distanceKm) * 100) / 100;

    return {
      statusCode: 200,
      body: JSON.stringify({
        available: true,
        price,
        distanceKm: Math.round(distanceKm * 10) / 10,
        service: "Entrega por Motoboy",
        etaText: "Entre 30 minutos e 2 horas (mesmo dia)",
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 200, body: JSON.stringify({ available: false, reason: "error" }) };
  }
};
