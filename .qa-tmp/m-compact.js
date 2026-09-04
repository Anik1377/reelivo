(function(){
  const vw=document.documentElement.clientWidth, doc=document.documentElement;
  let rail=0, real=0;
  document.querySelectorAll('body *').forEach(el=>{
    const r=el.getBoundingClientRect();
    if(r.width>0&&(r.right>vw+2||r.left<-2)){
      if(el.closest('[class*="overflow-x-auto"],[class*="overflow-y-auto"],[aria-roledescription="carousel"]')) rail++;
      else real++;
    }
  });
  let small=0, smallList=[];
  document.querySelectorAll('button,a[href]').forEach(el=>{
    const r=el.getBoundingClientRect();
    if(r.width>0&&r.height>0&&(r.width<40||r.height<40)&&r.top>=0&&r.top<window.innerHeight){
      small++; if(smallList.length<5) smallList.push(((el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,24))+' '+Math.round(r.width)+'x'+Math.round(r.height));
    }
  });
  return JSON.stringify({hscroll:doc.scrollWidth-doc.clientWidth,railOF:rail,realOF:real,small:small,smallList});
})()
