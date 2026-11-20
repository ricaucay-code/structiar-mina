/* Structiar Voladura Pro · fase 3 (implementación propia)
   1) Mapa de PPV en la sección: suma por elementos de carga (Holmberg–Persson), indicador relativo hasta calibrar.
   2) Esquemas de iniciación: pirotécnico, híbrido (electrónico en cuele y contorno) y electrónico total,
      con Monte Carlo de la dispersión de cada detonador.
   3) Recomendador del siguiente disparo: busca variantes de carga de contorno y malla, las evalúa con el
      motor de diseño y, si hay modelo de la mina, con sus predicciones; respeta vibración y avance. */
(function(root){'use strict';
var PI=Math.PI;
function E0(){return (typeof root!=='undefined'&&root.SVE)||(typeof require!=='undefined'?require('./engine.js'):null)}
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}

/* ---------- 1) mapa de PPV ---------- */
/* PPV(r) = K·[ q·∫ dx / (r² + x²)^(β/2α) ]^α sobre la columna de carga; el punto está en el plano medio de la columna.
   Cada taladro sale en su propio retardo: en cada punto manda el máximo, no la suma. */
function hpPunto(q,H,r,K,al,be){var n=16,s=0,dx=H/n,e=be/(2*al),rr=r*r;for(var i=0;i<n;i++){var x=-H/2+(i+0.5)*dx;s+=dx/Math.pow(rr+x*x,e)}return K*Math.pow(q*s,al)}
function mapaPPV(R,o){o=o||{};var d=R.d,g=d.geom,E=E0(),K=+o.K||700,al=+o.alfa||0.7,be=+o.beta||1.5,umb=+o.umbral||(R.ppvc?R.ppvc.ppvc:700),fac=+o.factor||3,
  W=g.W,H=g.H,mx=0.9,nx=+o.nx||70,dx=(W+2*mx)/nx,ny=Math.round((H+mx)/dx),pts=[],cargados=R.holes.filter(function(h){return h.kg>0&&h.col>0});
  var dentro=E&&E.dentro?E.dentro:function(){return true},fuera=0,dano=0,celdaA=dx*dx,dentroN=0,maxFuera=0,prof=[];
  for(var j=0;j<ny;j++){var y=(j+0.5)*dx;for(var i=0;i<nx;i++){var x=-W/2-mx+(i+0.5)*dx,v=0;
      for(var k=0;k<cargados.length;k++){var h=cargados[k],r=Math.max(0.05,Math.hypot(h.x-x,h.y-y)),q=h.kg/h.col,vv=hpPunto(q,h.col,r,K,al,be);if(vv>v)v=vv}
      var din=dentro(g,x,y,0);if(din)dentroN++;else if(v>=fac*umb){fuera+=celdaA}
      pts.push([x,y,v,din])}}
  /* profundidad de daño fuera del perfil: distancia máxima desde el perfil hasta una celda dañada */
  pts.forEach(function(p){if(!p[3]&&p[2]>=fac*umb){var m=distPerfil(g,p[0],p[1],dentro);if(m>maxFuera)maxFuera=m}});
  var per=perimetro(g);return {pts:pts,dx:dx,nx:nx,ny:ny,umbral:umb,factor:fac,K:K,alfa:al,beta:be,areaDanoFuera:fuera,espesorMedio:per?fuera/per:0,profMax:maxFuera}}
function distPerfil(g,x,y,dentro){for(var r=0.02;r<1.5;r+=0.02){for(var a=0;a<360;a+=20){var t=a*PI/180;if(dentro(g,x+r*Math.cos(t),y+r*Math.sin(t),0))return r}}return 1.5}
function perimetro(g){if(g.forma==='rect')return g.W+2*g.H;var r=g.W/2,h=Math.max(0,g.H-r);return 2*h+PI*r}

/* ---------- 2) esquemas de iniciación ---------- */
function rng(seed){var s=seed>>>0||1;return function(){s=(s*1664525+1013904223)>>>0;return s/4294967296}}
function gaussF(r){return function(){var u=r()||1e-9,v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*PI*v)}}
function simular(R,electron,o){var holes=R.holes.filter(function(h){return h.t!=='alivio'&&h.kg>0}),disp=+(R.d.tiempos.disp)||3,dEl=0.1,g=gaussF(rng(11)),runs=o.runs||200,ven=8;
  function maxV(ts){var ev=holes.map(function(h,i){return [ts[i],h.kg]}).sort(function(a,b){return a[0]-b[0]}),mx=0,j=0,s=0;for(var i=0;i<ev.length;i++){s+=ev[i][1];while(ev[i][0]-ev[j][0]>ven){s-=ev[j][1];j++}mx=Math.max(mx,s)}return mx}
  /* en el electrónico, los tiempos se reprograman: 1 taladro por ventana de 8 ms dentro de cada periodo */
  /* electrónico total: se reprograma toda la secuencia, un taladro por ventana (9 ms) respetando el orden de periodos;
     híbrido: los electrónicos conservan el tiempo del periodo con precisión de ±0,1 % (contorno sincronizado) */
  var tn=holes.map(function(h){return h.ms});if(o.reprog){var ord=holes.map(function(h,i){return i}).sort(function(a,b){return holes[a].p-holes[b].p||holes[a].ms-holes[b].ms}),t=0,pAnt=null;
    ord.forEach(function(i){var h=holes[i];if(pAnt!==null&&h.p!==pAnt)t+=16;else if(pAnt!==null)t+=(h.t==='contorno'?1:9);tn[i]=t;pAnt=h.p})}
  var arr=[],fuera=0,contDes=[];for(var r=0;r<runs;r++){var ts=holes.map(function(h,i){var dp=electron(h)?dEl:disp;return tn[i]+g()*Math.max(tn[i],25)*dp/100});arr.push(maxV(ts));
    var bad=false;for(var a=0;a<holes.length&&!bad;a++)for(var b=0;b<holes.length;b++){if(holes[a].p<holes[b].p&&ts[a]>ts[b]&&Math.hypot(holes[a].x-holes[b].x,holes[a].y-holes[b].y)<1.6*Math.max(R.d.malla.B,0.5)){bad=true;break}}if(bad)fuera++;
    var gp={};holes.forEach(function(h,i){if(h.t==='contorno'){(gp[h.p]=gp[h.p]||[]).push(ts[i])}});var mxD=0;Object.keys(gp).forEach(function(k){var v=gp[k];if(v.length>1)mxD=Math.max(mxD,Math.max.apply(null,v)-Math.min.apply(null,v))});contDes.push(mxD)}
  arr.sort(function(a,b){return a-b});contDes.sort(function(a,b){return a-b});
  var nEl=holes.filter(electron).length;return {nom:maxV(tn),p95:arr[Math.floor(runs*0.95)],fuera:fuera/runs*100,contDesP50:contDes.length?contDes[Math.floor(contDes.length/2)]:null,nEl:nEl,nNo:holes.length-nEl}}
