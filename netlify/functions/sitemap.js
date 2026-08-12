// netlify/functions/sitemap.js
//
// Gera o sitemap.xml automaticamente — sempre que você cadastrar ou
// desativar um produto pelo admin, o sitemap já reflete isso sozinho,
// sem precisar editar nenhum arquivo.
//
// Acessível em /sitemap.xml (configurado via redirect no netlify.toml).

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async () => {
  const siteUrl = process.env.SITE_URL || "https://jastorevendas1.netlify.app";

  const staticPages = [
    { loc: "/", priority: "1.0" },
    { loc: "/troca-e-devolucao.html", priority: "0.3" },
  ];

  let productUrls = [];
  try {
    const { data, error } = await supabase
      .from("products")
      .select("slug, id, updated_at")
      .eq("active", true);

    if (!error && data) {
      productUrls = data.map((p) => ({
        loc: `/produto.html?slug=${p.slug || p.id}`,
        lastmod: p.updated_at ? p.updated_at.slice(0, 10) : undefined,
        priority: "0.8",
      }));
    }
  } catch (err) {
    console.error("Erro ao buscar produtos para o sitemap:", err);
  }

  const allUrls = [...staticPages, ...productUrls];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls
  .map(
    (u) => `  <url>
    <loc>${siteUrl}${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}
    <priority>${u.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/xml; charset=UTF-8" },
    body: xml,
  };
};
