/* eslint-disable */
// HACK: canvas engine ported from a teammate's Claude artifact. Kept close to the original so
// visual tweaks diff cleanly; data, search, RICO/Reko and watch actions go through `A` (the adapter).
export function mountVault(root, A) {
let DEAD = false;
const LISTENERS = [];
const on = (t, e, f, o) => { t.addEventListener(e, f, o); LISTENERS.push([t, e, f, o]); };

/* =====================================================================
   THE STRAND VAULT: intro + top-down movie vault (ported from a teammate's artifact)
   Pixel scenes render on a 384x216 canvas (corridor at 192x108, 2x).
   Two blurred copies of a "glow" layer are screen-blended on top to give
   the translucent neon bloom. All movie data lives in the DB module below
   — in this port it comes from the adapter (src/vault/adapter.ts).
   ===================================================================== */
const W=384,H=216,SW=192,SH=108;
const $=id=>root.querySelector('#'+id);
const stage=$('stage'),cv=$('c'),ctx=cv.getContext('2d');ctx.imageSmoothingEnabled=false;
const gAx=$('gA').getContext('2d'),gBx=$('gB').getContext('2d'),irx=$('ir').getContext('2d');
let SC=1;
function mk(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.imageSmoothingEnabled=false;return[c,x];}
function rect(g,x,y,w,h,c){g.fillStyle=c;g.fillRect(x,y,w,h);}
function rr(g,x,y,w,h,c){g.fillStyle=c;g.fillRect(x+1,y,w-2,h);g.fillRect(x,y+1,w,h-2);}
function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function hash(n){const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);}
function hstr(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
const BAY=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5].map(v=>(v+.5)/16);
const bay=(x,y)=>BAY[((y&3)<<2)|(x&3)];
const hexRGB=h=>{const n=parseInt(h.slice(1),16);return[n>>16&255,n>>8&255,n&255];};
const clamp=(v,a=0,b=1)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const eio=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
function mixc(a,b,t){const A=hexRGB(a),B=hexRGB(b);return'#'+A.map((v,i)=>Math.round(lerp(v,B[i],t)).toString(16).padStart(2,'0')).join('');}
function line(g,x0,y0,x1,y1,c){g.fillStyle=c;x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
  const dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;let e=dx+dy;
  for(let n=0;n<999;n++){g.fillRect(x0,y0,1,1);if(x0===x1&&y0===y1)break;const e2=2*e;if(e2>=dy){e+=dy;x0+=sx;}if(e2<=dx){e+=dx;y0+=sy;}}}
function dither(g,x0,y0,w,h,cols,fn){const img=g.createImageData(w,h),d=img.data,C=cols.map(hexRGB),n=C.length-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=clamp(fn(x,y))*n;let i=Math.floor(v);if(v-i>bay(x+x0,y+y0))i++;if(i>n)i=n;const c=C[i],o=(y*w+x)*4;d[o]=c[0];d[o+1]=c[1];d[o+2]=c[2];d[o+3]=255;}
  g.putImageData(img,x0,y0);}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- chunky bitmap font ---------- */
const FONT={
T:["######","######","..##..","..##..","..##..","..##..","..##.."],H:["##..##","##..##","##..##","######","##..##","##..##","##..##"],
E:["######","##....","##....","#####.","##....","##....","######"],S:[".#####","##....","##....",".####.","....##","....##","#####."],
R:["#####.","##..##","##..##","#####.","##.##.","##..##","##..##"],A:[".####.","##..##","##..##","######","##..##","##..##","##..##"],
N:["##..##","###.##","######","##.###","##..##","##..##","##..##"],D:["#####.","##..##","##..##","##..##","##..##","##..##","#####."],
V:["##..##","##..##","##..##","##..##","##..##",".####.","..##.."],U:["##..##","##..##","##..##","##..##","##..##","##..##",".####."],
L:["##....","##....","##....","##....","##....","##....","######"],O:[".####.","##..##","##..##","##..##","##..##","##..##",".####."],
P:["#####.","##..##","##..##","#####.","##....","##....","##...."]};
function textW(s,sc,sp){let w=0;for(const ch of s)w+=(ch===' '?4:6)*sc+sp;return w-sp;}
function drawText(g,s,x,y,sc,sp,colFn,bounce){let cx=x,i=0;
  for(const ch of s){const gl=FONT[ch];
    if(gl){const by=bounce?bounce(i):0;for(let r=0;r<7;r++){g.fillStyle=colFn(r,i);const row=gl[r];
      for(let c=0;c<6;c++)if(row[c]==='#')g.fillRect(cx+c*sc,y+r*sc+by,sc,sc);}}
    cx+=(ch===' '?4:6)*sc+sp;i++;}}
/* neon-tube lettering: white-hot core with coloured rim */
function neonWord(s,sc,rim,core){const w=textW(s,sc,sc),[m,mx]=mk(w+2,7*sc+2);drawText(mx,s,1,1,sc,sc,()=>'#fff');
  const d=mx.getImageData(0,0,m.width,m.height).data,[o,ox]=mk(m.width,m.height),A=(x,y)=>d[(y*m.width+x)*4+3]>0;
  for(let y=1;y<m.height-1;y++)for(let x=1;x<m.width-1;x++)if(A(x,y))rect(ox,x,y,1,1,(A(x-1,y)&&A(x+1,y)&&A(x,y-1)&&A(x,y+1))?core:rim);
  return o;}

/* ---------- side-view hero (corridor) ---------- */
function sprite(rows,pal){const w=Math.max(...rows.map(r=>r.length)),h=rows.length;const[c,g]=mk(w,h);
  rows.forEach((r,y)=>{for(let x=0;x<r.length;x++){const p=pal[r[x]];if(p){g.fillStyle=p;g.fillRect(x,y,1,1);}}});return c;}
const HERO_TOP=["....kkkkkk....","...kcccccck...","..kcccwwccck..","..kccccccccckk","..kkkkkkkkkkkk","..khhssssssk..","..khsssskssk..","..khssssssssk.","..kssssskkkk..","...kksssssk...",
"..kjjjjjjjjk..",".kjjjwjjjjjjk.",".kjjjwjjjJjjk.",".kjjjwjjjJjjk.",".ksjjwjjjJjsk.",".kkjjjjjjjjkk.","..kppppppppk.."];
const LEGS={stand:["..kpppkpppk...","..kppk.kppk...","..kppk.kppk...","..kbbk.kbbbk..","..kkkk.kkkkk.."],
w1:["..kpppppppk...",".kppk..kppk...","kppk....kppk..","kbbk....kbbbk.","kkkk....kkkkk."],w2:["..kpppppk.....","...kpppk......","...kpppk......","...kbbbbk.....","...kkkkkk....."]};
const SIDE={};for(const k in LEGS)SIDE[k]=sprite(HERO_TOP.concat(LEGS[k]),{k:'#140a22',c:'#ff3fb4',w:'#ffffff',h:'#2a160c',s:'#e0a77a',j:'#2ad1c9',J:'#178a96',p:'#38407e',b:'#eef0ff'});

/* ---------- top-down people ---------- */
const PAL={
 hero:{skin:'#e0a77a',hair:'#2a160c',top:'#2ad1c9',top2:'#178a96',pants:'#38407e',shoe:'#eef0ff',cap:'#ff3fb4'},
 reko:{skin:'#c68a5e',hair:'#d8d8e0',top:'#7a2fb0',top2:'#4e1d77',pants:'#2a2240',shoe:'#222',glasses:1,bow:'#ffd84d'},
 maya:{skin:'#f0c09a',hair:'#8a2a1a',top:'#ff8a3a',top2:'#c05a1a',pants:'#2a3a6a',shoe:'#ffffff',long:1},
 jordan:{skin:'#8a5a3a',hair:'#140a0a',top:'#3ac06a',top2:'#1f7a40',pants:'#2a2a3a',shoe:'#ff3355'},
 priya:{skin:'#c08a64',hair:'#120808',top:'#3a7aff',top2:'#2048a8',pants:'#1c1c2c',shoe:'#dddddd',long:1}};
function drawPerson(g,x,y,dir,f,P){
  x=Math.round(x);y=Math.round(y);const O='#0b0716',bob=(f===1||f===3)?-1:0;
  g.fillStyle='rgba(0,0,0,.33)';g.fillRect(x-4,y-1,9,2);g.fillRect(x-3,y+1,7,1);
  for(const [lx,l] of [[x-3,f===1?-1:0],[x,f===3?-1:0]]){const ly=y-5+l;rect(g,lx-1,ly-1,5,6,O);rect(g,lx,ly,3,3,P.pants);rect(g,lx,ly+3,3,1,P.shoe);}
  const by=y-11+bob;rect(g,x-6,by,12,5,O);rect(g,x-5,by-1,10,7,O);rect(g,x-4,by,8,5,P.top);
  rect(g,dir===2?x-4:x+2,by,2,5,P.top2);rect(g,x-5,by,1,4,P.top2);rect(g,x+4,by,1,4,P.top2);rect(g,x-5,by+4,1,1,P.skin);rect(g,x+4,by+4,1,1,P.skin);
  if(P.bow)rect(g,x-1,by,3,1,P.bow);
  const hy=y-18+bob;rect(g,x-5,hy-1,10,9,O);rect(g,x-4,hy,8,7,P.skin);const hr=P.hair;
  if(dir===1){rect(g,x-4,hy,8,P.long?7:6,hr);}
  else if(dir===0){rect(g,x-4,hy,8,2,hr);rect(g,x-4,hy+2,1,P.long?5:2,hr);rect(g,x+3,hy+2,1,P.long?5:2,hr);
    if(P.glasses){rect(g,x-3,hy+3,7,1,O);rect(g,x-3,hy+3,2,2,'#bfefff');rect(g,x+1,hy+3,2,2,'#bfefff');}
    else{rect(g,x-2,hy+3,1,2,O);rect(g,x+1,hy+3,1,2,O);}}
  else if(dir===2){rect(g,x-4,hy,8,2,hr);rect(g,x+1,hy+2,3,P.long?5:3,hr);rect(g,x-3,hy+3,1,2,P.glasses?'#bfefff':O);}
  else{rect(g,x-4,hy,8,2,hr);rect(g,x-4,hy+2,3,P.long?5:3,hr);rect(g,x+2,hy+3,1,2,P.glasses?'#bfefff':O);}
  if(P.cap){rect(g,x-5,hy-2,10,1,O);rect(g,x-4,hy-1,8,2,P.cap);
    if(dir===0)rect(g,x-4,hy+1,8,1,'#c42a86');else if(dir===2){rect(g,x-6,hy+1,3,1,P.cap);rect(g,x-6,hy+2,3,1,O);}else if(dir===3){rect(g,x+3,hy+1,3,1,P.cap);rect(g,x+3,hy+2,3,1,O);}}
}

/* =====================================================================
   DB — mock movie database (replace with your API)
   ===================================================================== */
const MOVIES=A.movies;   // artifact-shaped movies built by the adapter (mutable: search/RICO add more)
const BYID=new Map(MOVIES.map(m=>[m.id,m]));
const SHELVES=[
 {id:'A',name:'Your Recommendations',sub:'Picked for you by the Vault recommender',x:36,y:84,w:140,ids:A.shelves.A.slice(0,7)},
 {id:'B',name:"Friends' Must-Watches",sub:'What your crew loves right now',x:208,y:84,w:140,ids:A.shelves.B.slice(0,7)},
 {id:'C',name:'Trending in the Vault',sub:'What everyone is watching this week',x:36,y:138,w:140,ids:A.shelves.C.slice(0,7)},
 {id:'D',name:'Vault Classics',sub:'Cult favourites that never leave the vault',x:208,y:138,w:140,ids:A.shelves.D.slice(0,7)}];
const CONT=A.watchlist().map(id=>({id}));   // "Your Watchlist" shelf (no fake progress)
const MUST=A.must.slice(0,5);
const PEOPLE=A.people;
const DB={
 all:MOVIES,
 get:id=>BYID.get(id),
 add(m){if(!m)return null;if(!BYID.has(m.id)){BYID.set(m.id,m);MOVIES.push(m);}return BYID.get(m.id);},
 shelfOf:id=>SHELVES.find(s=>s.ids.includes(id))||null,
 search(q){q=q.trim().toLowerCase();const L=MOVIES.slice();
   if(!q)return L.sort((a,b)=>(b.sc||0)-(a.sc||0));
   const sc=m=>{const t=m.t.toLowerCase();if(t.startsWith(q))return 0;if(t.split(/[\s:]+/).some(w=>w.startsWith(q)))return 1;if(t.includes(q))return 2;
     if((m.d||'').toLowerCase().includes(q))return 3;if(m.g.some(g=>g.toLowerCase().startsWith(q)))return 4;if(String(m.y).startsWith(q))return 5;return 9;};
   return L.map(m=>[sc(m),m]).filter(a=>a[0]<9).sort((a,b)=>a[0]-b[0]||a[1].t.localeCompare(b[1].t)).map(a=>a[1]);}};
function syncCont(){CONT.length=0;for(const id of A.watchlist())if(DB.get(id))CONT.push({id});}
const fmtRT=m=>!m.rt?'TBA':m.rt<60?`${m.rt}m`:`${Math.floor(m.rt/60)}h ${m.rt%60}m`;

