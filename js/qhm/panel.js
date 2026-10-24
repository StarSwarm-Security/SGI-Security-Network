
import { installProgress } from './progress.js';
const QHM_PROGRESS = installProgress({});
const API = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=true&price_change_percentage=24h';
const RED=[255,40,80], AMBER=[255,170,40], GREEN=[40,255,140], GREY=[150,160,190], LIQ=[60,255,150];
const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
const tone=s=>{ if(s==null) return GREY; const t=Math.max(0,Math.min(1,s/50)); return t<0.6?mix(RED,AMBER,t/0.6):mix(AMBER,GREEN,(t-0.6)/0.4); };
const rgba=(c,a)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;
const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2});
const price=v=>v==null?'–':v>=1?'$'+v.toLocaleString('en-US',{maximumFractionDigits:2}):'$'+v.toPrecision(4);
const pct=v=>v==null?'–':(v>=0?'+':'')+v.toFixed(2)+'%';

export function mountQHM(root) {
  root.innerHTML = `
    <div class="qhm-wrap">
      <div class="row-head"><h2>Quantum Helium Maps</h2>
        <div class="chiprow">
          <button class="chip on" data-size="cap">Market cap</button>
          <button class="chip" data-size="pq">Upgrade %</button>
          <span class="badge" id="qhm-badge">…</span>
        </div>
      </div>
      <canvas id="qhm-cv"></canvas>
      <p class="fine">Native port. Drag / fling bubbles. Click for price + privacy/quantum upgrade estimate.</p>
      <aside id="qhm-panel" class="drawer glass" hidden>
        <button class="x" id="qhm-x">×</button>
        <div class="ph"><h3 id="qhm-name"></h3><span id="qhm-sym"></span></div>
        <div class="stats"><div><span>Price</span><b id="qhm-price"></b></div><div><span>Mcap</span><b id="qhm-cap"></b></div><div><span>24h</span><b id="qhm-chg"></b></div></div>
        <canvas id="qhm-spark" height="110"></canvas>
        <div class="prog"><div class="ptop"><span>Upgrade estimate</span><b id="qhm-score"></b></div><div class="pbar"><i id="qhm-fill"></i></div><ul id="qhm-factors" class="factors"></ul></div>
      </aside>
    </div>`;
  const cv = root.querySelector('#qhm-cv');
  const cx = cv.getContext('2d');
  let W=0,H=0,DPR=1,bubbles=[],sizeMode='cap',drag=null,running=false,raf=0;
  const pad=()=>({top:8,bottom:8});
  function resize(){
    DPR=Math.min(devicePixelRatio||1,2);
    const r=cv.parentElement.getBoundingClientRect();
    const oW=W,oH=H; W=Math.max(280,r.width); H=Math.max(240, Math.min(480, (r.height||360)-8));
    cv.width=W*DPR; cv.height=H*DPR; cv.style.width=W+'px'; cv.style.height=H+'px';
    cx.setTransform(DPR,0,0,DPR,0,0);
    if(oW&&oH) bubbles.forEach(b=>{b.x*=W/oW;b.y*=H/oH;});
    sizeBubbles();
  }
  function sizeBubbles(){
    if(!bubbles.length) return;
    const area=W*H*0.32;
    const w=bubbles.map(b=>sizeMode==='cap'?Math.pow(Math.max(b.coin.mcap||1,1),0.62):4+(b.p.score||0));
    const k=Math.sqrt(area/(Math.PI*w.reduce((a,c)=>a+c*c,0)));
    const maxR=Math.min(W,H)*0.14,minR=11;
    bubbles.forEach((b,i)=>{b.tr=Math.max(minR,Math.min(maxR,w[i]*k)); if(!b.r)b.r=b.tr;});
  }
  function homeY(b){ const {top,bottom}=pad(); const s=b.p.score==null?20:b.p.score; const t=Math.max(0,Math.min(1,s/55)); return top+b.r+t*(H-top-bottom-2*b.r); }
  function make(coins){
    bubbles=coins.filter(c=>c.mcap>0).slice(0,100).map(c=>({coin:c,p:QHM_PROGRESS(c),x:0,y:0,vx:0,vy:0,r:0,tr:0,ph:Math.random()*6.28,lvl:0}));
    sizeBubbles();
    bubbles.forEach(b=>{b.x=b.r+Math.random()*(W-2*b.r); b.y=homeY(b)+(Math.random()-0.5)*60;});
  }
  function step(dt){
    const {top,bottom}=pad();
    for(const b of bubbles){
      b.r+=(b.tr-b.r)*0.08*dt; b.ph+=0.012*dt; b.lvl+=(((b.p.score||0)/100)-b.lvl)*0.03*dt;
      if(b===drag?.b) continue;
      b.vy+=(homeY(b)-b.y)*0.0012*dt; b.vx+=Math.sin(b.ph)*0.006*dt;
      b.vx*=Math.pow(0.975,dt); b.vy*=Math.pow(0.975,dt); b.x+=b.vx*dt; b.y+=b.vy*dt;
      if(b.x<b.r){b.x=b.r;b.vx=Math.abs(b.vx)*0.6;} if(b.x>W-b.r){b.x=W-b.r;b.vx=-Math.abs(b.vx)*0.6;}
      if(b.y<top+b.r){b.y=top+b.r;b.vy=Math.abs(b.vy)*0.6;} if(b.y>H-bottom-b.r){b.y=H-bottom-b.r;b.vy=-Math.abs(b.vy)*0.6;}
    }
    for(let i=0;i<bubbles.length;i++){const a=bubbles[i];
      for(let j=i+1;j<bubbles.length;j++){const b=bubbles[j]; const dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy,rr=a.r+b.r+2;
        if(d2<rr*rr&&d2>0.01){const d=Math.sqrt(d2),o=(rr-d)/d*0.5; let ma=b.r/(a.r+b.r),mb=1-ma;
          if(drag?.b===a){ma=0;mb=1;} else if(drag?.b===b){ma=1;mb=0;}
          a.x-=dx*o*ma;a.y-=dy*o*ma;b.x+=dx*o*mb;b.y+=dy*o*mb;}}}
  }
  function draw(now){
    cx.clearRect(0,0,W,H);
    cx.globalCompositeOperation='lighter';
    for(const b of bubbles){const c=tone(b.p.score); const low=b.p.score!=null&&b.p.score<25; const pulse=low?0.75+0.25*Math.sin(now/280+b.ph):0.8; const R=b.r*(low?1.9:1.65);
      const g=cx.createRadialGradient(b.x,b.y,b.r*0.7,b.x,b.y,R); g.addColorStop(0,rgba(c,(b.p.known?0.7:0.3)*pulse)); g.addColorStop(1,rgba(c,0));
      cx.fillStyle=g; cx.beginPath(); cx.arc(b.x,b.y,R,0,6.283); cx.fill();}
    cx.globalCompositeOperation='source-over';
    for(const b of bubbles){
      const c=tone(b.p.score),r=b.r;
      const g=cx.createRadialGradient(b.x-r*0.3,b.y-r*0.35,r*0.1,b.x,b.y,r);
      g.addColorStop(0,'rgba(255,255,255,.06)'); g.addColorStop(0.8,rgba(c,0.16)); g.addColorStop(1,rgba(c,0.5));
      cx.fillStyle=g; cx.beginPath(); cx.arc(b.x,b.y,r,0,6.283); cx.fill();
      if(b.p.known&&b.lvl>0.005){cx.save();cx.beginPath();cx.arc(b.x,b.y,r-1.5,0,6.283);cx.clip();
        const ly=b.y+r-b.lvl*2*r,amp=Math.max(1.2,r*0.06); cx.beginPath(); cx.moveTo(b.x-r,b.y+r);
        for(let xx=-r;xx<=r;xx+=Math.max(2,r/10)) cx.lineTo(b.x+xx,ly+Math.sin(xx/r*4+now/420+b.ph)*amp);
        cx.lineTo(b.x+r,b.y+r);cx.closePath();
        const lg=cx.createLinearGradient(0,ly,0,b.y+r); lg.addColorStop(0,rgba(LIQ,0.95)); lg.addColorStop(1,rgba([20,170,95],0.9));
        cx.fillStyle=lg;cx.fill();cx.restore();}
      cx.lineWidth=1.6; cx.strokeStyle=rgba(c,0.95); if(!b.p.known)cx.setLineDash([4,4]);
      cx.beginPath();cx.arc(b.x,b.y,r,0,6.283);cx.stroke();cx.setLineDash([]);
      const sym=b.coin.symbol.toUpperCase(),fs=Math.max(8,Math.min(r*0.48,r*1.5/Math.max(2.5,sym.length*0.62)));
      cx.fillStyle='#fff';cx.textAlign='center';cx.textBaseline='middle';cx.font='700 '+fs+'px Archivo Black, Sora, sans-serif';
      if(r>22){cx.fillText(sym,b.x,b.y-fs*0.3);cx.font='600 '+Math.max(8,fs*0.55)+'px Inter,sans-serif';cx.fillText(b.p.known?b.p.score+'%':'?',b.x,b.y+fs*0.58);}
      else if(r>11) cx.fillText(sym.slice(0,5),b.x,b.y);
    }
  }
  let last=performance.now();
  function frame(now){ if(!running) return; const dt=Math.min(3,(now-last)/16.67); last=now; step(dt); draw(now); raf=requestAnimationFrame(frame); }
  function pick(x,y){ let best=null; for(const b of bubbles){ if(Math.hypot(b.x-x,b.y-y)<=b.r+4&&(!best||b.r<best.r)) best=b;} return best; }
  function openCoin(b){
    const p=root.querySelector('#qhm-panel'); p.hidden=false;
    root.querySelector('#qhm-name').textContent=b.coin.name; root.querySelector('#qhm-sym').textContent=b.coin.symbol;
    root.querySelector('#qhm-price').textContent=price(b.coin.price); root.querySelector('#qhm-cap').textContent=usd.format(b.coin.mcap);
    const ch=root.querySelector('#qhm-chg'); ch.textContent=pct(b.coin.chg24); ch.className=b.coin.chg24>=0?'up':'down';
    root.querySelector('#qhm-score').textContent=b.p.known?b.p.score+'%':'Unknown';
    root.querySelector('#qhm-fill').style.width=(b.p.score||0)+'%';
    const ul=root.querySelector('#qhm-factors'); ul.innerHTML='';
    for(const f of b.p.factors){ const li=document.createElement('li'); li.innerHTML=`<div class="fx"><span>${f.name}</span><b>${f.pts==null?'unknown':f.pts+' / '+f.max}</b></div><p>${f.status}${f.note?'. '+f.note:''}</p>`; ul.appendChild(li); }
    // spark
    const el=root.querySelector('#qhm-spark'), pts=b.coin.spark||[], w=el.clientWidth||300,h=110,x=el.getContext('2d');
    el.width=w*DPR; el.height=h*DPR; x.setTransform(DPR,0,0,DPR,0,0); x.clearRect(0,0,w,h);
    if(pts.length>1){ const col=pts.at(-1)>=pts[0]?GREEN:RED, lo=Math.min(...pts), hi=Math.max(...pts), sp=hi-lo||1, p=10;
      const X=i=>p+i/(pts.length-1)*(w-2*p), Y=v=>p+(1-(v-lo)/sp)*(h-2*p);
      x.beginPath(); pts.forEach((v,i)=>i?x.lineTo(X(i),Y(v)):x.moveTo(X(i),Y(v))); x.strokeStyle=rgba(col,1); x.lineWidth=2; x.stroke(); }
  }
  cv.addEventListener('pointerdown',e=>{
    const rect=cv.getBoundingClientRect(); const px=e.clientX-rect.left, py=e.clientY-rect.top; const b=pick(px,py); if(!b) return;
    cv.setPointerCapture(e.pointerId); drag={b,id:e.pointerId,ox:b.x-px,oy:b.y-py,sx:px,sy:py,t:performance.now(),hist:[[px,py,performance.now()]],moved:false};
  });
  cv.addEventListener('pointermove',e=>{
    if(!drag||e.pointerId!==drag.id) return; const rect=cv.getBoundingClientRect(); const px=e.clientX-rect.left, py=e.clientY-rect.top;
    if(Math.hypot(px-drag.sx,py-drag.sy)>6) drag.moved=true; drag.b.x=px+drag.ox; drag.b.y=py+drag.oy; drag.b.vx=drag.b.vy=0;
    drag.hist.push([px,py,performance.now()]); if(drag.hist.length>6) drag.hist.shift();
  });
  function release(e){ if(!drag||e.pointerId!==drag.id) return; const b=drag.b;
    if(!drag.moved&&performance.now()-drag.t<450) openCoin(b);
    else { const h=drag.hist,a=h[0],z=h.at(-1),dt=Math.max(16,z[2]-a[2])/16.67; b.vx=Math.max(-40,Math.min(40,(z[0]-a[0])/dt)); b.vy=Math.max(-40,Math.min(40,(z[1]-a[1])/dt)); }
    drag=null; }
  cv.addEventListener('pointerup',release); cv.addEventListener('pointercancel',release);
  root.querySelector('#qhm-x').onclick=()=>root.querySelector('#qhm-panel').hidden=true;
  root.querySelectorAll('[data-size]').forEach(bt=>bt.onclick=()=>{ root.querySelectorAll('[data-size]').forEach(x=>x.classList.toggle('on',x===bt)); sizeMode=bt.dataset.size; sizeBubbles(); });
  async function load(){
    const badge=root.querySelector('#qhm-badge');
    try{
      const r=await fetch(API,{signal:AbortSignal.timeout(8000)}); if(!r.ok) throw 0;
      const d=await r.json();
      make(d.map(c=>({id:c.id,symbol:c.symbol,name:c.name,price:c.current_price,mcap:c.market_cap,rank:c.market_cap_rank,chg24:c.price_change_percentage_24h,spark:(c.sparkline_in_7d||{}).price||[]})));
      badge.textContent='Live · CoinGecko'; badge.className='badge live';
    }catch{
      const d=await (await fetch('data/qhm/sample.json')).json();
      make(d.coins); badge.textContent='Sample · '+d.taken; badge.className='badge sample';
    }
  }
  const ro=new ResizeObserver(()=>resize()); ro.observe(root.querySelector('.qhm-wrap'));
  resize(); running=true; raf=requestAnimationFrame(frame); load();
  return { stop(){ running=false; cancelAnimationFrame(raf); ro.disconnect(); } };
}
