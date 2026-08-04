// netlify/functions/utils/geocode.js
//
// Utilitário de geolocalização usado pela entrega por Motoboy.
//
// Hoje usa o Nominatim (OpenStreetMap), que é gratuito e não precisa de
// chave de API — ótimo para começar. Se um dia quiser trocar pelo Google
// Maps Geocoding API (mais preciso, mas pago), troque SÓ a função
// `geocodeAddress` abaixo — o resto do sistema (motoboy-quote.js,
// geocode-address.js) não precisa mudar nada, porque todos esperam o
// mesmo formato de retorno: { lat, lng } ou null.

const fetch = require("node-fetch");

async function geocodeAddress(addressString) {
  try {
    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=" +
      encodeURIComponent(addressString);

    const res = await fetch(url, {
      headers: { "User-Agent": "JA Store - entrega por motoboy (contato@jastore.com)" },
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data[0]) return null;

    return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
  } catch (err) {
    console.error("Erro ao geocodificar endereço:", err);
    return null;
  }

  // ---------- Exemplo de como ficaria com Google Maps (referência futura) ----------
  // const key = process.env.GOOGLE_MAPS_API_KEY;
  // const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressString)}&key=${key}`;
  // const res = await fetch(url);
  // const data = await res.json();
  // const loc = data.results?.[0]?.geometry?.location;
  // return loc ? { lat: loc.lat, lng: loc.lng } : null;
}

// Distância em linha reta entre 2 pontos (fórmula de Haversine), em km.
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = { geocodeAddress, haversineKm };