/* ---------- poster art (generated — stands in for poster images from the DB) ---------- */
const POSTER={},MOTIF={};
function circle(g,x,y,r,f){g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fillStyle=f;g.fill();}
function glowDot(g,x,y,r,c,a){const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,c);gr.addColorStop(1,'rgba(0,0,0,0)');g.globalAlpha=a??1;g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);g.globalAlpha=1;}
function stars(g,w,h,n,r,ymax){for(let i=0;i<n;i++){g.globalAlpha=.3+r()*.7;circle(g,r()*w,r()*(ymax||h),r()*1.4+.2,'#fff');}g.globalAlpha=1;}
function skyline(g,w,base,col,r,hmin,hmax){g.fillStyle=col;let x=-10;while(x<w){const bw=18+r()*40,bh=hmin+r()*(hmax-hmin);g.fillRect(x,base-bh,bw,bh+400);if(r()<.4)g.fillRect(x+bw*.4,base-bh-20,3,20);x+=bw+r()*4;}}
Object.assign(MOTIF,{
 planet(g,w,h,c,r){stars(g,w,h,160,r);glowDot(g,w*.55,h*.36,w*.55,c[1]+'88');const gr=g.createRadialGradient(w*.45,h*.3,10,w*.55,h*.38,w*.3);gr.addColorStop(0,c[2]);gr.addColorStop(.4,c[1]);gr.addColorStop(1,c[0]);
   circle(g,w*.55,h*.38,w*.28,gr);g.save();g.translate(w*.55,h*.38);g.rotate(-.35);g.strokeStyle=c[2];g.globalAlpha=.75;g.lineWidth=5;g.beginPath();g.ellipse(0,0,w*.46,w*.08,0,0,Math.PI*2);g.stroke();g.restore();g.globalAlpha=1;circle(g,w*.22,h*.62,2.5,'#fff');},
 spiral(g,w,h,c){g.save();g.translate(w/2,h*.4);for(let i=0;i<18;i++){g.rotate(.16);g.strokeStyle=i%2?c[1]:c[2];g.globalAlpha=.08+i*.035;g.lineWidth=2;const s=20+i*14;g.strokeRect(-s/2,-s/2,s,s);}g.restore();g.globalAlpha=1;
   for(let i=0;i<14;i++){g.fillStyle=mixc(c[0],c[1],.3+i*.03);g.fillRect(i*w/14,h*.62-i*6,w/14-2,h);}},
 cityhaze(g,w,h,c,r){glowDot(g,w*.5,h*.5,w*.9,c[1],.9);glowDot(g,w*.5,h*.42,w*.3,c[2],.7);skyline(g,w,h*.72,'rgba(20,8,4,.85)',r,40,170);skyline(g,w,h*.8,c[0],r,10,90);},
 halftone(g,w,h,c){for(let y=0;y<h;y+=12)for(let x=0;x<w;x+=12){const d=Math.hypot(x-w*.3,y-h*.3)/(w*1.1);circle(g,x,y,Math.max(.5,5.5*(1-d)),c[1]);circle(g,x+4,y+3,Math.max(.3,3*(d)),c[2]);}
   g.fillStyle='rgba(0,0,0,.35)';for(let i=-4;i<10;i++){g.save();g.translate(i*60,0);g.rotate(.4);g.fillRect(0,-50,14,h*1.6);g.restore();}},
 bagel(g,w,h,c,r){for(let i=0;i<36;i++){g.strokeStyle=i%2?c[1]:c[2];g.globalAlpha=.25;g.lineWidth=2;g.beginPath();g.moveTo(w/2,h*.4);g.lineTo(w/2+Math.cos(i/36*6.28)*w,h*.4+Math.sin(i/36*6.28)*w);g.stroke();}
   g.globalAlpha=1;g.lineWidth=46;g.strokeStyle=c[1];g.beginPath();g.arc(w/2,h*.4,w*.24,0,6.28);g.stroke();g.lineWidth=8;g.strokeStyle=c[2];g.beginPath();g.arc(w/2,h*.4,w*.24,0,6.28);g.stroke();circle(g,w/2,h*.4,w*.13,c[0]);},
 dust(g,w,h,c,r){glowDot(g,w*.5,h*.55,w*.9,c[1],.95);circle(g,w*.7,h*.28,30,c[2]+'cc');for(let i=0;i<40;i++){g.globalAlpha=.12;circle(g,r()*w,h*.45+r()*h*.2,20+r()*50,'#3a1a08');}g.globalAlpha=1;
   g.fillStyle=c[0];g.fillRect(0,h*.62,w,h);g.strokeStyle=c[1];g.globalAlpha=.5;for(let i=-3;i<=3;i++){g.beginPath();g.moveTo(w/2,h*.62);g.lineTo(w/2+i*90,h);g.stroke();}g.globalAlpha=1;g.fillStyle='#120804';g.fillRect(w*.44,h*.58,40,14);g.fillRect(w*.47,h*.55,22,6);},
 jets(g,w,h,c,r){glowDot(g,w*.75,h*.6,w,c[1],.8);glowDot(g,w*.78,h*.55,60,c[2]);for(let i=0;i<3;i++){g.strokeStyle='rgba(255,255,255,.55)';g.lineWidth=3;g.beginPath();g.moveTo(-20,h*(.15+i*.1));g.quadraticCurveTo(w*.4,h*(.2+i*.12),w*.72,h*(.08+i*.11));g.stroke();
   g.save();g.translate(w*.74,h*(.08+i*.11));g.rotate(-.35);g.fillStyle='#0a0a14';g.beginPath();g.moveTo(14,0);g.lineTo(-12,-8);g.lineTo(-8,0);g.lineTo(-12,8);g.fill();g.restore();}},
 sea(g,w,h,c,r){circle(g,w*.5,h*.3,w*.17,c[2]);glowDot(g,w*.5,h*.3,w*.6,c[2]+'66');for(let k=0;k<9;k++){g.fillStyle=mixc(c[1],c[0],k/9);g.beginPath();const y0=h*.42+k*h*.05;g.moveTo(0,y0);
   for(let x=0;x<=w;x+=10)g.lineTo(x,y0+Math.sin(x*.03+k*1.3)*(6+k*2));g.lineTo(w,h);g.lineTo(0,h);g.fill();}
   g.fillStyle='#04080f';g.beginPath();g.moveTo(w*.42,h*.47);g.lineTo(w*.6,h*.47);g.lineTo(w*.56,h*.5);g.lineTo(w*.45,h*.5);g.fill();g.beginPath();g.moveTo(w*.5,h*.47);g.lineTo(w*.5,h*.33);g.lineTo(w*.58,h*.44);g.fill();},
 web(g,w,h,c,r){glowDot(g,w*.5,h*.35,w,c[1],.6);const cx=w*.5,cy=h*.33;g.strokeStyle='rgba(255,255,255,.4)';g.lineWidth=1.4;for(let i=0;i<14;i++){const a=i/14*6.28;g.beginPath();g.moveTo(cx,cy);g.lineTo(cx+Math.cos(a)*w,cy+Math.sin(a)*w);g.stroke();}
   for(let k=1;k<9;k++){g.beginPath();for(let i=0;i<=14;i++){const a=i/14*6.28,rr=k*26;const x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr;i?g.quadraticCurveTo(cx+Math.cos(a-.22)*rr*.92,cy+Math.sin(a-.22)*rr*.92,x,y):g.moveTo(x,y);}g.stroke();}
   skyline(g,w,h*.75,c[0],r,30,190);glowDot(g,w*.3,h*.2,80,c[2]+'99');},
 rings(g,w,h,c,r){for(let i=18;i>0;i--){g.strokeStyle=i%2?c[1]:c[2];g.globalAlpha=.08+.04*(18-i)/2;g.lineWidth=3;g.beginPath();g.arc(w/2,h*.38,i*13,0,6.28);g.stroke();}g.globalAlpha=1;glowDot(g,w/2,h*.38,70,c[1]);
   g.strokeStyle=c[1];g.lineWidth=3;g.beginPath();let x=w/2,y=0;g.moveTo(x,y);while(y<h*.7){x+=(r()-.5)*40;y+=20+r()*20;g.lineTo(x,y);}g.stroke();},
 dunes(g,w,h,c,r){glowDot(g,w*.5,h*.45,w,c[1],.9);circle(g,w*.62,h*.24,w*.15,c[2]);circle(g,w*.3,h*.16,w*.05,c[2]+'aa');for(let k=0;k<6;k++){g.fillStyle=mixc(c[1],c[0],.35+k*.13);g.beginPath();const y0=h*.48+k*h*.07;g.moveTo(0,y0);
   g.bezierCurveTo(w*.3,y0-40+k*6,w*.6,y0+30,w,y0-20);g.lineTo(w,h);g.lineTo(0,h);g.fill();}},
 sling(g,w,h,c,r){const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,c[0]);gr.addColorStop(1,'#7ad0ff');g.fillStyle=gr;g.fillRect(0,0,w,h);for(let i=0;i<7;i++){const x=r()*w,y=r()*h*.5;for(let k=0;k<4;k++)circle(g,x+k*16,y+(k%2)*-8,18,'rgba(255,255,255,.85)');}
   g.fillStyle='#4a2a14';g.fillRect(w*.47,h*.55,16,h*.3);g.save();g.translate(w*.5,h*.56);g.rotate(-.4);g.fillRect(-4,-60,10,64);g.restore();g.save();g.translate(w*.5,h*.56);g.rotate(.4);g.fillRect(-6,-60,10,64);g.restore();
   g.setLineDash([6,8]);g.strokeStyle=c[2];g.lineWidth=3;g.beginPath();g.moveTo(w*.5,h*.4);g.quadraticCurveTo(w*.75,h*.05,w*.95,h*.25);g.stroke();g.setLineDash([]);circle(g,w*.86,h*.15,12,c[1]);},
 fire(g,w,h,c,r){glowDot(g,w/2,h*.42,w*.8,c[1],.9);glowDot(g,w/2,h*.42,w*.3,c[2]);circle(g,w/2,h*.42,30,'#fff8e0');for(let i=0;i<120;i++){const a=r()*6.28,d=40+r()*w*.5;circle(g,w/2+Math.cos(a)*d,h*.42+Math.sin(a)*d,r()*2+.5,r()<.5?c[2]:c[1]);}
   g.strokeStyle=c[2];g.globalAlpha=.5;g.lineWidth=2;g.beginPath();g.ellipse(w/2,h*.42,w*.42,w*.12,0,0,6.28);g.stroke();g.globalAlpha=1;},
 pinkgeo(g,w,h,c,r){for(let i=0;i<22;i++){const x=r()*w,y=r()*h*.75,s=10+r()*40;g.globalAlpha=.85;if(i%3===0)circle(g,x,y,s/2,i%2?c[1]:'#fff');else if(i%3===1){g.fillStyle=c[2];g.fillRect(x,y,s,s/3);}
   else{g.fillStyle='#fff';g.beginPath();for(let k=0;k<10;k++){const a=k/10*6.28-1.57,rr=k%2?s/4:s/2;g.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);}g.fill();}}g.globalAlpha=1;},
 orbs(g,w,h,c,r){const cols=['#ffd23f','#3a8aff','#ff3a3a','#3aff8a','#b05aff','#ff8a2a'];cols.forEach((k,i)=>{const a=i/6*6.28-1.57;glowDot(g,w/2+Math.cos(a)*w*.25,h*.38+Math.sin(a)*w*.25,60,k);circle(g,w/2+Math.cos(a)*w*.25,h*.38+Math.sin(a)*w*.25,16,k);});},
 emerald(g,w,h,c,r){stars(g,w,h,80,r,h*.4);glowDot(g,w/2,h*.62,w*.9,c[1],.85);g.fillStyle='#021008';const b=h*.66;[[.3,.18],[.4,.32],[.5,.45],[.6,.3],[.7,.2]].forEach(([x,s])=>{g.fillRect(w*x-10,b-h*s,20,h*s);g.beginPath();g.moveTo(w*x-13,b-h*s);g.lineTo(w*x,b-h*s-40);g.lineTo(w*x+13,b-h*s);g.fill();});
   g.fillRect(0,b,w,h);glowDot(g,w*.75,h*.12,70,c[2]+'aa');},
 split(g,w,h,c){g.fillStyle=c[2];g.fillRect(0,0,w,h*.45);g.fillStyle=c[1];for(let i=0;i<9;i++)g.fillRect(w*.15+i*22,h*.45+i*14,w,14);g.fillStyle='#0a0a0a';g.fillRect(w*.12,h*.22,w*.76,22);},
 flames(g,w,h,c,r){glowDot(g,w/2,h*.38,w,c[2]+'99');g.fillStyle='#000';g.fillRect(0,h*.4,w,h);g.strokeStyle=c[2];g.globalAlpha=.4;for(let i=0;i<8;i++){g.beginPath();g.moveTo(0,h*.4+i*i*5);g.lineTo(w,h*.4+i*i*5);g.stroke();}g.globalAlpha=1;
   for(const s of [-1,1]){const gr=g.createLinearGradient(0,h,0,h*.4);gr.addColorStop(0,c[1]);gr.addColorStop(1,'rgba(255,200,80,0)');g.fillStyle=gr;g.beginPath();g.moveTo(w/2+s*20,h);g.lineTo(w/2+s*70,h);g.lineTo(w/2+s*4,h*.42);g.fill();}},
 code(g,w,h,c,r){g.font='bold 14px monospace';for(let x=6;x<w;x+=14){const len=8+r()*26|0,y0=r()*h;for(let k=0;k<len;k++){g.fillStyle=k===len-1?'#eaffef':c[1];g.globalAlpha=k/len;g.fillText(String.fromCharCode(0x30A0+(r()*90|0)),x,(y0+k*16)%h);}}g.globalAlpha=1;},
 jungle(g,w,h,c,r){glowDot(g,w/2,h*.4,w*.8,c[2]+'cc');glowDot(g,w/2,h*.45,w,c[1],.6);g.fillStyle='#010804';for(let i=0;i<14;i++){g.save();g.translate(r()<.5?r()*w*.2:w-r()*w*.2,h*(.2+r()*.6));g.rotate(r()*6.28);g.beginPath();g.ellipse(0,0,90,22,0,0,6.28);g.fill();g.restore();}},
 lanterns(g,w,h,c,r){stars(g,w,h,60,r,h*.3);g.fillStyle='#0a0414';g.fillRect(w*.2,h*.35,w*.6,h);g.beginPath();g.moveTo(w*.12,h*.36);g.lineTo(w*.5,h*.22);g.lineTo(w*.88,h*.36);g.fill();
   for(let row=0;row<3;row++)for(let i=0;i<5;i++){const x=w*(.24+i*.13),y=h*(.42+row*.09);glowDot(g,x,y,22,c[1]);circle(g,x,y,6,c[2]);}},
 cityfire(g,w,h,c,r){glowDot(g,w/2,h*.85,w*1.1,c[2],.85);g.fillStyle='rgba(120,160,255,.12)';g.beginPath();g.moveTo(w*.5,h);g.lineTo(w*.35,0);g.lineTo(w*.45,0);g.fill();skyline(g,w,h*.78,'#020308',r,60,260);},
 clouds(g,w,h,c,r){for(let i=0;i<9;i++){const x=r()*w,y=h*(.08+r()*.55);for(let k=0;k<5;k++)circle(g,x+k*18-36,y+Math.sin(k)*6,16+r()*10,'rgba(255,255,255,.92)');}g.fillStyle=c[2];g.beginPath();for(let k=0;k<10;k++){const a=k/10*6.28-1.57,rr=k%2?14:34;g.lineTo(w*.72+Math.cos(a)*rr,h*.2+Math.sin(a)*rr);}g.fill();},
 stars(g,w,h,c,r){stars(g,w,h,220,r,h*.7);glowDot(g,w*.5,h*.55,w,c[1],.6);g.fillStyle='#04041a';g.fillRect(0,h*.68,w,h);g.fillRect(w*.7,h*.38,4,h*.3);circle(g,w*.705,h*.37,9,c[2]);glowDot(g,w*.705,h*.37,50,c[2]);
   g.fillRect(w*.3,h*.62,4,h*.06);g.fillRect(w*.38,h*.61,4,h*.07);}});
function poster(id){if(POSTER[id])return POSTER[id];const m=DB.get(id);if(!m)return '';if(m.img)return POSTER[id]=m.img;const w=360,h=540,[c,g]=mk(w,h);g.imageSmoothingEnabled=true;const r=rng(hstr(id));
  const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,m.c[0]);gr.addColorStop(1,mixc(m.c[0],m.c[1],.35));g.fillStyle=gr;g.fillRect(0,0,w,h);
  (MOTIF[m.m]||MOTIF.stars)(g,w,h,m.c,r);
  for(let i=0;i<2600;i++){g.fillStyle=r()<.5?'rgba(255,255,255,.035)':'rgba(0,0,0,.05)';g.fillRect(r()*w,r()*h,1,1);}
  const bg=g.createLinearGradient(0,h*.55,0,h);bg.addColorStop(0,'rgba(0,0,0,0)');bg.addColorStop(1,'rgba(0,0,0,.82)');g.fillStyle=bg;g.fillRect(0,h*.55,w,h*.45);
  g.textAlign='center';g.fillStyle='#fff';let fs=50,lines;
  const wrap=()=>{g.font=`700 ${fs}px ${A.fonts.display}`;const words=m.t.toUpperCase().split(' ');lines=[];let cur='';for(const wd of words){const t=cur?cur+' '+wd:wd;if(g.measureText(t).width>w-44&&cur){lines.push(cur);cur=wd;}else cur=t;}lines.push(cur);};
  wrap();while((lines.length>3||lines.some(l=>g.measureText(l).width>w-40))&&fs>18){fs-=2;wrap();}
  const base=h-46-(lines.length-1)*fs*.98;g.shadowColor='rgba(0,0,0,.6)';g.shadowBlur=12;lines.forEach((l,i)=>g.fillText(l,w/2,base+i*fs*.98));g.shadowBlur=0;
  g.font='600 13px '+A.fonts.body;g.fillStyle='rgba(255,255,255,.72)';g.fillText((m.rel?'IN CINEMAS '+m.rel.toUpperCase():(m.d||'THE VAULT').toUpperCase()),w/2,h-20);
  return POSTER[id]=c.toDataURL('image/jpeg',.9);}
/* tiny pixel covers for the shelves */
const MINI={};
function mini(id,w,h){const k=id+w+'x'+h;if(MINI[k])return MINI[k];const m=DB.get(id),[c,g]=mk(w,h);
  dither(g,0,0,w,h,[m.c[0],mixc(m.c[0],m.c[1],.5),m.c[1]],(x,y)=>y/(h-1)*.9);
  const r=Math.max(1,Math.round(w/5));for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++)if(x*x+y*y<=r*r+.5)rect(g,Math.round(w/2)+x,Math.round(h*.36)+y,1,1,m.c[2]);
  rect(g,1,h-4,w-2,1,'#ffffff');rect(g,2,h-3,w-4,1,'rgba(255,255,255,.55)');
  g.fillStyle='rgba(0,0,0,.55)';g.fillRect(0,0,w,1);g.fillRect(0,h-1,w,1);g.fillRect(0,0,1,h);g.fillRect(w-1,0,1,h);rect(g,1,1,1,h-2,'rgba(255,255,255,.25)');
  return MINI[k]=c;}

