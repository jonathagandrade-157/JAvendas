// assets/js/cart.js
//
// Carrinho compartilhado entre as páginas da loja (index.html e produto.html).
// Guarda tudo no localStorage do navegador, então funciona sem precisar de
// login — e o checkout.html já lê esse mesmo formato.

window.CartStore = {
  load() {
    try {
      return JSON.parse(localStorage.getItem('ja_cart') || '[]');
    } catch (e) {
      return [];
    }
  },
  save(cart) {
    localStorage.setItem('ja_cart', JSON.stringify(cart));
  },
  count(cart) {
    return cart.reduce((s, i) => s + i.qty, 0);
  },
};
