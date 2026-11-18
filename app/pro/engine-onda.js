/* Structiar Voladura Pro · onda elemental (signature hole)
   Superposición lineal de la señal de un taladro para predecir la vibración de una secuencia
   y elegir el retardo que evita la interferencia constructiva. Método público (superposición
   lineal de señales, p. ej. Anderson; Blair), implementación propia de Structiar.
   Unidades: tiempo en s dentro de la señal, retardos en ms, velocidad en mm/s. */
(function(root){'use strict';
var PI=Math.PI,COMPS=['T','V','L'];
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
function rngF(seed){var s=(seed||11)>>>0;return function(){s=(s*1664525+1013904223)>>>0;return s/4294967296}}
function gaussF(rnd){return function(){var u=rnd()||1e-9,v=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*PI*v)}}

/* señal sintética de un taladro: oscilación amortiguada con frente de subida, una componente por eje */
function sintetica(o){o=o||{};var ppv=+o.ppv||50,f=+o.f||100,z=clamp(+o.amort||0.12,0.02,0.6),dur=clamp(+o.dur||0.08,0.01,1),dt=1/(+o.sps||4096),n=Math.round(dur/dt),comps={};
  var fac={T:1,V:0.8,L:0.65},fas={T:0,V:0.6,L:1.2};
  COMPS.forEach(function(k){var x=new Array(n),w=2*PI*f,tr=0.25/f;for(var i=0;i<n;i++){var t=i*dt;x[i]=fac[k]*(1-Math.exp(-t/tr))*Math.exp(-z*w*t)*Math.sin(w*t+fas[k])}comps[k]=x});
  var p=pico({dt:dt,comps:comps}),esc=ppv/(p.max||1);COMPS.forEach(function(k){comps[k]=comps[k].map(function(v){return v*esc})});
  return {dt:dt,comps:comps,nombre:'Señal sintética '+f+' Hz',sintetica:true}}

/* lectura de CSV exportado por sismógrafos (tiempo + 1 a 3 componentes) */
function parseCSV(txt,unidad){var lines=String(txt||'').split(/\r?\n/).filter(function(l){return l.trim()});if(lines.length<8)throw new Error('El archivo tiene muy pocas filas.');
  var mues=lines.slice(Math.min(5,lines.length-10),Math.min(lines.length,45)),todas=function(d){return mues.every(function(l){return l.indexOf(d)>=0})};
  var delim=todas(';')?';':todas('\t')?'\t':',';
  function num(s){s=String(s).trim().replace(/^"|"$/g,'');if(delim!==','&&/^-?\d+,\d+([eE][-+]?\d+)?$/.test(s))s=s.replace(',','.');return s===''?NaN:+s}
  var head=null,rows=[];
  lines.forEach(function(l){var c=l.split(delim);var v=c.map(num);var nn=v.filter(isFinite).length;
    if(nn>=2&&nn>=c.length-1)rows.push(v);else if(!rows.length)head=c.map(function(x){return x.trim().replace(/^"|"$/g,'').toLowerCase()})});
  if(rows.length<8)throw new Error('No se encontraron columnas numéricas.');
  var nc=rows[0].length,col=function(re){if(!head)return -1;for(var i=0;i<head.length;i++)if(re.test(head[i]))return i;return -1};
  var it=col(/^(t|time|tiempo|seg|sec|s)\b|time|tiempo/);
  if(it<0){var mono=true;for(var r=1;r<Math.min(rows.length,50);r++)if(!(rows[r][0]>rows[r-1][0])){mono=false;break}it=mono?0:-1}
  var map={T:col(/tran|trans|^x$|^t$(?!ime)|^r$/),V:col(/vert|^z$|^v$/),L:col(/long|^y$|^l$/)};
  var libres=[];for(var i=0;i<nc;i++)if(i!==it&&i!==map.T&&i!==map.V&&i!==map.L)libres.push(i);
  COMPS.forEach(function(k){if(map[k]<0||map[k]===it)map[k]=libres.length?libres.shift():-1});
  var dt;if(it>=0){var ds=[];for(var r2=1;r2<rows.length;r2++){var d=rows[r2][it]-rows[r2-1][it];if(d>0)ds.push(d)}ds.sort(function(a,b){return a-b});dt=ds[Math.floor(ds.length/2)];
    if((head&&head[it]&&/\(ms\)|\bms\b|mili/.test(head[it]))||dt>0.02)dt/=1000}
  if(!(dt>0))throw new Error('No se pudo leer la columna de tiempo. Revisa que la primera columna sea el tiempo.');
  var k=unidad==='in/s'?25.4:unidad==='m/s'?1000:unidad==='cm/s'?10:1,comps={};
  COMPS.forEach(function(c){if(map[c]>=0)comps[c]=rows.map(function(rw){var v=rw[map[c]];return isFinite(v)?v*k:0})});
  if(!Object.keys(comps).length)throw new Error('No se encontraron componentes de velocidad.');
  return {dt:dt,comps:comps,n:rows.length}}

function largo(sig){var n=0;for(var k in sig.comps)n=Math.max(n,sig.comps[k].length);return n}
function vector(sig,i){var s=0;for(var k in sig.comps){var v=sig.comps[k][i]||0;s+=v*v}return Math.sqrt(s)}
function pico(sig){var out={comp:{},max:0,pvs:0,tMax:0},n=largo(sig);for(var k in sig.comps){var m=0;sig.comps[k].forEach(function(v){if(Math.abs(v)>m)m=Math.abs(v)});out.comp[k]=m;if(m>out.max)out.max=m}
  for(var i=0;i<n;i++){var p=vector(sig,i);if(p>out.pvs){out.pvs=p;out.tMax=i*sig.dt}}return out}

/* quita la media, recorta a la ventana útil y lleva la señal a como máximo 4 kHz */
function preparar(sig,o){o=o||{};var n=largo(sig),c={},k;for(k in sig.comps){var x=sig.comps[k],m=0;var nb=Math.max(1,Math.min(x.length,Math.round(0.01/sig.dt)));for(var i=0;i<nb;i++)m+=x[i];m/=nb;c[k]=x.map(function(v){return v-m})}
  var s={dt:sig.dt,comps:c,nombre:sig.nombre},p=pico(s),thr=0.08*p.pvs,a=0,b=n-1;
  if(o.ini!=null||o.fin!=null){a=clamp(Math.round((+o.ini||0)/1000/sig.dt),0,n-2);b=clamp(o.fin!=null?Math.round(+o.fin/1000/sig.dt):n-1,a+1,n-1)}
  else{while(a<n-1&&vector(s,a)<thr)a++;while(b>a&&vector(s,b)<thr)b--;a=Math.max(0,a-Math.round(0.004/sig.dt));b=Math.min(n-1,b+Math.round(0.02/sig.dt))}
  var paso=Math.max(1,Math.round(0.00025/sig.dt)),dt=sig.dt*paso;
  for(k in c){var y=[];for(var j=a;j<=b;j+=paso){var acc=0,cn=0;for(var q=0;q<paso&&j+q<=b;q++){acc+=c[k][j+q];cn++}y.push(acc/cn)}c[k]=y}
  return {dt:dt,comps:c,nombre:sig.nombre,ini:a*sig.dt*1000,fin:b*sig.dt*1000,sintetica:sig.sintetica}}

/* superposición: tiempos en ms, escalas opcionales por taladro */
function superponer(sig,tiempos,escalas){var n=largo(sig),dt=sig.dt,t0=Math.min.apply(null,tiempos),sh=tiempos.map(function(t){return Math.round((t-t0)/1000/dt)}),L=n+Math.max.apply(null,sh),out={};
  for(var k in sig.comps){var x=sig.comps[k],y=new Float64Array(L);for(var h=0;h<sh.length;h++){var e=escalas?escalas[h]:1,o=sh[h];for(var i=0;i<x.length;i++)y[o+i]+=e*x[i]}out[k]=y}
  return {dt:dt,comps:out}}
function picoRapido(sig,modo){var best=0,ks=Object.keys(sig.comps),n=largo(sig);
  if(modo==='pvs'){for(var i=0;i<n;i++){var s=0;for(var j=0;j<ks.length;j++){var v=sig.comps[ks[j]][i]||0;s+=v*v}if(s>best)best=s}return Math.sqrt(best)}
  ks.forEach(function(k){if(modo&&modo!=='max'&&k!==modo)return;var x=sig.comps[k];for(var i=0;i<x.length;i++){var a=Math.abs(x[i]);if(a>best)best=a}});return best}

/* barrido de retardos entre taladros: amplificación nominal y con dispersión de detonadores (Monte Carlo).
   Suma en búferes reutilizados para no generar basura en memoria (importante en teléfonos). */
function barrido(sig,o){o=o||{};var n=clamp(Math.round(+o.n||6),2,60),dMin=Math.max(0.5,+o.dMin||1),dMax=Math.max(dMin+1,+o.dMax||40),paso=clamp(+o.paso||0.5,0.1,10),disp=Math.max(0,+o.disp||0),runs=disp>0?clamp(Math.round(+o.corridas||40),5,200):1,modo=o.modo||'pvs';
  if((dMax-dMin)/paso>300)paso=(dMax-dMin)/300;
  var ks=Object.keys(sig.comps).filter(function(k){return modo==='pvs'||modo==='max'||k===modo});if(!ks.length)ks=Object.keys(sig.comps);
  var xs=ks.map(function(k){return sig.comps[k]}),nx=largo(sig),dt=sig.dt,maxSh=Math.ceil((dMax*(n-1)*(1+4*disp/100)+dMax)/1000/dt)+2,Lb=nx+maxSh,buf=xs.map(function(){return new Float64Array(Lb)});
  function picoT(ts){var t0=Infinity,i,j,h;for(i=0;i<ts.length;i++)if(ts[i]<t0)t0=ts[i];var L=0,sh=new Array(ts.length);for(h=0;h<ts.length;h++){sh[h]=Math.min(maxSh-1,Math.max(0,Math.round((ts[h]-t0)/1000/dt)));if(sh[h]+nx>L)L=sh[h]+nx}
    for(j=0;j<xs.length;j++){var y=buf[j],x=xs[j];for(i=0;i<L;i++)y[i]=0;for(h=0;h<sh.length;h++){var o2=sh[h];for(i=0;i<x.length;i++)y[o2+i]+=x[i]}}
    var best=0;if(modo==='pvs'){for(i=0;i<L;i++){var q=0;for(j=0;j<buf.length;j++)q+=buf[j][i]*buf[j][i];if(q>best)best=q}return Math.sqrt(best)}
    for(j=0;j<buf.length;j++)for(i=0;i<L;i++){var a=Math.abs(buf[j][i]);if(a>best)best=a}return best}
  var u=picoRapido(sig,modo)||1,g=gaussF(rngF(o.seed||7)),pts=[],tn=new Array(n),ts=new Array(n),arr=new Float64Array(runs);
  for(var d=dMin;d<=dMax+1e-9;d+=paso){for(var i=0;i<n;i++)tn[i]=i*d;var an=picoT(tn)/u,p50=an,p95=an;
    if(disp>0){for(var r=0;r<runs;r++){for(var k=0;k<n;k++)ts[k]=tn[k]+g()*Math.max(tn[k],d)*disp/100;arr[r]=picoT(ts)/u}var srt=Array.prototype.slice.call(arr).sort(function(a,b){return a-b});p50=srt[Math.floor(runs*0.5)];p95=srt[Math.min(runs-1,Math.floor(runs*0.95))]}
    pts.push({d:Math.round(d*100)/100,a:an,p50:p50,p95:p95})}
  var orden=pts.slice().sort(function(a,b){return a.p95-b.p95||a.d-b.d}),peor=pts.reduce(function(m,p){return p.p95>m.p95?p:m},pts[0]);
  return {pts:pts,mejor:orden[0],top:orden.slice(0,5),peor:peor,ppvU:u,n:n,disp:disp,modo:modo,aMax:n}}

/* espectro de amplitud (FFT radix 2) y frecuencia dominante */
function fft(re,im){var n=re.length;for(var i=1,j=0;i<n;i++){var bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){var t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t}}
  for(var len=2;len<=n;len<<=1){var ang=-2*PI/len,wr=Math.cos(ang),wi=Math.sin(ang);for(var s=0;s<n;s+=len){var cr=1,ci=0;for(var k=0;k<len/2;k++){var a=s+k,b=a+len/2,xr=re[b]*cr-im[b]*ci,xi=re[b]*ci+im[b]*cr;re[b]=re[a]-xr;im[b]=im[a]-xi;re[a]+=xr;im[a]+=xi;var nr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=nr}}}}