/* =====================================================================
   AUDIO — synthesised vault mechanism, door, music and UI sounds.
   To use the BudgetPixel recording, paste it as a data: URI below.
   ===================================================================== */
const VAULT_SFX_DATA='';
const AU={ac:null,muted:false,custom:null,track:0,playing:false};
AU.init=function(){
  if(this.ac){if(this.ac.state==='suspended')this.ac.resume();return true;}
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;
  const ac=this.ac=new AC();
  this.master=ac.createGain();this.master.gain.value=this.muted?0:.75;
  const comp=ac.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;this.master.connect(comp);comp.connect(ac.destination);
  this.lp=ac.createBiquadFilter();this.lp.type='lowpass';this.lp.frequency.value=420;this.lp.Q.value=.7;
  this.mus=ac.createGain();this.mus.gain.value=.4;this.mus.connect(this.lp);this.lp.connect(this.master);
  this.bassLP=ac.createBiquadFilter();this.bassLP.type='lowpass';this.bassLP.frequency.value=650;this.bassLP.connect(this.mus);
  this.arp=ac.createGain();this.arp.connect(this.mus);
  const dl=ac.createDelay(1);dl.delayTime.value=.3;const fb=ac.createGain();fb.gain.value=.33;this.arp.connect(dl);dl.connect(fb);fb.connect(dl);dl.connect(this.mus);
  this.sfx=ac.createGain();this.sfx.gain.value=.9;this.sfx.connect(this.master);
  const len=ac.sampleRate*2,b=ac.createBuffer(1,len,ac.sampleRate),d=b.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;this.nb=b;
  if(VAULT_SFX_DATA)fetch(VAULT_SFX_DATA).then(r=>r.arrayBuffer()).then(a=>ac.decodeAudioData(a)).then(buf=>this.custom=buf).catch(()=>{});
  if(ac.state==='suspended')ac.resume();return true;};
AU.now=function(){return this.ac?this.ac.currentTime:0;};
AU.env=function(p,t,a,peak,dur){p.setValueAtTime(.0001,t);p.exponentialRampToValueAtTime(Math.max(.0002,peak),t+a);p.exponentialRampToValueAtTime(.0001,t+Math.max(a+.01,dur));};
AU.noise=function(t,dur,type,freq,q,peak,a,dest){const ac=this.ac;if(!ac)return;const s=ac.createBufferSource();s.buffer=this.nb;s.loop=true;
  const f=ac.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;const g=ac.createGain();this.env(g.gain,t,a||.004,peak,dur);
  s.connect(f);f.connect(g);g.connect(dest||this.sfx);s.start(t,Math.random()*1.5);s.stop(t+dur+.05);return{s,f,g};};
AU.tone=function(t,dur,type,freq,peak,a,dest,fEnd){const ac=this.ac;if(!ac)return;const o=ac.createOscillator();o.type=type;o.frequency.setValueAtTime(freq,t);
  if(fEnd)o.frequency.exponentialRampToValueAtTime(fEnd,t+dur);const g=ac.createGain();this.env(g.gain,t,a||.004,peak,dur);o.connect(g);g.connect(dest||this.sfx);o.start(t);o.stop(t+dur+.05);return{o,g};};
AU.clunk=function(t,big){this.tone(t,.4,'sine',95,.9,.003,null,36);this.noise(t,.14,'lowpass',900,.8,.7);this.noise(t,.06,'bandpass',2600,5,.3);
  if(big)[233,377,587,941,1310].forEach((f,i)=>this.tone(t+.005,1.3-i*.15,'sine',f,.05,.002));};
AU.grind=function(t,dur){const ac=this.ac;if(!ac)return;const n=this.noise(t,dur,'bandpass',240,2,.3,.25);
  const l=ac.createOscillator();l.frequency.value=7;const lg=ac.createGain();lg.gain.value=90;l.connect(lg);lg.connect(n.f.frequency);l.start(t);l.stop(t+dur);
  n.g.gain.cancelScheduledValues(t);n.g.gain.setValueAtTime(.0001,t);n.g.gain.linearRampToValueAtTime(.3,t+.3);n.g.gain.setValueAtTime(.3,t+dur-.35);n.g.gain.linearRampToValueAtTime(.0001,t+dur);
  const o=ac.createOscillator();o.type='sawtooth';o.frequency.value=48;const f=ac.createBiquadFilter();f.type='lowpass';f.frequency.value=300;
  const g=ac.createGain();g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.15,t+.3);g.gain.setValueAtTime(.15,t+dur-.35);g.gain.linearRampToValueAtTime(.0001,t+dur);
  o.connect(f);f.connect(g);g.connect(this.sfx);o.start(t);o.stop(t+dur+.05);};
AU.click=function(){if(!this.ac)return;const t=this.now();this.noise(t,.035,'highpass',2600,1,.26);this.tone(t,.03,'square',1400+Math.random()*200,.03);};
AU.vault=function(t,rd){if(!this.ac)return;if(this.custom){const s=this.ac.createBufferSource();s.buffer=this.custom;s.connect(this.sfx);s.start(t);return;}
  this.clunk(t,false);this.grind(t+.1,rd);this.clunk(t+rd,true);this.clunk(t+rd+.42,true);this.noise(t+rd+.5,.7,'highpass',3800,.7,.16,.02);};
AU.door=function(t){if(!this.ac)return;const k=this.custom?.45:1;this.noise(t,.8,'highpass',3500,.7,.2*k,.02);this.tone(t,2,'sawtooth',40,.45*k,.3,this.bassLP);
  const ac=this.ac,o=ac.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(95,t);o.frequency.linearRampToValueAtTime(150,t+1.5);
  const f=ac.createBiquadFilter();f.type='bandpass';f.frequency.value=700;f.Q.value=6;const g=ac.createGain();this.env(g.gain,t,.25,.12*k,1.6);o.connect(f);f.connect(g);g.connect(this.sfx);o.start(t);o.stop(t+1.7);this.clunk(t+1.75,false);};
AU.whoosh=function(t,dur,lo,hi,pk){if(!this.ac)return;const n=this.noise(t,dur,'bandpass',lo||300,1.2,pk||.28,dur*.55);n.f.frequency.setValueAtTime(lo||300,t);n.f.frequency.exponentialRampToValueAtTime(hi||2600,t+dur*.8);};
AU.step=function(){if(!this.ac)return;const t=this.now();this.noise(t,.04,'lowpass',900,.7,.07);};
AU.blip=function(f){if(!this.ac)return;this.tone(this.now(),.07,'sine',f||880,.08);};
AU.ping=function(){if(!this.ac)return;const t=this.now();this.tone(t,.18,'sine',1046,.12);this.tone(t+.11,.35,'sine',1568,.1);this.tone(t+.11,.35,'triangle',784,.05);};
AU.open=function(){if(!this.ac)return;const t=this.now();this.noise(t,.05,'highpass',3000,1,.2);this.tone(t+.02,.05,'square',600,.04);[1318,1760,2093,2637].forEach((f,i)=>this.tone(t+.5+i*.06,.9,'sine',f,.035));};
AU.tick=function(){if(!this.ac)return;this.noise(this.now(),.015,'highpass',4000,1,.06);};
const mtof=m=>440*Math.pow(2,(m-69)/12);
const TRACK={bpm:100,play(A,s,t,spb){const bar=(s>>4)&3,i=s&15;const ch=[[69,72,76],[65,69,72],[64,67,72],[67,71,74]][bar],root=[45,41,48,43][bar];
  if(i%4===0)A.tone(t,.24,'sine',150,.8,.002,A.mus,42);
  if(i===4||i===12){A.noise(t,.15,'highpass',1500,.7,.22,.002,A.mus);A.tone(t,.07,'triangle',190,.12,.002,A.mus);}
  if(i%2===1)A.noise(t,.035,'highpass',7500,.7,.06,.002,A.mus);
  if(i%2===0)A.tone(t,spb*1.8,'sawtooth',mtof(root+(i%4===2?12:0)),.14,.004,A.bassLP);
  A.tone(t,spb*.9,'square',mtof(ch[[0,1,2,1][i%4]]+(i>=8?12:0)),.022,.003,A.arp);
  if(i===0)ch.forEach(n=>A.tone(t,spb*15,'triangle',mtof(n-12),.028,.4,A.mus));}};
AU.startMusic=function(){if(!this.ac||this.playing)return;this.playing=true;this.si=0;this.nt=this.ac.currentTime+.06;this.timer=setInterval(()=>this.sched(),25);};
AU.sched=function(){const ac=this.ac,spb=60/TRACK.bpm/4;if(this.nt<ac.currentTime-.25)this.nt=ac.currentTime+.05;
  while(this.nt<ac.currentTime+.15){TRACK.play(this,this.si,this.nt,spb);this.nt+=spb;this.si=(this.si+1)%64;}};
AU.filter=function(f,g,tc){if(!this.ac)return;const t=this.now();this.lp.frequency.cancelScheduledValues(t);this.lp.frequency.setTargetAtTime(f,t,tc||.4);this.mus.gain.setTargetAtTime(g,t,tc||.4);};
AU.setMuted=function(m){this.muted=m;if(this.ac)this.master.gain.setTargetAtTime(m?0:.75,this.now(),.05);};

/* =====================================================================
   EXTERIOR — art-deco vault front, sunset neon
   ===================================================================== */
const DOOR={x:136,y:60,w:112,h:126};
const [skyC,skyX]=mk(W,H),[frC,frX]=mk(W,H),[exC,exX]=mk(W,H),[glC,glX]=mk(W,H);
dither(skyX,0,0,W,H,['#07041a','#0d0727','#160a36','#231044','#371352','#53185e','#80226c','#b62f78','#f2507a'],(x,y)=>Math.pow(y/182,1.3));
(()=>{const g=skyX,r=rng(7);
  for(let i=0;i<55;i++){const x=r()*W|0,y=r()*66|0;rect(g,x,y,1,1,r()<.3?'#ffffff':'#8f80d8');}
  const cx=344,cy=146,R=30;
  for(let y=-R;y<=R;y++){if(y>-6&&((y+60)%6)<Math.min(3,1+((y+6)/9|0)))continue;for(let x=-R;x<=R;x++){if(x*x+y*y>R*R)continue;const t=(y+R)/(2*R);
    rect(g,cx+x,cy+y,1,1,t<.3?'#ffe68a':t<.5?'#ffbe5e':t<.7?'#ff8a68':'#ff4f8b');}}
  let x=-6;while(x<W){const w=12+(r()*20|0),top=122+(r()*48|0),col=r()<.5?'#2a0f45':'#240c3c';rect(g,x,top,w,H-top,col);
    if(w>16&&r()<.65){rect(g,x+3,top-6,w-6,6,col);if(r()<.5)rect(g,x+(w>>1)-1,top-15,2,9,col);}
    for(let wy=top+5;wy<190;wy+=5)for(let wx=x+2;wx<x+w-2;wx+=4)if(r()<.09)rect(g,wx,wy,1,2,r()<.6?'#ff7ac0':'#5ff0e0');x+=w+(r()*2|0);}
})();
function palm(g,x,base,h,lean,col){const pts=[];for(let i=0;i<=h;i++){const t=i/h;pts.push([x+lean*h*t*t,base-i]);}
  pts.forEach(([px,py],i)=>{const w=i<h*.3?3:2;rect(g,Math.round(px)-1,Math.round(py),w,1,(i%5===0)?mixc(col,'#000000',.4):col);});
  const [tx,ty]=pts[pts.length-1];
  for(let k=0;k<8;k++){const a=-Math.PI/2+(k-3.5)*.42,len=26+(k%3)*6,dir=Math.cos(a)>0?1:-1;
    for(let s=0;s<=len;s++){const t=s/len,fx=tx+Math.cos(a)*s*1.1,fy=ty+Math.sin(a)*s*.55+t*t*18;rect(g,Math.round(fx),Math.round(fy),1,2,col);
      if(s%3===0&&s>4){rect(g,Math.round(fx)+dir,Math.round(fy)+2+((s/3)%2),1,2,col);rect(g,Math.round(fx)-dir,Math.round(fy)+2,1,1,col);}}}
  rect(g,Math.round(tx)-2,ty-1,5,4,mixc(col,'#000000',.3));}
function rivet(g,x,y){rect(g,x,y,2,2,'#262b38');rect(g,x,y,1,1,'#aab2c6');}
(()=>{const g=frX,r=rng(21);
  palm(g,24,198,132,.18,'#1b0a2c');palm(g,54,198,96,-.06,'#22103a');palm(g,358,198,120,-.2,'#1b0a2c');
  const B='#2a1d4f',B3='#3d2e6e',D='#160e30',HL='#5a4890';
  rect(g,150,12,84,12,B);rect(g,160,4,64,10,B);rect(g,174,0,36,6,B);for(let x=164;x<222;x+=6)rect(g,x,4,2,20,B3);
  rect(g,70,22,244,164,B);
  const gr=g.createLinearGradient(0,0,0,186);gr.addColorStop(0,'rgba(8,4,24,.5)');gr.addColorStop(.5,'rgba(8,4,24,0)');gr.addColorStop(1,'rgba(8,4,24,.28)');g.fillStyle=gr;g.fillRect(70,0,244,186);
  rect(g,66,22,252,2,B3);rect(g,66,22,252,1,HL);rect(g,146,12,92,1,HL);rect(g,158,4,68,1,HL);
  for(const px of [70,308]){rect(g,px,24,6,162,B3);rect(g,px,24,1,162,HL);}
  for(const yy of [72,76,80]){rect(g,78,yy,38,1,'#2a8f8a');rect(g,268,yy,38,1,'#2a8f8a');}
  for(const wx of [84,100,272,288]){rect(g,wx-1,30,14,34,D);const lit=r()<.6;for(let y=31;y<63;y++)rect(g,wx,y,12,1,lit?mixc('#ffb27a','#a8406a',(y-31)/32):((y%3)?'#110b28':'#171034'));
    rect(g,wx+5,31,1,32,D);if(lit)for(let y=33;y<62;y+=3)rect(g,wx,y,12,1,'rgba(60,20,40,.35)');rect(g,wx-2,64,16,1,HL);}
  for(const x of [80,266]){rect(g,x-2,90,42,62,D);for(let y=92;y<150;y++)rect(g,x,y,38,1,mixc('#100a26','#1f1244',(y-92)/58));rect(g,x-3,150,44,2,B3);rect(g,x-3,150,44,1,HL);rect(g,x+18,92,1,58,'#0c0820');}
  // vault door frame
  rect(g,126,50,132,136,'#1c1f2b');rect(g,128,52,128,134,'#2e3344');rect(g,128,52,128,1,'#5a6178');rect(g,128,52,1,134,'#4a5066');rect(g,255,52,1,134,'#181b25');
  rect(g,134,58,116,128,'#14161f');rect(g,DOOR.x,DOOR.y,DOOR.w,DOOR.h,'#05030a');
  for(let x=132;x<254;x+=8)rivet(g,x,54);for(let y=62;y<184;y+=8){if(y%40<10)continue;rivet(g,130,y);rivet(g,252,y);}
  for(const yy of [72,118,164]){rect(g,129,yy,6,12,'#1a1d27');rect(g,129,yy,6,1,'#6a7188');rect(g,249,yy,6,12,'#1a1d27');rect(g,249,yy,6,1,'#6a7188');}
  // planters
  for(const cx of [99,285]){for(let k=0;k<7;k++){const a=-Math.PI/2+(k-3)*.45;for(let s=0;s<12;s++)rect(g,Math.round(cx+Math.cos(a)*s),Math.round(174+Math.sin(a)*s*.8+s*s*.04),1,1,k%2?'#1d5a52':'#2a8a74');}
    rect(g,cx-7,175,14,2,HL);rect(g,cx-6,177,12,9,B3);rect(g,cx-6,177,1,9,HL);}
  // street
  rect(g,0,186,W,12,'#21173c');rect(g,0,186,W,1,'#3a2c66');for(let x=8;x<W;x+=16)rect(g,x,187,1,11,'#1a1230');rect(g,132,184,120,2,'#6a6f85');
  rect(g,0,198,W,2,'#3a2c66');rect(g,0,200,W,16,'#0b0720');for(let x=6;x<W;x+=32)rect(g,x,209,14,1,'#241a44');
})();
const SIGN=neonWord('THE VAULT',2,'#ff3fa4','#ffe2f3');
const SIGN_GLOW=(()=>{const[c,g]=mk(SIGN.width,SIGN.height);drawText(g,'THE VAULT',1,1,2,2,()=>'#ff3fa4');return c;})();
const OPEN_N=neonWord('OPEN',1,'#ff4f7a','#ffd6de');

