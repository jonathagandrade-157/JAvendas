// assets/js/supabase-client.js
//
// Cliente Supabase compartilhado pelo site (index.html, checkout.html e admin).
// A "anon key" NÃO é secreta — ela é feita para rodar no navegador; quem
// protege os dados são as regras de RLS definidas em supabase-schema.sql.
//
// Preencha os dois valores abaixo com os dados do seu projeto Supabase
// (Painel do projeto -> Settings -> API).

window.SUPABASE_URL = "https://khzqowftinwuieuvdlgt.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_IkhJ45ydGWYOn6ygDWGRIw_J36egjpV";

window.getSupabaseClient = function () {
  if (!window.__sb) {
    window.__sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }
  return window.__sb;
};
