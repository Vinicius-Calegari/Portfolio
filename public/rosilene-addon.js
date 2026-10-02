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
          if (!String(payload.data.ponto_referencia || '').trim() || payload.data.ponto_referencia === 'Não informado') payload.data.ponto_referencia = '';
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
    document.querySelectorAll('.hero-image img').forEach((img) => {
      const wanted = '/logo.jpg?v=20261002-2';
      if (!img.src.includes('logo.jpg')) img.src = wanted;
      img.alt = 'Salgados e Massas Rosilene';
      img.onerror = () => { img.onerror = null; img.src = '/logo-rosilene.svg?v=20261002-2'; };
    });
  }

  function reactSet(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, value); else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function makeReferenceOptional() {
    if (!location.pathname.includes('/encomendar') && !location.pathname.includes('/painel')) return;
    const inputs = [...document.querySelectorAll('input')];
    const ref = inputs.find((i) => /Portão azul|referência/i.test(i.placeholder || '') || /ponto de referência/i.test(i.closest('label')?.textContent || ''));
    if (!ref) return;
    const label = ref.closest('label');
    if (label && !/opcional/i.test(label.textContent || '')) {
      for (const node of [...label.childNodes]) if (node.nodeType === Node.TEXT_NODE && /Ponto de referência/i.test(node.textContent || '')) node.textContent = 'Ponto de referência (opcional)';
    }
    const panel = ref.closest('.order-main');
    if (panel && !panel.dataset.optionalReferenceHook) {
      panel.dataset.optionalReferenceHook = '1';
      panel.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn || !/Continuar|Revisar|Avançar/i.test(btn.textContent || '')) return;
        if (!ref.value.trim()) reactSet(ref, 'Não informado');
      }, true);
    }
  }

  function renameGroups() {
    document.querySelectorAll('.group-tabs button').forEach((b) => {
      if (/^Grupo\s+\d+/i.test(b.textContent || '')) b.textContent = (b.textContent || '').replace(/^Grupo/i, 'Pedido');
    });
    document.querySelectorAll('.group-progress span').forEach((s) => {
      if (/Grupo completo/i.test(s.textContent || '')) {
        for (const n of [...s.childNodes]) if (n.nodeType === Node.TEXT_NODE) n.textContent = (n.textContent || '').replace(/Grupo completo/gi, 'Pedido completo');
      }
    });
    document.querySelectorAll('.admin-order .order-items p').forEach((p) => {
      const b = p.querySelector('b');
      if (b && /Grupo/i.test(b.textContent || '')) b.textContent = (b.textContent || '').replace(/Grupo/gi, 'Pedido');
      [...p.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).forEach((n) => {
        n.textContent = (n.textContent || '').replace(/(^|,\s*)\d+\s+(?=[^,]+)/g, '$1');
      });
    });
  }

  function addProductionChecklist() {
    if (!location.pathname.startsWith('/painel')) return;
    const buttons = [...document.querySelectorAll('.report-buttons button')];
    const original = buttons.find((b) => /Lista de produção/i.test(b.textContent || ''));
    if (!original || document.querySelector('[data-production-checklist]')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.productionChecklist = '1';
    btn.innerHTML = '☑ Lista de produção · checklist';
    btn.addEventListener('click', () => {
      const orders = [...document.querySelectorAll('.admin-order')];
      const rows = new Map();
      orders.forEach((order) => {
        const status = order.querySelector('.status')?.textContent?.trim() || '';
        if (/cancelado/i.test(status)) return;
        const date = order.querySelector('.order-head p')?.textContent?.split(' às ')[0]?.trim() || '';
        order.querySelectorAll('.order-items p').forEach((p) => {
          const text = p.textContent?.replace(/^Pedido\s*\d+\s*:\s*/i, '') || '';
          text.split(',').forEach((item) => {
            const m = item.trim().match(/^(\d+)\s+(.+)$/);
            if (!m) return;
            const key = `${date}|${m[2]}`;
            rows.set(key, (rows.get(key) || 0) + Number(m[1]));
          });
        });
      });
      const list = [...rows.entries()].sort(([a],[b]) => a.localeCompare(b, 'pt-BR')).map(([key, qty]) => {
        const [date, name] = key.split('|');
        return `<tr><td>${date}</td><td>${name}</td><td class="qty">${qty}</td><td class="box">☐ Feito</td><td class="box">☐ Separado</td></tr>`;
      }).join('');
      const w = window.open('', '_blank');
      if (!w) return;
      w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Lista de produção</title><style>body{font-family:Arial,sans-serif;padding:28px;color:#222}header{display:flex;align-items:center;gap:16px;margin-bottom:22px}header img{width:72px;height:72px;object-fit:contain}h1{margin:0;font-size:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #aaa;padding:10px;text-align:left}th{background:#f1e6db}.qty{text-align:center;font-size:18px;font-weight:700}.box{white-space:nowrap;font-size:16px}@media print{button{display:none}}</style></head><body><header><img src="/logo.jpg?v=20261002-2"><div><h1>Lista de produção</h1><small>Salgados Rosilene</small></div></header><table><thead><tr><th>Data</th><th>Salgado</th><th>Unidades</th><th>Feito</th><th>Separado</th></tr></thead><tbody>${list || '<tr><td colspan="5">Nenhum pedido visível na agenda.</td></tr>'}</tbody></table><p><button onclick="window.print()">Imprimir / Salvar PDF</button></p></body></html>`);
      w.document.close();
    });
    original.insertAdjacentElement('afterend', btn);
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
    box.innerHTML = `<strong style="display:block;margin-bottom:6px">Cupom de desconto <span style="font-weight:400;color:#777">(opcional)</span></strong><div style="display:flex;gap:8px;flex-wrap:wrap"><input data-coupon-input maxlength="40" placeholder="Digite seu cupom" style="flex:1;min-width:180px;text-transform:uppercase" /><button type="button" data-coupon-apply>Aplicar</button><button type="button" data-coupon-remove style="display:none">Remover</button></div><small data-coupon-msg style="display:block;margin-top:8px"></small>`;
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
      } catch (e) { couponCode = ''; couponDiscount = 0; msg.textContent = e.message || 'Cupom inválido.'; msg.style.color = '#a52a2a'; }
      finally { apply.disabled = false; }
    });
    remove.addEventListener('click', () => { couponCode = ''; couponDiscount = 0; input.value = ''; input.disabled = false; remove.style.display = 'none'; msg.textContent = 'Cupom removido. O pedido seguirá sem desconto.'; msg.style.color = ''; });
  }

  const sync = () => { fixLogo(); makeReferenceOptional(); renameGroups(); addProductionChecklist(); addAdminCouponLink(); addCouponBox(); };
  new MutationObserver(sync).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', sync);
  sync();
})();