/* Structiar · visualización del disparo (implementación propia, canvas 2D, sin librerías).
   - frente(): sección del frente en 2D. Modos: tipo, periodo (tiempo), carga (kg/m³ local), dano, frag (X50 Kuz-Ram por zona).
     Con t (ms) simula el disparo: destello de cada barreno, la zona que rompe (celda de Voronoi del barreno) pasa a roca
     quebrada, nube de polvo y fragmentos lanzados hacia la cara libre (lo que ya salió antes).
   - galeria3d(): galería excavada, cara del frente y barrenos en perspectiva; se orbita arrastrando.
   - cuele(): detalle del arranque a escala real con secciones, burden B1/B2, diámetro equivalente y avance máximo.
   - grabar(): exporta la simulación a video (MediaRecorder sobre un canvas).
   Carga local: densidad de kernel gaussiano Σ (kg_i/avance)·N(r; σ) en kg/m³; su promedio en la sección es el factor de carga.
   X50 por zona: Kuz-Ram, X50 = A·K^-0,8·Q^(1/6)·(115/RWS)^(19/30) con K = kg del barreno / (área de su zona × L). */
(function(root){'use strict';
var PI=Math.PI,COL={arranque:'#E07B22',ayudas:'#D9A21B',destrozo:'#16A09A',contorno:'#2F6FD6',zapatera:'#8A4FD1',alivio:'#111',sequia:'#7A8794'};
/* forma por tipo (no depender solo del color): arranque círculo, ayudas círculo con punto, destrozo rombo, contorno anillo, zapatera cuadrado */
function marca(ctx,h,x,y,r){var t=h.t==='arranque'&&h.g==='Ayudas'?'ayudas':h.t;ctx.beginPath();
  if(t==='destrozo'){ctx.moveTo(x,y-r*1.25);ctx.lineTo(x+r*1.25,y);ctx.lineTo(x,y+r*1.25);ctx.lineTo(x-r*1.25,y);ctx.closePath()}else if(t==='zapatera'){ctx.rect(x-r,y-r,2*r,2*r)}else ctx.arc(x,y,r,0,2*PI);
  if(t==='contorno'){ctx.lineWidth=Math.max(2,r*0.55);ctx.strokeStyle=ctx.fillStyle;ctx.stroke();return}ctx.fill();if(t==='ayudas'){ctx.fillStyle='rgba(0,0,0,.55)';ctx.beginPath();ctx.arc(x,y,r*0.35,0,2*PI);ctx.fill()}}
var PCOL=['#FFD166','#F4A261','#9BE564','#57CC99','#38A3A5','#4C8BF5','#8E7CF0','#C77DFF','#FF7AA2','#F25C54'];
function holeCol(h){if(h.t==='alivio')return COL.alivio;if(h.g==='Ayudas')return COL.ayudas;return COL[h.t]||'#ccc'}
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
function lerp(a,b,t){return a+(b-a)*t}
function ramp(stops,t){t=clamp(t,0,1);var n=stops.length-1,i=Math.min(n-1,Math.floor(t*n)),f=t*n-i,a=stops[i],b=stops[i+1];return 'rgb('+Math.round(lerp(a[0],b[0],f))+','+Math.round(lerp(a[1],b[1],f))+','+Math.round(lerp(a[2],b[2],f))+')'}
var R_CARGA=[[28,16,52],[96,30,110],[176,52,100],[232,104,56],[252,186,60],[252,240,160]],R_FRAG=[[44,123,182],[120,190,200],[250,230,140],[245,150,70],[200,40,40]];
function dentro(g,x,y){var r=g.W/2;if(y<0||Math.abs(x)>r)return false;if(g.forma==='rect')return y<=g.H;var h=g.H-r;if(y<=h)return true;return Math.hypot(x,y-h)<=r}
function perfil(g,n){var r=g.W/2,h=g.H-r,P=[[-r,0],[r,0]];if(g.forma==='rect'){P.push([r,g.H],[-r,g.H]);return P}P.push([r,h]);for(var i=1;i<n;i++){var a=PI*i/n;P.push([r*Math.cos(a),h+r*Math.sin(a)])}P.push([-r,h]);return P}
function rnd(seed){var s=seed>>>0||1;return function(){s=(s*1664525+1013904223)>>>0;return s/4294967296}}
/* ---------- malla de cálculo (se guarda por diseño) ---------- */
var cache={key:null,G:null};
function malla(R){var g=R.d.geom,key=JSON.stringify([g,R.holes.length,R.kg,R.d.malla,R.d.corte]);if(cache.key===key)return cache.G;
  var res=Math.max(0.03,Math.min(g.W,g.H)/90),nx=Math.ceil(g.W/res),ny=Math.ceil(g.H/res),N=nx*ny,x0=-g.W/2,L=Math.max(0.3,+R.av||+g.L||1),/* volumen quebrado por metro de avance: el promedio del mapa = factor de carga del diseño */
    ch=R.holes.map(function(h,i){return {i:i,h:h}}).filter(function(o){return o.h.kg>0&&o.h.t!=='alivio'}),own=new Int16Array(N).fill(-1),den=new Float32Array(N),ins=new Uint8Array(N),
    B=Math.max(0.3,+R.d.malla.B||0.8),sg=B/1.6,area=new Float64Array(R.holes.length),dmax=0;
  for(var j=0;j<ny;j++)for(var i=0;i<nx;i++){var k=j*nx+i,x=x0+(i+0.5)*res,y=(j+0.5)*res;if(!dentro(g,x,y))continue;ins[k]=1;var best=1e9,bi=-1,d=0;
    for(var q=0;q<ch.length;q++){var h=ch[q].h,dx=x-h.x,dy=y-h.y,r2=dx*dx+dy*dy;if(r2<best){best=r2;bi=ch[q].i}d+=(h.kg/L)*Math.exp(-r2/(2*sg*sg))/(2*PI*sg*sg)}
    own[k]=bi;den[k]=d;if(d>dmax)dmax=d;if(bi>=0)area[bi]+=res*res}
  /* la carga de los barrenos del contorno no se pierde fuera del perfil: se reescala para que todo el explosivo quede en la sección */
  var tot=0;for(var k1=0;k1<N;k1++)if(ins[k1])tot+=den[k1]*res*res;var esc=tot>0?(R.kg/L)/tot:1;dmax=0;for(var k3=0;k3<N;k3++){den[k3]*=esc;if(den[k3]>dmax)dmax=den[k3]}
  var A=R.frag&&R.frag.A?R.frag.A:6,rws=R.prod&&R.prod.rws?R.prod.rws:100,x50=new Float64Array(R.holes.length),xmin=1e9,xmax=0;
  ch.forEach(function(o){var K=o.h.kg/Math.max(0.01,area[o.i]*L),X=A*Math.pow(K,-0.8)*Math.pow(o.h.kg,1/6)*Math.pow(115/rws,19/30);x50[o.i]=X;if(X<xmin)xmin=X;if(X>xmax)xmax=X});
  /* centroide de cada zona (para la dirección de lanzamiento) */
  var cx=new Float64Array(R.holes.length),cy=new Float64Array(R.holes.length),cn=new Float64Array(R.holes.length);
  for(var k2=0;k2<N;k2++){if(own[k2]<0)continue;var o2=own[k2];cx[o2]+=x0+((k2%nx)+0.5)*res;cy[o2]+=(Math.floor(k2/nx)+0.5)*res;cn[o2]++}
  var G={res:res,nx:nx,ny:ny,x0:x0,own:own,den:den,ins:ins,dmax:dmax,area:area,x50:x50,xmin:xmin,xmax:xmax,cx:cx,cy:cy,cn:cn,L:L,prom:R.kg/(R.A*L)};
  cache={key:key,G:G};return G}
/* dirección hacia la cara libre: hacia lo que ya salió antes que el barreno (o el alivio si es el primero) */
function libre(R,G,i){var h=R.holes[i],sx=0,sy=0,n=0;R.holes.forEach(function(o,j){if(j===i)return;if(o.t==='alivio'||(o.ms!=null&&h.ms!=null&&o.ms<h.ms&&G.cn[j])){var px=o.t==='alivio'?o.x:G.cx[j]/G.cn[j],py=o.t==='alivio'?o.y:G.cy[j]/G.cn[j],w=1/Math.max(0.05,Math.hypot(px-h.x,py-h.y));sx+=px*w*w;sy+=py*w*w;n+=w*w}});
  if(!n)return [0,1];var tx=sx/n-h.x,ty=sy/n-h.y,m=Math.hypot(tx,ty)||1;return [tx/m,ty/m]}
/* ---------- frente 2D ---------- */
function frente(cv,R,o){o=o||{};var g=R.d.geom,ctx=cv.getContext('2d'),W=cv.width,H=cv.height,pad=0.55,s=Math.min(W/(g.W+2*pad),H/(g.H+2*pad+0.35)),ox=W/2,oy=H-(pad+0.2)*s;
  function X(x){return ox+x*s}function Y(y){return oy-y*s}var G=malla(R),t=o.t,modo=o.modo||'tipo';
  ctx.save();ctx.fillStyle='#14100c';ctx.fillRect(0,0,W,H);
  /* roca alrededor */
  var rg=ctx.createRadialGradient(ox,Y(g.H/2),s*0.5,ox,Y(g.H/2),s*Math.max(g.W,g.H));rg.addColorStop(0,'#2b231b');rg.addColorStop(1,'#16110d');ctx.fillStyle=rg;ctx.fillRect(0,0,W,H);
  var P=perfil(g,48);ctx.beginPath();P.forEach(function(p,i){i?ctx.lineTo(X(p[0]),Y(p[1])):ctx.moveTo(X(p[0]),Y(p[1]))});ctx.closePath();ctx.save();ctx.clip();
  ctx.fillStyle='#5a4532';ctx.fillRect(0,0,W,H);
  var cs=G.res*s+0.6,fired=function(i){return t!=null&&R.holes[i]&&R.holes[i].ms!=null&&R.holes[i].ms<=t};
  for(var k=0;k<G.own.length;k++){if(!G.ins[k])continue;var px=X(G.x0+(k%G.nx)*G.res),py=Y((Math.floor(k/G.nx)+1)*G.res),ow=G.own[k],c=null;
    if(modo==='carga')c=ramp(R_CARGA,G.den[k]/(G.dmax||1));
    else if(modo==='frag'&&ow>=0)c=ramp(R_FRAG,(G.x50[ow]-G.xmin)/((G.xmax-G.xmin)||1));
    else if(modo==='periodo'&&ow>=0&&R.holes[ow].p)c=PCOL[(R.holes[ow].p-1)%PCOL.length];
    if(t!=null&&ow>=0&&fired(ow)){var age=t-R.holes[ow].ms,ii=k%G.nx,jj=Math.floor(k/G.nx),hv=Math.sin(ii*12.9898+jj*78.233)*43758.5453,hsh=hv-Math.floor(hv);c=age<45?'#c9783a':'rgb('+Math.round(30+hsh*30)+','+Math.round(24+hsh*22)+','+Math.round(20+hsh*16)+')'}
    if(c){ctx.globalAlpha=modo==='periodo'&&!(t!=null&&ow>=0&&fired(ow))?0.35:1;ctx.fillStyle=c;ctx.fillRect(px,py,cs,cs);ctx.globalAlpha=1}}
  /* polvo y fragmentos */
  if(t!=null)R.holes.forEach(function(h,i){if(h.ms==null||h.kg<=0||h.ms>t)return;var age=t-h.ms;
    if(age<1100){var rr=s*(0.25+Math.min(1,age/500)*0.9),gr=ctx.createRadialGradient(X(h.x),Y(h.y),0,X(h.x),Y(h.y),rr);gr.addColorStop(0,'rgba(210,205,195,'+(0.55*(1-age/1100)).toFixed(3)+')');gr.addColorStop(1,'rgba(210,205,195,0)');ctx.fillStyle=gr;ctx.beginPath();ctx.arc(X(h.x),Y(h.y),rr,0,2*PI);ctx.fill()}
    if(age<650){var d=libre(R,G,i),r=rnd(i*7919+13);ctx.fillStyle='#e8a253';for(var p=0;p<16;p++){var v=0.6+r()*1.6,a=(r()-0.5)*1.4,dx=d[0]*Math.cos(a)-d[1]*Math.sin(a),dy=d[0]*Math.sin(a)+d[1]*Math.cos(a),tt=age/1000,
        fx=h.x+dx*v*tt*2.2,fy=h.y+dy*v*tt*2.2-2.5*tt*tt;ctx.globalAlpha=1-age/650;ctx.fillRect(X(fx)-1.5,Y(fy)-1.5,3,3)}ctx.globalAlpha=1}});
  ctx.restore();
  ctx.lineWidth=2;ctx.strokeStyle='#C9B79C';ctx.beginPath();P.forEach(function(p,i){i?ctx.lineTo(X(p[0]),Y(p[1])):ctx.moveTo(X(p[0]),Y(p[1]))});ctx.closePath();ctx.stroke();
  /* daño en el contorno */
  if(modo==='dano'&&R.dano){ctx.fillStyle='rgba(229,72,77,.22)';ctx.strokeStyle='rgba(229,72,77,.6)';R.holes.forEach(function(h){if(h.t==='contorno'||h.t==='zapatera'){ctx.beginPath();ctx.arc(X(h.x),Y(h.y),R.dano.rRot*s,0,2*PI);ctx.fill();ctx.stroke()}})}
  /* barrenos */
  var maxKg=R.holes.reduce(function(m,h){return Math.max(m,h.kg||0)},0.01),rad=Math.max(4,(+R.d.malla.d||38)/1000*s*1.5);
  ctx.font='600 '+Math.max(9,Math.round(s*0.12))+'px "IBM Plex Mono",monospace';ctx.textAlign='center';
  R.holes.forEach(function(h,i){var x=X(h.x),y=Y(h.y),c=holeCol(h),r=rad,lit=t==null||h.t==='alivio'||fired(i);
    if(modo==='periodo'&&h.p)c=PCOL[(h.p-1)%PCOL.length];if(modo==='carga'&&h.kg>0)r=rad*(0.7+0.7*h.kg/maxKg);
    if(t!=null&&fired(i)&&t-h.ms<140){var a=(t-h.ms)/140;ctx.fillStyle='rgba(255,225,140,'+(0.8*(1-a)).toFixed(3)+')';ctx.beginPath();ctx.arc(x,y,r*(1.5+a*3),0,2*PI);ctx.fill()}
    ctx.globalAlpha=lit?1:0.35;if(h.t==='alivio'){ctx.fillStyle='#0a0a0a';ctx.beginPath();ctx.arc(x,y,r,0,2*PI);ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#fff';ctx.stroke()}else{ctx.fillStyle=c;marca(ctx,h,x,y,r);if(h.t!=='contorno'){ctx.lineWidth=1;ctx.strokeStyle=o.sel===i?'#fff':'rgba(0,0,0,.6)';ctx.stroke()}}ctx.globalAlpha=1;
    var lbl=modo==='periodo'&&h.p?String(h.p):modo==='carga'&&h.kg>0?h.kg.toFixed(1):modo==='frag'&&G.x50[i]?(G.x50[i]).toFixed(1):'';
    if(lbl){ctx.lineWidth=3;ctx.strokeStyle='rgba(0,0,0,.85)';ctx.strokeText(lbl,x,y-r-3);ctx.fillStyle='#fff';ctx.fillText(lbl,x,y-r-3)}});
  /* cotas */
  ctx.fillStyle='#d9cdbb';ctx.font=Math.max(10,Math.round(s*0.13))+'px "IBM Plex Mono",monospace';ctx.textAlign='center';ctx.fillText(g.W.toFixed(2)+' m',ox,Y(0)+Math.max(14,s*0.28));
  ctx.save();ctx.translate(X(-g.W/2)-Math.max(12,s*0.22),Y(g.H/2));ctx.rotate(-PI/2);ctx.fillText(g.H.toFixed(2)+' m',0,0);ctx.restore();
  /* rótulo del instante */
  if(t!=null){var fs=R.holes.filter(function(h,i){return h.kg>0&&fired(i)}),kg=fs.reduce(function(a,h){return a+h.kg},0),last=fs.sort(function(a,b){return b.ms-a.ms})[0],
      tot=R.holes.filter(function(h){return h.kg>0}).length,txt='t '+Math.round(t)+' ms'+(last?' · P'+last.p+' '+last.g.toLowerCase():'')+' · '+fs.length+'/'+tot+' barrenos · '+kg.toFixed(1)+' kg';
    ctx.font='600 '+Math.max(11,Math.round(W/48))+'px "IBM Plex Mono",monospace';var tw=ctx.measureText(txt).width+22;ctx.fillStyle='rgba(10,14,18,.85)';ctx.strokeStyle='#E8A23A';ctx.lineWidth=1.5;
    var bx=W/2-tw/2,by=8,bh=Math.max(22,W/34);ctx.beginPath();if(ctx.roundRect)ctx.roundRect(bx,by,tw,bh,bh/2);else ctx.rect(bx,by,tw,bh);ctx.fill();ctx.stroke();ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText(txt,W/2,by+bh*0.68)}
  ctx.restore();return G}
/* ---------- galería 3D ---------- */
function galeria3d(cv,R,o){o=o||{};var g=R.d.geom,ctx=cv.getContext('2d'),W=cv.width,H=cv.height,t=o.t,cam=o.cam||{yaw:-0.75,pitch:0.32,zoom:1},L=+g.L||3,Lg=Math.max(3,g.W*1.3),av=R.av||L*0.9,
    span=Math.max(g.W,g.H,L+Lg),tg=[0,g.H*0.42,(L-Lg)*0.3],dist=span*1.45/cam.zoom,cy=Math.cos(cam.yaw),sy=Math.sin(cam.yaw),cp=Math.cos(cam.pitch),sp=Math.sin(cam.pitch),f=Math.min(W*0.62,H*1.05);
  function pr(p){var x=p[0]-tg[0],y=p[1]-tg[1],z=p[2]-tg[2],x1=x*cy-z*sy,z1=x*sy+z*cy,y2=y*cp-z1*sp,z2=y*sp+z1*cp+dist;return [W/2+f*x1/z2,H*0.55-f*y2/z2,z2]}
  ctx.save();var bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#0f1820');bg.addColorStop(1,'#0a0f14');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  /* piso con grilla */
  ctx.strokeStyle='rgba(120,150,170,.16)';ctx.lineWidth=1;for(var gx=-6;gx<=6;gx++){var a=pr([gx,0,-Lg-2]),b=pr([gx,0,L+3]);ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke()}
  for(var gz=-Lg-2;gz<=L+3;gz++){var c=pr([-6,0,gz]),d=pr([6,0,gz]);ctx.beginPath();ctx.moveTo(c[0],c[1]);ctx.lineTo(d[0],d[1]);ctx.stroke()}
  var P=perfil(g,28),bw=g.W/2+1.1,bh=g.H+1.0;
  /* bloque de roca por desarrollar (caras traslúcidas, de atrás hacia adelante) */
  var V=[[-bw,0,0],[bw,0,0],[bw,bh,0],[-bw,bh,0],[-bw,0,L+1],[bw,0,L+1],[bw,bh,L+1],[-bw,bh,L+1]].map(pr),F=[[0,1,2,3],[4,5,6,7],[0,3,7,4],[1,2,6,5],[3,2,6,7]];
  F.map(function(fc){return {fc:fc,z:fc.reduce(function(a,i){return a+V[i][2]},0)/4}}).sort(function(a,b){return b.z-a.z}).forEach(function(q){ctx.beginPath();q.fc.forEach(function(i,k){k?ctx.lineTo(V[i][0],V[i][1]):ctx.moveTo(V[i][0],V[i][1])});ctx.closePath();ctx.fillStyle='rgba(120,92,64,.20)';ctx.fill();ctx.strokeStyle='rgba(201,183,156,.35)';ctx.stroke()});
  /* galería excavada (hacia atrás) */
  ctx.strokeStyle='rgba(232,190,110,.55)';for(var zz=-Lg;zz<=0;zz+=Lg/5){ctx.beginPath();P.forEach(function(p,i){var q=pr([p[0],p[1],zz]);i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1])});ctx.closePath();ctx.stroke()}
  P.forEach(function(p,i){if(i%3)return;var a=pr([p[0],p[1],-Lg]),b=pr([p[0],p[1],0]);ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke()});
  /* avance que ya rompió (simulación) */
  var tot=R.holes.reduce(function(a,h){return a+(h.kg||0)},0)||1,done=t==null?0:R.holes.reduce(function(a,h){return a+(h.ms!=null&&h.ms<=t?h.kg:0)},0)/tot;
  if(done>0){var z1=av*done;ctx.fillStyle='rgba(242,163,58,.16)';ctx.beginPath();P.forEach(function(p,i){var q=pr([p[0],p[1],z1]);i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1])});ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(242,163,58,.8)';ctx.stroke()}
  /* cara del frente */
  ctx.lineWidth=2;ctx.strokeStyle='#7fd3e6';ctx.beginPath();P.forEach(function(p,i){var q=pr([p[0],p[1],0]);i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1])});ctx.closePath();ctx.stroke();ctx.lineWidth=1;
  /* barrenos: del collar al fondo, con desvío del contorno hacia afuera */
  var hs=R.holes.map(function(h,i){var lo=h.t==='contorno'?0.12:h.t==='zapatera'?0.08:0,nx=h.t==='zapatera'?0:Math.sign(h.x)*(Math.abs(h.x)>g.W/2-0.3?1:0),ny=h.t==='zapatera'?-1:(h.t==='contorno'&&h.y>g.H-g.W/2?1:0),m=Math.hypot(nx,ny)||1;
      var a=pr([h.x,h.y,0]),b=pr([h.x+lo*nx/m,h.y+lo*ny/m,h.t==='alivio'?L*1.02:L]);return {h:h,i:i,a:a,b:b,z:(a[2]+b[2])/2}}).sort(function(a,b){return b.z-a.z});
  hs.forEach(function(q){var h=q.h,c=o.modo==='periodo'&&h.p?PCOL[(h.p-1)%PCOL.length]:holeCol(h),lit=t!=null&&h.ms!=null&&h.ms<=t,glow=lit&&t-h.ms<160;
    ctx.globalAlpha=t!=null&&!lit&&h.t!=='alivio'?0.35:1;ctx.lineWidth=glow?4:2.2;ctx.strokeStyle=h.t==='alivio'?'#e6e6e6':glow?'#ffe08a':c;ctx.beginPath();ctx.moveTo(q.a[0],q.a[1]);ctx.lineTo(q.b[0],q.b[1]);ctx.stroke();
    ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(q.a[0],q.a[1],glow?4:2.2,0,2*PI);ctx.fill();ctx.globalAlpha=1});
  /* fragmentos que salen de la cara hacia la galería */
  if(t!=null)R.holes.forEach(function(h,i){if(h.ms==null||h.kg<=0||h.ms>t||t-h.ms>700)return;var age=(t-h.ms)/1000,r=rnd(i*104729+7);ctx.fillStyle='rgba(232,162,83,'+(1-age/0.7).toFixed(2)+')';
    for(var p=0;p<10;p++){var v=1.5+r()*3,q=pr([h.x+(r()-0.5)*0.6*age*3,h.y+(r()-0.3)*age*2-4*age*age,-v*age*2.2]);ctx.fillRect(q[0]-1.5,q[1]-1.5,3,3)}});
  /* rótulos */
  ctx.font='600 '+Math.max(10,Math.round(W/55))+'px "IBM Plex Mono",monospace';ctx.textAlign='center';
  function lab(p,txt,col){var q=pr(p);ctx.fillStyle=col;ctx.fillText(txt,q[0],q[1])}
  lab([0,g.H+0.45,-Lg*0.7],'GALERÍA EXCAVADA','#e0c996');lab([0,bh+1.0,L+0.8],'ROCA POR DESARROLLAR','#e0c996');lab([0,g.H+0.35,0],'▼ CARA DEL FRENTE','#7fd3e6');lab([bw+0.2,0.1,L*0.5],'AVANCE '+av.toFixed(2)+' m','#F2A33A');
  ctx.restore()}
