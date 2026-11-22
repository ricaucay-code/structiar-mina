/* Structiar Voladura Pro · barrenación larga (tajeos por subniveles, Simba / jumbo de producción)
   Métodos públicos: abanicos con espaciamiento al fondo, energía por columna, Mathews (N' y radio hidráulico),
   aproximación del gráfico de Clark & Pakalnis para ELOS, distancia escalada para vibración. Unidades SI. */
(function(root){'use strict';
var PI=Math.PI,rad=function(d){return d*PI/180},deg=function(r){return r*180/PI};
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
function defaultsLH(){return {tipo:'larga',nombre:'',labor:'',frente:'',responsable:'',
  bloque:{H:15,largo:30,ley:5,densMin:2.8,densEst:2.7,recup:95},
  galInf:{W:3.5,H:3.5},galSup:{W:3.5,H:3.5},
  veta:{w:3,dip:75,rmr:55,q:4,A:0.8,B:0.5,C:5.5,off:0,c:null,cModo:'auto',ucs:100,auto:false},
  rumbo:0,estructuras:[],estaciones:[],
  perf:{modo:'asc',d:76,B:1.8,E:2.2,taco:1.5,stagger:1.0,dev:1.0,tacoMin:1.0,pivH:1.6,pivX:0,angMin:35,sepAng:5,Lmax:30,barra:1.83,tacoInf:0.5,sepCol:null,minCarga:2,agua:'seco',regla:'separacion'},
  cuna:{tipo:'alivio',nAliv:3,dAliv:152,nCarg:8,dCarg:76},
  exp:{id:'anfo',acopl:1},
  disparo:{anillos:3,msAnillo:130,msTal:15,serie:'ELEC',slot:3,conCuna:false},
  vibr:{dist:60,lim:100,K:1140,beta:1.6},
  costos:{perf:9,det:12,booster:2.5,linea:30,manoHH:9.5,manoMin:8,dilucion:12}
}}

/* ---------- zona de diseño (sección transversal al rumbo) ----------
   Eje x: horizontal a través de la veta (0 = centro de la veta en el piso del nivel inferior), y: vertical desde el piso inferior.
   La veta es un paralelogramo con buzamiento dip: contacto bajo x = -w/2 + y·cot(dip), contacto alto x = w/2 + y·cot(dip). */
function zona(d){var b=d.bloque,v=d.veta,gi=d.galInf,gs=d.galSup,ct=1/Math.tan(rad(clamp(v.dip,40,90)));
  var y0=gi.H,y1=b.H; // banco entre el techo de la galería inferior y el piso de la superior
  var off=+v.off||0;function fw(y){return off-v.w/2+y*ct}function hw(y){return off+v.w/2+y*ct}
  var poly=[[fw(y0),y0],[hw(y0),y0],[hw(y1),y1],[fw(y1),y1]];
  return {poly:poly,y0:y0,y1:y1,fw:fw,hw:hw,ct:ct,area:v.w*(y1-y0),banco:y1-y0}}

/* ---------- abanico ----------
   Equipo: el abanico sale de un pivote a altura pivH sobre el piso de la galería, desplazado pivX; el collar es donde la
   línea del taladro sale de la galería (techo en ascendentes, piso en descendentes). Límites: ángulo mínimo respecto de la
   horizontal, separación angular mínima entre taladros, largo máximo y barras enteras (ideas de Aegis, Deswik y Vulcan).
   Carga: regla de separación mínima entre columnas (collares escalonados, como Load Ring de Vulcan) o clases fijas
   20/50/125·d (Onederra y Chitombo); tapón de fondo en los taladros que conectan con la otra galería. */
function anillo(d){var Z=zona(d),p=d.perf,asc=p.modo!=='desc',gi=d.galInf,gs=d.galSup,b=d.bloque,dm=p.d/1000;
  var angMin=clamp(+p.angMin||35,0,80),sepAng=clamp(+p.sepAng||5,0,30),Lmax=+p.Lmax||30,rod=+p.barra||1.83,tInf=Math.max(0,+p.tacoInf||0),minC=Math.max(0.5,+p.minCarga||2),sepCol=+p.sepCol>0?+p.sepCol:14*dm*10/10;
  var cxS=(Z.fw(b.H)+Z.hw(b.H))/2,cx=asc?0:cxS,pivH=clamp(+p.pivH||1.6,0.5,(asc?gi.H:gs.H)-0.2),piv={x:cx+(+p.pivX||0),y:asc?pivH:b.H+pivH};
  var dr=asc?{x0:-gi.W/2,x1:gi.W/2,y0:0,y1:gi.H}:{x0:cxS-gs.W/2,x1:cxS+gs.W/2,y0:b.H,y1:b.H+gs.H},otra=asc?{x0:cxS-gs.W/2,x1:cxS+gs.W/2,y:b.H}:{x0:-gi.W/2,x1:gi.W/2,y:gi.H};
  function collar(ux,uy){var t=1e9;if(asc&&uy>1e-6)t=Math.min(t,(dr.y1-piv.y)/uy);if(!asc&&uy<-1e-6)t=Math.min(t,(dr.y0-piv.y)/uy);if(ux>1e-6)t=Math.min(t,(dr.x1-piv.x)/ux);if(ux<-1e-6)t=Math.min(t,(dr.x0-piv.x)/ux);return {x:piv.x+ux*t,y:piv.y+uy*t}}
  // 1) fondos en el borde lejano, cada E
  var top=asc?[Z.poly[3],Z.poly[2]]:[Z.poly[0],Z.poly[1]],tw=Math.hypot(top[1][0]-top[0][0],top[1][1]-top[0][1]),nt=Math.max(2,Math.ceil(tw/p.E)+1),tg=[];
  for(var i=0;i<nt;i++)tg.push([top[0][0]+(top[1][0]-top[0][0])*i/(nt-1),top[0][1]+(top[1][1]-top[0][1])*i/(nt-1)]);
  function dLine(pt,t){var ax=t[0]-piv.x,ay=t[1]-piv.y,bx=pt[0]-piv.x,by=pt[1]-piv.y,la=ax*ax+ay*ay,u=la?(ax*bx+ay*by)/la:0;u=clamp(u,0,1);return Math.hypot(bx-ax*u,by-ay*u)}
  function elev(t){return Math.abs(deg(Math.atan2(t[1]-piv.y,t[0]-piv.x)))}function okAng(t){var e=elev(t);return asc?(e>=angMin&&e<=180-angMin):(e>=angMin&&e<=180-angMin)}
  // 2) contactos laterales: fondos donde el contacto queda a más de 0,7·E de los taladros, respetando el ángulo mínimo
  function lado(f){for(var it=0;it<8;it++){var worst=0,wp=null;for(var yy=Z.y0+0.3;yy<=Z.y1-0.3;yy+=0.25){var pt=[f(yy),yy];if(!okAng(pt))continue;var m=Infinity;tg.forEach(function(t){m=Math.min(m,dLine(pt,t))});if(m>worst){worst=m;wp=pt}}
    if(worst<=0.7*p.E||!wp)break;if(Math.hypot(wp[0]-piv.x,wp[1]-piv.y)<1.5)break;tg.push(wp)}}
  lado(Z.fw);lado(Z.hw);
  // 3) taladro de borde al ángulo mínimo hacia cada contacto si queda zona sin cubrir cerca de la galería
  [Z.fw,Z.hw].forEach(function(f,k){var sg=k?1:-1,a=rad(angMin),ux=sg*Math.cos(a),uy=(asc?1:-1)*Math.sin(a);for(var tt=0.5;tt<60;tt+=0.05){var x=piv.x+ux*tt,y=piv.y+uy*tt;if(y<Z.y0-0.01||y>Z.y1+0.01)continue;if(sg<0?x<=f(y):x>=f(y)){var ya=Math.min(Z.y1,Math.max(Z.y0,y));if(!tg.some(function(q){return Math.abs(elev(q)-angMin)<sepAng&&Math.sign(q[0]-piv.x)===sg}))tg.push([f(ya),ya]);break}}});
  tg=tg.filter(okAng);
  tg.sort(function(a,b2){return Math.atan2(b2[1]-piv.y,b2[0]-piv.x)-Math.atan2(a[1]-piv.y,a[0]-piv.x)});
  // 4) separación angular mínima: se fusionan fondos demasiado juntos (se conserva el más largo)
  var tf=[];tg.forEach(function(t){var l=tf[tf.length-1];if(l){var da=Math.abs(deg(Math.atan2(t[1]-piv.y,t[0]-piv.x))-deg(Math.atan2(l[1]-piv.y,l[0]-piv.x)));if(da>180)da=360-da;
      if(da<sepAng){if(Math.hypot(t[0]-piv.x,t[1]-piv.y)>Math.hypot(l[0]-piv.x,l[1]-piv.y))tf[tf.length-1]=t;return}}tf.push(t)});
  var q=E0.cargaLineal(p.d,d.exp.acopl,prodRho(d));
  var holes=tf.map(function(t,i){var dx=t[0]-piv.x,dy=t[1]-piv.y,L0=Math.hypot(dx,dy),ux=dx/L0,uy=dy/L0,c=collar(ux,uy),len=Math.hypot(t[0]-c.x,t[1]-c.y),largo=false;
    if(len>Lmax){len=Lmax;largo=true}var x1=c.x+ux*len,y1=c.y+uy*len,yE=asc?Z.y1:Z.y0,conecta=!largo&&Math.abs(y1-(asc?otra.y:otra.y))<0.15&&x1>=otra.x0-0.05&&x1<=otra.x1+0.05;
    return {id:'T'+(i+1),x0:c.x,y0:c.y,x1:x1,y1:y1,ux:ux,uy:uy,len:len,ang:deg(Math.atan2(uy,ux)),barras:Math.ceil(len/rod-0.05),conecta:conecta,largo:largo,tacoInf:conecta?tInf:0,desv:len*p.dev/100}});
  holes=holes.filter(function(h){return h.len>=1&&isFinite(h.len)});holes.forEach(function(h,i){h.id='T'+(i+1)});
  // 5) carga: collares sin cargar
  function startPt(h,u){return [h.x0+h.ux*u,h.y0+h.uy*u]}function endPt(h){var e=h.len-h.tacoInf;return [h.x0+h.ux*e,h.y0+h.uy*e]}
  function dPtSeg(pt,a,b2){var vx=b2[0]-a[0],vy=b2[1]-a[1],l2=vx*vx+vy*vy,t=l2?clamp(((pt[0]-a[0])*vx+(pt[1]-a[1])*vy)/l2,0,1):0;return Math.hypot(pt[0]-a[0]-vx*t,pt[1]-a[1]-vy*t)}
  if(p.regla==='clases'){var cl=[20,50,125].map(function(k){return k*dm});holes.forEach(function(h,i){var u=Math.max(+p.tacoMin||1,i===0||i===holes.length-1?cl[0]:cl[[1,0,2,0][i%4]]);h.taco=Math.min(u,Math.max(0,h.len-h.tacoInf-minC))})}
  else{var orden=holes.map(function(h,i){return i}).sort(function(a,b2){return holes[b2].len-holes[a].len}),hecho=[];
    orden.forEach(function(i){var h=holes[i],u=Math.max(+p.tacoMin||1,+p.taco||1.5),lim=h.len-h.tacoInf-minC;
      while(u<lim){var sp=startPt(h,u),m=Infinity;hecho.forEach(function(j){var o=holes[j];m=Math.min(m,dPtSeg(sp,startPt(o,o.taco),endPt(o)))});if(m>=sepCol)break;u+=0.25}
      h.taco=Math.min(u,Math.max(0,lim));hecho.push(i)})}
  holes.forEach(function(h){h.carg=Math.max(0,h.len-h.taco-h.tacoInf);if(h.carg<0.3){h.carg=0}h.kg=q*h.carg;h.boost=h.carg>0?(h.carg>12?2:1):0;h.cebo=h.carg>0?Math.max(0,h.len-h.tacoInf-0.5):null});
  // cobertura de energía: punto de la zona más lejano a una columna cargada
  function dseg(px,py,h){var a=startPt(h,h.taco),e=endPt(h);return dPtSeg([px,py],a,e)}
  var worst=0,wp=null;for(var yy=Z.y0+0.2;yy<=Z.y1-0.05;yy+=0.4)for(var xx=Z.fw(yy)+0.1;xx<=Z.hw(yy)-0.1;xx+=0.3){var m=Infinity;holes.forEach(function(h){if(h.carg>0)m=Math.min(m,dseg(xx,yy,h))});if(m>worst){worst=m;wp=[xx,yy]}}
  var metros=holes.reduce(function(s2,h){return s2+h.len},0),kg=holes.reduce(function(s2,h){return s2+h.kg},0);
  return {Z:Z,col:piv,piv:piv,holes:holes,metros:metros,cargado:holes.reduce(function(s2,h){return s2+h.carg},0),kg:kg,q:q,hueco:worst,huecoP:wp,sepCol:sepCol,nConecta:holes.filter(function(h){return h.conecta}).length,barras:holes.reduce(function(s2,h){return s2+h.barras},0)}}
/* distribución de energía en el plano del anillo (estilo 2DRing): cada elemento de carga se reparte con un núcleo gaussiano
   de σ = E/2 sobre el espesor de un burden; la suma da kg/m³ local, que se pasa a kg/t con la densidad del mineral. */
function energiaAnillo(R,o){o=o||{};var A=R.A,Z=A.Z,p=R.d.perf,B=p.B,sg=Math.max(0.5,p.E/2),den=R.d.bloque.densMin,st=o.paso||0.3,els=[];
  A.holes.forEach(function(h){if(!(h.carg>0))return;var n=Math.max(2,Math.round(h.carg/0.3)),dl=h.carg/n;for(var k=0;k<n;k++){var u=h.taco+dl*(k+0.5);els.push([h.x0+h.ux*u,h.y0+h.uy*u,A.q*dl])}});
  var xs=Z.poly.map(function(q){return q[0]}),x0=Math.min.apply(null,xs),x1=Math.max.apply(null,xs),pts=[],c2=2*sg*sg,nrm=1/(2*PI*sg*sg*B),obj=R.pfObj,bajo=0,alto=0,n=0;
  for(var y=Z.y0+st/2;y<Z.y1;y+=st)for(var x=x0+st/2;x<x1;x+=st){if(x<Z.fw(y)||x>Z.hw(y))continue;var s2=0;for(var e=0;e<els.length;e++){var dx=els[e][0]-x,dy=els[e][1]-y,r2=dx*dx+dy*dy;if(r2<9*c2)s2+=els[e][2]*Math.exp(-r2/c2)}
    var pf=s2*nrm/den;pts.push([x,y,pf]);if(Math.hypot(x-A.piv.x,y-A.piv.y)<1.5*p.E)continue;n++;if(pf<0.5*obj)bajo++;else if(pf>2*obj)alto++}
  return {zonaCollar:1.5*p.E,pts:pts,paso:st,obj:obj,bajoPct:n?bajo/n*100:0,altoPct:n?alto/n*100:0,sigma:sg}}
function prodRho(d){return E0.CATALOGO.filter(function(p){return p.id===d.exp.id})[0].rho}

/* ---------- estabilidad y dilución ---------- */
function mathews(d){var v=d.veta,b=d.bloque,G=GEOf(),auto=null;if(v.auto&&G&&(d.estructuras||[]).filter(G.valida).length){auto=G.analizarTajo(d.estructuras,+d.rumbo||0,v.dip)}
  var fB=auto&&auto.B!=null?auto.B:+v.B,fC=auto?auto.C:+v.C,Np=(+v.q||0)*(+v.A||0)*(fB||0)*(fC||0);
  var altoInc=(b.H)/Math.sin(rad(clamp(v.dip,40,90))),HR=(b.largo*altoInc)/(2*(b.largo+altoInc));
  var est=HR<2.2*Math.pow(Math.max(Np,0.01),0.31)?'estable':HR<4.4*Math.pow(Math.max(Np,0.01),0.29)?'transición':'hundimiento';
  /* ELOS (Clark 1998 / Capes 2009) ajustado a 12 lecturas publicadas de caserones reales
     (Gómez 2015, U. de Chile, mina selectiva, RH 2,7–5,2 y N' 2,4–7): error típico ±10 %. */
  var elosHW=Np>0?clamp(0.73*Math.pow(HR,0.93)/Math.pow(Np,1.06),0.05,4):null;
  return {Np:Np,HR:HR,B:fB,C:fC,auto:auto,estado:Np>0?est:'sin datos',elosHW:elosHW,elosFW:elosHW!=null?elosHW*0.6:null}}
function GEOf(){return (typeof root!=='undefined'&&root.SVE&&root.SVE.GEO)||(typeof require!=='undefined'?(function(){try{return require('./engine-geo.js')}catch(e){return null}})():null)}

/* ---------- diseño completo ---------- */
function nm(x,def,a,b2){x=+x;return clamp(isFinite(x)&&x!==0?x:def,a,b2)}
function disenarLH(d){d=JSON.parse(JSON.stringify(d));var b=d.bloque,v=d.veta,p=d.perf;
  v.w=nm(v.w,3,0.2,40);v.dip=nm(v.dip,75,20,90);p.d=nm(p.d,89,30,250);p.B=nm(p.B,1.8,0.3,8);p.E=nm(p.E,2.2,0.3,10);b.H=nm(b.H,15,3,60);b.largo=nm(b.largo,30,2,500);
  var ex=E0.CATALOGO.filter(function(x){return x.id===d.exp.id})[0]||E0.CATALOGO[0];
  var A=anillo(d),Z=A.Z,M=mathews(d),kr=E0.kRoca({rmr:v.rmr,ucs:+v.ucs||100,estructura:'moderada'});
  var tonAn=Z.area*p.B*b.densMin,nAn=Math.max(1,Math.floor(b.largo/p.B)),nDisp=Math.max(1,d.disparo.anillos);
  // burden sugerido (Langefors sobre carga de la columna)
  var G1=GEOf(),CR=G1?G1.cRoca({modo:v.cModo,c:v.c,q:v.q,ucs:v.ucs,kr:kr}):{modo:'auto',c:0.4*kr*kr,cbar:0.4*kr*kr+0.05,txt:''},cU=CR.modo!=='auto'?1:null,cL=CR.c,cbar=CR.cbar,Lmx=A.holes.reduce(function(m,h){return Math.max(m,h.len)},0),fA=0.85;
  var BmaxL=(p.d/33)*Math.sqrt((ex.rho*ex.rws/100)/(cbar*1.0*(p.E/p.B))),errP=0.05+p.dev/100*Lmx,Bsug=Math.max(0.8,fA*BmaxL-errP);
  // cuña (cara libre inicial): alivio + cargados alrededor, con desviación al fondo
  var C=d.cuna,phi=(C.tipo==='alivio'?C.dAliv/1000*Math.sqrt(Math.max(1,C.nAliv)):0),Lc=Z.banco+0.5,dev=Lc*p.dev/100;
  var B1=phi?1.2*phi:0,ratioFondo=phi?1.2+dev/phi:0,qC=E0.cargaLineal(C.dCarg,1,ex.rho),kgC=C.tipo==='alivio'?C.nCarg*qC*Math.max(0,Lc-1):0;
  var vacioCuna=C.tipo==='alivio'?Math.max(0.3,(B1+phi)*(B1+phi)*2)*Z.banco:(C.tipo==='chimenea'?1.8*1.8*Z.banco:0);
  // disparo
  var conC=!!d.disparo.conCuna&&C.tipo==='alivio';if(!conC)kgC=0;var kgDisp=A.kg*nDisp+kgC,tonDisp=tonAn*nDisp+(conC?vacioCuna*b.densMin:0),pfAn=tonAn?A.kg/tonAn:0;
  var kgRet=Math.max(A.holes.reduce(function(m,h){return Math.max(m,h.kg)},0),C.tipo==='alivio'?qC*Math.max(0,Lc-1):0);
  if(d.disparo.serie!=='ELEC')kgRet=A.kg; // pirotécnico: todo el anillo en un retardo
  var ppv=E0.ppv(d.vibr.K,d.vibr.beta,d.vibr.dist,kgRet),qAdm=E0.qAdm(d.vibr.K,d.vibr.beta,d.vibr.dist,d.vibr.lim);
  // dilución
  var elosH=M.elosHW!=null?M.elosHW:0.5,elosF=M.elosFW!=null?M.elosFW:0.3;
  var rRot=Math.sqrt(A.q*3.7*ex.rws/100)*0.12,elosV=Math.max(0,rRot-0.2);// sobre-rotura por voladura en contactos
  var hwT=elosH+elosV,fwT=elosF+elosV,dil=(hwT+fwT)/(v.w+hwT+fwT)*100;
  var tonEst=tonAn*(hwT+fwT)/v.w*(b.densEst/b.densMin),leyDil=b.ley*v.w/(v.w+hwT+fwT)*(b.densMin/((v.w*b.densMin+(hwT+fwT)*b.densEst)/(v.w+hwT+fwT)));
  // esponjamiento: el vacío disponible debe recibir el esponjamiento del disparo
  var esp=1.45,volDisp=Z.area*p.B*nDisp,vacio=(conC?vacioCuna:0)+Z.area*Math.max(0,+d.disparo.slot||0),necesita=volDisp*(esp-1);
  var R={cR:CR,c:cL,cbar:cbar,cUser:cU!=null,BmaxL:BmaxL,errP:errP,fA:fA,tipo:'larga',d:d,prod:ex,A:A,Z:Z,M:M,kr:kr,Bsug:Bsug,tonAn:tonAn,nAn:nAn,nDisp:nDisp,kgDisp:kgDisp,tonDisp:tonDisp,pfAn:pfAn,pfDisp:tonDisp?kgDisp/tonDisp:0,
    cuna:{phi:phi,B1:B1,dev:dev,ratio:ratioFondo,kg:kgC,L:Lc,vacio:vacioCuna,n:C.nCarg},kgRet:kgRet,ppv:ppv,qAdm:qAdm,distMin:Math.sqrt(kgRet)*Math.pow(d.vibr.lim/d.vibr.K,-1/d.vibr.beta),
    elos:{hw:hwT,fw:fwT,voladura:elosV},dil:dil,tonEst:tonEst*nDisp,leyDil:leyDil,minBloque:Z.area*b.largo*b.densMin,
    esp:{factor:esp,vacio:vacio,necesita:necesita,ok:vacio>=necesita}};
  R.pfObj=(0.25+0.9/Math.max(0.8,v.w))*kr;
  if(!d._sub)R.energia=energiaAnillo(R);
  costosLH(R);alertasLH(R);if(!d._sub)variables(R);return R}
/* anillos variables: interpola potencia, buzamiento, desplazamiento y ley entre estaciones a lo largo del rumbo */
function interp(est,x,k){if(x<=est[0].x)return +est[0][k];for(var i=1;i<est.length;i++){if(x<=est[i].x){var a=est[i-1],b=est[i],t=(x-a.x)/((b.x-a.x)||1);return +a[k]+(+b[k]-+a[k])*t}}return +est[est.length-1][k]}
function variables(R){var d=R.d,est=(d.estaciones||[]).filter(function(e){return isFinite(+e.x)&&+e.w>0&&+e.dip>0}).map(function(e){return {x:+e.x,w:+e.w,dip:+e.dip,off:+e.off||0,ley:+e.ley||d.bloque.ley}}).sort(function(a,b){return a.x-b.x});
  R.variable=est.length>=2;if(!R.variable){R.anillos=null;return}var slot=Math.max(0,+d.disparo.slot||0),out=[],tot={t:0,kg:0,m:0,est:0,au:0,auD:0};
  for(var i=0;i<R.nAn;i++){var x=slot+d.perf.B*(i+0.5);if(x>d.bloque.largo)break;var dd=JSON.parse(JSON.stringify(d));dd._sub=1;dd.estaciones=[];
    dd.veta.w=interp(est,x,'w');dd.veta.dip=interp(est,x,'dip');dd.veta.off=interp(est,x,'off');dd.bloque.ley=interp(est,x,'ley');dd.disparo.anillos=1;dd.disparo.conCuna=false;
    var r=disenarLH(dd);out.push({n:i+1,x:x,w:dd.veta.w,dip:dd.veta.dip,off:dd.veta.off,ley:dd.bloque.ley,holes:r.A.holes,nT:r.A.holes.length,m:r.A.metros,kg:r.A.kg,t:r.tonAn,pf:r.pfAn,hueco:r.A.hueco,dil:r.dil,leyDil:r.leyDil,tEst:r.tonEst,R:r});
    tot.t+=r.tonAn;tot.kg+=r.A.kg;tot.m+=r.A.metros;tot.est+=r.tonEst;tot.au+=r.tonAn*dd.bloque.ley;tot.auD+=(r.tonAn+r.tonEst)*r.leyDil}
  R.anillos=out;R.totVar={t:tot.t,kg:tot.kg,m:tot.m,est:tot.est,pf:tot.t?tot.kg/tot.t:0,ley:tot.t?tot.au/tot.t:0,leyDil:(tot.t+tot.est)?tot.auD/(tot.t+tot.est):0,dil:(tot.t+tot.est)?tot.est/(tot.t+tot.est)*100:0};
  var malos=out.filter(function(a){return a.hueco>0.8*d.perf.E||a.pf<R.pfObj*0.6||a.pf>R.pfObj*1.7});
  R.alertas.push({nivel:malos.length?'aviso':'ok',txt:malos.length?malos.length+' de '+out.length+' anillos fuera de rango (cobertura o factor de potencia): '+malos.slice(0,6).map(function(a){return 'A'+a.n}).join(', ')+(malos.length>6?'…':'')+'.':'Los '+out.length+' anillos del tajo quedan dentro de rango con la veta variable.',acc:'Revisa esos anillos en la tabla y ajusta el espaciamiento donde la veta se ensancha.',k:'var'});
  R.nAvisos=R.alertas.filter(function(x){return x.nivel!=='ok'}).length;if(R.estado==='conforme'&&malos.length)R.estado='ajuste menor'}
function costosLH(R){var c=R.d.costos,ex=R.prod,nH=R.A.holes.length*R.nDisp+(R.d.cuna.tipo==='alivio'?R.d.cuna.nCarg:0),m=R.A.metros*R.nDisp+(R.d.cuna.tipo==='alivio'?(R.d.cuna.nCarg+R.d.cuna.nAliv)*R.cuna.L:0);
  var conC=!!R.d.disparo.conCuna&&R.d.cuna.tipo==='alivio';nH=R.A.holes.length*R.nDisp+(conC?R.d.cuna.nCarg:0);m=R.A.metros*R.nDisp+(conC?(R.d.cuna.nCarg+R.d.cuna.nAliv)*R.cuna.L:0);
  var it=[['Explosivos','Explosivo '+ex.nombre,R.kgDisp,'kg',ex.precio],['Iniciación','Detonadores',nH,'pza',c.det],['Iniciación','Boosters / cebos',nH,'pza',c.booster],['Iniciación','Línea de inicio',1,'disparo',c.linea],
    ['Perforación','Perforación larga',m,'m',c.perf],['Mano de obra','Carguío',nH*c.manoMin/60,'h-h',c.manoHH],['Dilución','Acarreo y tratamiento de estéril',R.tonEst,'t',c.dilucion]];
  var tot=0;it.forEach(function(i){i[5]=i[2]*i[4];tot+=i[5]});R.costo={items:it,total:tot,porT:R.tonDisp?tot/R.tonDisp:0,metros:m,nH:nH}}
function alertasLH(R){var d=R.d,p=d.perf,a=[];function chk(ok,w,t,acc,k){a.push({nivel:ok?'ok':w?'aviso':'error',txt:t,acc:acc||'',k:k})}
  var bd=p.B/(p.d/1000);chk(bd>=20&&bd<=35,bd>=16&&bd<=40,'Burden entre anillos '+p.B.toFixed(2)+' m = '+Math.round(bd)+'× el diámetro. Ideal 20–35×.','Ajusta el burden o el diámetro.','B');
  var dB=(p.B-R.Bsug)/R.Bsug*100;chk(Math.abs(dB)<=15,Math.abs(dB)<=30,'Burden '+p.B.toFixed(2)+' m contra sugerido '+R.Bsug.toFixed(2)+' m ('+(dB>0?'+':'')+Math.round(dB)+' %).','Usa «Aplicar sugerido».','B');
  var eb=p.E/p.B;chk(eb>=1.0&&eb<=1.5,eb>=0.85&&eb<=1.8,'Espaciamiento al fondo / burden = '+eb.toFixed(2)+'. Ideal 1,0–1,5.','Ajusta el espaciamiento al fondo.','E');
  chk(R.A.hueco<=0.6*p.E,R.A.hueco<=0.8*p.E,'Cobertura de energía: el punto más lejano a una columna cargada está a '+R.A.hueco.toFixed(2)+' m ('+(R.A.hueco/p.E).toFixed(2)+'×E).','Agrega taladros o reduce el taco escalonado.','E');
  var dv=R.A.holes.reduce(function(m,h){return Math.max(m,h.desv)},0);chk(dv<=0.3*p.B,dv<=0.5*p.B,'Desviación al fondo del taladro más largo: ±'+dv.toFixed(2)+' m ('+p.dev+' % de la longitud).','Usa barras guía, menor longitud o mayor diámetro.','dev');
  chk(R.pfAn>=R.pfObj*0.75&&R.pfAn<=R.pfObj*1.4,R.pfAn>=R.pfObj*0.6&&R.pfAn<=R.pfObj*1.7,'Factor de potencia del anillo '+R.pfAn.toFixed(2)+' kg/t. Objetivo ≈ '+R.pfObj.toFixed(2)+' kg/t para esta roca.','Revisa burden, espaciamiento o explosivo.','pf');
  if(d.cuna.tipo==='alivio')chk(R.cuna.ratio<=1.7,R.cuna.ratio<=2.1,'Cuña: burden/Ø equivalente al fondo con desviación = '+R.cuna.ratio.toFixed(2)+'× (≤ 1,7 rompe; > 2,1 se congela).','Agrega alivios o aumenta su diámetro.','cuna');
  chk(R.esp.ok,R.esp.vacio>=R.esp.necesita*0.8,'Esponjamiento: el disparo necesita '+R.esp.necesita.toFixed(0)+' m³ de vacío y hay '+R.esp.vacio.toFixed(0)+' m³.','Dispara menos anillos o abre más cara libre.','esp');
  chk(R.ppv<=d.vibr.lim,R.ppv<=d.vibr.lim*1.2,'Vibración estimada '+Math.round(R.ppv)+' mm/s a '+d.vibr.dist+' m con '+R.kgRet.toFixed(0)+' kg por retardo. Límite '+d.vibr.lim+' mm/s.','Usa un retardo por taladro o cargas espaciadas.','vib');
  if(R.M.estado!=='sin datos')chk(R.M.estado==='estable',R.M.estado==='transición','Estabilidad de Mathews: N\' '+R.M.Np.toFixed(1)+', radio hidráulico '+R.M.HR.toFixed(1)+' m → '+R.M.estado+'.','Acorta el tajo o deja pilares.','mathews');
  chk(R.dil<=20,R.dil<=35,'Dilución estimada '+R.dil.toFixed(1)+' % (ELOS alto '+R.elos.hw.toFixed(2)+' m, bajo '+R.elos.fw.toFixed(2)+' m).','Controla la carga en los contactos y la longitud del tajo.','dil');
  // dirección, agua y producto (ascendentes vs descendentes)
  var asc=p.modo!=='desc',tp=String(R.prod.id||'')+' '+String(R.prod.nombre||'').toLowerCase(),anfo=/anfo/.test(tp)&&!/pesado/.test(tp),ag=p.agua||'seco';
  if(asc)chk(!anfo,true,anfo?'Taladros ascendentes con ANFO: necesita carguío neumático que lo compacte y adhiera; con taladros húmedos se cae.':'Taladros ascendentes con '+R.prod.nombre+': verifica que la emulsión tenga viscosidad o gasificación para quedarse en el taladro.','En ascendentes prefiere emulsión bombeable con retención; usa tapón de collar en diámetros grandes.','prod');
  else chk(!(anfo&&ag!=='seco'),!(anfo&&ag==='agua'),anfo&&ag!=='seco'?'Taladros descendentes con ANFO y condición '+(ag==='agua'?'con agua':'húmeda')+': el ANFO pierde energía o no detona.':'Taladros descendentes: el carguío es por gravedad; '+(ag==='seco'?'secos, el ANFO es adecuado.':'con agua, la emulsión es adecuada.'),'Sopla y mide cada taladro antes de cargar; con agua usa emulsión o encamisa.','prod');
  var nc=R.A.nConecta,sinT=R.A.holes.filter(function(h){return h.conecta&&!(h.tacoInf>0)}).length;if(nc)chk(sinT===0,false,nc+' taladros conectan con la otra galería'+(sinT?': '+sinT+' sin tapón de fondo — la carga se escapa.':' con tapón de fondo de '+f2s(p.tacoInf)+' m.'),'Coloca tapón y taco de fondo antes de cargar; mide la profundidad real.','conecta');
  var lar=R.A.holes.filter(function(h){return h.largo}).length;if(lar)chk(false,true,lar+' taladros recortados al largo máximo del equipo ('+f2s(p.Lmax)+' m).','Agrega barras, cambia el pivote o divide en subnivel.','largo');
  var ciegos=R.A.holes.filter(function(h){return !h.conecta&&h.len>20});if(ciegos.length)chk(p.dev<=1,p.dev<=2,ciegos.length+' taladros ciegos de más de 20 m: con '+p.dev+' % de desviación el fondo se corre hasta ±'+f2s(Math.max.apply(null,ciegos.map(function(h){return h.desv})))+' m.','Levanta la desviación (Boretrak) antes de cargar y ceba en el fondo.','dev');
  if(R.energia)chk(R.energia.altoPct<=8&&R.energia.bajoPct<=10,R.energia.altoPct<=15&&R.energia.bajoPct<=20,'Distribución de energía: '+f1s(R.energia.altoPct)+' % del anillo sobre 2× el objetivo (zona de collares) y '+f1s(R.energia.bajoPct)+' % bajo la mitad (bolones).','Escalona más los collares si sobra energía arriba; agrega taladros o baja el burden donde falta.','energia');
  R.alertas=a;R.nAvisos=a.filter(function(x){return x.nivel!=='ok'}).length;R.estado=a.some(function(x){return x.nivel==='error'})?'revisar':R.nAvisos?'ajuste menor':'conforme'}
function f2s(v){return (Math.round(v*100)/100).toString().replace('.',',')}function f1s(v){return (Math.round(v*10)/10).toString().replace('.',',')}
/* orden de salida dentro del anillo: primero el taladro más cercano a la vertical (frente libre al centro) y luego
   alternando hacia ambos contactos, como en la práctica de cámaras */
function rangoSalida(holes){var c=holes.map(function(h,i){return [i,Math.abs(Math.abs(h.ang)-90)]}).sort(function(a,b){return a[1]-b[1]}),i0=c[0][0],r=new Array(holes.length),k=0,l=i0,rr=i0;r[i0]=k++;
  while(l>0||rr<holes.length-1){if(rr<holes.length-1){rr++;r[rr]=k++}if(l>0){l--;r[l]=k++}}return r}
function hojaSimba(R,todo){var out=[];if(R.anillos){(todo?R.anillos:R.anillos.slice(0,R.nDisp)).forEach(function(a){var rk=rangoSalida(a.holes);a.holes.forEach(function(h,i){out.push({anillo:a.n,id:h.id,ang:h.ang,len:h.len,taco:h.taco,carg:h.carg,kg:h.kg,barras:h.barras,conecta:h.conecta,tacoInf:h.tacoInf,boost:h.boost,ms:((a.n-1)*R.d.disparo.msAnillo+rk[i]*R.d.disparo.msTal)})})});return out}
  var rk0=rangoSalida(R.A.holes);for(var an=1;an<=R.nDisp;an++)R.A.holes.forEach(function(h,i){out.push({anillo:an,id:h.id,ang:h.ang,len:h.len,taco:h.taco,carg:h.carg,kg:h.kg,barras:h.barras,conecta:h.conecta,tacoInf:h.tacoInf,boost:h.boost,ms:((an-1)*R.d.disparo.msAnillo+rk0[i]*R.d.disparo.msTal)})});return out}

var E0=root.SVE||(typeof require!=='undefined'?require('./engine.js'):null);
var API={rangoSalida:rangoSalida,energiaAnillo:energiaAnillo,defaultsLH:defaultsLH,disenarLH:disenarLH,hojaSimba:hojaSimba,mathews:mathews,anillo:anillo,zona:zona};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else{root.SVE.LH=API}
})(this);
