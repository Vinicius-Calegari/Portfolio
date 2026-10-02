(() => {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('/functions/v1/encomendas') && typeof init.body === 'string') {
        const payload = JSON.parse(init.body);
        if ((payload.action === 'criar' || payload.action === 'manual') && payload.data) {
          if (!String(payload.data.ponto_referencia || '').trim() || payload.data.ponto_referencia === 'Não informado') payload.data.ponto_referencia = '';
          init = { ...init, body: JSON.stringify(payload) };
        }
      }
    } catch {}
    return originalFetch(input, init);
  };
  function fixLogo() {
    document.querySelectorAll('.hero-image img').forEach((img) => {
      if (!img.src.includes('logo.jpg')) img.src = '/logo.jpg?v=20261002-3';
      img.alt = 'Salgados e Massas Rosilene';
      img.onerror = () => { img.onerror = null; img.src = '/logo-rosilene.svg?v=20261002-3'; };
    });
  }
  function reactSet(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input,value); else input.value=value;
    input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function makeReferenceOptional() {
    if (!location.pathname.includes('/encomendar') && !location.pathname.includes('/painel')) return;
    const ref=[...document.querySelectorAll('input')].find(i=>/Portão azul|referência/i.test(i.placeholder||'')||/ponto de referência/i.test(i.closest('label')?.textContent||'')); if(!ref)return;
    const label=ref.closest('label'); if(label&&!/opcional/i.test(label.textContent||'')) for(const node of [...label.childNodes]) if(node.nodeType===Node.TEXT_NODE&&/Ponto de referência/i.test(node.textContent||'')) node.textContent='Ponto de referência (opcional)';
    const panel=ref.closest('.order-main'); if(panel&&!panel.dataset.optionalReferenceHook){panel.dataset.optionalReferenceHook='1';panel.addEventListener('click',e=>{const btn=e.target.closest('button');if(btn&&/Continuar|Revisar|Avançar/i.test(btn.textContent||'')&&!ref.value.trim())reactSet(ref,'Não informado');},true);}
  }
  function renameGroups() {
    document.querySelectorAll('.group-tabs button').forEach(b=>{if(/^Grupo\s+\d+/i.test(b.textContent||''))b.textContent=(b.textContent||'').replace(/^Grupo/i,'Pedido');});
    document.querySelectorAll('.group-progress span').forEach(s=>{if(/Grupo completo/i.test(s.textContent||''))for(const n of [...s.childNodes])if(n.nodeType===Node.TEXT_NODE)n.textContent=(n.textContent||'').replace(/Grupo completo/gi,'Pedido completo');});
    document.querySelectorAll('.admin-order .order-items p').forEach(p=>{
      if(!p.dataset.productionItems)p.dataset.productionItems=p.textContent||'';
      const b=p.querySelector('b'); if(b&&/Grupo/i.test(b.textContent||''))b.textContent=(b.textContent||'').replace(/Grupo/gi,'Pedido');
      [...p.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).forEach(n=>{n.textContent=(n.textContent||'').replace(/(^|,\s*)\d+\s+(?=[^,]+)/g,'$1');});
    });
  }
  function addAdminCouponLink(){if(!location.pathname.startsWith('/painel'))return;const nav=document.querySelector('.admin-nav nav');if(!nav||nav.querySelector('[data-coupons-link]'))return;const a=document.createElement('a');a.dataset.couponsLink='1';a.href='/cupons.html';a.textContent='🎟️ Cupons';a.style.cssText='display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:10px;text-decoration:none;color:inherit;font-weight:600';nav.appendChild(a);}
  const sync=()=>{fixLogo();makeReferenceOptional();renameGroups();addAdminCouponLink();};new MutationObserver(sync).observe(document.documentElement,{childList:true,subtree:true});document.addEventListener('DOMContentLoaded',sync);sync();
})();