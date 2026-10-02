(() => {
  const SUPABASE_URL = 'https://gqhscywjjvvjspajqkgt.supabase.co';
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxaHNjeXdqanZ2anNwYWpxa2d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3NzMzMDgsImV4cCI6MjEwNjM0OTMwOH0.07N8qTbpYsmCuWj71y9EXUevM-Nrcrg62Ss68SlreVA';
  let couponCode = '';
  let couponDiscount = 0;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('/functions/v1/encomendas') && typeof init.body === 'string') {
        const payload = JSON.parse(init.body);
        if ((payload.action === 'criar' || payload.action === 'manual') && payload.data) {
          payload.data.cupom_codigo = couponCode || '';
          init = { ...init, body: JSON.stringify(payload) };
        }
      }
    } catch { /* mantém a requisição original */ }
    return originalFetch(input, init);
  };

  const money = (c) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(c) || 0) / 100);
  const parseMoney = (text) => {
    const m = String(text || '').match(/R\$\s*([\d.]+,\d{2})/);
    return m ? Math.round(Number(m[1].replace(/\./g, '').replace(',', '.')) * 100) : 0;
  };

  async function validateCoupon(code, subtotal) {
    const res = await originalFetch(`${SUPABASE_URL}/functions/v1/encomendas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ action: 'cupom', data: { codigo: code, subtotal } }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Cupom inválido.');
    return data;
  }

  function fixLogo() {
    document.querySelectorAll('img[src="/logo.jpg"]').forEach((img) => {
      img.src = '/logo-rosilene.svg';
      img.alt = 'Salgados e Massas Rosilene';
    });
  }

  function addAdminCouponLink() {
    if (!location.pathname.startsWith('/painel')) return;
    const nav = document.querySelector('.admin-nav nav');
    if (!nav || nav.querySelector('[data-coupons-link]')) return;
    const a = document.createElement('a');
    a.dataset.couponsLink = '1';
    a.href = '/cupons.html';
    a.textContent = '🎟️ Cupons';
    a.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:10px;text-decoration:none;color:inherit;font-weight:600';
    nav.appendChild(a);
  }

  function addCouponBox() {
    if (!location.pathname.startsWith('/encomendar')) return;
    const main = document.querySelector('.order-main');
    if (!main || main.querySelector('[data-coupon-box]')) return;
    const pageText = main.textContent || '';
    if (!/Revis|pagamento|resumo/i.test(pageText)) return;

    const box = document.createElement('section');
    box.dataset.couponBox = '1';
    box.style.cssText = 'margin-top:18px;padding:16px;border:1px solid #eadfd5;border-radius:14px;background:#fffaf6';
    box.innerHTML = `
      <strong style="display:block;margin-bottom:6px">Cupom de desconto <span style="font-weight:400;color:#777">(opcional)</span></strong>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input data-coupon-input maxlength="40" placeholder="Digite seu cupom" style="flex:1;min-width:180px;text-transform:uppercase" />
        <button type="button" data-coupon-apply>Aplicar</button>
        <button type="button" data-coupon-remove style="display:none">Remover</button>
      </div>
      <small data-coupon-msg style="display:block;margin-top:8px"></small>`;
    main.appendChild(box);

    const input = box.querySelector('[data-coupon-input]');
    const apply = box.querySelector('[data-coupon-apply]');
    const remove = box.querySelector('[data-coupon-remove]');
    const msg = box.querySelector('[data-coupon-msg]');

    apply.addEventListener('click', async () => {
      const code = input.value.trim().toUpperCase();
      if (!code) { couponCode = ''; couponDiscount = 0; msg.textContent = 'Cupom é opcional. Você pode continuar sem preencher.'; return; }
      const subtotalEl = [...document.querySelectorAll('.order-main *')].find((el) => /Subtotal|Salgados/i.test(el.textContent || '') && /R\$/.test(el.textContent || ''));
      const subtotal = parseMoney(subtotalEl?.textContent) || [...document.querySelectorAll('.order-main *')].map((el) => parseMoney(el.textContent)).find((v) => v > 0) || 0;
      apply.disabled = true; msg.textContent = 'Validando cupom…';
      try {
        const result = await validateCoupon(code, subtotal);
        couponCode = result.codigo || code;
        couponDiscount = Number(result.desconto || 0);
        msg.textContent = couponDiscount > 0 ? `Cupom ${couponCode} aplicado: -${money(couponDiscount)}.` : 'Nenhum cupom aplicado.';
        msg.style.color = '#287a3d'; remove.style.display = ''; input.disabled = true;
      } catch (e) {
        couponCode = ''; couponDiscount = 0; msg.textContent = e.message || 'Cupom inválido.'; msg.style.color = '#a52a2a';
      } finally { apply.disabled = false; }
    });
    remove.addEventListener('click', () => {
      couponCode = ''; couponDiscount = 0; input.value = ''; input.disabled = false; remove.style.display = 'none'; msg.textContent = 'Cupom removido. O pedido seguirá sem desconto.'; msg.style.color = '';
    });
  }

  const sync = () => { fixLogo(); addAdminCouponLink(); addCouponBox(); };
  new MutationObserver(sync).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', sync);
  sync();
})();