/* ---------- vault doors + wheel ---------- */
const [dbC,dbX]=mk(112,126),[dtC,dtX]=mk(112,126);
(()=>{const g=dbX;
  dither(g,0,0,112,126,['#7a85a0','#6b7690','#5d6782','#4f5873','#424a63','#373e54'],(x,y)=>y/125*.85+.08);
  for(const ox of [0,56]){
    const rc=(x,y,w,h)=>{g.fillStyle='rgba(0,0,0,.16)';g.fillRect(x,y,w,h);rect(g,x,y,w,1,'#2a2f3d');rect(g,x,y,1,h,'#2a2f3d');rect(g,x,y+h-1,w,1,'#8a93a9');rect(g,x+w-1,y,1,h,'#8a93a9');};
    rc(ox+6,6,44,24);rc(ox+6,94,44,22);
    for(let x=ox+4;x<ox+52;x+=7){rivet(g,x,2);rivet(g,x,114);}for(let y=8;y<112;y+=8){rivet(g,ox+2,y);rivet(g,ox+52,y);}
    for(let y=118;y<124;y++)for(let x=ox+1;x<ox+55;x++)rect(g,x,y,1,1,((x+y)>>2)&1?'#ffcc22':'#1a1a22');
    rect(g,ox,0,56,1,'#a3acc0');rect(g,ox,0,1,126,'#8e97ad');rect(g,ox+55,0,1,126,'#242937');rect(g,ox,125,56,1,'#1c202b');}
  const cx=56,cy=63;
  for(let y=cy-28;y<=cy+28;y++)for(let x=cx-28;x<=cx+28;x++){const fx=x+.5-cx,fy=y+.5-cy,r=Math.hypot(fx,fy);if(r>27)continue;
    if(r>24.5){const n=(-fx*.7-fy*.7)/r;rect(g,x,y,1,1,n>.3?'#9aa3b8':n<-.3?'#1c202b':'#2e3444');}else rect(g,x,y,1,1,Math.floor(r)%3===0?'#47506a':'#535d77');}
  for(let i=0;i<12;i++){const a=i*Math.PI/6+.26;rivet(g,Math.round(cx+Math.cos(a)*25.7-1),Math.round(cy+Math.sin(a)*25.7-1));}
  for(const y of [16,102]){rect(g,57,y,26,7,'#1d212c');rect(g,57,y+6,26,1,'#7d879e');rect(g,42,y,13,7,'#1d212c');}
  rect(g,55,0,1,126,'#0f1118');rect(g,56,0,1,126,'#8a93a9');})();
const CH=['#1b1f29','#3a4152','#5d667c','#8c96ad','#c3cad8','#eef2fa'];
function wheelPix(fx,fy,r,ang){const L=(-fx*.6-fy*.8)/(r||1);const a=Math.atan2(fy,fx)-ang,sec=Math.PI/3;let da=((a%sec)+sec)%sec;if(da>sec/2)da-=sec;
  const perp=r*Math.abs(Math.sin(da)),along=r*Math.cos(da),kd=Math.hypot(along-19.3,perp);
  if(kd<=2.6){if(kd>2)return CH[0];const kl=(-(along-19.3)*.3-perp*.2);return kd<.9?CH[5]:(L+kl>0?CH[4]:CH[3]);}
  if(r<=3.2)return r<1.5?CH[5]:(L>0?CH[4]:CH[3]);if(r<=4.6)return CH[0];
  if(r>=13.6&&r<=17){if(r<14.3||r>16.4)return CH[0];const notch=(((a/(Math.PI/12))%1)+1)%1<.18,v=L>.5?5:L>.1?4:L>-.3?3:2;return notch?CH[Math.max(1,v-2)]:CH[v];}
  if(r>4.6&&r<13.6&&perp<=1.6)return perp>1?CH[0]:(Math.sin(da)>0?CH[4]:CH[2]);
  if(r>17&&r<17.6&&perp<=1)return CH[3];return null;}
function drawWheel(g,cx,cy,ang){for(let pass=0;pass<2;pass++)for(let y=-23;y<=23;y++)for(let x=-23;x<=23;x++){const fx=x+.5,fy=y+.5,r=Math.hypot(fx,fy);if(r>22.3)continue;const c=wheelPix(fx,fy,r,ang);if(!c)continue;
  if(pass===0){g.fillStyle='rgba(0,0,0,.42)';g.fillRect(cx+x+1,cy+y+2,1,1);}else{g.fillStyle=c;g.fillRect(cx+x,cy+y,1,1);}}}
function drawDoorTex(){dtX.clearRect(0,0,112,126);dtX.drawImage(dbC,0,0);const bx=Math.round(lerp(44,57,S.bolt));
  for(const y of [17,103]){rect(dtX,bx,y,24,5,'#aeb6c8');rect(dtX,bx,y,24,1,'#e8ecf4');rect(dtX,bx,y+4,24,1,'#6a7288');rect(dtX,bx,y-1,2,7,'#d0d6e2');}
  drawWheel(dtX,56,63,S.wheel);}
function drawDoorsOpen(g,th){const cx=192,cy=123,f=240,TH=10,c=Math.cos(th),s=Math.sin(th);
  for(const side of [0,1]){const hx=side?248:136,dir=side?-1:1,P=(X,Z)=>{const k=f/(f-Z);return[cx+(X-cx)*k,k];},yk=(y,k)=>cy+(y-cy)*k;
    const[fx,fk]=P(hx+dir*56*c,56*s),[bx,bk]=P(hx+dir*56*c+dir*TH*s,56*s-TH*c);
    g.fillStyle='#2b3142';g.beginPath();g.moveTo(fx,yk(60,fk));g.lineTo(bx,yk(60,bk));g.lineTo(bx,yk(186,bk));g.lineTo(fx,yk(186,fk));g.fill();
    for(const yy of [78,123,168]){const mX=hx+dir*56*c+dir*(TH/2)*s,mZ=56*s-(TH/2)*c,[m0,mk0]=P(mX,mZ),[m1]=P(mX+dir*7*c,mZ+7*s),y=yk(yy,mk0);
      g.fillStyle='#c3cad8';g.fillRect(Math.min(m0,m1),y-2,Math.max(1,Math.abs(m1-m0)),5);g.fillStyle='#eef2fa';g.fillRect(Math.min(m0,m1),y-2,Math.max(1,Math.abs(m1-m0)),1);}
    for(let u=0;u<56;u++){const[x0]=P(hx+dir*u*c,u*s),[x1]=P(hx+dir*(u+1)*c,(u+1)*s),[,km]=P(hx+dir*(u+.5)*c,(u+.5)*s);
      const xa=Math.floor(Math.min(x0,x1)),xb=Math.ceil(Math.max(x0,x1)),yt=Math.floor(yk(60,km)),yb=Math.ceil(yk(186,km));
      g.drawImage(dtC,side?111-u:u,0,1,126,xa,yt,Math.max(1,xb-xa),yb-yt);g.fillStyle=`rgba(10,5,24,${.45*s})`;g.fillRect(xa,yt,Math.max(1,xb-xa),yb-yt);}}}

/* ---------- door logo (retro & clean) ---------- */
const [tmC,tmX]=mk(W,H),[ttC,ttX]=mk(W,H),[tlC,tlX]=mk(W,H);
const COL_THE=['#ffe0f4','#ffb0e6','#ff7ad5','#ff7ad5','#ff5ac8','#ff5ac8','#e03aa8'];
const COL_STRAND=['#fffbd8','#fff07a','#ffd24a','#ffb03a','#ff8f3a','#ff6a4a','#ff4f6e'];
const COL_VAULT=['#ffffff','#dafffb','#a8fff2','#6ff5e6','#3fe0e0','#2abaea','#3a8cff'];
const WORDS=[['THE',2,2,69,COL_THE,0],['STRAND',3,2,86,COL_STRAND,3],['VAULT',3,2,114,COL_VAULT,9]];
const PB={x:172,y:148,w:40,h:18};
function tint(src,col){ttX.globalCompositeOperation='source-over';ttX.clearRect(0,0,W,H);ttX.drawImage(src,0,0);ttX.globalCompositeOperation='source-atop';ttX.fillStyle=col;ttX.fillRect(0,0,W,H);ttX.globalCompositeOperation='source-over';return ttC;}
function drawTitle(){const g=tlX;g.clearRect(0,0,W,H);const bx=130,by=63,bw=124,bh=115;
  g.fillStyle='rgba(10,6,28,.86)';g.fillRect(bx+2,by,bw-4,bh);g.fillRect(bx,by+2,bw,bh-4);g.fillRect(bx+1,by+1,bw-2,bh-2);
  g.fillStyle='rgba(255,63,164,.75)';g.fillRect(bx+2,by,bw-4,1);g.fillRect(bx+2,by+bh-1,bw-4,1);g.fillRect(bx,by+2,1,bh-4);g.fillRect(bx+bw-1,by+2,1,bh-4);
  g.fillStyle='rgba(63,240,224,.45)';g.fillRect(bx+4,by+2,bw-8,1);g.fillRect(bx+4,by+bh-3,bw-8,1);
  const bo=i=>Math.round(Math.sin(T*2.6-i*.5)*1.2);
  tmX.clearRect(0,0,W,H);for(const [w,sc,sp,y,,off] of WORDS)drawText(tmX,w,Math.round(192-textW(w,sc,sp)/2),y,sc,sp,()=>'#fff',i=>bo(i+off));
  const oc=tint(tmC,'#0e051c');for(let dy=-1;dy<=4;dy++)for(let dx=-1;dx<=1;dx++)g.drawImage(oc,dx,dy);
  let ec=tint(tmC,'#3a0f5a');g.drawImage(ec,0,3);ec=tint(tmC,'#6a1f8f');g.drawImage(ec,0,1);g.drawImage(ec,0,2);
  for(const [w,sc,sp,y,cols,off] of WORDS)drawText(g,w,Math.round(192-textW(w,sc,sp)/2),y,sc,sp,r=>cols[r],i=>bo(i+off));
  const {x,y,w,h}=PB,fy=y+(S.press?2:0);
  rr(g,x-1,y-1,w+2,h+5,'#0a0618');rr(g,x,y+3,w,h,'#0a6a60');
  rr(g,x,fy,w,h,S.hover?'#3ff5d8':'#1fe0c2');rect(g,x+1,fy+1,w-2,6,S.hover?'#a8fff2':'#6ff5e2');rect(g,x+2,fy+1,w-4,1,'#e0fffb');rect(g,x+1,fy+h-3,w-2,2,'#14b8a0');
  for(let i=0;i<11;i++){const half=5-Math.abs(i-5),tw=Math.round(half*1.7)+1;rect(g,189,fy+5+i,tw,1,'#0a5a50');rect(g,188,fy+4+i,tw,1,'#ffffff');}}

function neonBoot(i){if(T<1.1+i*.22)return hash(Math.floor(T*16)+i*31)>.5?1:0;return 1;}
function renderExterior(){
  const g=exX,q=glX;g.globalCompositeOperation='source-over';g.globalAlpha=1;g.clearRect(0,0,W,H);q.clearRect(0,0,W,H);
  g.drawImage(skyC,0,0);g.drawImage(frC,0,0);
  const on=neonBoot(0),on2=neonBoot(1),on3=neonBoot(2),br=.92+.08*Math.sin(T*1.7);
  // window neon: OPEN + film reel
  if(on3){g.drawImage(OPEN_N,85,106);rect(g,81,102,36,1,'#3ff0e0');rect(g,81,118,36,1,'#3ff0e0');rect(g,81,102,1,17,'#3ff0e0');rect(g,116,102,1,17,'#3ff0e0');
    const cx=285,cy=118;for(let a=0;a<64;a++){const t=a/64*6.283;rect(g,Math.round(cx+Math.cos(t)*11),Math.round(cy+Math.sin(t)*11),1,1,'#3ff0e0');}
    for(let k=0;k<5;k++){const t=k/5*6.283+T*.6;for(let a=0;a<10;a++)rect(g,Math.round(cx+Math.cos(t)*6+Math.cos(a/10*6.283)*2.4),Math.round(cy+Math.sin(t)*6+Math.sin(a/10*6.283)*2.4),1,1,'#3ff0e0');}
    rect(g,cx-1,cy-1,3,3,'#3ff0e0');line(g,cx+11,cy+4,cx+18,cy+16,'#ff3fa4');line(g,cx+18,cy+16,cx+8,cy+18,'#ff3fa4');
    q.globalAlpha=.9;rect(q,80,101,38,19,'rgba(255,79,122,.55)');circle(q,cx,cy,13,'rgba(63,240,224,.45)');q.globalAlpha=1;}
  // door tubes (pink inner, cyan outer)
  const P=on?'#ff3fa4':'#4a1036',PC=on?'#ffd6ef':'#5a1a46',C=on2?'#3ff0e0':'#103a3a',CC=on2?'#dafffb':'#164a48';
  rect(g,123,47,2,139,P);rect(g,124,48,1,138,PC);rect(g,259,47,2,139,P);rect(g,259,48,1,138,PC);rect(g,123,47,138,1,P);rect(g,124,48,136,1,PC);
  rect(g,118,43,1,143,C);rect(g,265,43,1,143,C);rect(g,118,43,148,1,C);rect(g,119,44,146,1,CC);
  // sign
  if(on)g.drawImage(SIGN,192-(SIGN.width>>1),26);else g.drawImage(tint2(SIGN,'#3a0c2c'),192-(SIGN.width>>1),26);
  if(on){q.globalAlpha=br;q.fillStyle='#ff3fa4';q.fillRect(121,45,6,141);q.fillRect(257,45,6,141);q.fillRect(121,45,142,5);q.drawImage(SIGN_GLOW,192-(SIGN.width>>1),26);q.drawImage(SIGN_GLOW,192-(SIGN.width>>1),26);
    q.fillStyle='rgba(255,63,164,.35)';q.fillRect(100,186,184,12);q.globalAlpha=1;}
  if(on2){q.globalAlpha=br*.9;q.fillStyle='#3ff0e0';q.fillRect(116,41,4,145);q.fillRect(264,41,4,145);q.fillRect(116,41,152,4);q.globalAlpha=1;}
  // street reflections
  for(let y=201;y<216;y++){const a=.5-(y-201)*.03,wob=Math.round(Math.sin(y*.8+T*2)*.6);
    if(on){q.fillStyle=`rgba(255,63,164,${a})`;q.fillRect(121+wob,y,5,1);q.fillRect(257-wob,y,5,1);}
    if(on2){q.fillStyle=`rgba(63,240,224,${a*.8})`;q.fillRect(116+wob,y,3,1);q.fillRect(264-wob,y,3,1);}
    if(on3&&y<210){q.fillStyle=`rgba(255,79,122,${a*.5})`;q.fillRect(84-wob,y,30,1);q.fillStyle=`rgba(63,240,224,${a*.5})`;q.fillRect(274+wob,y,22,1);}}
  // doors
  if(S.open<=0){drawDoorTex();g.drawImage(dtC,DOOR.x,DOOR.y);}
  else{g.clearRect(DOOR.x,DOOR.y,DOOR.w,DOOR.h);drawDoorTex();drawDoorsOpen(g,S.open*1.2);
    q.fillStyle=`rgba(190,140,255,${.22*S.open})`;q.beginPath();q.moveTo(136,186);q.lineTo(248,186);q.lineTo(290,216);q.lineTo(94,216);q.fill();
    if(S.flash>0){q.fillStyle=`rgba(255,230,255,${S.flash*.7})`;q.fillRect(0,0,W,H);}}
  if(S.titleA>0){drawTitle();g.globalAlpha=S.titleA;g.drawImage(tlC,0,-Math.round((1-S.titleA)*5));g.globalAlpha=1;
    q.globalAlpha=S.titleA*(.25+(S.hover?.25:0));q.fillStyle='#1fe0c2';q.fillRect(PB.x,PB.y,PB.w,PB.h+3);q.globalAlpha=1;}
}
const _t2={};function tint2(src,col){const k=col;if(_t2[k])return _t2[k];const[c,g]=mk(src.width,src.height);g.drawImage(src,0,0);g.globalCompositeOperation='source-atop';g.fillStyle=col;g.fillRect(0,0,c.width,c.height);return _t2[k]=c;}