function espectro(sig,comp){var ks=Object.keys(sig.comps),k=comp&&sig.comps[comp]?comp:ks.reduce(function(m,c){return pico({dt:1,comps:{x:sig.comps[c]}}).max>pico({dt:1,comps:{x:sig.comps[m]}}).max?c:m},ks[0]);
  var x=sig.comps[k],N=1;while(N<Math.max(1024,x.length))N<<=1;var re=new Float64Array(N),im=new Float64Array(N);
  for(var i=0;i<x.length;i++){var w=0.5-0.5*Math.cos(2*PI*i/(x.length-1||1));re[i]=x[i]*w}fft(re,im);
  var df=1/(N*sig.dt),f=[],a=[],best=0,fd=0;for(var j=1;j<N/2;j++){var fr=j*df;if(fr>500)break;var m=Math.hypot(re[j],im[j]);f.push(fr);a.push(m);if(fr>=3&&m>best){best=m;fd=fr}}
  var mx=Math.max.apply(null,a)||1;return {comp:k,f:f,a:a.map(function(v){return v/mx}),fDom:fd}}

/* escala la señal medida a otra carga y distancia con la ley PPV = K (D/√Q)^-β */
function escala(o){var ds0=(+o.D0||1)/Math.sqrt(+o.Q0||1),ds=(+o.D||1)/Math.sqrt(+o.Q||1);return Math.pow(ds/ds0,-(+o.beta||1.6))}

var API={sintetica:sintetica,parseCSV:parseCSV,preparar:preparar,pico:pico,superponer:superponer,picoRapido:picoRapido,barrido:barrido,espectro:espectro,escala:escala,largo:largo};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else{root.SVE=root.SVE||{};root.SVE.ONDA=API}
})(this);
