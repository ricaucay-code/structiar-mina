/* Structiar Voladura Pro · calibración con datos de la mina (implementación propia)
   1) Ley de vibración del sitio con límite de predicción al 95 % y carga admisible por retardo.
   2) Modelo de la mina: regresión regularizada (ridge) con pocos disparos; bosque aleatorio desde ~100 disparos.
   3) Perfil medido (distanciómetro desde el eje o puntos x,y de teléfono/LiDAR) contra el perfil de diseño.
   4) Anillos según lo perforado: desviación real de cada taladro y error de burden y espaciamiento al fondo. */
(function(root){'use strict';
var PI=Math.PI;
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
function mean(a){return a.length?a.reduce(function(s,v){return s+v},0)/a.length:0}
/* cuantil t de Student (dos colas 95 %) aproximado para gl ≥ 1 */
function t975(df){var T=[0,12.71,4.30,3.18,2.78,2.57,2.45,2.36,2.31,2.26,2.23,2.20,2.18,2.16,2.14,2.13,2.12,2.11,2.10,2.09,2.09];if(df<1)return 12.71;if(df<=20)return T[Math.round(df)];if(df<=30)return 2.09-(df-20)*0.0035;if(df<=60)return 2.04-(df-30)*0.0007;return 1.96+0.04*60/df*0.5}

/* ---------- 1) vibración ---------- */
function vib95(lect){var pts=(lect||[]).filter(function(s){return +s.ppv>0&&+s.dist>0&&+s.q>0});if(pts.length<3)return null;
  var X=pts.map(function(s){return Math.log(s.dist/Math.sqrt(s.q))}),Y=pts.map(function(s){return Math.log(s.ppv)}),n=X.length,mx=mean(X),my=mean(Y),sxx=0,sxy=0,syy=0,i;
  for(i=0;i<n;i++){sxx+=(X[i]-mx)*(X[i]-mx);sxy+=(X[i]-mx)*(Y[i]-my);syy+=(Y[i]-my)*(Y[i]-my)}if(!sxx)return null;
  var b=sxy/sxx,a=my-b*mx,sse=0;for(i=0;i<n;i++){var e=Y[i]-(a+b*X[i]);sse+=e*e}var s=n>2?Math.sqrt(sse/(n-2)):0,t=t975(n-2);
  var sds=pts.map(function(p){return p.dist/Math.sqrt(p.q)});
  function ppv95(sd){var x=Math.log(sd),se=s*Math.sqrt(1+1/n+(x-mx)*(x-mx)/sxx);return Math.exp(a+b*x+t*se)}
  function ppvMed(sd){return Math.exp(a+b*Math.log(sd))}
  function qAdm95(dist,lim){var lo=1e-3,hi=1e5;if(ppv95(dist/Math.sqrt(lo))>lim)return 0;for(var k=0;k<80;k++){var m=Math.sqrt(lo*hi);if(ppv95(dist/Math.sqrt(m))>lim)hi=m;else lo=m}return lo}
  return {K:Math.exp(a),beta:-b,r2:syy?sxy*sxy/(sxx*syy):0,n:n,s:s,t:t,sdMin:Math.min.apply(null,sds),sdMax:Math.max.apply(null,sds),ppv95:ppv95,ppvMed:ppvMed,qAdm95:qAdm95,
    fiable:n>=20?'buena':n>=8?'preliminar':'insuficiente'}}
/* CSV de lecturas: columnas fecha, distancia, kg por retardo, PPV (encabezados en español o inglés) */
function parseSismos(txt){var L=String(txt||'').split(/\r?\n/).filter(function(l){return l.trim()});if(L.length<2)throw new Error('El archivo no tiene filas.');
  var dl=L[0].indexOf(';')>=0?';':L[0].indexOf('\t')>=0?'\t':',',h=L[0].split(dl).map(function(x){return x.trim().toLowerCase().replace(/^"|"$/g,'')});
  function col(re){for(var i=0;i<h.length;i++)if(re.test(h[i]))return i;return -1}
  var cF=col(/fecha|date/),cD=col(/dist/),cQ=col(/kg|carga|charge|q\b|mic/),cP=col(/ppv|pvs|vel|mm\/s/);if(cD<0||cQ<0||cP<0)throw new Error('Se necesitan columnas de distancia, kg por retardo y PPV.');
  function nm(v){v=String(v==null?'':v).trim().replace(/^"|"$/g,'');if(dl!==','&&/^-?\d+,\d+$/.test(v))v=v.replace(',','.');return +v}
  return L.slice(1).map(function(l){var c=l.split(dl);return {fecha:cF>=0?String(c[cF]||'').trim().replace(/^"|"$/g,'').slice(0,10):'',dist:nm(c[cD]),q:nm(c[cQ]),ppv:nm(c[cP])}}).filter(function(o){return o.dist>0&&o.q>0&&o.ppv>0})}

/* ---------- 2) modelo de la mina ---------- */
var FEATS=[['L','Largo perforado'],['B','Burden'],['E','Espaciamiento'],['contRatio','Carga de contorno / 90·d²'],['EV','E/V del contorno'],['rmr','RMR'],['fc','Factor de carga del diseño'],['kgm3','Factor de carga real'],['phi','Alivio equivalente']];
function filaDe(x){var d=x.dis||{},v={L:+x.perf||+d.L,B:+d.B,E:+d.E,contRatio:+d.contRatio,EV:+d.EV,rmr:+d.rmr,fc:+d.fc,kgm3:x.kgm3!=null?+x.kgm3:null,phi:+d.phi};return v}
function solve(A,b){var n=b.length,M=A.map(function(r,i){return r.concat([b[i]])});for(var c=0;c<n;c++){var p=c;for(var r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;var tmp=M[c];M[c]=M[p];M[p]=tmp;if(Math.abs(M[c][c])<1e-12)continue;
    for(r=0;r<n;r++){if(r===c)continue;var f=M[r][c]/M[c][c];for(var k=c;k<=n;k++)M[r][k]-=f*M[c][k]}}return M.map(function(r,i){return Math.abs(r[i])<1e-12?0:r[n]/r[i]})}
function ridgeFit(X,y,lam){var p=X[0].length,mu=[],sd=[],j,i;for(j=0;j<p;j++){var col=X.map(function(r){return r[j]});mu[j]=mean(col);sd[j]=Math.sqrt(mean(col.map(function(v){return (v-mu[j])*(v-mu[j])})))||1}
  var Z=X.map(function(r){return r.map(function(v,j){return (v-mu[j])/sd[j]})}),ym=mean(y),A=[],bb=[];for(j=0;j<p;j++){A.push([]);for(var k=0;k<p;k++){var s=0;for(i=0;i<Z.length;i++)s+=Z[i][j]*Z[i][k];A[j].push(s+(j===k?lam:0))}var t=0;for(i=0;i<Z.length;i++)t+=Z[i][j]*(y[i]-ym);bb.push(t)}
  var w=solve(A,bb);return {pred:function(r){var s=ym;for(var j=0;j<p;j++)s+=w[j]*((r[j]-mu[j])/sd[j]);return s},w:w,mu:mu,sd:sd}}
/* árboles de regresión para el bosque aleatorio */
function rng(seed){var s=seed>>>0||1;return function(){s=(s*1664525+1013904223)>>>0;return s/4294967296}}
function arbol(X,y,idx,depth,mtry,rnd){var ys=idx.map(function(i){return y[i]}),m=mean(ys);if(depth<=0||idx.length<10)return {v:m};
  var p=X[0].length,best=null,feats=[];while(feats.length<mtry){var f=Math.floor(rnd()*p);if(feats.indexOf(f)<0)feats.push(f)}
  feats.forEach(function(f){var vals=idx.map(function(i){return X[i][f]}).sort(function(a,b){return a-b});for(var q=1;q<8;q++){var th=vals[Math.floor(vals.length*q/8)],L=[],R=[];idx.forEach(function(i){(X[i][f]<=th?L:R).push(i)});if(L.length<5||R.length<5)continue;
    var sse=[L,R].reduce(function(s,g){var mm=mean(g.map(function(i){return y[i]}));return s+g.reduce(function(t,i){return t+(y[i]-mm)*(y[i]-mm)},0)},0);if(!best||sse<best.sse)best={f:f,th:th,L:L,R:R,sse:sse}}});
  if(!best)return {v:m};return {f:best.f,th:best.th,l:arbol(X,y,best.L,depth-1,mtry,rnd),r:arbol(X,y,best.R,depth-1,mtry,rnd)}}
function evalArbol(t,r){while(t.v===undefined)t=r[t.f]<=t.th?t.l:t.r;return t.v}
function bosqueFit(X,y,nT){var rnd=rng(17),p=X[0].length,mtry=Math.max(1,Math.round(p/3)),T=[];for(var k=0;k<(nT||60);k++){var idx=[];for(var i=0;i<X.length;i++)idx.push(Math.floor(rnd()*X.length));T.push(arbol(X,y,idx,5,mtry,rnd))}
  return {pred:function(r){return mean(T.map(function(t){return evalArbol(t,r)}))}}}
/* calibra un objetivo ('sobre' o 'eff') con los disparos que tienen la foto del diseño */
function calibrar(disparos,kpi,objetivo){var filas=[];(disparos||[]).forEach(function(x,i){var k=kpi[i];if(!x.dis||!k||k[objetivo]==null||!isFinite(k[objetivo]))return;var f=filaDe(Object.assign({},x,{kgm3:k.kgm3}));filas.push({f:f,y:k[objetivo]})});
  var n=filas.length;if(n<8)return {n:n,ok:false};
  var usados=FEATS.filter(function(F){var v=filas.map(function(r){return r.f[F[0]]}).filter(function(v){return v!=null&&isFinite(v)});if(v.length<n*0.8)return false;var m=mean(v);return v.some(function(x){return Math.abs(x-m)>1e-9})});
  if(!usados.length)return {n:n,ok:false,motivo:'Los disparos no varían en ningún parámetro: cambia una variable a la vez para que el modelo aprenda.'};
  var med=usados.map(function(F){return mean(filas.map(function(r){return r.f[F[0]]}).filter(function(v){return v!=null&&isFinite(v)}))});
  var X=filas.map(function(r){return usados.map(function(F,j){var v=r.f[F[0]];return v!=null&&isFinite(v)?v:med[j]})}),y=filas.map(function(r){return r.y});
  var lam=Math.max(1,usados.length*0.8);function fitT(t,Xa,ya){return t==='bosque'?bosqueFit(Xa,ya,40):ridgeFit(Xa,ya,lam)}
  /* validación cruzada: dejar uno fuera con pocos datos; 5 pliegues desde 100 disparos, donde también se prueba el bosque y se elige el de menor error */
  function cv(t){var err=[],K=n>=100?5:n;for(var k=0;k<K;k++){var tr=[],te=[];for(var i=0;i<n;i++)(i%K===k?te:tr).push(i);var m=fitT(t,tr.map(function(i){return X[i]}),tr.map(function(i){return y[i]}));te.forEach(function(i){err.push(m.pred(X[i])-y[i])})}return Math.sqrt(mean(err.map(function(e){return e*e})))}
  var tipo='ridge',rmse=cv('ridge');if(n>=100){var rb=cv('bosque');if(rb<rmse){tipo='bosque';rmse=rb}}function fit(Xa,ya){return fitT(tipo,Xa,ya)}
  var sdY=Math.sqrt(mean(y.map(function(v){return (v-mean(y))*(v-mean(y))})))||1,modelo=fit(X,y);
  /* importancia por permutación */
  var base=mean(X.map(function(r,i){var e=modelo.pred(r)-y[i];return e*e})),rnd=rng(5),imp=usados.map(function(F,j){var perm=X.map(function(r){return r[j]});for(var a=perm.length-1;a>0;a--){var b=Math.floor(rnd()*(a+1)),t=perm[a];perm[a]=perm[b];perm[b]=t}
    var mse=mean(X.map(function(r,i){var rr=r.slice();rr[j]=perm[i];var e=modelo.pred(rr)-y[i];return e*e}));return {k:F[0],n:F[1],imp:Math.max(0,mse-base)}});var tot=imp.reduce(function(s,o){return s+o.imp},0)||1;imp.forEach(function(o){o.pct=o.imp/tot*100});imp.sort(function(a,b){return b.pct-a.pct});
  var dir=tipo==='ridge'?usados.map(function(F,j){return {k:F[0],signo:modelo.w[j]>0?1:modelo.w[j]<0?-1:0}}):[];
  return {ok:true,n:n,tipo:tipo,usados:usados,rmse:rmse,skill:Math.max(0,1-rmse/sdY),imp:imp,dir:dir,confianza:n>=100?'alta':n>=30?'media':'preliminar',
    predecir:function(f){var r=usados.map(function(F,j){var v=f[F[0]];return v!=null&&isFinite(v)?v:med[j]});var v=modelo.pred(r);return {v:v,lo:v-1.96*rmse,hi:v+1.96*rmse}}}}

/* ---------- 3) perfil medido ---------- */
function perfilDiseno(g){var W=g.W,H=g.H,pts=[];if(g.forma==='rect')return [[-W/2,0],[-W/2,H],[W/2,H],[W/2,0]];var r=W/2,h=Math.max(0,H-r);pts.push([-r,0],[-r,h]);for(var a=180;a>=0;a-=5)pts.push([r*Math.cos(a*PI/180),h+r*Math.sin(a*PI/180)]);pts.push([r,0]);return pts}
function areaPoly(p){var s=0;for(var i=0;i<p.length;i++){var a=p[i],b=p[(i+1)%p.length];s+=a[0]*b[1]-b[0]*a[1]}return Math.abs(s)/2}
function dentroPoly(p,x,y){var c=false;for(var i=0,j=p.length-1;i<p.length;j=i++){var xi=p[i][0],yi=p[i][1],xj=p[j][0],yj=p[j][1];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi))c=!c}return c}
function ejeMedicion(g){return g.forma==='rect'?[0,g.H/2]:[0,Math.max(0.3,g.H-g.W/2)]}
/* lecturas radiales: ángulo en grados desde la horizontal derecha, antihorario; distancia desde el punto del eje */
function perfilRadial(g,lect,eje){var c=eje||ejeMedicion(g),p=(lect||[]).filter(function(l){return isFinite(+l.ang)&&+l.dist>0}).sort(function(a,b){return a.ang-b.ang}).map(function(l){var t=l.ang*PI/180;return [c[0]+l.dist*Math.cos(t),c[1]+l.dist*Math.sin(t)]});
  if(p.length<5)return null;var der=p[0],izq=p[p.length-1];return [[izq[0],0]].concat(p.slice().reverse()).concat([[der[0],0]]).reverse()}
function parseXY(txt){return String(txt||'').split(/\r?\n/).map(function(l){var c=l.split(/[;,\t ]+/).filter(Boolean).map(function(v){return +String(v).replace(',','.')});return c.length>=2&&isFinite(c[0])&&isFinite(c[1])?[c[0],c[1]]:null}).filter(Boolean)}
function compararPerfil(g,real){if(!real||real.length<5)return null;var dis=perfilDiseno(g),Ad=areaPoly(dis),Ar=areaPoly(real),xs=dis.concat(real).map(function(p){return p[0]}),ys=dis.concat(real).map(function(p){return p[1]});
  var x0=Math.min.apply(null,xs),x1=Math.max.apply(null,xs),y0=Math.min.apply(null,ys),y1=Math.max.apply(null,ys),st=Math.max(0.01,Math.min(0.03,(x1-x0)/250)),sob=0,sub=0;
  for(var x=x0;x<=x1;x+=st)for(var y=y0;y<=y1;y+=st){var d=dentroPoly(dis,x,y),r=dentroPoly(real,x,y);if(r&&!d)sob+=st*st;else if(d&&!r)sub+=st*st}
  var per=0;for(var i=1;i<dis.length;i++)per+=Math.hypot(dis[i][0]-dis[i-1][0],dis[i][1]-dis[i-1][1]);  return {Ad:Ad,Ar:Ar,sobreA:sob,subA:sub,sobrePct:sob/Ad*100,subPct:sub/Ad*100,espesor:per>0?sob/per:0,diseno:dis,real:real}}
function decimar(p,max){if(p.length<=max)return p;var st=p.length/max,o=[];for(var i=0;i<max;i++)o.push(p[Math.floor(i*st)]);return o}

/* ---------- 4) anillos según lo perforado ---------- */
/* levantamiento por taladro: id, fondo medido x, y en el plano del anillo y z fuera del plano (+ hacia el siguiente anillo), en metros */
function parseDesv(txt){var L=String(txt||'').split(/\r?\n/).filter(function(l){return l.trim()}),out=[];L.forEach(function(l){var c=l.split(/[;,\t]+/).map(function(v){return String(v).trim().replace(/^"|"$/g,'')});if(c.length<4)return;var x=+c[1].replace(',','.'),y=+c[2].replace(',','.'),z=+c[3].replace(',','.');if(c[0]&&isFinite(x)&&isFinite(y)&&isFinite(z))out.push({id:c[0].toUpperCase(),x:x,y:y,z:z})});return out}
function segun(R,lev){var B=+R.d.perf.B,Ed=+R.d.perf.E,H=R.A.holes,m={};(lev||[]).forEach(function(o){m[o.id]=o});var filas=H.map(function(h){var s=m[String(h.id).toUpperCase()];var xr=s?s.x:h.x1,yr=s?s.y:h.y1,z=s?s.z:0,dIn=Math.hypot(xr-h.x1,yr-h.y1),L=Math.hypot(h.x1-h.x0,h.y1-h.y0)||1;
    return {id:h.id,med:!!s,x0:h.x0,y0:h.y0,x1:h.x1,y1:h.y1,xr:xr,yr:yr,z:z,desvIn:dIn,desvPct:Math.hypot(dIn,z)/L*100,errB:z/B*100}});
  for(var i=0;i<filas.length;i++){var a=filas[i],b=filas[i+1];if(!b)continue;var Ed2=Math.hypot(b.x1-a.x1,b.y1-a.y1),Er=Math.hypot(b.xr-a.xr,b.yr-a.yr);a.Edis=Ed2;a.Ereal=Er;a.errE=Ed2?(Er-Ed2)/Ed2*100:0}
  filas.forEach(function(f){f.mal=f.med&&(Math.abs(f.errB)>20||(f.errE!=null&&Math.abs(f.errE)>30)||f.desvPct>3)});var med=filas.filter(function(f){return f.med});
  return {filas:filas,n:med.length,malos:med.filter(function(f){return f.mal}).length,errBmax:med.reduce(function(m,f){return Math.max(m,Math.abs(f.errB))},0),errBmedio:mean(med.map(function(f){return Math.abs(f.errB)})),desvMedia:mean(med.map(function(f){return f.desvPct})),Ed:Ed,B:B}}

var API={vib95:vib95,parseSismos:parseSismos,FEATS:FEATS,filaDe:filaDe,calibrar:calibrar,ridgeFit:ridgeFit,bosqueFit:bosqueFit,perfilDiseno:perfilDiseno,perfilRadial:perfilRadial,parseXY:parseXY,compararPerfil:compararPerfil,ejeMedicion:ejeMedicion,decimar:decimar,areaPoly:areaPoly,parseDesv:parseDesv,segun:segun,t975:t975};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else{root.SVE=root.SVE||{};root.SVE.CAL=API}
})(this);
