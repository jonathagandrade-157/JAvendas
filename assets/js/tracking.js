// assets/js/tracking.js
//
// Carrega o Google Analytics (GA4) e o Meta Pixel dinamicamente, só se
// estiverem ATIVADOS e com ID preenchido (Admin → Analytics). Se qualquer
// um dos dois estiver desativado (ou sem ID), simplesmente não carrega
// aquele — não deixa nenhum script "quebrado" nem chamada pra ID vazio.

window.JATracking = {
  gaId: null,
  metaPixelId: null,
  ready: false,

  async init(){
    try {
      const sb = window.getSupabaseClient();
      const { data, error } = await sb
        .from('store_settings')
        .select('ga_enabled, ga_measurement_id, meta_pixel_enabled, meta_pixel_id')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;

      if (data?.ga_enabled && data?.ga_measurement_id){
        this.gaId = data.ga_measurement_id.trim();
        this._loadGA(this.gaId);
      }
      if (data?.meta_pixel_enabled && data?.meta_pixel_id){
        this.metaPixelId = data.meta_pixel_id.trim();
        this._loadMetaPixel(this.metaPixelId);
      }
      this.ready = true;
    } catch (err) {
      console.error('Erro ao carregar rastreamento (Analytics/Pixel):', err);
    }
  },

  _loadGA(id){
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){ window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', id);
  },

  _loadMetaPixel(id){
    /* eslint-disable */
    (function(f,b,e,v,n,t,s){
      if(f.fbq) return; n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq) f._fbq=n; n.push=n; n.loaded=!0; n.version='2.0'; n.queue=[]; t=b.createElement(e); t.async=!0;
      t.src=v; s=b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t,s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', id);
    window.fbq('track', 'PageView');
  },

  // ---------- eventos de negócio ----------

  trackSearch(searchTerm){
    if (!searchTerm || !searchTerm.trim()) return;
    if (window.gtag) window.gtag('event', 'search', { search_term: searchTerm.trim() });
    if (window.fbq) window.fbq('track', 'Search', { search_string: searchTerm.trim() });
  },

  trackViewItem(product){
    if (!product) return;
    if (window.gtag) window.gtag('event', 'view_item', {
      currency: 'BRL',
      value: Number(product.price) || 0,
      items: [{ item_id: product.id, item_name: product.name, price: Number(product.price) || 0 }],
    });
    if (window.fbq) window.fbq('track', 'ViewContent', {
      content_ids: [product.id],
      content_name: product.name,
      value: Number(product.price) || 0,
      currency: 'BRL',
    });
  },

  trackAddToCart(product, qty){
    if (!product) return;
    const value = (Number(product.price) || 0) * (qty || 1);
    if (window.gtag) window.gtag('event', 'add_to_cart', {
      currency: 'BRL',
      value,
      items: [{ item_id: product.id, item_name: product.name, price: Number(product.price) || 0, quantity: qty || 1 }],
    });
    if (window.fbq) window.fbq('track', 'AddToCart', {
      content_ids: [product.id],
      content_name: product.name,
      value,
      currency: 'BRL',
    });
  },

  trackBeginCheckout(items, total){
    if (!items || !items.length) return;
    if (window.gtag) window.gtag('event', 'begin_checkout', {
      currency: 'BRL',
      value: total,
      items: items.map(i => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.qty })),
    });
    if (window.fbq) window.fbq('track', 'InitiateCheckout', {
      content_ids: items.map(i => i.id),
      value: total,
      currency: 'BRL',
      num_items: items.reduce((s,i)=> s + i.qty, 0),
    });
  },

  trackPurchase(orderId, items, total){
    if (!items || !items.length) return;
    if (window.gtag) window.gtag('event', 'purchase', {
      transaction_id: orderId,
      currency: 'BRL',
      value: total,
      items: items.map(i => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.qty })),
    });
    if (window.fbq) window.fbq('track', 'Purchase', {
      content_ids: items.map(i => i.id),
      value: total,
      currency: 'BRL',
    });
  },
};