function orbitar(cv,cam,redraw){var on=false,lx=0,ly=0;cv.style.touchAction='none';
  cv.addEventListener('pointerdown',function(e){on=true;lx=e.clientX;ly=e.clientY;cv.setPointerCapture&&cv.setPointerCapture(e.pointerId)});
  cv.addEventListener('pointermove',function(e){if(!on)return;cam.yaw+=(e.clientX-lx)*0.008;cam.pitch=clamp(cam.pitch+(e.clientY-ly)*0.006,-0.15,1.2);lx=e.clientX;ly=e.clientY;redraw()});
  ['pointerup','pointercancel','pointerleave'].forEach(function(ev){cv.addEventListener(ev,function(){on=false})});
  cv.addEventListener('wheel',function(e){e.preventDefault();cam.zoom=clamp(cam.zoom*(e.deltaY<0?1.1:0.91),0.5,3);redraw()},{passive:false})}
/* ---------- detalle del cuele a escala real ---------- */
function cuele(cv,R){var ctx=cv.getContext('2d'),W=cv.width,H=cv.height,C=R.corte,cx=R.cx,cy=R.cy,secs=(C&&C.secs)||[],ult=secs[Math.min(1,secs.length-1)]||{dist:0.5,W:0.7},
    ext=(ult.W||ult.dist*1.4)*0.95+0.12,s=Math.min(W,H)/(2*ext),ox=W/2,oy=H/2;function X(x){return ox+(x-cx)*s}function Y(y){return oy-(y-cy)*s}
  ctx.save();ctx.fillStyle='#14100c';ctx.fillRect(0,0,W,H);var rg=ctx.createRadialGradient(ox,oy,0,ox,oy,ext*s);rg.addColorStop(0,'#4a3826');rg.addColorStop(1,'#1d1610');ctx.fillStyle=rg;ctx.beginPath();ctx.arc(ox,oy,ext*s,0,2*PI);ctx.fill();
  ctx.font='600 '+Math.max(11,Math.round(W/40))+'px "IBM Plex Mono",monospace';ctx.textAlign='center';
  secs.slice(0,2).forEach(function(q,k){var a=q.ang||0,hw=q.W/2;ctx.save();ctx.translate(X(cx),Y(cy));ctx.rotate(-a);ctx.setLineDash([6,5]);ctx.strokeStyle=k?'rgba(127,211,230,.7)':'rgba(242,163,58,.8)';ctx.lineWidth=1.5;ctx.strokeRect(-hw*s,-hw*s,hw*2*s,hw*2*s);ctx.restore();ctx.setLineDash([])});
  var al=R.holes.filter(function(h){return h.t==='alivio'}),ar=R.holes.filter(function(h){return h.t==='arranque'&&h.sec&&h.sec<=2}),dA=(+R.d.corte.dAliv||64)/1000,dB=(+R.d.malla.d||38)/1000;
  al.forEach(function(h){ctx.fillStyle='#050505';ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(X(h.x),Y(h.y),Math.max(5,dA/2*s),0,2*PI);ctx.fill();ctx.stroke()});
  ar.forEach(function(h){var r=Math.max(4,dB/2*s*1.6);ctx.fillStyle=h.sec===1?'#F2A33A':'#F6C76B';ctx.beginPath();ctx.arc(X(h.x),Y(h.y),r,0,2*PI);ctx.fill();ctx.strokeStyle='#000';ctx.lineWidth=1;ctx.stroke();ctx.lineWidth=3;ctx.strokeStyle='rgba(0,0,0,.85)';ctx.strokeText('P'+(h.p||h.sec),X(h.x),Y(h.y)-r-4);ctx.fillStyle='#fff';ctx.fillText('P'+(h.p||h.sec),X(h.x),Y(h.y)-r-4)});
  /* cotas de burden: del borde del alivio al barreno de cada sección */
  function cota(h,txt,col){if(!h)return;var a=[X(cx),Y(cy)],b=[X(h.x),Y(h.y)];ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
    var mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2-14;ctx.save();ctx.fillStyle='rgba(10,14,18,.8)';var tw=ctx.measureText(txt).width+10;ctx.fillRect(mx-tw/2,my-11,tw,18);ctx.restore();ctx.fillText(txt,mx,my+3)}
  var s1=ar.filter(function(h){return h.sec===1}).sort(function(a,b){return (b.x-a.x)||(a.y-b.y)})[0],s2=ar.filter(function(h){return h.sec===2}).sort(function(a,b){return (b.x+b.y)-(a.x+a.y)})[0];
  cota(s1,'B1 '+(C.B1||0).toFixed(2)+' m','#F2A33A');cota(s2,'B2 '+(C.B2||0).toFixed(2)+' m','#7fd3e6');
  /* barra de escala 10 cm */
  var sb=0.1*s;ctx.strokeStyle='#d9cdbb';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(W-20-sb,H-18);ctx.lineTo(W-20,H-18);ctx.stroke();ctx.fillStyle='#d9cdbb';ctx.textAlign='right';ctx.fillText('10 cm',W-20,H-26);
  ctx.textAlign='left';ctx.fillText('Ø equivalente '+Math.round((R.phiEq||0)*1000)+' mm → avance máx. '+(R.Lmax||0).toFixed(2)+' m',14,H-14);ctx.restore()}