/* =====================================================================
   CORRIDOR — short side-scrolling walk through the vault to the store
   ===================================================================== */
const CW=240,FLOOR=89;
const [cbC,cbX]=mk(CW,SH),[coC,coX]=mk(SW,SH),[cgC,cgX]=mk(SW,SH);
const STORE_N=neonWord('STORE',1,'#ff3fa4','#ffe2f3');
(()=>{const g=cbX;
  rect(g,0,0,CW,10,'#0b0718');for(let x=0;x<CW;x+=24)rect(g,x,0,2,10,'#070410');rect(g,0,9,CW,1,'#1d1433');rect(g,0,10,CW,1,'#24304a');
  for(let x=0;x<CW;x+=24){rect(g,x,11,24,73,(x/24)&1?'#2a2244':'#2d2549');rect(g,x,11,24,1,'#3d3460');rect(g,x,11,1,73,'#3a3160');rect(g,x+23,11,1,73,'#1b1530');}
  for(const [x0,x1] of [[34,104],[124,180]]){rect(g,x0-2,18,x1-x0+4,52,'#1c1e2c');for(let y=20;y<68;y+=8)for(let x=x0;x<x1;x+=10){rect(g,x,y,9,7,'#4a4f66');rect(g,x,y,9,1,'#6d7390');rect(g,x+1,y+1,7,5,'#3a3f55');rect(g,x+4,y+3,1,2,'#16182a');}}
  rect(g,0,84,CW,5,'#140e26');rect(g,0,84,CW,1,'#4a1838');
  let ri=0;for(const [y,h] of [[89,3],[92,4],[96,5],[101,7]]){for(let x=-(ri*2);x<CW;x+=8)rect(g,x,y,8,h,(((x+ri*2)>>3)+ri)&1?'#1a1030':'#2a1848');ri++;}rect(g,0,89,CW,1,'#3c2a66');
  for(const cx of [70,110,150])for(let i=0;i<4;i++){rect(g,cx+i,97+i,1,1,'#5a1a4a');rect(g,cx+i,103-i,1,1,'#5a1a4a');}
  rect(g,0,30,7,59,'#4b5468');rect(g,0,30,7,1,'#8e97ad');rect(g,6,30,1,59,'#2a2f3c');for(const y of [40,58,76]){rect(g,7,y,3,4,'#c3cad8');rect(g,7,y,3,1,'#eef2fa');}
  rect(g,192,36,36,53,'#3a4054');rect(g,192,36,36,2,'#5a6178');rect(g,195,39,30,50,'#120a26');
})();
function renderCorridor(cam,L,o){
  const g=coX,q=cgX;cam=Math.round(cam);g.globalAlpha=1;g.drawImage(cbC,cam,0,SW,SH,0,0,SW,SH);q.clearRect(0,0,SW,SH);
  const dx=195-cam,d=o.door||0;
  if(d>0){g.fillStyle=`rgba(200,150,255,${.35*d})`;g.fillRect(dx,39,30,50);g.fillStyle=`rgba(255,210,255,${.12*d})`;g.fillRect(dx-6,89,42,19);}
  rect(g,dx-Math.round(d*13),39,15,50,'rgba(130,190,255,.22)');rect(g,dx+15+Math.round(d*13),39,15,50,'rgba(130,190,255,.22)');
  rect(g,dx-Math.round(d*13)+2,41,1,46,'rgba(255,255,255,.35)');rect(g,dx+17+Math.round(d*13),41,1,46,'rgba(255,255,255,.35)');
  if(L<1){g.fillStyle=`rgba(4,2,12,${(1-L)*.86})`;g.fillRect(0,0,SW,SH);}
  const lit=th=>L>=th+.1?1:L>=th?(hash(Math.floor(T*28)+th*97)>.42?1:0):0;
  if(lit(.15)){rect(g,0,10,SW,1,'#3ff0e0');rect(q,0,9,SW,3,'#3ff0e0');}
  if(lit(.35)){rect(g,0,84,SW,1,'#ff3fa4');rect(q,0,83,SW,3,'#ff3fa4');q.fillStyle='rgba(255,63,164,.25)';q.fillRect(0,90,SW,10);}
  if(lit(.5)){g.drawImage(STORE_N,dx-2,28);q.drawImage(STORE_N,dx-2,28);q.fillStyle='rgba(255,63,164,.6)';q.fillRect(dx-3,27,38,11);}
  if(d>0){q.fillStyle=`rgba(200,150,255,${.6*d})`;q.fillRect(dx,39,30,50);}
  if(o.hero&&hero.alpha>0){const s=SIDE[hero.frame],x=Math.round(hero.x-cam),y=FLOOR-22;g.globalAlpha=hero.alpha*.5;rect(g,x+2,FLOOR,10,1,'#05030a');g.globalAlpha=hero.alpha;g.drawImage(s,x,y);g.globalAlpha=1;}
  if(o.wipe!==undefined&&o.wipe<1){const x=Math.round(o.wipe*SW);g.fillStyle='rgba(40,52,74,.62)';g.fillRect(x,0,SW-x,SH);
    if(o.wipe>0){rect(g,x-1,0,1,SH,'#3ff0e0');rect(q,x-3,0,4,SH,'#3ff0e0');}}
}

/* =====================================================================
   STORE — top-down (3/4) vault store
   ===================================================================== */
const [stC,stX]=mk(W,H);
const CSHELF={x:200,y:10,w:70,h:30,slot:i=>({x:207+i*12,y:20,w:10,h:14}),stand:i=>({x:212+i*12,y:58})};
const COMPUTER={x:156,y:12,w:46,h:44,stand:{x:178,y:62}};
const BOARD={x:84,y:6,w:68,h:32,stand:{x:118,y:58}};
const COUNTER={x:276,y:26,w:100,h:42,stand:{x:326,y:74}};
const slotRect=(s,i)=>({x:s.x+7+i*19,y:s.y+8,w:12,h:15});
const slotStand=(s,i)=>({x:s.x+13+i*19,y:s.y+34});
(()=>{const g=stX,r=rng(5);
  for(let y=46;y<216;y+=16)for(let x=0;x<W;x+=16){rect(g,x,y,16,16,((x+y)>>4)&1?'#181030':'#1c1436');rect(g,x,y,16,1,'#130c28');rect(g,x,y,1,16,'#130c28');}
  for(let i=0;i<160;i++)rect(g,r()*W|0,46+(r()*170|0),1,1,'#241a48');
  rect(g,0,0,W,46,'#231848');for(let x=8;x<W;x+=32){rect(g,x,4,1,38,'#1b1240');rect(g,x+1,4,1,38,'#2c2058');}
  rect(g,0,0,W,3,'#0f0824');rect(g,0,42,W,4,'#170f30');rect(g,0,42,W,1,'#3a2c66');rect(g,8,3,368,1,'#164a48');rect(g,8,41,368,1,'#4a1036');
  rect(g,0,46,8,170,'#120a26');rect(g,7,46,1,170,'#2a1f52');rect(g,376,46,8,170,'#120a26');rect(g,376,46,1,170,'#2a1f52');
  rect(g,0,204,168,12,'#120a26');rect(g,216,204,168,12,'#120a26');rect(g,0,204,168,1,'#2a1f52');rect(g,216,204,168,1,'#2a1f52');
  rect(g,164,198,4,18,'#3a2c66');rect(g,216,198,4,18,'#3a2c66');
  rect(g,174,190,36,12,'#241446');rect(g,174,190,36,1,'#ff3fa4');rect(g,174,201,36,1,'#ff3fa4');rect(g,174,190,1,12,'#ff3fa4');rect(g,209,190,1,12,'#ff3fa4');
  // pinboard
  rect(g,84,6,68,32,'#5a341c');rect(g,84,6,68,1,'#8a5a30');rect(g,84,37,68,1,'#3a200e');
  dither(g,86,8,64,28,['#9a6634','#a8703e','#b88050'],(x,y)=>hash(x*13.1+y*7.7));
  MUST.forEach((id,i)=>{const x=90+i*12,y=13+(i%2);rect(g,x+1,y+1,10,14,'rgba(0,0,0,.35)');g.drawImage(mini(id,10,14),x,y);rect(g,x+4,y-1,2,2,'#ff3355');rect(g,x+4,y-1,1,1,'#ffb0c0');});
  // computer kiosk
  rect(g,160,54,36,2,'rgba(0,0,0,.35)');rect(g,158,34,40,8,'#3a2c66');rect(g,158,34,40,1,'#5a4890');rect(g,158,42,40,12,'#241a48');
  rect(g,162,46,14,1,'#3a2c66');rect(g,180,46,14,1,'#3a2c66');rect(g,168,48,2,1,'#8a7ab0');rect(g,186,48,2,1,'#8a7ab0');
  rect(g,166,14,24,20,'#cfc6b8');rect(g,166,14,24,1,'#efe8dc');rect(g,189,14,1,20,'#9a9286');rect(g,166,33,24,1,'#9a9286');rect(g,168,16,20,14,'#2a2a2a');
  rect(g,174,34,8,2,'#9a9286');rect(g,168,37,20,3,'#b8b0a2');for(let x=169;x<187;x+=2)rect(g,x,38,1,1,'#8a8274');rect(g,186,31,1,1,'#3aff6a');
  // continue shelf
  rect(g,202,10,66,26,'#1a1036');rect(g,202,10,66,1,'#3a2c66');rect(g,202,10,1,26,'#3a2c66');rect(g,267,10,1,26,'#3a2c66');
  rect(g,203,22,3,12,'#3a2c66');rect(g,200,34,70,4,'#7a4a28');rect(g,200,34,70,1,'#a8693a');rect(g,200,38,70,1,'#120a1c');rect(g,206,38,2,3,'#3a2c66');rect(g,262,38,2,3,'#3a2c66');
  // back shelf behind counter
  rect(g,288,6,84,28,'#1a1036');for(const py of [18,31]){rect(g,288,py,84,2,'#5a3a8a');for(let x=290;x<370;x+=4){if(r()<.15)continue;const m=MOVIES[r()*MOVIES.length|0];rect(g,x,py-9,3,9,m.c[1]);rect(g,x,py-9,1,9,mixc(m.c[1],'#000000',.4));rect(g,x,py-3,3,1,'#ffffff');}}
})();
const [cnC,cnX]=mk(100,30);
(()=>{const g=cnX;rect(g,0,6,100,8,'#4a2c6a');rect(g,0,6,100,1,'#7a4aa0');rect(g,0,14,100,14,'#241640');for(let x=10;x<100;x+=20)rect(g,x,16,1,10,'#1a0f30');
  rect(g,0,14,100,1,'#ff3fa4');rect(g,0,28,100,2,'#140a22');rect(g,74,0,16,8,'#5d6178');rect(g,74,0,16,1,'#8a8fa6');rect(g,85,2,3,4,'#3a3d50');rect(g,12,3,4,3,'#d9a441');rect(g,13,2,2,1,'#f2c75a');
  [['#ff3fa4',0],['#3ff0e0',2],['#ffd23f',4]].forEach(([c,o])=>{rect(g,30,6-o,12,2,c);rect(g,30,6-o,12,1,'#ffffff');});})();
const GOND={};
function gondola(w){if(GOND[w])return GOND[w];const[c,g]=mk(w,26);rect(g,2,24,w-4,2,'rgba(0,0,0,.35)');rect(g,0,0,w,6,'#3a2c66');rect(g,0,0,w,1,'#5a4890');rect(g,0,0,2,24,'#2a1f52');rect(g,w-2,0,2,24,'#2a1f52');
  rect(g,0,6,w,18,'#1a1233');rect(g,2,7,w-4,15,'#120b26');rect(g,0,22,w,2,'#4a3a7a');rect(g,0,6,w,1,'#2c6a70');return GOND[w]=c;}
const PALMC=(()=>{const[c,g]=mk(20,28);for(let k=0;k<9;k++){const a=-Math.PI/2+(k-4)*.42;for(let s=0;s<11;s++)rect(g,Math.round(10+Math.cos(a)*s*1.1),Math.round(12+Math.sin(a)*s*.9+s*s*.05),1,1,k%2?'#1d5a52':'#2a8a74');}
  rect(g,4,18,12,2,'#5a4890');rect(g,5,20,10,8,'#3d2e6e');rect(g,5,20,1,8,'#5a4890');return c;})();

/* ---------- pathfinding (4px grid, A*) ---------- */
const GS=4,GW=96,GH=54,GRID=new Uint8Array(GW*GH);
const OBST=[...SHELVES.map(s=>({x:s.x-2,y:s.y-2,w:s.w+4,h:28})),{x:274,y:30,w:106,h:38},{x:154,y:28,w:48,h:28},{x:8,y:62,w:22,h:16},{x:350,y:184,w:24,h:18}];
for(let cy=0;cy<GH;cy++)for(let cx=0;cx<GW;cx++){const px=cx*GS+2,py=cy*GS+2;
  GRID[cy*GW+cx]=(px<12||px>372||py<54||py>200||OBST.some(o=>px>o.x-5&&px<o.x+o.w+5&&py>o.y-1&&py<o.y+o.h+3))?1:0;}
const cellOf=(x,y)=>{const cx=Math.floor(x/GS),cy=Math.floor(y/GS);return(cx<0||cy<0||cx>=GW||cy>=GH)?-1:cy*GW+cx;};
const blocked=(x,y)=>{const c=cellOf(x,y);return c<0||GRID[c]===1;};
function nearestFree(c){if(c>=0&&!GRID[c])return c;const cx=c%GW,cy=(c/GW)|0;for(let r=1;r<30;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(Math.abs(dx)!==r&&Math.abs(dy)!==r)continue;const x=cx+dx,y=cy+dy;if(x<0||y<0||x>=GW||y>=GH)continue;const k=y*GW+x;if(!GRID[k])return k;}return c;}
function los(ax,ay,bx,by){const n=Math.ceil(Math.hypot(bx-ax,by-ay)/2);for(let i=1;i<=n;i++)if(blocked(lerp(ax,bx,i/n),lerp(ay,by,i/n)))return false;return true;}
function findPath(x0,y0,x1,y1){
  const s=nearestFree(cellOf(clamp(x0,0,W-1),clamp(y0,0,H-1))),t=nearestFree(cellOf(clamp(x1,0,W-1),clamp(y1,0,H-1)));if(s<0||t<0)return null;
  const N=GW*GH,gs=new Float32Array(N).fill(1e9),came=new Int32Array(N).fill(-1),closed=new Uint8Array(N),heap=[];
  const tx=t%GW,ty=(t/GW)|0,hf=k=>Math.hypot(k%GW-tx,((k/GW)|0)-ty);
  const push=(k,f)=>{heap.push([f,k]);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p][0]<=heap[i][0])break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p;}};
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;for(;;){const l=i*2+1,r2=l+1;let m=i;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r2<heap.length&&heap[r2][0]<heap[m][0])m=r2;if(m===i)break;[heap[m],heap[i]]=[heap[i],heap[m]];i=m;}}return top;};
  gs[s]=0;push(s,hf(s));
  while(heap.length){const[,k]=pop();if(closed[k])continue;closed[k]=1;if(k===t)break;const kx=k%GW,ky=(k/GW)|0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=kx+dx,ny=ky+dy;if(nx<0||ny<0||nx>=GW||ny>=GH)continue;const n=ny*GW+nx;if(GRID[n]||closed[n])continue;
      if(dx&&dy&&(GRID[ky*GW+nx]||GRID[ny*GW+kx]))continue;const ng=gs[k]+(dx&&dy?1.414:1);if(ng<gs[n]){gs[n]=ng;came[n]=k;push(n,ng+hf(n));}}}
  if(came[t]<0&&t!==s)return null;const cells=[];for(let k=t;k!==-1;k=came[k])cells.unshift(k);
  const pts=cells.map(k=>({x:(k%GW)*GS+2,y:((k/GW)|0)*GS+2}));if(!blocked(x1,y1))pts[pts.length-1]={x:x1,y:y1};
  const out=[];let cur={x:x0,y:y0},i=0;while(i<pts.length){let j=pts.length-1;while(j>i&&!los(cur.x,cur.y,pts[j].x,pts[j].y))j--;out.push(pts[j]);cur=pts[j];i=j+1;}return out;}