function esquemas(R,o){o=o||{};var c=R.d.costos||{},pE=+c.detElec||22,pN=+c.det||3.2,v=R.d.vibr,E=E0();
  var defs=[['pir','Pirotécnico (no eléctrico)',function(){return false}],['hib','Híbrido: electrónico en cuele y contorno',function(h){return h.t==='arranque'||h.t==='contorno'}],['ele','Electrónico total',function(){return true}]];
  return defs.map(function(df){var s=simular(R,df[2],{runs:o.runs||160,reprog:df[0]==='ele'}),costoDet=s.nEl*pE+s.nNo*pN,ppv=E&&E.ppv?E.ppv(v.K,v.beta,v.dist,s.p95):null;
    return {id:df[0],nombre:df[1],kg8nom:s.nom,kg8p95:s.p95,fuera:s.fuera,contDes:s.contDesP50,nEl:s.nEl,nNo:s.nNo,costoDet:costoDet,ppv95:ppv}})}

/* ---------- 3) recomendador del siguiente disparo ---------- */
/* pred: function(design, R) → {sobre:{v,lo,hi}|null, eff:{v,lo,hi}|null} (modelo de la mina) o null */
function recomendar(d,cat,pred,o){o=o||{};var E=E0(),base=E.disenar(d,cat),pb=pred?pred(d,base):null,cand=[],B0=+d.malla.B,EB=(+d.malla.E)/B0,c0=+d.malla.contornoPct;
  var pcts=[];for(var p=10;p<=100;p+=10)pcts.push(p);if(base.contorno)pcts.push(base.contorno.pctSug);
  var fB=[0.9,1,1.1];pcts.forEach(function(pc){fB.forEach(function(f){var dd=JSON.parse(JSON.stringify(d));dd.malla.contornoPct=clamp(Math.round(pc),5,100);dd.malla.B=Math.round(B0*f*20)/20;dd.malla.E=Math.round(dd.malla.B*EB*20)/20;
    var r;try{r=E.disenar(dd,cat)}catch(e){return}var pp=pred?pred(dd,r):null,ok=r.ppv<=Math.max(d.vibr.lim,base.ppv)*1.001&&r.Lmax>=Math.min(dd.geom.L,base.Lmax)*0.999&&r.sinCara<=base.sinCara&&r.contorno.ratio>=1;
    var fcOk=r.fc>=r.fcObj*0.7&&r.fc<=r.fcObj*1.3,contOk=r.contorno.ratio<=2.2;
    var score=(pp&&pp.sobre?pp.sobre.v:(contOk?0:10)+Math.abs(r.fc/r.fcObj-1)*20)+(pp&&pp.eff?Math.max(0,88-pp.eff.v)*1.5:(fcOk?0:15))+r.costo.porM/40;
    cand.push({d:dd,R:r,p:pp,ok:ok,score:score,cambios:cambios(d,dd)})})});
  cand=cand.filter(function(c){return c.ok&&c.cambios.length});cand.sort(function(a,b){return a.score-b.score});
  var top=[],vistos={};cand.forEach(function(c){var k=c.cambios.map(function(x){return x.k+x.b}).join('|');if(!vistos[k]&&top.length<3){vistos[k]=1;top.push(c)}});
  return {base:base,pBase:pb,top:top,conModelo:!!pred}}
function cambios(a,b){var o=[];if(a.malla.contornoPct!==b.malla.contornoPct)o.push({k:'contornoPct',n:'Carga de contorno',a:a.malla.contornoPct+' %',b:b.malla.contornoPct+' %',v:b.malla.contornoPct});
  if(Math.abs(a.malla.B-b.malla.B)>0.001)o.push({k:'B',n:'Burden',a:a.malla.B+' m',b:b.malla.B+' m',v:b.malla.B});
  if(Math.abs(a.malla.E-b.malla.E)>0.001)o.push({k:'E',n:'Espaciamiento',a:a.malla.E+' m',b:b.malla.E+' m',v:b.malla.E});return o}

var API={mapaPPV:mapaPPV,hpPunto:hpPunto,esquemas:esquemas,recomendar:recomendar};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else{root.SVE=root.SVE||{};root.SVE.OPT=API}
})(this);