/* ---------- exportar a video ---------- */
function soportaVideo(){return typeof MediaRecorder!=='undefined'&&!!HTMLCanvasElement.prototype.captureStream}
function grabar(cv,dibujar,fin,op){op=op||{};var lento=op.lento||10,fps=op.fps||30;return new Promise(function(res,rej){if(!soportaVideo()){rej(new Error('Este navegador no permite grabar video'));return}
  var tipos=['video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm'],mime=tipos.filter(function(m){return MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(m)})[0]||'';
  var st=cv.captureStream(fps),rec=new MediaRecorder(st,mime?{mimeType:mime,videoBitsPerSecond:6e6}:{videoBitsPerSecond:6e6}),ch=[];rec.ondataavailable=function(e){if(e.data&&e.data.size)ch.push(e.data)};
  rec.onstop=function(){res({blob:new Blob(ch,{type:mime||'video/webm'}),ext:/mp4/.test(mime)?'mp4':'webm'})};rec.onerror=function(e){rej(e.error||e)};
  var dur=fin*lento+1500,t0=null;rec.start(200);(function step(now){if(t0==null)t0=now;var el=now-t0,t=Math.min(fin,Math.max(0,(el-400)/lento));dibujar(t,el/dur);if(op.progreso)op.progreso(Math.min(1,el/dur));
    if(el<dur)requestAnimationFrame(step);else rec.stop()})(performance.now())})}
var API={frente:frente,galeria3d:galeria3d,orbitar:orbitar,cuele:cuele,grabar:grabar,soportaVideo:soportaVideo,malla:malla,PCOL:PCOL};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else{root.SVE=root.SVE||{};root.SVE.VIZ=API}
})(this);