/* ---------- actors ---------- */
const hero={x:192,y:228,dir:1,path:null,anim:0,f:0,alpha:1,frame:'stand'};
if(A.heroPalette)PAL.hero=A.heroPalette;
const npcs=PEOPLE.map(p=>({...p,path:null,anim:0,f:0,wait:3+Math.random()*4,si:0,P:p.P||PAL[p.id]||PAL.maya}));
let showDemo=true;
const remotes=new Map(); // live players from realtime: id -> actor
const visNpcs=()=>showDemo?npcs:[];
function walkTo(a,x,y,speedCb){a.path=findPath(a.x,a.y,x,y);return!!a.path;}
function stepActor(a,dt,speed){
  if(!a.path||!a.path.length){a.anim=0;a.f=0;return false;}
  const t=a.path[0],dx=t.x-a.x,dy=t.y-a.y,d=Math.hypot(dx,dy),st=speed*dt;
  if(Math.abs(dx)>Math.abs(dy))a.dir=dx<0?2:3;else a.dir=dy<0?1:0;
  if(d<=st){a.x=t.x;a.y=t.y;a.path.shift();if(!a.path.length)a.path=null;}else{a.x+=dx/d*st;a.y+=dy/d*st;}
  a.anim+=dt;const f=Math.floor(a.anim/.12)%4;if(f!==a.f){a.f=f;if(a===hero&&(f===1||f===3))AU.step();}return true;}

/* ---------- labels ---------- */
function buildLabels(){const L=$('labels');L.innerHTML='';
  const add=(txt,x,y,cls)=>{const d=document.createElement('div');d.className='plq px '+(cls||'');d.textContent=txt;d.style.left=(x/W*100)+'%';d.style.top=(y/H*100)+'%';L.appendChild(d);};
  SHELVES.forEach(s=>add(s.name,s.x+s.w/2,s.y-1));
  add('Your Watchlist',235,.5,'top wrap');add('Search for a Movie',178,.5,'top c');add('Must-Watches',118,.5,'top');add('Reko',326,31,'c');}

/* ---------- store state, render ---------- */
const STR={door:0,ping:null,hidden:null,hoverT:null,hoverNpc:null};
function caseVisible(k){return STR.hidden!==k;}
function drawContinue(g){const n=Math.min(5,CONT.length);
  for(let i=0;i<n;i++){const id=CONT[i].id,k='c'+i;if(!caseVisible(k))continue;const sl=CSHELF.slot(i),img=mini(id,10,14),lift=STR.hoverT&&STR.hoverT.key===k?-1:0;
    if(n<5&&i===n-1){g.save();g.translate(n===1?206:sl.x+2,34);g.rotate(n===1?-.28:-.35);g.drawImage(img,0,-14+lift);g.restore();}
    else{g.drawImage(img,sl.x,sl.y+lift);rect(g,sl.x+10,sl.y+2,1,12,'rgba(0,0,0,.4)');}}}
function drawGondola(g,s){g.drawImage(gondola(s.w),s.x,s.y);
  s.ids.forEach((id,i)=>{const k=s.id+i;if(!caseVisible(k))return;const r=slotRect(s,i),lift=STR.hoverT&&STR.hoverT.key===k?-2:0;g.drawImage(mini(id,12,15),r.x,r.y+lift);rect(g,r.x,r.y+lift,1,15,'rgba(0,0,0,.3)');
    if(lift){rect(g,r.x-1,r.y+lift-1,14,1,'#ffffff');rect(g,r.x-1,r.y+lift+15,14,1,'#ffffff');rect(g,r.x-1,r.y+lift,1,15,'#ffffff');rect(g,r.x+12,r.y+lift,1,15,'#ffffff');}});}
function renderStore(){
  const g=ctx,q=glX;g.globalAlpha=1;g.drawImage(stC,0,0);q.clearRect(0,0,W,H);
  // wall neon + sign
  rect(g,8,3,368,1,'#3ff0e0');rect(g,8,41,368,1,'#ff3fa4');rect(q,8,1,368,4,'#3ff0e0');rect(q,8,39,368,4,'#ff3fa4');q.fillStyle='rgba(255,63,164,.22)';q.fillRect(8,46,368,12);
  drawText(g,'THE VAULT',14,17,1,1,r=>r===3?'#ffe2f3':'#ff3fa4');drawText(q,'THE VAULT',14,17,1,1,()=>'#ff3fa4');drawText(q,'THE VAULT',14,17,1,1,()=>'#ff3fa4');
  rect(g,14,27,60,1,'#3ff0e0');rect(q,14,26,60,3,'#3ff0e0');
  // monitor screen
  rect(g,169,17,18,12,'#06302e');for(let i=0;i<4;i++){const w=4+((hash(i*7+Math.floor(T*1.3))*12)|0);rect(g,170,18+i*3,w,1,'#3ff0e0');}if(Math.floor(T*2)%2)rect(g,171,27,2,1,'#dafffb');
  q.fillStyle='rgba(63,240,224,.7)';q.fillRect(168,16,20,14);
  q.fillStyle='rgba(255,210,150,.18)';q.fillRect(84,6,68,32);
  drawContinue(g);
  // store door
  const sd=STR.door;rect(g,168,204,48,12,'#0c0620');rect(g,168-Math.round(sd*22),204,24,12,'rgba(120,200,255,.25)');rect(g,192+Math.round(sd*22),204,24,12,'rgba(120,200,255,.25)');
  rect(g,169-Math.round(sd*22),205,1,10,'rgba(255,255,255,.4)');rect(g,193+Math.round(sd*22),205,1,10,'rgba(255,255,255,.4)');
  rect(q,162,198,7,18,'#3ff0e0');rect(q,215,198,7,18,'#3ff0e0');q.fillStyle='rgba(255,63,164,.35)';q.fillRect(174,190,36,12);
  // y-sorted entities
  const E=[];
  SHELVES.forEach(s=>E.push([s.y+24,()=>drawGondola(g,s)]));
  E.push([68,()=>{drawPerson(g,326,52,0,0,PAL.reko);g.drawImage(cnC,276,38);}]);
  E.push([78,()=>g.drawImage(PALMC,10,50)]);E.push([202,()=>g.drawImage(PALMC,352,174)]);
  visNpcs().forEach(n=>E.push([n.y,()=>drawPerson(g,n.x,n.y,n.dir,n.f,n.P)]));
  remotes.forEach(n=>E.push([n.y,()=>drawPerson(g,n.x,n.y,n.dir,n.f,n.P)]));
  if(hero.alpha>0)E.push([hero.y,()=>{g.globalAlpha=hero.alpha;drawPerson(g,hero.x,hero.y,hero.dir,hero.f,PAL.hero);g.globalAlpha=1;}]);
  E.sort((a,b)=>a[0]-b[0]).forEach(e=>e[1]());
  // counter + shelf lips glow
  q.fillStyle='rgba(255,63,164,.9)';q.fillRect(276,51,100,2);q.fillStyle='#59ff9a';q.fillRect(352,40,8,3);
  q.globalAlpha=.35;SHELVES.forEach(s=>rect(q,s.x,s.y+6,s.w,1,'#3ff0e0'));q.globalAlpha=1;
  // hover outline (non-case targets)
  const h=STR.hoverT;if(h&&h.r&&!h.key){q.strokeStyle='rgba(255,255,255,.7)';q.lineWidth=1;q.strokeRect(h.r.x-1.5,h.r.y-1.5,h.r.w+3,h.r.h+3);}
  // ping
  const p=STR.ping;if(p){const t=T-p.t0,pulse=(Math.sin(t*6)+1)/2,R=p.rect;
    q.fillStyle=`rgba(255,214,107,${.5+.4*pulse})`;q.fillRect(R.x-2,R.y-2,R.w+4,R.h+4);
    const c=(Math.floor(t*6)%2)?'#ffd66b':'#ffffff';rect(g,R.x-2,R.y-2,R.w+4,1,c);rect(g,R.x-2,R.y+R.h+1,R.w+4,1,c);rect(g,R.x-2,R.y-2,1,R.h+4,c);rect(g,R.x+R.w+1,R.y-2,1,R.h+4,c);
    const ax=Math.round(R.x+R.w/2),ay=Math.round(R.y-7+Math.sin(t*5)*1.5);rect(g,ax-3,ay,7,1,'#ffd66b');rect(g,ax-2,ay+1,5,1,'#ffd66b');rect(g,ax-1,ay+2,3,1,'#ffd66b');rect(g,ax,ay+3,1,1,'#ffd66b');
    for(let k=0;k<3;k++){const rr=((t*14+k*7)%21);const a=1-rr/21;for(let i=0;i<32;i++){const th=i/32*6.283;rect(g,Math.round(p.stand.x+Math.cos(th)*rr),Math.round(p.stand.y+Math.sin(th)*rr*.5),1,1,`rgba(255,214,107,${a})`);}}
    rect(g,p.stand.x-1,p.stand.y-1,3,3,'#ffd66b');q.fillStyle='rgba(255,214,107,.8)';q.fillRect(p.stand.x-4,p.stand.y-2,9,5);}
}

/* =====================================================================
   STATE MACHINE
   ===================================================================== */
const S={wheel:0,bolt:0,open:0,k:1,ks:.65,L:.12,wipe:0,titleA:0,flash:0,shake:0,hover:false,press:false};
let state='title',st=0,T=0,RD=3.4,lastStep=0,ui=null,ccam=0,cdoor=0;
const iris={r:999,cx:192,cy:108};
const INTRO=['title','fade','unlock','open','zoom'];
function go(s){state=s;st=0;const t=AU.now();
  if(s==='unlock'){RD=AU.custom?clamp(AU.custom.duration*.7,1.8,5):3.4;lastStep=0;AU.vault(t+.02,RD);S.shake=1.5;}
  if(s==='open'){AU.door(t);AU.filter(12000,.45,.5);S.flash=1;}
  if(s==='zoom')AU.whoosh(t,2.6);
  if(s==='corridor'){Object.assign(hero,{x:-14,alpha:1,anim:0,frame:'w1'});ccam=0;cdoor=0;warmPosters();}
  if(s==='irisOut'){iris.cx=(hero.x+7-ccam)*2;iris.cy=(FLOOR-12)*2;AU.whoosh(t,.7,1800,400,.12);}
  if(s==='storeIn'){Object.assign(hero,{x:192,y:230,dir:1,path:null,alpha:1,anim:0,f:0});iris.cx=192;iris.cy=205;iris.r=0;AU.filter(6500,.3,.8);buildLabels();setTimeout(()=>$('labels').classList.add('on'),500);}
  if(s==='play'){toast('Welcome to <b>THE VAULT</b>');setHint('Click to walk · click shelves, the computer, the board or Reko · hover people');}
  $('press').hidden=s!=='title';}
function startIntro(){if(state!=='title'||S.titleA<.5)return;AU.init();AU.startMusic();AU.filter(420,.4,.01);AU.blip(660);S.press=true;setTimeout(()=>S.press=false,140);cv.classList.remove('hand');go('fade');}
function wheelAt(p){if(p<.12)return -.22*Math.sin(p/.12*Math.PI);const TOT=Math.PI*3,raw=eio((p-.12)/.88)*TOT,stp=TOT/30,q=raw/stp,fl=Math.floor(q),fr=q-fl,sm=fr<.55?0:(fr-.55)/.45;return(fl+sm*sm*(3-2*sm))*stp;}
const keys={};
function update(dt){
  T+=dt;st+=dt;S.shake=Math.max(0,S.shake-dt*10);S.flash=Math.max(0,S.flash-dt*1.4);
  if(state==='title')S.titleA=clamp((T-.9)/.6);
  else if(state==='fade'){S.titleA=1-clamp(st/.7);if(st>=.75)go('unlock');}
  else if(state==='unlock'){const p=clamp(st/RD);S.wheel=wheelAt(p);const q=Math.floor(Math.max(0,S.wheel)/(Math.PI*3/30));if(q!==lastStep){lastStep=q;if(!AU.custom)AU.click();}
    if(st>RD){S.bolt=clamp((st-RD)/.45);if(st-dt<=RD||(st-dt<=RD+.42&&st>RD+.42))S.shake=3;}if(st>=RD+.6)go('open');}
  else if(state==='open'){S.open=eio(clamp(st/1.9));S.L=.12+.06*S.open;if(st>=1.6&&st-dt<1.6)S.shake=2;if(st>=2.2)go('zoom');}
  else if(state==='zoom'){const p=clamp(st/2.6),e=eio(p);S.k=Math.exp(Math.log(7)*e);S.ks=Math.min(1,Math.max(.65,.65*S.k));S.L=.18+.82*clamp((p-.2)/.7);S.wipe=clamp((p-.25)/.65);if(p>=1)go('corridor');}
  else if(state==='corridor'||state==='irisOut'){
    hero.x+=54*dt;hero.anim+=dt;const f=Math.floor(hero.anim/.13)%2;const nf=f?'w2':'w1';if(nf!==hero.frame){hero.frame=nf;if(!f)AU.step();}
    ccam=clamp(hero.x+7-80,0,CW-SW);cdoor=clamp((hero.x-150)/30);if(hero.x>196)hero.alpha=clamp(1-(hero.x-196)/12);
    if(state==='corridor'&&hero.x>=200)go('irisOut');
    if(state==='irisOut'){iris.r=lerp(240,0,eio(clamp(st/.7)));if(st>=.8)go('storeIn');}}
  else if(state==='storeIn'){iris.r=lerp(0,260,eio(clamp(st/.9)));hero.y=Math.max(188,hero.y-42*dt);hero.dir=1;hero.anim+=dt;const f=Math.floor(hero.anim/.12)%4;if(f!==hero.f){hero.f=f;if(f%2)AU.step();}
    STR.door=hero.y>192?Math.min(1,STR.door+dt*4):Math.max(0,STR.door-dt*2);if(hero.y<=188&&st>.9){hero.f=0;iris.r=999;go('play');}}
  else if(state==='play'){
    STR.door=Math.max(0,STR.door-dt*2);
    if(!ui){let dx=0,dy=0;if(keys.l)dx--;if(keys.r)dx++;if(keys.u)dy--;if(keys.d)dy++;
      if(dx||dy){hero.path=null;const n=Math.hypot(dx,dy),sp=70*dt;const nx=hero.x+dx/n*sp,ny=hero.y+dy/n*sp;if(!blocked(nx,hero.y))hero.x=nx;if(!blocked(hero.x,ny))hero.y=ny;
        hero.dir=Math.abs(dx)>=Math.abs(dy)&&dx?(dx<0?2:3):(dy<0?1:0);hero.anim+=dt;const f=Math.floor(hero.anim/.12)%4;if(f!==hero.f){hero.f=f;if(f%2)AU.step();}}
      else if(!stepActor(hero,dt,70))hero.f=0;}
    for(const r of remotes.values()){const k=Math.min(1,dt*10);r.x=lerp(r.x,r.tx,k);r.y=lerp(r.y,r.ty,k);
      if(r.moving||Math.hypot(r.tx-r.x,r.ty-r.y)>.6){r.anim+=dt;r.f=Math.floor(r.anim/.12)%4;}else r.f=0;}
    if(A.onHero)A.onHero(hero.x,hero.y,hero.dir,!!(hero.path||keys.l||keys.r||keys.u||keys.d));
    for(const n of visNpcs()){if(STR.hoverNpc===n){n.path=null;n.f=0;const dx=hero.x-n.x,dy=hero.y-n.y;n.dir=Math.abs(dx)>Math.abs(dy)?(dx<0?2:3):(dy<0?1:0);continue;}
      if(n.path)stepActor(n,dt,30);else{n.wait-=dt;n.dir=1;if(n.wait<0){n.si=(n.si+1)%n.spots.length;const[x,y]=n.spots[n.si];walkTo(n,x,y);n.wait=6+Math.random()*7;}}}
    const p=STR.ping;if(p&&!p.fired&&!ui&&!hero.path&&Math.hypot(hero.x-p.stand.x,hero.y-p.stand.y)<6){p.fired=true;hero.dir=1;hero.f=0;setTimeout(()=>openDVD(p),260);}}
}

