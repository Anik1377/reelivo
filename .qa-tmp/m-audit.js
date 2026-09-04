(function(){
  const vw = document.documentElement.clientWidth;
  const doc = document.documentElement;
  const overflows = [];
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > vw + 2 || r.left < -2) && !el.closest('[aria-roledescription="carousel"]')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || el.closest('header') || el.closest('nav[aria-label="Primary"]')) {
        if (overflows.length < 6) overflows.push({tag: el.tagName, cls: (el.className.baseVal||el.className||'').toString().slice(0,60), right: Math.round(r.right), left: Math.round(r.left)});
      }
    }
  });
  const small = [];
  document.querySelectorAll('button, a[href], [role="button"]').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && (r.width < 40 || r.height < 40) && r.top >= 0 && r.top < window.innerHeight) {
      if (small.length < 8) small.push({tag: el.tagName, h: Math.round(r.height), w: Math.round(r.width), label: (el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,30)});
    }
  });
  return JSON.stringify({vw, hscroll: doc.scrollWidth - doc.clientWidth, overflows, smallTargets: small}, null, 1);
})()
