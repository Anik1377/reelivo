(function(){
  const vw=document.documentElement.clientWidth;
  const out=[];
  document.querySelectorAll('body *').forEach(el=>{
    const r=el.getBoundingClientRect();
    if(r.width>0&&(r.right>vw+2||r.left<-2)&&!el.closest('[class*="overflow-x-auto"],[class*="overflow-y-auto"],[aria-roledescription="carousel"]')){
      out.push({tag:el.tagName, cls:(el.className.baseVal||el.className||'').toString().slice(0,80), left:Math.round(r.left), right:Math.round(r.right), text:(el.textContent||'').trim().slice(0,40)});
    }
  });
  return JSON.stringify(out.slice(0,8),null,1);
})()
