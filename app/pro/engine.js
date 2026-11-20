/* Structiar Voladura Pro · motor de cálculo (desarrollo de labores subterráneas)
   Métodos públicos: Holmberg (corte paralelo y avance), Langefors (burden), Holmberg–Persson (daño),
   Kuz-Ram (fragmentación), ley de distancia escalada (vibración). Unidades SI: m, mm, kg, s. */
(function(root){'use strict';
var PI=Math.PI;
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
function r2(x){return Math.round(x*100)/100}

/* ---------- catálogos ---------- */
var CATALOGO=[
 {id:'emul-cart',nombre:'Emulsión encartuchada',rho:1.15,vod:4500,rws:90,agua:'Excelente',pres:'cartucho',cart:[1.25,8],precio:2.6},
 {id:'emul-cart-15',nombre:'Emulsión encartuchada 1½"',rho:1.15,vod:4800,rws:90,agua:'Excelente',pres:'cartucho',cart:[1.5,12],precio:2.5},
 {id:'dinamita-sg',nombre:'Dinamita semigelatina',rho:1.12,vod:4500,rws:115,agua:'Buena',pres:'cartucho',cart:[1.125,8],precio:3.4},
 {id:'dinamita-g',nombre:'Dinamita gelatina 65%',rho:1.38,vod:5500,rws:150,agua:'Excelente',pres:'cartucho',cart:[1.125,8],precio:3.9},
 {id:'anfo',nombre:'ANFO',rho:0.82,vod:3500,rws:100,agua:'Nula',pres:'granel',precio:1.1},
 {id:'anfo-pesado',nombre:'ANFO pesado (30% emulsión)',rho:1.0,vod:4200,rws:110,agua:'Baja',pres:'granel',precio:1.4},
 {id:'emul-granel',nombre:'Emulsión a granel (bombeable)',rho:1.2,vod:5000,rws:95,agua:'Excelente',pres:'granel',precio:1.6},
 {id:'contorno',nombre:'Explosivo de contorno (baja densidad)',rho:0.85,vod:3000,rws:70,agua:'Buena',pres:'cartucho',cart:[0.875,16],precio:2.8}
];
var SERIES={
 MS:{nombre:'Retardo MS (milisegundos)',t:[0,25,50,75,100,125,150,175,200,250,300,350,400,450,500]},
 LP:{nombre:'Retardo LP (periodo largo)',t:[0,500,800,1100,1400,1700,2000,2300,2700,3100,3500,3900,4400,4900,5400,6000]},
 ELEC:{nombre:'Electrónico (programable)',paso:25}
};
var CORTES={
 quemado2:'Quemado por secciones (Holmberg, corte paralelo)',
 quemado1:'Quemado de 1 sección',
 cuna:'Cuña en V (escalada a la profundidad)',
 quemadoH:'Quemado en H (2 alivios horizontales)',
 linea:'Quemado en línea (ranura)'
};
function defaults(){return {
 nombre:'',labor:'',frente:'',responsable:'',
 geom:{forma:'herradura',W:3.0,H:3.0,L:2.4,eff:90,rumbo:0},
 malla:{d:38,B:0.8,E:0.9,taco:0.5,acopl:0.9,contornoPct:50,zapTaco:0.3,sbAbajo:1.25,evCont:0.8},
 corte:{tipo:'quemado2',nAliv:2,dAliv:64,dx:0,y:null},
 sequia:'no',
 roca:{rmr:55,ucs:100,estructura:'moderada',dens:2.7,agua:'seco',c:null,cModo:'auto',q:null,st:null,ei:null,vp:null},
 estructuras:[],
 exp:{id:'emul-cart',fondo:null},
 tiempos:{serie:'MS',disp:3},
 vibr:{dist:30,lim:100,K:1140,beta:1.6},
 costos:{perf:2.2,rima:6,det:3.2,detElec:22,booster:0,linea:15,manoMin:5,manoHH:9.5,mecha:0},
 sismos:[],
 ref:{n:null,kg:null,av:null,espC:null,rws:null}
}}

/* ---------- geometría ---------- */
function area(g){if(g.forma==='rect')return g.W*g.H;var r=g.W/2,h=Math.max(0,g.H-r);return g.W*h+PI*r*r/2}
function perimetro(g){if(g.forma==='rect')return g.W+2*g.H;var r=g.W/2,h=Math.max(0,g.H-r);return 2*h+PI*r}
/* punto dentro del perfil (origen: centro del piso) */
function dentro(g,x,y,m){m=m||0;var r=g.W/2;if(y<m||Math.abs(x)>r-m)return false;
  if(g.forma==='rect')return y<=g.H-m;var h=g.H-r;if(y<=h)return true;return Math.hypot(x,y-h)<=r-m}
/* puntos sobre el contorno (hastiales + corona) a distancia m hacia adentro */
function contorno(g,esp,m){var r=g.W/2,pts=[];
  if(g.forma==='rect'){var hw=g.H-m;
    var nh=Math.max(1,Math.round((hw-0.3)/esp));for(var i=1;i<=nh;i++){var y=0.3+(hw-0.3)*i/nh;pts.push({x:-(r-m),y:y,z:'tabla'});pts.push({x:r-m,y:y,z:'tabla'})}
    var nc=Math.max(1,Math.round((g.W-2*m)/esp));for(var j=1;j<nc;j++)pts.push({x:-(r-m)+(g.W-2*m)*j/nc,y:hw,z:'corona'});return pts}
  var h=g.H-r,rr=r-m;
  var nw=Math.max(1,Math.round((h-0.3)/esp));for(var k=1;k<=nw;k++){var yy=0.3+(h-0.3)*k/nw;if(yy<h-0.05){pts.push({x:-rr,y:yy,z:'tabla'});pts.push({x:rr,y:yy,z:'tabla'})}}
  var arc=PI*rr,na=Math.max(2,Math.round(arc/esp));
  for(var a=0;a<=na;a++){var th=PI*a/na;var x=rr*Math.cos(th),y=h+rr*Math.sin(th);var z=(th<PI*0.22||th>PI*0.78)?'hombro':'corona';pts.push({x:x,y:y,z:z})}
  return pts}

/* ---------- roca ---------- */
function kRoca(roca){var rmr=clamp(+roca.rmr||50,10,95),ucs=clamp(+roca.ucs||80,5,300);
  var e={masiva:1.08,moderada:1.0,fracturada:0.9,muy:0.82}[roca.estructura]||1;
  var kr=clamp((0.75+0.005*rmr)*Math.pow(100/ucs,0.08)*e,0.6,1.3);return kr}
function GEOf(){return (typeof root!=='undefined'&&root.SVE&&root.SVE.GEO)||(typeof require!=='undefined'?(function(){try{return require('./engine-geo.js')}catch(e){return null}})():null)}
function umbralDano(rmr){return rmr>=70?1200:rmr>=55?900:rmr>=40?700:500}
function factorA(roca){var rmr=+roca.rmr||50,ucs=+roca.ucs||80;return clamp(0.06*(20+(rmr<40?10:rmr<60?30:50)+ucs/5*0.2*25/5+ (roca.estructura==='masiva'?50:roca.estructura==='moderada'?25:10)),3,16)}

/* ---------- explosivo ---------- */
function prod(id,cat){cat=cat||CATALOGO;for(var i=0;i<cat.length;i++)if(cat[i].id===id)return cat[i];return cat[0]}
function cargaLineal(d,acopl,rho){var dm=d/1000*acopl;return PI/4*dm*dm*rho*1000}
function cartuchoKg(p){if(!p.cart)return 0;var dm=p.cart[0]*0.0254,lm=p.cart[1]*0.0254;return PI/4*dm*dm*lm*p.rho*1000}

/* ---------- corte ---------- */
function corteAvance(dAlivMM,n){var phi=dAlivMM/1000*Math.sqrt(Math.max(1,n)),pc=Math.min(0.25,Math.max(0.02,phi));return {phiEq:phi,Lmax:0.15+34.1*pc-39.4*pc*pc,fueraRango:phi>0.25||phi<0.05}}
function generarCorte(d,cx,cy){var c=d.corte,phi=corteAvance(c.dAliv,c.nAliv).phiEq,h=[],dd=d.malla.d/1000;
  // alivios
  var na=Math.max(0,Math.round(c.nAliv)),sepA=c.dAliv/1000*1.15;
  if(c.tipo==='quemadoH'||c.tipo==='linea'){for(var i=0;i<na;i++)h.push({x:cx+(i-(na-1)/2)*sepA,y:cy,t:'alivio',g:'Alivio'})}
  else if(c.tipo!=='cuna'){for(var j=0;j<na;j++){var ang=2*PI*j/na+(na===4?PI/4:0);h.push({x:cx+(na>1?sepA/2*Math.cos(ang):0),y:cy+(na>1?sepA/2*Math.sin(ang):0),t:'alivio',g:'Alivio'})}}
  if(c.tipo==='cuna'){var V=cunaV(d);V.vs.forEach(function(v,k){for(var p=0;p<V.filas;p++){var yy=cy+(p-(V.filas-1)/2)*V.dy;
      h.push({x:cx-v.x,y:yy,t:'arranque',g:k<1?'Arranque':'Ayudas',sec:k+1,inc:v.ang});h.push({x:cx+v.x,y:yy,t:'arranque',g:k<1?'Arranque':'Ayudas',sec:k+1,inc:v.ang})}});
    return {holes:h,B1:V.vs[0].x,B2:0,secciones:V.vs.length,secs:V.vs.map(function(v,k){return {n:k+1,dist:v.x,B:v.B,W:2*v.x,ang:0,L:v.L}}),cuna:V}}
  var o=arguments[3]||{},L=+d.geom.L||3,Ep=0.01*L+0.02,ql=o.q||1,sA=o.s||1,cR=o.c||0.4,dh=Math.max(0.02,dd);
  /* sección 1: a = 1,5·Ø equivalente desde el centro de los alivios (1,7·Ø − Ep si la desviación es alta) */
  var a1=Math.max(1.5*phi,dh*4)+(na>1?sepA*0.25:0),W=a1*Math.SQRT2,secs=[{n:1,dist:a1,B:a1,W:W,ang:0}],B1=a1;
  if(c.tipo==='linea'){var off=(na*sepA)/2+B1;h.push({x:cx-off,y:cy,t:'arranque',g:'Arranque',sec:1});h.push({x:cx+off,y:cy,t:'arranque',g:'Arranque',sec:1});h.push({x:cx,y:cy+B1+phi/2,t:'arranque',g:'Arranque',sec:1});h.push({x:cx,y:cy-B1-phi/2,t:'arranque',g:'Arranque',sec:1});
    return {holes:h,B1:B1,B2:0,secciones:1,secs:secs}}
  /* secciones siguientes (Holmberg): B = 0,088·√(W·q·s / (d·c)), práctico B − Ep, máximo 2·W;
     cuadrantes girados 45° hasta que el lado del último supere √L (máximo 4 secciones) */
  var maxS=c.tipo==='quemado1'?1:c.tipo==='quemadoH'?3:4,lim=Math.sqrt(L);
  while(secs.length<maxS&&W<lim){var Bt=0.088*Math.sqrt(W*ql*sA/(dh*cR)),Bp=Math.max(0.15,Math.min(2*W,Bt)-Ep),dist=W/2+Bp,k=secs.length+1;W=Math.SQRT2*(Bp+W/2);secs.push({n:k,dist:dist,B:Bp,W:W,ang:(k%2===0)?PI/4:0})}
  secs.forEach(function(sc){for(var m=0;m<4;m++){var t=sc.ang+PI/2*m;h.push({x:cx+sc.dist*Math.cos(t),y:cy+sc.dist*Math.sin(t),t:'arranque',g:sc.n<=2?'Arranque':'Ayudas',sec:sc.n})}});
  var ult=secs[secs.length-1];return {holes:h,B1:B1,B2:secs[1]?secs[1].B:0,secciones:secs.length,secs:secs,ult:ult}}

/* cuña en V: ángulo incluido ≥ 60°, fondos separados 0,2 m; una V de ayuda menor si L > 2 m y una tercera si L > 3,2 m.
   La boca de la V principal no puede pasar del ancho útil: avance limitado a ≈ 0,45–0,5 del ancho (Holmberg; López Jimeno). */
function cunaV(d){var L=+d.geom.L||2.4,W=+d.geom.W||3,H=+d.geom.H||3,t30=Math.tan(PI/6),nV=L>3.2?3:L>2?2:1,vs=[];
  for(var k=0;k<nV;k++){var Lk=k===0?(nV===1?L:L*0.5):(k===nV-1?L:L*0.75),x=0.1+Lk*t30;vs.push({L:Lk,x:x,ang:30,B:k?x-vs[k-1].x:x})}
  vs.sort(function(a,b){return a.x-b.x});var util=W/2-0.45,cabe=vs[vs.length-1].x<=util,Lmax=(util-0.1)/t30;
  var hc=Math.min(1.6,Math.max(0.9,0.35*H)),filas=Math.max(2,Math.round(hc/0.5)+1);return {vs:vs,filas:filas,dy:hc/(filas-1),cabe:cabe,Lmax:Lmax}}
function lmaxPhi(phi){var p=Math.min(0.25,phi);return 0.15+34.1*p-39.4*p*p}
function phiNecesario(L){for(var p=0.02;p<=0.43;p+=0.001)if(lmaxPhi(p)>=L)return p;return null}
/* comparador de cueles para la sección y profundidad del diseño */
function variantesCuele(d,cat){var g=d.geom,L=+g.L,out=[],dA=+d.corte.dAliv||64,opc=[];
  [1,2,3,4].forEach(function(n){opc.push({tipo:'quemado2',n:n,dA:dA})});[102,127,152].forEach(function(D2){if(D2>dA+5)[1,2].forEach(function(n){opc.push({tipo:'quemado2',n:n,dA:D2})})});
  opc.forEach(function(o){var dd=JSON.parse(JSON.stringify(d));dd.corte.tipo=o.tipo;dd.corte.nAliv=o.n;dd.corte.dAliv=o.dA;var r;try{r=disenar(dd,cat)}catch(e){return}
    var phi=o.dA/1000*Math.sqrt(o.n),Lm=lmaxPhi(phi),nC=r.holes.filter(function(h){return h.t==='arranque'}).length;
    out.push({id:'q'+o.n+'x'+o.dA,tipo:'quemado2',nAliv:o.n,dAliv:o.dA,nombre:'Quemado · '+o.n+' alivio'+(o.n>1?'s':'')+' de '+o.dA+' mm',Lmax:Lm,avance:0.95*Math.min(L,Lm),viable:Lm>=L,nCuele:nC,nTotal:r.holes.length,
      mPerf:r.holes.reduce(function(s,h){return s+(h.t==='alivio'?0:L)},0),mRima:o.n*L,costo:r.costo?r.costo.total:null,fc:r.fc,
      nota:Lm>=L?'Avance completo con margen de '+Math.round((Lm/L-1)*100)+' %.':'Profundidad mayor que la capacidad del cuele: avance esperado '+(0.95*Lm).toFixed(2)+' m.'})});
  var V=cunaV(d),dv=JSON.parse(JSON.stringify(d));dv.corte.tipo='cuna';var rv=disenar(dv,cat);
  out.push({id:'cuna',tipo:'cuna',nAliv:0,dAliv:dA,nombre:'Cuña en V'+(V.vs.length>1?' ('+V.vs.length+' V)':''),Lmax:V.Lmax,avance:0.9*Math.min(L,V.Lmax),viable:V.cabe,nCuele:rv.holes.filter(function(h){return h.t==='arranque'}).length,nTotal:rv.holes.length,
    mPerf:rv.holes.reduce(function(s,h){return s+(h.t==='alivio'?0:(h.inc?L/Math.cos(PI/6):L))},0),mRima:0,costo:rv.costo?rv.costo.total:null,fc:rv.fc,
    nota:V.cabe?'Sin alivios; barrenos inclinados a 60°. Exige buen marcado del ángulo.':'La boca de la V no cabe en '+g.W+' m de ancho: profundidad máxima ≈ '+V.Lmax.toFixed(2)+' m.'});
  var Lab=0.4*g.W;out.push({id:'abanico',tipo:null,nAliv:0,dAliv:dA,nombre:'Abanico (corte en abanico)',Lmax:Lab,avance:0.85*Math.min(L,Lab),viable:Lab>=L,nCuele:null,nTotal:null,mPerf:null,mRima:0,costo:null,fc:null,
    nota:'Referencia: avance ≈ 0,4 del ancho y fragmentación más gruesa; útil en frentes anchos sin escariador.'});
  var phiN=phiNecesario(L);
  var pr=+((d.costos||{}).rima)||6;out.forEach(function(o){var adj=o.dAliv!==dA?pr*o.mRima*(Math.pow(o.dAliv/dA,2)-1):0;if(o.dAliv!==dA&&o.tipo==='quemado2')o.nota+=' Requiere escariador de '+o.dAliv+' mm (rimado más caro).';o.costoAj=o.costo!=null?o.costo+adj:null;o.puntaje=(o.viable?0:1e6)+(o.costoAj!=null?o.costoAj:9e5)});var orden=out.filter(function(o){return o.nTotal!=null}).sort(function(a,b){return a.puntaje-b.puntaje});
  return {lista:out,mejor:orden[0],phiNec:phiN,dNec1:phiN?phiN*1000:null,dNec2:phiN?phiN/Math.SQRT2*1000:null,dNec4:phiN?phiN/2*1000:null}}
/* revisión contra la literatura: diseño y, si se ingresan, los datos del estándar del usuario */
function revisionLit(R,d){var g=d.geom,A=R.A,kr=R.kr,ex=R.prod,rws=(ex.rws||100)/100,rmr=+d.roca.rmr||50,ref=d.ref||{},rows=[];
  var cl=rmr>=60?{n:'tenaz',dp:0.5,c:2}:rmr>=40?{n:'intermedia',dp:0.6,c:1.5}:{n:'friable',dp:0.7,c:1};
  var Nlit=R.holes.length,qLit=(14/A+0.8)*kr*kr/0.84,av=R.av,refAv=+ref.av>0?+ref.av:av,vol=A*refAv;
  function est(v,lo,hi){return v==null||!isFinite(v)?null:(v>=lo&&v<=hi?'ok':(v>=lo*0.85&&v<=hi*1.15?'aviso':'revisar'))}
  var Lm=R.Lmax;rows.push({k:'cuele',n:'Capacidad del cuele (Holmberg)',dis:R.corte&&R.corte.cuna?R.corte.cuna.Lmax:Lm,ref:null,u:'m',rango:'≥ '+g.L.toFixed(2)+' m de perforación',lo:g.L,hi:99,fuente:'Holmberg (1982): L = 0,15 + 34,1·Ø − 39,4·Ø²'});
  rows.push({k:'fc',n:'Factor de carga (equivalente ANFO)',dis:R.fc*rws,ref:+ref.kg>0?(+ref.kg*(+ref.rws>0?+ref.rws/100:rws))/vol:null,u:'kg/m³',rango:(qLit*0.75).toFixed(2)+' – '+(qLit*1.35).toFixed(2),lo:qLit*0.75,hi:qLit*1.35,fuente:'Langefors y Kihlström: q = 14/A + 0,8 (dinamita LFB) × Kr², pasado a ANFO con s = 0,84'});
  rows.push({k:'n',n:'Número de barrenos',dis:R.holes.length,ref:+ref.n>0?+ref.n:null,u:'u',rango:Math.round(Nlit*0.85)+' – '+Math.round(Nlit*1.15),lo:Nlit*0.85,hi:Nlit*1.15,fuente:'Diseño Holmberg calculado por Structiar para estos mismos datos (± 15 %)'});
  var mDis0=0;var mDis=R.holes.reduce(function(s,h){return s+(h.t==='alivio'?0:g.L)},0)/(A*g.L);
  rows.push({k:'pe',n:'Perforación específica',dis:mDis,ref:+ref.n>0?(+ref.n*g.L)/(A*g.L):null,u:'m/m³',rango:(mDis*0.85).toFixed(2)+' – '+(mDis*1.15).toFixed(2),lo:mDis*0.85,hi:mDis*1.15,fuente:'Diseño Holmberg de Structiar (± 15 %)'});
  rows.push({k:'B',n:'Burden de destrozo / sugerido',dis:d.malla.B/R.Bsug,ref:null,u:'×',rango:'0,8 – 1,2',lo:0.8,hi:1.2,fuente:'Holmberg para túneles con base Langefors'});
  rows.push({k:'EB',n:'Relación espaciamiento / burden',dis:d.malla.E/d.malla.B,ref:null,u:'',rango:'1,0 – 1,3',lo:1.0,hi:1.3,fuente:'Holmberg: S/B 1,1–1,25 en ayudas; 1,0 en zapateras'});
  var dm=d.malla.d/1000;rows.push({k:'cont',n:'Espaciamiento de contorno',dis:15,ref:+ref.espC>0?+ref.espC/dm:null,u:'× Ø',rango:'12 – 16 Ø (voladura controlada)',lo:12,hi:16,fuente:'Persson, Holmberg y Lundborg: E = 15–16 Ø, B = 1,25·E'});
  rows.push({k:'taco',n:'Taco',dis:d.malla.taco/dm,ref:null,u:'× Ø',rango:'10 – 20 Ø',lo:10,hi:20,fuente:'Práctica general de túneles'});
  rows.push({k:'av',n:'Avance por disparo',dis:av,ref:+ref.av>0?+ref.av:null,u:'m',rango:'≥ 0,9 de la perforación',lo:0.9*g.L,hi:g.L,fuente:'Eficiencia esperada 90–95 % con cuele bien dimensionado'});
  rows.forEach(function(r){r.eDis=est(r.dis,r.lo,r.hi);r.eRef=r.ref==null?null:est(r.ref,r.lo,r.hi)});return {rows:rows,Nlit:Nlit,qLit:qLit,clase:cl}}

/* KPIs de un disparo real contra la sección de diseño */
function kpiDisparo(x,geom){var perf=+x.perf||0,av=+x.avance||0,A=area(geom),Ar=(+x.ancho>0&&+x.alto>0)?area({forma:geom.forma,W:+x.ancho,H:+x.alto}):null,vol=A*av,tal=+x.tal||0;
  return {fecha:x.fecha,eff:perf?av/perf*100:null,sobre:x.perfil&&x.perfil.sobrePct!=null?+x.perfil.sobrePct:(Ar!=null?(Ar-A)/A*100:null),kgm3:vol&&+x.kg?+x.kg/vol:null,kgm:av&&+x.kg?+x.kg/av:null,mpm3:vol&&tal&&perf?tal*perf/vol:null,
    fall:x.fall!=null&&x.fall!==''?+x.fall:(x.qa&&x.qa.fall!=null?+x.qa.fall:null),hcf:x.hcf!=null&&x.hcf!==''?+x.hcf:null,acu:x.acu!=null&&x.acu!==''?+x.acu:null,culote:x.culote!=null&&x.culote!==''?+x.culote:null}}
var KPIS=[['eff','Eficiencia de avance','%',1],['sobre','Sobreexcavación de área','%',-1],['kgm3','Factor de carga real','kg/m³',0],['kgm','Explosivo por metro de avance','kg/m',-1],['mpm3','Perforación específica real','m/m³',-1],['culote','Culote (taco sin romper)','m',-1],['fall','Tiros fallados','u',-1],['hcf','Medias cañas visibles (HCF)','%',1],['acu','Tiempo de acuñadura','min',-1]];
function kpiResumen(list,geom){var ks=list.slice().sort(function(a,b){return String(a.fecha).localeCompare(String(b.fecha))}).map(function(x){return kpiDisparo(x,typeof geom==='function'?geom(x):geom)}),nB=Math.min(5,Math.ceil(ks.length/2));
  function media(arr,k){var v=arr.map(function(o){return o[k]}).filter(function(v){return v!=null&&isFinite(v)});return v.length?{m:v.reduce(function(a,b){return a+b},0)/v.length,n:v.length}:null}
  return {n:ks.length,serie:ks,filas:KPIS.map(function(k){var b=media(ks.slice(0,nB),k[0]),r=media(ks.slice(-nB),k[0]),t=media(ks,k[0]),mej=null;if(b&&r&&ks.length>=4&&k[3]!==0){var dv=(r.m-b.m)*(k[3]);mej=Math.abs(r.m-b.m)<1e-9?0:dv>0?1:-1}
    return {k:k[0],n:k[1],u:k[2],base:b,rec:r,tot:t,mejora:mej}})}}
/* registro de fórmulas: fuente, estado de verificación y rango de validez.
   V = verificado en al menos una fuente; VP = verificado en parte (ejemplo o aspecto cualitativo); NV = forma canónica sin verificar contra el texto primario */
var REFS={
 lmax:{n:'Avance máximo por alivio',f:'L = 0,15 + 34,1·Ø − 39,4·Ø²',src:'Holmberg (1982), vía López Jimeno',est:'NV',rango:'Ø equivalente 50–250 mm, desviación ≤ 2 %'},
 phieq:{n:'Alivio equivalente',f:'Ø = Ø₀·√n',src:'Holmberg; Zare y Bruland (2006)',est:'NV',rango:'Alivios agrupados'},
 x95:{n:'Avance esperado',f:'X = 0,95·L',src:'López Jimeno (apuntes)',est:'VP',rango:'Cuele paralelo bien perforado'},
 b1:{n:'Primera sección del cuele',f:'a = 1,5·Ø',src:'Holmberg; OCW Unican',est:'V',rango:'Perforación precisa'},
 bsec:{n:'Secciones siguientes del cuele',f:'B = 0,088·√(W·q·s / (d·c)) − error; B ≤ 2·W',src:'Holmberg; ejemplo EHU',est:'VP',rango:'Ángulo de apertura < 1,6 rad'},
 stop:{n:'Fin de los cuadrantes',f:'lado del último cuadrante ≥ √L',src:'Holmberg',est:'NV',rango:'Máximo 4 secciones'},
 lang:{n:'Burden por zona',f:'B = 0,9·√(q·s / (c̄·f·S/B)) − (0,05 + 0,03·L)',src:'Langefors y Kihlström; Holmberg',est:'V',rango:'Tabla f–S/B por zona'},
 cbar:{n:'Constante de roca corregida',f:'c̄ = c + 0,05 (B ≥ 1,4 m) · c + 0,07/B (B < 1,4 m)',src:'Langefors y Kihlström',est:'V',rango:'c típico 0,2–0,6 kg/m³'},
 fsb:{n:'Factores f y S/B',f:'Zapateras 1,45/1 · destroza arriba 1,45/1,25 · abajo 1,20/1,25 o 1,75 · contorno 1,20/1,25',src:'Holmberg; López Jimeno; INL/CSM',est:'V',rango:'S/B de destroza abajo en conflicto entre fuentes'},
 rec:{n:'Recorte del contorno',f:'E = 15–16·d · E/V = 0,8 · q = 90·d² kg/m',src:'Persson, Holmberg y Lundborg; Ramulu',est:'V',rango:'Diámetro 25–48 mm'},
 ev:{n:'Relación E/V del contorno',f:'0,6 ≤ E/V ≤ 1,0',src:'TUST 2023 (aprendizaje automático); USBR',est:'V',rango:'Túneles y galerías'},
 q14:{n:'Carga específica de referencia',f:'q = (14/A + 0,8)·Kr² (LFB) → ANFO ÷ 0,84',src:'Langefors y Kihlström vía Ramulu',est:'VP',rango:'Secciones 5–40 m²; base explosiva sin confirmar'},
 qcu:{n:'Carga específica del cuele',f:'7–10 kg/m³ o más',src:'Ramulu (InTech)',est:'V',rango:'Cueles paralelos'},
 base:{n:'Base energética',f:'s = RWS / 100 respecto del ANFO',src:'Holmberg; López Jimeno',est:'NV',rango:'Conversión LFB ↔ ANFO (0,84) sin verificar'},
 ppv:{n:'Ley de vibración',f:'PPV = K·(D/√Q)^−β',src:'Práctica estándar; SME 2013',est:'V',rango:'Solo dentro del rango de distancia escalada medido'},
 hp:{n:'Daño en el contorno (campo cercano)',f:'Holmberg–Persson',src:'Holmberg y Persson (1979); NIOSH modificado',est:'NV',rango:'Indicador relativo hasta calibrar; error matemático señalado por Hustrulid y Lu (2002)'},
 ppvc:{n:'Velocidad crítica',f:'PPVc = σt·Vp / E; sobreexcavación ≈ 2–3,5 × PPVc (se usa 3)',src:'Persson; Singh',est:'NV',rango:'Usar propiedades del macizo'},
 kuz:{n:'Fragmentación',f:'Kuz-Ram (Cunningham)',src:'Cunningham (1987, 2005)',est:'NV',rango:'Calibrado en bancos: no aplica bien a frentes de desarrollo'}};
function formulasUsadas(R,d){var g=d.geom,dmm=+d.malla.d,phi=R.phiEq,out=[];function add(id,ok,val){var r=REFS[id];out.push({id:id,n:r.n,f:r.f,src:r.src,est:r.est,rango:r.rango,ok:ok,val:val||''})}
  var cu=d.corte.tipo!=='cuna';
  if(cu){add('phieq',null,Math.round(phi*1000)+' mm');add('lmax',phi>=0.05&&phi<=0.25,'Ø '+Math.round(phi*1000)+' mm → '+R.Lmax.toFixed(2)+' m');add('b1',null);add('bsec',null);add('stop',null)}
  add('x95',R.Lmax>=g.L,(0.95*Math.min(g.L,R.Lmax)).toFixed(2)+' m');add('lang',null,'B sugerido '+R.Bsug.toFixed(2)+' m');add('cbar',R.c>=0.2&&R.c<=0.6,'c '+R.c.toFixed(2)+' → c̄ '+R.cbar.toFixed(2));add('fsb',null,'S/B abajo '+(+d.malla.sbAbajo||1.25));
  add('rec',dmm>=25&&dmm<=48,'d '+dmm+' mm');if(R.contorno&&R.contorno.EV)add('ev',R.contorno.EV>=0.6&&R.contorno.EV<=1.0,'E/V '+R.contorno.EV.toFixed(2));
  add('q14',R.A>=5&&R.A<=40,'A '+R.A.toFixed(1)+' m²');if(R.qCuele!=null)add('qcu',R.qCuele>=7,R.qCuele.toFixed(1)+' kg/m³');add('base',null,(R.prod.nombre||'')+' · RWS '+(R.prod.rws||100));
  add('ppv',null);add('hp',null);if(R.ppvc)add('ppvc',null,Math.round(R.ppvc.ppvc)+' mm/s');add('kuz',false,'frente de desarrollo');return out}

/* ---------- diseño completo ---------- */
function num(v,def,a,b){v=+v;return clamp(isFinite(v)&&v!==0?v:def,a,b)}
function disenar(d,cat){d=JSON.parse(JSON.stringify(d));var g=d.geom,ml=d.malla,ro=d.roca,ex=prod(d.exp.id,cat);
  g.W=num(g.W,3,1,20);g.H=num(g.H,3,1,20);g.L=num(g.L,2.4,0.3,8);g.eff=num(g.eff,90,10,100);ml.d=num(ml.d,38,20,200);ml.B=num(ml.B,0.8,0.2,5);ml.E=num(ml.E,0.9,0.2,6);ml.acopl=num(ml.acopl,0.9,0.3,1);
  var A=area(g),av=g.L*g.eff/100,vol=A*av,ton=vol*ro.dens,kr=kRoca(ro),dm=ml.d/1000;
  var q=cargaLineal(ml.d,ml.acopl,ex.rho);
  // burden sugerido (Langefors simplificado, corregido por roca)
  var s=ex.rws/100,f=1.45,EB=(ml.E/ml.B)||1.25,G0=GEOf(),CR=G0?G0.cRoca({modo:ro.cModo,c:ro.c,q:ro.q,ucs:ro.ucs,kr:kr}):{modo:'auto',c:0.4*kr*kr,cbar:0.4*kr*kr+0.05,txt:''},cU=CR.modo!=='auto'?1:null,c=CR.c,cbar=CR.cbar;
  var cB=function(B){return c+(B>=1.4?0.05:0.07/Math.max(0.3,B))},Bmax=0.9*Math.sqrt(q*s/((c+0.05)*f*EB));for(var itc=0;itc<4;itc++){cbar=cB(Bmax);Bmax=0.9*Math.sqrt(q*s/(cbar*f*EB))}
  var errP=0.05+0.03*g.L,Bsug=Math.max(0.3,Bmax-errP);
  /* burden por zona (Holmberg): f y S/B de la tabla; destroza hacia abajo configurable (1,25 López Jimeno / 1,75 INL) */
  var zonasH=[['Zapateras',1.45,1],['Destroza hacia arriba / horizontal',1.45,1.25],['Destroza hacia abajo',1.2,+ml.sbAbajo||1.25],['Contorno sin recorte',1.2,1.25]].map(function(z){var Bz=0.9*Math.sqrt(q*s/((c+0.05)*z[1]*z[2]));for(var k=0;k<4;k++)Bz=0.9*Math.sqrt(q*s/(cB(Bz)*z[1]*z[2]));var Bp=Math.max(0.25,Bz-errP);return {zona:z[0],f:z[1],sb:z[2],Bmax:Bz,B:Bp,E:Bp*z[2],cbar:cB(Bz)}});
  var cy=(d.corte.y==null?Math.min(Math.max(1.2,g.H*0.3),g.H-g.W/2+0.2):d.corte.y),cx=d.corte.dx||0;
  var C=generarCorte(d,cx,cy,{q:q,s:s,c:c}),holes=C.holes.slice();
  // contorno y zapateras
  var espC=15*dm;var margen=0.15,evC=Math.min(1.0,Math.max(0.6,+ml.evCont||0.8)),Bc=Math.min(ml.B,espC/evC);
  contorno(g,espC,margen).forEach(function(p){holes.push({x:p.x,y:p.y,t:'contorno',g:p.z==='tabla'?'Tablas':p.z==='hombro'?'Hombros':'Corona'})});
  var nz=Math.max(2,Math.ceil((g.W-2*margen)/ml.E)+1);for(var i=0;i<nz;i++)holes.push({x:-(g.W/2-margen)+(g.W-2*margen)*i/(nz-1),y:0.15,t:'zapatera',g:'Zapateras'});
  // destrozo: malla ordenada. Columnas alineadas con las zapateras (cada E) y filas cada B desde el piso;
  // fuera del cuadrante final del cuele y a un burden de contorno del perímetro. Después se cubren huecos sueltos.
  var mInt0=margen+0.85*Bc;holes=holes.filter(function(h){return !(h.t==='arranque'&&h.sec>=3&&(h.y<0.15+0.55*ml.B||!dentro(g,h.x,Math.max(h.y,mInt0),mInt0*0.7)))});
  var aMax=C.holes.reduce(function(mx,h){return Math.max(mx,Math.hypot(h.x-cx,h.y-cy))},0),mInt=margen+0.85*Bc,U=null;(C.secs||[]).forEach(function(sc){if(holes.filter(function(h){return h.t==='arranque'&&h.sec===sc.n}).length===4)U=sc});
  function enCuele(x,y){if(C.cuna){var Vx=C.cuna.vs[C.cuna.vs.length-1].x;return Math.abs(x-cx)<=Vx+ml.B*0.5&&Math.abs(y-cy)<=C.cuna.dy*(C.cuna.filas-1)/2+ml.B*0.6}if(!U)return Math.hypot(x-cx,y-cy)<aMax+ml.B*0.5;var dx=Math.abs(x-cx),dy=Math.abs(y-cy),e=ml.B*0.55;
    return U.ang===0?(dx+dy)<=U.dist+e*Math.SQRT2:Math.max(dx,dy)<=U.dist/Math.SQRT2+e}
  function libre(x,y,f){return !holes.some(function(h){return Math.hypot(h.x-x,h.y-y)<f})}
  var cols=[];for(var ic=1;ic<nz-1;ic++)cols.push(-(g.W/2-margen)+(g.W-2*margen)*ic/(nz-1));
  for(var yy=0.15+ml.B;yy<g.H;yy+=ml.B)cols.forEach(function(x){if(!dentro(g,x,yy,mInt)||enCuele(x,yy)||!libre(x,yy,Math.min(ml.B,ml.E)*0.6))return;
    holes.push({x:x,y:yy,t:'destrozo',g:'Destrozo',r:Math.hypot(x-cx,yy-cy)})});
  var tCob=(+d.malla.kCob||0.72)*Math.sqrt(ml.B*ml.E),paso=0.05,cand=[],md=[];
  for(var cyy=0.15+ml.B*0.55;cyy<g.H;cyy+=paso)for(var cxx=-g.W/2;cxx<=g.W/2;cxx+=paso){if(!dentro(g,cxx,cyy,mInt)||enCuele(cxx,cyy))continue;cand.push([cxx,cyy])}
  cand.forEach(function(c2,k){var m=1e9;holes.forEach(function(h){var dd2=Math.hypot(h.x-c2[0],h.y-c2[1]);if(dd2<m)m=dd2});md[k]=m});
  for(var it=0;it<200&&cand.length;it++){var bi=-1,bv=0;for(var k2=0;k2<cand.length;k2++)if(md[k2]>bv){bv=md[k2];bi=k2}
    if(bi<0||bv<tCob)break;var px=cand[bi][0],py=cand[bi][1];holes.push({x:px,y:py,t:'destrozo',g:'Destrozo',r:Math.hypot(px-cx,py-cy)});
    for(var k3=0;k3<cand.length;k3++){var dq=Math.hypot(cand[k3][0]-px,cand[k3][1]-py);if(dq<md[k3])md[k3]=dq}}
  if(d.sequia==='izq'||d.sequia==='der'){var sx=(d.sequia==='izq'?-1:1)*(g.W/2-margen-0.25);holes.push({x:sx,y:0.15+0.35,t:'sequia',g:'Sequía'})}
  // capas de destrozo por distancia al corte
  // capas de destrozo por propagación de cara libre: sale cuando ya detonó un vecino a menos de 2·max(B,E)
  var des=holes.filter(function(h){return h.t==='destrozo'}),lim2=2*Math.max(ml.B,ml.E),hechos=holes.filter(function(h){return h.t==='arranque'||h.t==='alivio'}),capas=0,pend=des.slice();
  while(pend.length&&capas<6){var ya=pend.filter(function(h){return hechos.some(function(o){return Math.hypot(o.x-h.x,o.y-h.y)<=lim2})});if(!ya.length)ya=[pend.reduce(function(m,h){return h.r<m.r?h:m},pend[0])];capas++;
    ya.forEach(function(h){h.capa=capas});hechos=hechos.concat(ya);pend=pend.filter(function(h){return ya.indexOf(h)<0})}
  if(pend.length){pend.forEach(function(h){h.capa=capas})}capas=Math.max(1,capas);
  // periodos: corte sec1, sec2, destrozo por capa, tablas, hombros+corona, zapateras, sequía
  var per=1;holes.forEach(function(h){if(h.t==='arranque')h.p=h.sec});per=1+(C.secciones||1);
  for(var cp=1;cp<=capas;cp++){var any=false;des.forEach(function(h){if(h.capa===cp){h.p=per;any=true}});if(any)per++}
  holes.forEach(function(h){if(h.g==='Tablas')h.p=per});per++;
  holes.forEach(function(h){if(h.g==='Hombros'||h.g==='Corona')h.p=per});per++;
  holes.forEach(function(h){if(h.t==='zapatera')h.p=per});per++;
  holes.forEach(function(h){if(h.t==='sequia')h.p=per});
  // tiempos
  var serie=SERIES[d.tiempos.serie]||SERIES.MS,maxP=0;
  holes.forEach(function(h,i){h.id=(h.t==='alivio'?'V':h.t==='arranque'?'A':h.t==='destrozo'?'D':h.t==='contorno'?'C':h.t==='zapatera'?'Z':'S')+(i+1);
    if(h.t==='alivio')return;maxP=Math.max(maxP,h.p);h.ms=serie.t?(serie.t[Math.min(h.p,serie.t.length-1)]):h.p*serie.paso});
  // cargas
  var col=Math.max(0,g.L-ml.taco);
  holes.forEach(function(h){if(h.t==='alivio'){h.kg=0;return}var len=h.t==='zapatera'?Math.max(0,g.L-ml.zapTaco):col;
    h.col=len;h.kg=q*len*(h.t==='contorno'?ml.contornoPct/100:1)});
  var cargados=holes.filter(function(h){return h.t!=='alivio'}),kg=cargados.reduce(function(s,h){return s+h.kg},0);
  var nAl=holes.length-cargados.length;
  // kg por periodo
  var porP={};cargados.forEach(function(h){porP[h.p]=porP[h.p]||{p:h.p,ms:h.ms,n:0,kg:0,grupos:{}};porP[h.p].n++;porP[h.p].kg+=h.kg;porP[h.p].grupos[h.g]=1});
  var periodos=Object.keys(porP).map(function(k){var o=porP[k];o.grupo=Object.keys(o.grupos).join(' + ');delete o.grupos;return o}).sort(function(a,b){return a.p-b.p});
  var res={zonasH:zonasH,cR:CR,c:c,cbar:cbar,cUser:cU!=null,Bmax:Bmax,errP:errP,f:f,d:d,prod:ex,A:A,perim:perimetro(g),av:av,vol:vol,ton:ton,kr:kr,q:q,Bsug:Bsug,corte:C,phiEq:corteAvance(d.corte.dAliv,d.corte.nAliv).phiEq,
    Lmax:corteAvance(d.corte.dAliv,d.corte.nAliv).Lmax,holes:holes,nCarg:cargados.length,nAl:nAl,kg:kg,fc:vol?kg/vol:0,pf:ton?kg/ton:0,
    perfM:holes.length*g.L,periodos:periodos,cy:cy,cx:cx};
  res.fcObjANFO=(14/A+0.8)*kr*kr/0.84;res.fcObj=res.fcObjANFO/((ex.rws||100)/100);res.energia=kg*3.7*ex.rws/100;
  analizar(res);costos(res);return res}

/* ---------- análisis ---------- */
function ppv(K,beta,D,Q){return Q>0?K*Math.pow(D/Math.sqrt(Q),-beta):0}
function qAdm(K,beta,D,lim){return Math.pow(D/Math.pow(lim/K,-1/beta),2)}
function kgRetardo(holes,ventana,disp,corridas,seed){var cg=holes.filter(function(h){return h.t!=='alivio'});
  function maxVentana(ts){var ev=cg.map(function(h,i){return [ts[i],h.kg]}).sort(function(a,b){return a[0]-b[0]}),mx=0,j=0,s=0;
    for(var i=0;i<ev.length;i++){s+=ev[i][1];while(ev[i][0]-ev[j][0]>ventana){s-=ev[j][1];j++}mx=Math.max(mx,s)}return mx}
  var nom=maxVentana(cg.map(function(h){return h.ms}));
  var rnd=(function(s){return function(){s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff}})(seed||7),arr=[],fuera=0;
  function gauss(){var u=rnd()||1e-9,v=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*PI*v)}
  for(var k=0;k<corridas;k++){var ts=cg.map(function(h){return h.ms+gauss()*h.ms*disp/100/3});arr.push(maxVentana(ts));
    var bad=false;for(var a=0;a<cg.length&&!bad;a++)for(var b=0;b<cg.length;b++){if(cg[a].p<cg[b].p&&ts[a]>ts[b]&&Math.hypot(cg[a].x-cg[b].x,cg[a].y-cg[b].y)<1.5*Math.max(0.5,0)){bad=true;break}}
    if(bad)fuera++}
  arr.sort(function(a,b){return a-b});return {nom:nom,p50:arr[Math.floor(corridas*0.5)]||nom,p95:arr[Math.floor(corridas*0.95)]||nom,fuera:corridas?fuera/corridas*100:0}}
function analizar(R){var d=R.d,v=d.vibr,ml=d.malla,g=d.geom;
  var kr=kgRetardo(R.holes,8,d.tiempos.disp||3,300,11);R.kgRet=kr;
  R.ppv=ppv(v.K,v.beta,v.dist,kr.nom);R.ppv95=ppv(v.K,v.beta,v.dist,kr.p95);R.qAdm=qAdm(v.K,v.beta,v.dist,v.lim);
  R.distMin=Math.sqrt(kr.nom)*Math.pow(v.lim/v.K,-1/v.beta);
  // daño Holmberg–Persson en contorno: radio donde PPV = umbral de rotura
  var GEO=GEOf(),PC=GEO?GEO.ppvCritica(d.roca):null;R.ppvc=PC;
  var um=PC?PC.ppvc:umbralDano(d.roca.rmr),rot=PC?3*PC.ppvc:um*3,Khp=700,al=0.7,qc=R.q*ml.contornoPct/100,Hc=Math.max(0.3,g.L-ml.taco);
  function hp(r){return Khp*Math.pow(qc/r*2*Math.atan(Hc/(2*r)),al)}
  var lo=0.01,hi=3;for(var i=0;i<50;i++){var mid=(lo+hi)/2;if(hp(mid)>rot)lo=mid;else hi=mid}
  var rRot=lo,margen=0.15,l2=0.01,h2=6;for(var j=0;j<50;j++){var m2=(l2+h2)/2;if(hp(m2)>um)l2=m2;else h2=m2}
  R.dano={umbral:um,rotura:rot,rRot:rRot,rDano:l2,sobre:Math.max(0,rRot-margen),sobreMax:Math.max(0,rRot*1.8-margen)};
  R.estr=GEO?GEO.analizarLabor(d.estructuras,+g.rumbo||0):[];var fx=R.estr.reduce(function(m,x){return Math.max(m,x.factor)},1);
  R.dano.factorEstr=fx;R.dano.sobre=R.dano.sobre*fx+(fx>1?0.03:0);R.dano.sobreMax=R.dano.sobreMax*fx;
  R.dano.vol=R.dano.sobre*R.perim*R.av;
  // Kuz-Ram
  var A=factorA(d.roca),K=R.fc,Q=R.nCarg?R.kg/R.nCarg:0,rws=R.prod.rws;
  var X50=A*Math.pow(K||0.1,-0.8)*Math.pow(Q||0.1,1/6)*Math.pow(115/rws,19/30);// cm
  var Bm=ml.B,dmm=ml.d,W=0.05*Bm,H=g.L,L=Math.max(0.1,g.L-ml.taco);
  var n=clamp((2.2-14*Bm/dmm)*Math.sqrt((1+ml.E/Bm)/2)*(1-W/Bm)*(L/H),0.6,2.2);
  function pas(x){return 1-Math.exp(-0.693*Math.pow(x/X50,n))}
  R.frag={X50:X50,n:n,A:A,P80:X50*Math.pow(Math.log(5)/Math.log(2),1/n),bolones:(1-pas(50))*100,curva:[1,2,5,10,20,50,100].map(function(x){return [x,pas(x)*100]})};
  // cara libre: cada barreno debe tener uno de periodo anterior (o alivio) a ≤ 1.6 B
  var sinCara=0;R.holes.forEach(function(h){if(h.t==='alivio')return;if(h.t==='arranque'&&(h.sec===1||d.corte.tipo==='cuna')){h.libre=true;return}var lim=Math.max(2.0*ml.B,2.0*ml.E);var ok=R.holes.some(function(o){return o!==h&&(o.t==='alivio'||(o.p!=null&&o.p<h.p))&&Math.hypot(o.x-h.x,o.y-h.y)<=lim});h.libre=ok;if(!ok)sinCara++});R.sinCara=sinCara;
  // rezaga
  R.rezaga={suelto:R.vol*1.6,ton:R.ton,cuch:Math.ceil(R.ton/6)};
  // energía por zona
  var z={};R.holes.forEach(function(h){if(h.t==='alivio')return;z[h.g]=z[h.g]||{n:0,kg:0};z[h.g].n++;z[h.g].kg+=h.kg});R.zonas=z;
  // QA/QC
  // contorno: relación E/V medida en el diseño y carga lineal contra el mínimo de recorte 90·d²
  var cont=R.holes.filter(function(h){return h.t==='contorno'&&h.g!=='Zapateras'}),inter=R.holes.filter(function(h){return h.t==='destrozo'||h.t==='arranque'});
  var Vs=cont.map(function(h){return inter.reduce(function(m,o){return Math.min(m,Math.hypot(o.x-h.x,o.y-h.y))},99)}).filter(function(v){return v<9}),Vm=Vs.length?Vs.reduce(function(a,b){return a+b},0)/Vs.length:null;
  var espC2=15*ml.d/1000,qC=R.q*ml.contornoPct/100,qMin=90*Math.pow(ml.d/1000,2);
  R.contorno={E:espC2,V:Vm,EV:Vm?espC2/Vm:null,q:qC,qMin:qMin,ratio:qC/qMin,pctSug:Math.max(5,Math.round(qMin*1.3/R.q*100))};
  // carga específica del cuele: secciones 1 y 2 sobre el volumen de su cuadrante
  var cuS=R.corte&&R.corte.secs&&R.corte.secs.length&&!R.corte.cuna?R.corte.secs[Math.min(1,R.corte.secs.length-1)]:null,kgCu=R.holes.filter(function(h){return h.t==='arranque'&&cuS&&h.sec<=cuS.n}).reduce(function(a,h){return a+h.kg},0);
  R.qCuele=cuS?kgCu/(cuS.W*cuS.W*g.L):null;
  R.formulas=formulasUsadas(R,d);
  var al2=[];function chk(ok,warn,txt,acc,k){al2.push({nivel:ok?'ok':warn?'aviso':'error',txt:txt,acc:acc||'',k:k})}
  chk(R.contorno.ratio<=2,true,'Carga lineal del contorno '+r2(qC)+' kg/m; mínimo de recorte 90·d² = '+r2(qMin)+' kg/m ('+r2(R.contorno.ratio)+'×).',R.contorno.ratio>2?'Para voladura controlada baja la carga de contorno a ≈ '+R.contorno.pctSug+' % o usa cartuchos desacoplados / explosivo de baja densidad.':'','cont');
  if(R.contorno.EV)chk(R.contorno.EV>=0.6&&R.contorno.EV<=1.0,true,'Relación espaciamiento / burden del contorno E/V = '+r2(R.contorno.EV)+' (E '+r2(espC2)+' m, V medido '+r2(Vm)+' m). Rango de recorte 0,6–1,0.','Ajusta el burden de la fila vecina al contorno.','cont');
  chk(!(R.phiEq>0.25||R.phiEq<0.05),true,'Alivio equivalente '+Math.round(R.phiEq*1000)+' mm'+(R.phiEq>0.25||R.phiEq<0.05?': fuera del rango de la fórmula de Holmberg (50–250 mm); el avance máximo se limita y debe validarse en campo.':', dentro del rango de la fórmula de avance.'),'','corte');
  var bd=ml.B/(ml.d/1000);chk(bd>=18&&bd<=32,bd>=14&&bd<=38,'Relación burden/diámetro '+Math.round(bd)+'×. Ideal 18–32×.','Ajusta el burden o el diámetro.','B');
  var eb=ml.E/ml.B;chk(eb>=1.0&&eb<=1.5,eb>=0.85&&eb<=1.7,'Relación espaciamiento/burden '+r2(eb)+'. Ideal 1.0–1.5.','Acerca espaciamiento y burden.','E');
  var tc=ml.taco/(ml.d/1000);chk(tc>=10&&tc<=22,tc>=7&&tc<=28,'Taco/diámetro '+Math.round(tc)+'×. Ideal 10–22× (evita soplado y bancos).','Ajusta el taco.','taco');
  var dB=(ml.B-R.Bsug)/R.Bsug*100;chk(Math.abs(dB)<=15,Math.abs(dB)<=30,'Burden '+r2(ml.B)+' m contra sugerido '+r2(R.Bsug)+' m ('+(dB>0?'+':'')+Math.round(dB)+' %).','Usa «Aplicar sugerido».','B');
  var fcLo=R.fcObj*0.7,fcHi=R.fcObj*1.3;chk(R.fc>=fcLo&&R.fc<=fcHi,R.fc>=fcLo*0.85&&R.fc<=fcHi*1.15,'Factor de carga '+r2(R.fc)+' kg/m³. Objetivo para esta roca '+r2(fcLo)+'–'+r2(fcHi)+' kg/m³.','Revisa malla, carga de contorno o explosivo.','fc');
  chk(g.eff>=88,g.eff>=80,'Eficiencia de avance esperada '+g.eff+' %. Objetivo ≥ 88 %.','Mejora paralelismo y el corte.','eff');
  chk(R.Lmax>=g.L,R.Lmax>=g.L*0.9,'Avance máximo que permite el corte: '+r2(R.Lmax)+' m (alivio equivalente '+Math.round(R.phiEq*1000)+' mm) contra '+r2(g.L)+' m perforados.','Agrega o agranda los alivios, o acorta la perforación.','corte');
  chk(sinCara===0,sinCara<=2,sinCara?sinCara+' barrenos sin cara libre cercana.':'Todos los barrenos salen hacia una cara libre.','Revisa la secuencia o la malla.','sec');
  chk(R.ppv<=v.lim,R.ppv<=v.lim*1.2,'Vibración estimada '+Math.round(R.ppv)+' mm/s a '+v.dist+' m con '+r2(kr.nom)+' kg por retardo. Límite '+v.lim+' mm/s.','Reparte la carga en más retardos.','vib');
  chk(R.dano.sobre<=0.15,R.dano.sobre<=0.3,'Sobreexcavación estimada por daño: '+r2(R.dano.sobre)+' m.','Baja la carga de contorno o usa explosivo de contorno.','dano');
  R.estr.forEach(function(e){chk(e.clase!=='desfavorable',e.clase==='regular',e.nombre+' ('+e.dip+'°/'+String(Math.round(e.dd)).padStart(3,'0')+'°): '+(e.clase==='favorable'?'orientación favorable al eje de la labor.':'forma '+Math.round(e.angEje)+'° con el eje → riesgo de sobreexcavación en '+e.zona+'.'),e.clase==='favorable'?'':'Reduce la carga de contorno en '+e.zona+' y acorta el disparo si hay cuñas.','estr')});
  chk(kr.fuera<=2,kr.fuera<=8,'Salidas fuera de secuencia por dispersión de detonadores: '+r2(kr.fuera)+' % de corridas.','Separa más los tiempos entre periodos.','sec');
  chk(R.frag.bolones<=5,R.frag.bolones<=12,'Fragmentación estimada: P80 '+r2(R.frag.P80)+' cm, bolones > 50 cm '+r2(R.frag.bolones)+' %.','Sube energía en el destrozo.','frag');
  R.alertas=al2;R.nAvisos=al2.filter(function(a){return a.nivel!=='ok'}).length;
  R.estado=al2.some(function(a){return a.nivel==='error'})?'revisar':R.nAvisos?'ajuste menor':'conforme'}

/* ---------- costos ---------- */
function costos(R){var c=R.d.costos,ex=R.prod,nC=R.nCarg,nA=R.nAl,L=R.d.geom.L;
  var it=[['Explosivos','Explosivo '+ex.nombre,R.kg,'kg',ex.precio],['Iniciación','Detonadores no eléctricos',nC,'pza',c.det],
    ['Iniciación','Boosters / cebos',nC,'pza',c.booster],['Iniciación','Línea de inicio',1,'disparo',c.linea],
    ['Perforación','Perforación de producción',(R.holes.length-nA)*L,'m',c.perf],['Perforación','Rimado de alivios',nA*L,'m',c.rima],
    ['Mano de obra','Carguío y amarre',nC*c.manoMin/60,'h-h',c.manoHH]];
  var tot=0;it.forEach(function(i){i[5]=i[2]*i[4];tot+=i[5]});
  R.costo={items:it,total:tot,porT:R.ton?tot/R.ton:0,porM:R.av?tot/R.av:0,porM3:R.vol?tot/R.vol:0,porKg:R.kg?tot/R.kg:0}}
function sensibilidad(d,cat){var out=[];for(var f=0.7;f<=1.301;f+=0.1){var dd=JSON.parse(JSON.stringify(d));var eb=d.malla.E/d.malla.B;dd.malla.B=d.malla.B*f;dd.malla.E=dd.malla.B*eb;
  var R=disenar(dd,cat);out.push({f:f,B:dd.malla.B,usdT:R.costo.porT,fc:R.fc,ok:R.fc>=R.fcObj*0.7&&R.fc<=R.fcObj*1.3})}return out}
function comparar(d,cat){cat=cat||CATALOGO;return cat.map(function(p){var dd=JSON.parse(JSON.stringify(d));dd.exp.id=p.id;var R=disenar(dd,cat);
  return {p:p,kg:R.kg,fc:R.fc,Bsug:R.Bsug,exp:R.costo.items[0][5],total:R.costo.total,usdT:R.costo.porT,apto:!(d.roca.agua!=='seco'&&(p.agua==='Nula'||(d.roca.agua==='inundado'&&p.agua==='Baja')))}}).sort(function(a,b){return a.usdT-b.usdT})}

/* ---------- plan de carga y vale ---------- */
var MANGUERAS=[2.4,3.0,3.6,4.2,4.8,6.0,7.2,9.0,12,15];
function planCarga(R){var ex=R.prod,ck=cartuchoKg(ex),gr={};
  R.holes.forEach(function(h){var k=h.t==='alivio'?'Alivio (vacío)':h.g;gr[k]=gr[k]||{g:k,n:0,kg:0,col:h.col||0,kgB:h.kg||0,per:{}};gr[k].n++;gr[k].kg+=h.kg||0;if(h.p)gr[k].per['P'+h.p]=1});
  var filas=Object.keys(gr).map(function(k){var o=gr[k];o.per=Object.keys(o.per).join(', ');o.cart=ck&&o.kgB?Math.max(1,Math.round(o.kgB/ck)):0;return o});
  var totCart=filas.reduce(function(s,o){return s+o.cart*o.n},0);
  var mang=MANGUERAS.filter(function(m){return m>=R.d.geom.L+1})[0]||15;
  var dets=R.periodos.map(function(p){return {p:p.p,ms:p.ms,n:p.n,mang:mang}});
  return {filas:filas,cartKg:ck,totCart:totCart,kgCart:totCart*ck,mang:mang,dets:dets,cajas:ex.pres==='cartucho'?Math.ceil(totCart*ck/25):Math.ceil(R.kg/25)}}

/* ---------- calibración con datos reales ---------- */
function ajustarVibracion(lect){var pts=(lect||[]).filter(function(s){return s.ppv>0&&s.dist>0&&s.q>0});if(pts.length<3)return null;
  var X=pts.map(function(s){return Math.log(s.dist/Math.sqrt(s.q))}),Y=pts.map(function(s){return Math.log(s.ppv)});
  var n=X.length,mx=X.reduce(function(a,b){return a+b})/n,my=Y.reduce(function(a,b){return a+b})/n,sxy=0,sxx=0,syy=0;
  for(var i=0;i<n;i++){sxy+=(X[i]-mx)*(Y[i]-my);sxx+=(X[i]-mx)*(X[i]-mx);syy+=(Y[i]-my)*(Y[i]-my)}
  if(!sxx)return null;var b=sxy/sxx,a=my-b*mx;return {K:Math.exp(a),beta:-b,r2:syy?sxy*sxy/(sxx*syy):0,n:n}}
function eficienciaReal(disparos){var v=(disparos||[]).filter(function(x){return +x.perf>0&&+x.avance>0}).map(function(x){return x.avance/x.perf*100});
  if(!v.length)return null;var m=v.reduce(function(a,b){return a+b})/v.length;return {media:m,n:v.length}}

var API={kpiDisparo:kpiDisparo,kpiResumen:kpiResumen,KPIS:KPIS,REFS:REFS,formulasUsadas:formulasUsadas,variantesCuele:variantesCuele,revisionLit:revisionLit,cunaV:cunaV,lmaxPhi:lmaxPhi,phiNecesario:phiNecesario,CATALOGO:CATALOGO,SERIES:SERIES,CORTES:CORTES,defaults:defaults,disenar:disenar,sensibilidad:sensibilidad,comparar:comparar,planCarga:planCarga,
  area:area,dentro:dentro,ppv:ppv,qAdm:qAdm,ajustarVibracion:ajustarVibracion,eficienciaReal:eficienciaReal,corteAvance:corteAvance,cargaLineal:cargaLineal,cartuchoKg:cartuchoKg,kRoca:kRoca};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.SVE=API;
})(this);