/* =====================================================================
   RENDER
   ===================================================================== */
function present(list,sh){for(const g of [gAx,gBx]){g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,W,H);g.setTransform(1,0,0,1,sh[0],sh[1]);g.imageSmoothingEnabled=true;
  for(const[c,r,cl]of list){if(cl){g.save();g.beginPath();g.rect(...cl);g.clip();g.drawImage(c,...r);g.restore();}else g.drawImage(c,...r);}}}
function render(){
  const sh=S.shake>.2?[Math.round((Math.random()*2-1)*S.shake),Math.round((Math.random()*2-1)*S.shake)]:[0,0];
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;rect(ctx,0,0,W,H,'#000');ctx.setTransform(1,0,0,1,sh[0],sh[1]);ctx.imageSmoothingEnabled=false;let gl;
  if(INTRO.includes(state)){renderExterior();
    if(S.open>0){let P=[192,123],k=1,ks=.65;if(state==='zoom'){const e=eio(clamp(st/2.6));P=[192,lerp(123,108,e)];k=S.k;ks=S.ks;}
      renderCorridor(0,S.L,{wipe:state==='zoom'?S.wipe:0});const R1=[192-192*ks,lerp(123,108,clamp((ks-.65)/.35))-108*ks,W*ks,H*ks],R2=[P[0]-192*k,P[1]-123*k,W*k,H*k];
      ctx.imageSmoothingEnabled=ks<1;ctx.drawImage(coC,...R1);ctx.imageSmoothingEnabled=false;ctx.drawImage(exC,...R2);gl=[[cgC,R1,[P[0]-56*k,P[1]-63*k,112*k,126*k]],[glC,R2]];}
    else{ctx.drawImage(exC,0,0);gl=[[glC,[0,0,W,H]]];}}
  else if(state==='corridor'||state==='irisOut'){renderCorridor(ccam,1,{hero:true,door:cdoor});ctx.drawImage(coC,0,0,W,H);gl=[[cgC,[0,0,W,H]]];}
  else{renderStore();gl=[[glC,[0,0,W,H]]];}
  present(gl,sh);
  irx.clearRect(0,0,W,H);if(iris.r<500&&(state==='irisOut'||state==='storeIn')){irx.globalCompositeOperation='source-over';irx.fillStyle='#000';irx.fillRect(0,0,W,H);
    irx.globalCompositeOperation='destination-out';irx.beginPath();irx.arc(iris.cx,iris.cy,Math.max(0,iris.r),0,6.283);irx.fill();irx.globalCompositeOperation='source-over';}
}

/* =====================================================================
   STORE INTERACTION
   ===================================================================== */
const inR=(x,y,r,p=0)=>x>=r.x-p&&x<=r.x+r.w+p&&y>=r.y-p&&y<=r.y+r.h+p;
function npcAt(x,y){for(const n of [...visNpcs(),...remotes.values()])if(x>=n.x-6&&x<=n.x+6&&y>=n.y-20&&y<=n.y+1)return n;return null;}
function targetAt(x,y){
  const p=STR.ping;if(p&&Math.hypot(x-p.stand.x,(y-p.stand.y)*2)<9)return{type:'marker',r:{x:p.stand.x-5,y:p.stand.y-3,w:10,h:6}};
  for(const s of SHELVES){for(let i=0;i<s.ids.length;i++){const r=slotRect(s,i);if(inR(x,y,r,1))return{type:'case',key:s.id+i,id:s.ids[i],r};}if(inR(x,y,{x:s.x,y:s.y,w:s.w,h:24}))return{type:'shelf',s,r:{x:s.x,y:s.y,w:s.w,h:24}};}
  for(let i=0;i<Math.min(5,CONT.length);i++){const r=CSHELF.slot(i);if(inR(x,y,r,1))return{type:'ccase',key:'c'+i,id:CONT[i].id,r};}
  if(inR(x,y,CSHELF))return{type:'cont',r:CSHELF};if(inR(x,y,COMPUTER))return{type:'comp',r:COMPUTER};if(inR(x,y,BOARD))return{type:'board',r:BOARD};if(inR(x,y,COUNTER))return{type:'reko',r:COUNTER};
  return null;}
function storeClick(x,y){const t=targetAt(x,y);AU.init();
  if(!t){if(y>46)walkTo(hero,x,Math.max(56,y));return;}
  ({case:()=>pingAndWalk(t.id),ccase:()=>pingAndWalk(t.id,'cont'),shelf:()=>openList('shelf',t.s),cont:()=>openList('cont'),comp:openSearch,board:openBoard,reko:openReko,
    marker:()=>walkTo(hero,STR.ping.stand.x,STR.ping.stand.y)})[t.type]();}
function pullMovie(id,from){let rect,stand,key,label;
  if(from==='cont'){const i=CONT.findIndex(c=>c.id===id);if(i<0)return null;rect=CSHELF.slot(i);stand=CSHELF.stand(i);key='c'+i;label='Your Watchlist';}
  else{const s=DB.shelfOf(id);if(!s)return null;const i=s.ids.indexOf(id);rect=slotRect(s,i);stand=slotStand(s,i);key=s.id+i;label=s.name;}
  STR.ping={id,rect,stand,key,label,t0:T,fired:false,from};AU.ping();return STR.ping;}
function pingAndWalk(id,from){const p=pullMovie(id,from);if(!p)return openDirect(id);walkTo(hero,p.stand.x,p.stand.y);}
/** Open a film that isn't on a shelf (search, RICO, friends' faves): DVD flies out from the centre. */
async function openDirect(id){if(ui)return;let m=DB.get(id);if(!m||!m.full){try{m=DB.add(await A.ensure(id))||m;}catch(e){}}if(!m||DEAD)return;
  openDVD({id:m.id,rect:{x:W/2-6,y:H/2-8,w:12,h:15},stand:{x:W/2,y:H/2},key:null,label:'The Vault',t0:T,fired:true});}
function pingOnly(id){const p=pullMovie(id);if(!p)return openDirect(id);toast(`Pinged on <b>${esc(p.label)}</b> — walk to the glowing marker`,3600);}

/* ---------- UI helpers ---------- */
function toast(html,ms){const t=$('toast');t.innerHTML=html;t.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('on'),ms||2600);}
function setHint(txt){const h=$('hint');h.textContent=txt;h.classList.add('on');clearTimeout(setHint.t);setHint.t=setTimeout(()=>h.classList.remove('on'),9000);}
const px=n=>n*SC;
const AVC={Maya:'#ff8a3a',Jordan:'#3ac06a',Priya:'#3a7aff',Sam:'#c05aff',Reko:'#7a2fb0'};
function metaLine(m){return`${m.y} · ${m.g.join(', ')}${m.rt?' · '+fmtRT(m):''}`;}

/* ---------- shelf / continue list ---------- */
function openList(kind,s){ui='list';hideNpc();AU.blip(740);const P=$('list');
  $('lT').textContent=kind==='cont'?'Your Watchlist':s.name;$('lS').textContent=kind==='cont'?(CONT.length?`${CONT.length} film${CONT.length===1?'':'s'} saved for later`:'Nothing saved yet: hit + Watchlist on any film'):s.sub;
  const items=(kind==='cont'?CONT.map(c=>[DB.get(c.id),c]):s.ids.map(id=>[DB.get(id),null])).filter(([m])=>m);
  $('lR').innerHTML=items.map(([m,c],i)=>`<button class="row" data-id="${m.id}" style="animation-delay:${80+i*55}ms"><img src="${poster(m.id)}" alt=""><div class="tx"><b>${esc(m.t)}</b><small>${esc(metaLine(m))}</small></div>${m.sc?`<span class="sc">★ ${(m.sc*2).toFixed(1)}</span>`:''}</button>`).join('');
  $('lR').querySelectorAll('.row').forEach(b=>b.onclick=()=>{const id=b.dataset.id;closeList();pingAndWalk(id,kind==='cont'?'cont':undefined);});
  P.classList.add('on');P.animate([{opacity:0,transform:`translateX(${px(10)}px) scale(.98)`},{opacity:1,transform:'none'}],{duration:480,easing:'cubic-bezier(.16,1,.3,1)'});}
function closeList(){const P=$('list');P.animate([{opacity:1},{opacity:0,transform:`translateX(${px(6)}px)`}],{duration:220,easing:'ease-in'}).onfinish=()=>P.classList.remove('on');ui=null;}
$('lX').onclick=closeList;

/* ---------- search computer ---------- */
let sSel=0,sList=[];
const MON={x0:169,y0:17,x1:187,y1:29,ox:178,oy:23,z:9};
function monInset(){const z=MON.z,X=x=>MON.ox+(x-MON.ox)*z,Y=y=>MON.oy+(y-MON.oy)*z;
  return`inset(${clamp(Y(MON.y0)/H,0,1)*100}% ${clamp((W-X(MON.x1))/W,0,1)*100}% ${clamp((H-Y(MON.y1))/H,0,1)*100}% ${clamp(X(MON.x0)/W,0,1)*100}% round ${px(2)}px)`;}
function openSearch(){ui='search';hideNpc();AU.blip(520);$('labels').classList.add('dim');const wd=$('world'),Sx=$('search');
  wd.style.transformOrigin=`${MON.ox/W*100}% ${MON.oy/H*100}%`;wd.animate([{transform:'scale(1)'},{transform:`scale(${MON.z})`}],{duration:720,easing:'cubic-bezier(.6,0,.8,.3)',fill:'forwards'});
  AU.whoosh(AU.now(),.75,250,1600,.14);
  setTimeout(()=>{Sx.style.display='block';Sx.animate([{clipPath:monInset(),opacity:.5},{clipPath:'inset(0% 0% 0% 0% round 0px)',opacity:1}],{duration:700,easing:'cubic-bezier(.16,1,.3,1)'});
    Sx.querySelector('.sc-in').animate([{transform:'scale(1.12)',opacity:0,filter:'blur(6px)'},{transform:'scale(1)',opacity:1,filter:'blur(0px)'}],{duration:1100,easing:'cubic-bezier(.16,1,.3,1)'});
    $('q').value='';renderSearch();setTimeout(()=>$('q').focus(),60);},640);}
function closeSearch(after){const wd=$('world'),Sx=$('search');$('q').blur();
  Sx.animate([{clipPath:'inset(0% 0% 0% 0% round 0px)',opacity:1},{clipPath:monInset(),opacity:0}],{duration:420,easing:'cubic-bezier(.7,0,.84,0)'}).onfinish=()=>{Sx.style.display='none';
    wd.animate([{transform:`scale(${MON.z})`},{transform:'scale(1)'}],{duration:760,easing:'cubic-bezier(.16,1,.3,1)',fill:'forwards'}).onfinish=()=>{wd.getAnimations().forEach(a=>a.cancel());$('labels').classList.remove('dim');ui=null;after&&after();};};
  AU.whoosh(AU.now(),.8,1600,250,.12);}
let sSeq=0;
function renderSearch(){const q=$('q').value,seq=++sSeq;
  const row=(m,i)=>`<button class="row${i===0?' sel':''}" data-i="${i}" style="animation-delay:${Math.min(i,10)*35}ms"><img src="${poster(m.id)}" alt=""><div class="tx"><b>${esc(m.t)}</b><small>${esc(metaLine(m))}${m.d?' · '+esc(m.d):''}</small></div><span class="sc">${m.sc?'★ '+(m.sc*2).toFixed(1):''}</span><span class="loc">${esc(DB.shelfOf(m.id)?.name||'In the vault')}</span></button>`;
  const show=(list,meta)=>{sList=list;sSel=0;$('sM').textContent=meta;
    $('sR').innerHTML=list.length?list.map(row).join(''):`<div class="empty">No tape found for that one.<br>Try a title, director, genre or year.</div>`;
    $('sR').querySelectorAll('.row').forEach(b=>{b.onclick=()=>pickSearch(+b.dataset.i);b.onmouseenter=()=>selSearch(+b.dataset.i,false);});};
  const local=DB.search(q);
  if(!q.trim()){show(local,`${local.length} titles on the shelves · top rated first`);return;}
  show(local,local.length?`${local.length} on the shelves · searching the whole vault…`:'Searching the whole vault…');
  clearTimeout(renderSearch.t);renderSearch.t=setTimeout(async()=>{let hits=[];try{hits=await A.search(q);}catch(e){}
    if(seq!==sSeq||DEAD||ui!=='search')return;const seen=new Set(local.map(m=>m.id));
    const more=hits.map(h=>DB.add(h)).filter(m=>m&&!seen.has(m.id)&&(seen.add(m.id),true));
    const all=local.concat(more);show(all,`${all.length} result${all.length===1?'':'s'} for “${q.trim()}”`);},220);}
function selSearch(i,scroll){const rows=$('sR').querySelectorAll('.row');if(!rows.length)return;sSel=clamp(i,0,rows.length-1);rows.forEach((r,k)=>r.classList.toggle('sel',k===sSel));if(scroll!==false)rows[sSel].scrollIntoView({block:'nearest'});}
function pickSearch(i){const m=sList[i];if(!m)return;AU.blip(990);closeSearch(()=>DB.shelfOf(m.id)?pingOnly(m.id):openDirect(m.id));}
$('q').addEventListener('input',()=>{AU.tick();renderSearch();});
$('q').addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();selSearch(sSel+1);}else if(e.key==='ArrowUp'){e.preventDefault();selSearch(sSel-1);}else if(e.key==='Enter'){e.preventDefault();pickSearch(sSel);}else if(e.key==='Escape'){e.preventDefault();closeSearch();}e.stopPropagation();});
$('sX').onclick=()=>closeSearch();

/* ---------- must-watches board ---------- */
const boardInset=()=>`inset(${BOARD.y/H*100}% ${(W-BOARD.x-BOARD.w)/W*100}% ${(H-BOARD.y-BOARD.h)/H*100}% ${BOARD.x/W*100}% round ${px(2)}px)`;
function openBoard(){ui='board';hideNpc();AU.blip(620);const B=$('board');
  $('bS').textContent='Pinned by your friends — out now and coming soon';
  const fr=MUST.map(id=>A.mustWho[id]||'Loved by your crew');
  $('bC').innerHTML=MUST.map((id,i)=>{const m=DB.get(id);if(!m)return'';return`<button class="mw" data-id="${id}"><span class="pin"></span><div class="pf"><img src="${poster(id)}" alt=""><span class="bdg${m.rel?' soon':''}">${m.rel?'Coming '+m.rel:'Out now'}</span></div><h3>${esc(m.t)}</h3><small>${esc(fr[i])}</small></button>`;}).join('');
  B.style.display='block';B.animate([{clipPath:boardInset(),opacity:.5},{clipPath:'inset(0% 0% 0% 0% round 0px)',opacity:1}],{duration:720,easing:'cubic-bezier(.16,1,.3,1)'});AU.whoosh(AU.now(),.6,400,1800,.12);
  B.querySelectorAll('.mw').forEach((c,i)=>{const rot=(i%2?1.6:-1.4);c.animate([{opacity:0,transform:`translateY(${px(-14)}px) rotate(${rot*4}deg) scale(.92)`},{opacity:1,transform:`rotate(${rot}deg)`}],{duration:620,delay:260+i*90,easing:'cubic-bezier(.2,1.3,.4,1)',fill:'forwards'});
    c.onclick=()=>{const id=c.dataset.id;closeBoard(()=>pingAndWalk(id));};});}
function closeBoard(after){const B=$('board');B.animate([{clipPath:'inset(0% 0% 0% 0% round 0px)',opacity:1},{clipPath:boardInset(),opacity:0}],{duration:460,easing:'cubic-bezier(.7,0,.84,0)'}).onfinish=()=>{B.style.display='none';ui=null;after&&after();};}
$('bX').onclick=()=>closeBoard();

