// assets/js/supabase-client.js
window.SUPABASE_URL = "https://khzqowftinwuieuvdlgt.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_IkhJ45ydGWYOn6ygDWGRIw_J36egjpV";

window.getSupabaseClient = function () {
  if (!window.__sb) {
    window.__sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }
  return window.__sb;
};