/* ---------- Reko ---------- */
const REASON={epic:'You want scale? Big screen, big sound.',funny:'Something light — you deserve a laugh.',mind:'Ooh, one to chew on afterwards.',feel:'A warm one. Blanket recommended.',any:'Trust me on this one.'};
let rkTimer=null,rkLast=null;
function rkType(txt,after){clearInterval(rkTimer);const el=$('rkT');el.textContent='';let i=0;rkTimer=setInterval(()=>{el.textContent=txt.slice(0,++i);if(i%3===0)AU.tick();if(i>=txt.length){clearInterval(rkTimer);after&&after();}},18);}
function openReko(){ui='reko';hideNpc();AU.blip(700);const R=$('reko'),c=$('rkC'),g=c.getContext('2d');g.clearRect(0,0,16,20);drawPerson(g,8,19,0,0,PAL.reko);
  R.classList.add('on');R.animate([{opacity:0,transform:`translateY(${px(8)}px)`},{opacity:1,transform:'none'}],{duration:450,easing:'cubic-bezier(.16,1,.3,1)'});rkMoods();}
function rkMoods(){$('rkB').innerHTML='';rkType("Hey, I'm Reko. Can't decide what to watch? Tell me the vibe and I'll pull something from the vault.",()=>{
  $('rkB').innerHTML='<div class="chips">'+[['epic','Epic'],['funny','Funny'],['mind','Mind-bending'],['feel','Feel-good'],['any','Surprise me']].map(([k,l])=>`<button class="chip" data-k="${k}">${l}</button>`).join('')+'</div>';
  $('rkB').querySelectorAll('.chip').forEach(b=>b.onclick=()=>rkPick(b.dataset.k));});}
const rkSeen=[];
async function rkPick(tag){AU.blip(880);$('rkB').innerHTML='';rkType('Let me check the shelves…');
  let res=null;try{res=await A.rico(tag,rkSeen.slice(-12));}catch(e){}
  if(DEAD||ui!=='reko')return;
  let m=res&&DB.add(res.movie);
  if(!m){const pool=MOVIES.filter(x=>!x.rel&&(tag==='any'||(x.tags||[]).includes(tag))&&!rkSeen.includes(x.id));m=pool[Math.random()*pool.length|0]||MOVIES[0];}
  rkSeen.push(m.id);
  const txt=(res&&res.line)||`${REASON[tag]} I'd go with “${m.t}” (${m.y}).`;
  rkType(txt,()=>{$('rkB').innerHTML=`<div class="rk-pick"><img src="${poster(m.id)}" alt=""><div class="chips" style="margin:0"><button class="chip pri" data-a="go">${DB.shelfOf(m.id)?'Show me on the shelf':'Open it'}</button><button class="chip" data-a="again">Another one</button><button class="chip" data-a="vibe">Different vibe</button></div></div>`;
    $('rkB').querySelector('[data-a=go]').onclick=()=>closeReko(()=>pingAndWalk(m.id));$('rkB').querySelector('[data-a=again]').onclick=()=>rkPick(tag);$('rkB').querySelector('[data-a=vibe]').onclick=rkMoods;});}
function closeReko(after){clearInterval(rkTimer);const R=$('reko');R.animate([{opacity:1},{opacity:0,transform:`translateY(${px(6)}px)`}],{duration:240}).onfinish=()=>{R.classList.remove('on');ui=null;after&&after();};}
$('rX').onclick=()=>closeReko();

/* ---------- people hover card ---------- */
let npcHideT=null;
function showNpc(n){clearTimeout(npcHideT);if(STR.hoverNpc===n&&$('npc').classList.contains('on'))return;STR.hoverNpc=n;const c=$('npc');
  const mv=(id,k)=>{const m=id!=null&&DB.get(id);if(!m)return'';return`<div class="k">${k}</div><button data-id="${id}"><img src="${poster(id)}" alt=""><span>${esc(m.t)}</span><span class="go">›</span></button>`;};
  c.innerHTML=`<div class="nm"><span class="dot"></span>${esc(n.name)}</div>${mv(n.recent,'Recently watched')}${mv(n.fav,'Favourite movie')}`;
  c.style.left=(n.x/W*100)+'%';c.style.top=((n.y-22)/H*100)+'%';c.classList.add('on');
  c.querySelectorAll('button').forEach(b=>b.onclick=()=>{const id=b.dataset.id;hideNpc(true);pingAndWalk(id);});}
function hideNpc(now){clearTimeout(npcHideT);const f=()=>{$('npc').classList.remove('on');STR.hoverNpc=null;};now?f():(npcHideT=setTimeout(f,280));}
$('npc').addEventListener('pointerenter',()=>clearTimeout(npcHideT));$('npc').addEventListener('pointerleave',()=>hideNpc());

/* ---------- DVD slide-out + open ---------- */
function openDVD(p){if(ui)return;const m=DB.get(p.id);if(!m)return;ui='dvd';hideNpc(true);const pst=poster(m.id);A.onOpen&&A.onOpen(m);STR.hidden=p.key;
  const L=$('dvdLayer');L.querySelectorAll('.dvd').forEach(e=>e.remove());L.style.display='block';const dim=L.querySelector('.dim');
  const sw=stage.clientWidth,sh=stage.clientHeight,Hh=sh*.62,Ww=Hh*.7,fx=(sw-Ww)/2,fy=(sh-Hh)/2;
  const el=document.createElement('div');el.className='dvd';el.style.cssText=`left:${fx}px;top:${fy}px;width:${Ww}px;height:${Hh}px;transform-origin:0 0`;
  el.innerHTML=`<div class="base"></div><div class="disc"><div class="lab" style="background-image:url(${pst})"></div><div class="shine"></div><div class="hub"></div></div><div class="cover"><div class="f"><img src="${pst}" alt=""></div><div class="b"><div class="lg">THE VAULT</div><div class="ti">${esc(m.t)}</div><div class="ln"></div><div class="sm">${m.y} · ${esc(m.g.join(' / '))}<br>${esc(m.d||'')}</div></div></div>`;
  L.appendChild(el);
  const R=p.rect,sx=px(R.x),sy=px(R.y),s0=px(R.w)/Ww,tA=`translate(${sx-fx}px,${sy-fy}px) scale(${s0})`,tB=`translate(${sx-fx-px(R.w)*.2}px,${sy-fy+px(R.h)*.9}px) scale(${s0*1.45})`;
  dim.animate([{opacity:0},{opacity:1}],{duration:800,fill:'forwards'});AU.whoosh(AU.now(),.4,600,1800,.1);
  el.animate([{transform:tA},{transform:tB}],{duration:420,easing:'cubic-bezier(.3,0,.2,1)',fill:'forwards'}).onfinish=()=>{
    AU.whoosh(AU.now(),.8,300,2200,.15);
    el.animate([{transform:tB},{transform:'translate(0px,0px) scale(1)'}],{duration:900,easing:'cubic-bezier(.16,1,.3,1)',fill:'forwards'}).onfinish=()=>setTimeout(()=>{
      AU.open();el.classList.add('open');el.animate([{transform:'translate(0px,0px)'},{transform:`translate(${Ww/2}px,0px)`}],{duration:1000,easing:'cubic-bezier(.65,0,.25,1)',fill:'forwards'});
      setTimeout(()=>showInfo(m,p),1250);},140);};}
function showInfo(m,p){ui='info';const I=$('info');I.innerHTML=infoHTML(m,p);I.style.display='block';
  I.animate([{opacity:0,transform:'scale(.94)',filter:'blur(14px)'},{opacity:1,transform:'scale(1)',filter:'blur(0px)'}],{duration:800,easing:'cubic-bezier(.16,1,.3,1)'});
  const L=$('dvdLayer');L.animate([{opacity:1},{opacity:0}],{duration:600,delay:200,fill:'forwards'}).onfinish=()=>{L.style.display='none';L.getAnimations().forEach(a=>a.cancel());L.querySelector('.dim').getAnimations().forEach(a=>a.cancel());L.querySelectorAll('.dvd').forEach(e=>e.remove());};
  I.querySelector('.card>.x').onclick=closeInfo;I.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>{const a=b.dataset.act;AU.blip(990);
    if(a==='watch'){const pv=A.providers(m)[+b.dataset.i];A.watch(m,pv);toast(`▶ Opening <b>${esc(m.t)}</b> on ${esc(pv.name)}`,2800);}
    else if(a==='find'){A.watch(m,null);toast(`Finding where to watch <b>${esc(m.t)}</b>`,2800);}
    else if(a==='list'){const saved=A.toggleSaved(m);b.textContent=saved?'✓ On your watchlist':'+ Watchlist';syncCont();toast(saved?`Added <b>${esc(m.t)}</b> to your watchlist`:`Removed <b>${esc(m.t)}</b> from your watchlist`,2400);}
    else if(a==='back')closeInfo();});}
function closeInfo(){const I=$('info');if(!I)return;AU.blip(520);I.animate([{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.97)'}],{duration:320,easing:'ease-in'}).onfinish=()=>{I.style.display='none';I.innerHTML='';};
  ui=null;STR.hidden=null;STR.ping=null;}
function infoHTML(m,p){const pst=poster(m.id),bg=m.bd||pst,f=m.film||{},provs=A.providers(m),lovers=A.lovers(m.id);
  const rate=m.sc?`<div class="rate"><span class="stars" style="--v:${m.sc/5*100}%">★★★★★</span><b>${(m.sc*2).toFixed(1)}</b><small>TMDB · ${(f.votes||0).toLocaleString('en-GB')} ratings${f.certification?' · Rated '+esc(f.certification):''}</small></div>`:'';
  const watch=provs.length?provs.slice(0,3).map((pv,i)=>`<button class="btn${i===0?' pri':''}" data-act="watch" data-i="${i}">▶ ${i===0?'Watch now · ':''}${esc(pv.name)}</button>`).join(''):`<button class="btn pri" data-act="find">▶ Find where to watch</button>`;
  const saved=A.isSaved(m.id);
  const crew=lovers.length?`<h4>Friends who love this</h4><div class="revs">${lovers.map(n=>`<div class="rv"><div class="h"><span class="av" style="background:${AVC[n]||'#7a2fb0'}">${esc(n[0]||'?')}</span>${esc(n)}<em>♥</em></div></div>`).join('')}</div>`:'';
  const cast=f.cast&&f.cast.length?`<h4>Starring</h4><p class="desc">${esc(f.cast.slice(0,5).join(' · '))}</p>`:'';
  const kind=f.mediaType==='tv'?`TV · ${f.seasons||'?'} season${f.seasons===1?'':'s'}`:m.g[0]||'Film';
  return`<div class="bg" style="background-image:url(${bg})"></div><div class="shade"></div><div class="card"><button class="x" aria-label="Close">×</button>
   <div class="lcol"><div class="io"><div class="pl"><img src="${pst}" alt=""></div><div class="pr"><div class="disc"><div class="lab" style="background-image:url(${pst})"></div><div class="shine"></div><div class="hub"></div></div></div></div><div class="cap">${p.key===null?'Pulled from the vault':'From the shelf · '+esc(p.label)}</div></div>
   <div class="rcol reveal"><div class="kick">The Vault · ${esc(kind)}</div><h1>${esc(m.t)}</h1>
    <div class="meta"><span>${m.y||''}</span>${m.rt?`<span>${fmtRT(m)}</span>`:''}${m.g.map(g=>`<span>${esc(g)}</span>`).join('')}${m.d?`<span>Dir. ${esc(m.d)}</span>`:''}</div>
    ${rate}<p class="desc">${esc(m.desc||'')}</p><div class="acts">${watch}<button class="btn" data-act="list">${saved?'✓ On your watchlist':'+ Watchlist'}</button><button class="btn" data-act="back">Back to the Vault</button></div>
    ${crew}${cast}<div class="fine">Film data from TMDB · Streaming availability by JustWatch.</div></div></div>`;}
/* =====================================================================
   INPUT
   ===================================================================== */
function toNative(e){const r=cv.getBoundingClientRect();return[(e.clientX-r.left)/r.width*W,(e.clientY-r.top)/r.height*H];}
const overPlay=(x,y)=>state==='title'&&S.titleA>.5&&x>=PB.x-2&&x<=PB.x+PB.w+2&&y>=PB.y-2&&y<=PB.y+PB.h+5;
cv.addEventListener('pointermove',e=>{const[x,y]=toNative(e);
  if(state==='title'){const h=overPlay(x,y);if(h!==S.hover){S.hover=h;cv.classList.toggle('hand',h);if(h)AU.ac&&AU.tick();}return;}
  if(state!=='play'||ui){cv.classList.remove('hand');return;}
  const n=npcAt(x,y);if(n)showNpc(n);else if(STR.hoverNpc)hideNpc();
  const t=targetAt(x,y);STR.hoverT=t;cv.classList.toggle('hand',!!t||!!n);});
cv.addEventListener('pointerleave',()=>{STR.hoverT=null;if(STR.hoverNpc)hideNpc();});
cv.addEventListener('pointerdown',e=>{const[x,y]=toNative(e);if(state==='title'){if(overPlay(x,y))startIntro();return;}if(state==='play'&&!ui){const n=npcAt(x,y);if(n){showNpc(n);return;}storeClick(x,y);}});
const KM={ArrowLeft:'l',a:'l',A:'l',ArrowRight:'r',d:'r',D:'r',ArrowUp:'u',w:'u',W:'u',ArrowDown:'d',s:'d',S:'d'};
on(window,'keydown',e=>{if(e.target&&e.target.tagName==='INPUT')return;const k=e.key;
  if(state==='title'&&(k==='Enter'||k===' ')){e.preventDefault();startIntro();return;}
  if(k==='Escape'){({list:closeList,search:()=>closeSearch(),board:()=>closeBoard(),reko:()=>closeReko(),info:closeInfo})[ui]?.();return;}
  if(k==='m'||k==='M'){AU.setMuted(!AU.muted);return;}
  if(KM[k]){e.preventDefault();keys[KM[k]]=true;}});
on(window,'keyup',e=>{if(KM[e.key])keys[KM[e.key]]=false;});
on(window,'blur',()=>{for(const k in keys)keys[k]=false;});

/* =====================================================================
   BOOT
   ===================================================================== */
function fit(){const s=Math.min(innerWidth/W,innerHeight/H);SC=s;stage.style.width=W*s+'px';stage.style.height=H*s+'px';stage.style.setProperty('--s',s);}
on(window,'resize',fit);fit();
let warmed=false;function warmPosters(){if(warmed)return;warmed=true;const ids=MOVIES.map(m=>m.id);let i=0;const step=()=>{if(i>=ids.length)return;poster(ids[i++]);setTimeout(step,30);};
  (document.fonts&&document.fonts.ready?Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,1500))]):Promise.resolve()).then(step);}
let last=performance.now();
function frame(now){if(DEAD)return;const dt=Math.min(.05,(now-last)/1000);last=now;update(dt);render();requestAnimationFrame(frame);}
requestAnimationFrame(frame);
const api={
  destroy(){DEAD=true;for(const[t,e,f,o]of LISTENERS)t.removeEventListener(e,f,o);try{AU.ac&&AU.ac.close();}catch(e){}},
  /** Live players (realtime). Each: {id,name,x,y,dir,moving,P,fav,recent}. */
  setRemotes(list){const seen=new Set();for(const r of list){seen.add(r.id);let a=remotes.get(r.id);
      if(!a){a={...r,tx:r.x,ty:r.y,anim:0,f:0,path:null};remotes.set(r.id,a);}
      Object.assign(a,{name:r.name,P:r.P,fav:r.fav,recent:r.recent,tx:r.x,ty:r.y,dir:r.dir,moving:r.moving});}
    for(const id of [...remotes.keys()])if(!seen.has(id))remotes.delete(id);},
  setDemoVisible(v){showDemo=!!v;if(!v&&STR.hoverNpc&&npcs.includes(STR.hoverNpc))hideNpc(true);},
  setShelf(id,ids){const s=SHELVES.find(x=>x.id===id);if(s&&ids&&ids.length)s.ids=ids.filter(i=>DB.get(i)).slice(0,7);},
  addMovies(list){list.forEach(m=>DB.add(m));},
  syncWatchlist:syncCont,
  get state(){return state},get ui(){return ui},
  get remotes(){return [...remotes.values()].map(r=>({id:r.id,name:r.name,x:Math.round(r.x),y:Math.round(r.y)}))},get hero(){return {x:Math.round(hero.x),y:Math.round(hero.y)}},
  skipTo(){Object.assign(S,{titleA:0,wheel:Math.PI*3,bolt:1,open:1,k:7,ks:1,L:1,wipe:1});AU.init();go('storeIn');},
  openSearch,openBoard,openReko,openDirect,pingAndWalk};
if(A.dev)window.__SV=api;
return api;
}
