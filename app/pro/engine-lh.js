/* Structiar Voladura Pro · barrenación larga (tajeos por subniveles, Simba / jumbo de producción)
   Métodos públicos: abanicos con espaciamiento al fondo, energía por columna, Mathews (N' y radio hidráulico),
   aproximación del gráfico de Clark & Pakalnis para ELOS, distancia escalada para vibración. Unidades SI. */
(function(root){'use strict';
var PI=Math.PI,rad=function(d){return d*PI/180},deg=function(r){return r*180/PI};
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
function defaultsLH(){return {tipo:'larga',nombre:'',labor:'',frente:'',responsable:'',
  bloque:{H:15,largo:30,ley:5,densMin:2.8,densEst:2.7,recup:95},
  galInf:{W:3.5,H:3.5},galSup:{W:3.5,H:3.5},
  veta:{w:3,dip:75,rmr:55,q:4,A:0.8,B:0.5,C:5.5,off:0,c:null,auto:false},
  rumbo:0,estructuras:[],estaciones:[],
  perf:{modo:'asc',d:76,B:1.8,E:2.2,taco:1.5,stagger:1.0,dev:1.0,tacoMin:1.0},
  cuna:{tipo:'alivio',nAliv:3,dAliv:152,nCarg:8,dCarg:76},
  exp:{id:'anfo',acopl:1},
  disparo:{anillos:3,msAnillo:50,msTal:9,serie:'ELEC',slot:3,conCuna:false},
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

/* ---------- abanico ---------- */
function anillo(d){var Z=zona(d),p=d.perf,asc=p.modo!=='desc',gi=d.galInf,gs=d.galSup;
  var col=asc?{x:0,y:Math.min(gi.H-0.3,gi.H*0.85)}:{x:Z.hw(d.bloque.H)/2+Z.fw(d.bloque.H)/2,y:d.bloque.H+0.3};
  // objetivos (fondos) a lo largo del contorno lejano de la zona, espaciados E
  var segs=[];if(asc){segs=[[Z.poly[0],Z.poly[3]],[Z.poly[3],Z.poly[2]],[Z.poly[2],Z.poly[1]]]}else{segs=[[Z.poly[3],Z.poly[0]],[Z.poly[0],Z.poly[1]],[Z.poly[1],Z.poly[2]]]}
  // 1) fondos repartidos en el borde opuesto al collar (techo del banco si asciende, piso si desciende)
  var top=asc?[Z.poly[3],Z.poly[2]]:[Z.poly[0],Z.poly[1]],tw=Math.hypot(top[1][0]-top[0][0],top[1][1]-top[0][1]),nt=Math.max(2,Math.ceil(tw/p.E)+1),tg=[];
  for(var i=0;i<nt;i++)tg.push([top[0][0]+(top[1][0]-top[0][0])*i/(nt-1),top[0][1]+(top[1][1]-top[0][1])*i/(nt-1)]);
  // 2) contactos laterales: agregar fondos donde el contacto queda a más de 0,7·E de la línea del taladro más cercano
  function dLine(pt,t){var ax=t[0]-col.x,ay=t[1]-col.y,bx=pt[0]-col.x,by=pt[1]-col.y,la=ax*ax+ay*ay,u=la?(ax*bx+ay*by)/la:0;u=clamp(u,0,1);return Math.hypot(bx-ax*u,by-ay*u)}
  function lado(f){for(var it=0;it<6;it++){var worst=0,wp=null;for(var yy=Z.y0+0.3;yy<=Z.y1-0.3;yy+=0.25){var pt=[f(yy),yy],m=Infinity;tg.forEach(function(t){m=Math.min(m,dLine(pt,t))});if(m>worst){worst=m;wp=pt}}
    if(worst<=0.7*p.E||!wp)break;var dx=wp[0]-col.x,dy=wp[1]-col.y;if(Math.hypot(dx,dy)<1.5)break;tg.push(wp)}}
  lado(Z.fw);lado(Z.hw);
  tg.sort(function(a,b){return Math.atan2(b[1]-col.y,b[0]-col.x)-Math.atan2(a[1]-col.y,a[0]-col.x)});
  // omitir fondos casi horizontales hacia el lado de la galería (no perforables) y fusionar duplicados
  var q=E0.cargaLineal(p.d,d.exp.acopl,prodRho(d)),holes=tg.map(function(t,i){var dx=t[0]-col.x,dy=t[1]-col.y,len=Math.hypot(dx,dy);
    var ang=deg(Math.atan2(dy,dx)),taco=Math.max(p.tacoMin,p.taco+(i%2?p.stagger:0));var carg=Math.max(0,len-taco);
    return {id:'T'+(i+1),x0:col.x,y0:col.y,x1:t[0],y1:t[1],len:len,ang:ang,taco:taco,carg:carg,kg:q*carg,desv:len*p.dev/100}});
  // cobertura de energía: punto de la zona más lejano a una columna cargada
  function dseg(px,py,h){var ax=h.x0+(h.x1-h.x0)*(h.taco/h.len),ay=h.y0+(h.y1-h.y0)*(h.taco/h.len),bx=h.x1,by=h.y1,vx=bx-ax,vy=by-ay,l2=vx*vx+vy*vy,t=l2?clamp(((px-ax)*vx+(py-ay)*vy)/l2,0,1):0;return Math.hypot(px-ax-vx*t,py-ay-vy*t)}
  var worst=0,wp=null;for(var yy=Z.y0+0.2;yy<=Z.y1-0.05;yy+=0.4)for(var xx=Z.fw(yy)+0.1;xx<=Z.hw(yy)-0.1;xx+=0.3){var m=Infinity;holes.forEach(function(h){if(h.carg>0)m=Math.min(m,dseg(xx,yy,h))});if(m>worst){worst=m;wp=[xx,yy]}}
  var metros=holes.reduce(function(s,h){return s+h.len},0),kg=holes.reduce(function(s,h){return s+h.kg},0);
  return {Z:Z,col:col,holes:holes,metros:metros,cargado:holes.reduce(function(s,h){return s+h.carg},0),kg:kg,q:q,hueco:worst,huecoP:wp}}
function prodRho(d){return E0.CATALOGO.filter(function(p){return p.id===d.exp.id})[0].rho}

/* ---------- estabilidad y dilución ---------- */
function mathews(d){var v=d.veta,b=d.bloque,G=GEOf(),auto=null;if(v.auto&&G&&(d.estructuras||[]).filter(G.valida).length){auto=G.analizarTajo(d.estructuras,+d.rumbo||0,v.dip)}
  var fB=auto&&auto.B!=null?auto.B:+v.B,fC=auto?auto.C:+v.C,Np=(+v.q||0)*(+v.A||0)*(fB||0)*(fC||0);
  var altoInc=(b.H)/Math.sin(rad(clamp(v.dip,40,90))),HR=(b.largo*altoInc)/(2*(b.largo+altoInc));
  var est=HR<2.2*Math.pow(Math.max(Np,0.01),0.31)?'estable':HR<4.4*Math.pow(Math.max(Np,0.01),0.29)?'transición':'hundimiento';
  var elosHW=Np>0?clamp(0.15*Math.pow(HR,1.15)/Math.pow(Np,0.4),0.05,4):null;
  return {Np:Np,HR:HR,B:fB,C:fC,auto:auto,estado:Np>0?est:'sin datos',elosHW:elosHW,elosFW:elosHW!=null?elosHW*0.6:null}}
function GEOf(){return (typeof root!=='undefined'&&root.SVE&&root.SVE.GEO)||(typeof require!=='undefined'?(function(){try{return require('./engine-geo.js')}catch(e){return null}})():null)}

/* ---------- diseño completo ---------- */
function disenarLH(d){d=JSON.parse(JSON.stringify(d));var b=d.bloque,v=d.veta,p=d.perf,ex=E0.CATALOGO.filter(function(x){return x.id===d.exp.id})[0]||E0.CATALOGO[0];
  var A=anillo(d),Z=A.Z,M=mathews(d),kr=E0.kRoca({rmr:v.rmr,ucs:100,estructura:'moderada'});
  var tonAn=Z.area*p.B*b.densMin,nAn=Math.max(1,Math.floor(b.largo/p.B)),nDisp=Math.max(1,d.disparo.anillos);
  // burden sugerido (Langefors sobre carga de la columna)
  var cU=+v.c>0?+v.c:null,cL=cU!=null?cU:0.4/(kr*kr),cbar=cL+0.05,Lmx=A.holes.reduce(function(m,h){return Math.max(m,h.len)},0),fA=0.85;
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
  var R={c:cL,cbar:cbar,cUser:cU!=null,BmaxL:BmaxL,errP:errP,fA:fA,tipo:'larga',d:d,prod:ex,A:A,Z:Z,M:M,kr:kr,Bsug:Bsug,tonAn:tonAn,nAn:nAn,nDisp:nDisp,kgDisp:kgDisp,tonDisp:tonDisp,pfAn:pfAn,pfDisp:tonDisp?kgDisp/tonDisp:0,
    cuna:{phi:phi,B1:B1,dev:dev,ratio:ratioFondo,kg:kgC,L:Lc,vacio:vacioCuna,n:C.nCarg},kgRet:kgRet,ppv:ppv,qAdm:qAdm,distMin:Math.sqrt(kgRet)*Math.pow(d.vibr.lim/d.vibr.K,-1/d.vibr.beta),
    elos:{hw:hwT,fw:fwT,voladura:elosV},dil:dil,tonEst:tonEst*nDisp,leyDil:leyDil,minBloque:Z.area*b.largo*b.densMin,
    esp:{factor:esp,vacio:vacio,necesita:necesita,ok:vacio>=necesita}};
  R.pfObj=(0.35+0.9/Math.max(0.8,v.w))/kr;
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
  R.alertas=a;R.nAvisos=a.filter(function(x){return x.nivel!=='ok'}).length;R.estado=a.some(function(x){return x.nivel==='error'})?'revisar':R.nAvisos?'ajuste menor':'conforme'}
function hojaSimba(R,todo){var out=[];if(R.anillos){(todo?R.anillos:R.anillos.slice(0,R.nDisp)).forEach(function(a){a.holes.forEach(function(h,i){out.push({anillo:a.n,id:h.id,ang:h.ang,len:h.len,taco:h.taco,carg:h.carg,kg:h.kg,ms:((a.n-1)*R.d.disparo.msAnillo+i*R.d.disparo.msTal)})})});return out}
  for(var an=1;an<=R.nDisp;an++)R.A.holes.forEach(function(h,i){out.push({anillo:an,id:h.id,ang:h.ang,len:h.len,taco:h.taco,carg:h.carg,kg:h.kg,ms:((an-1)*R.d.disparo.msAnillo+i*R.d.disparo.msTal)})});return out}

var E0=root.SVE||(typeof require!=='undefined'?require('./engine.js'):null);
var API={defaultsLH:defaultsLH,disenarLH:disenarLH,hojaSimba:hojaSimba,mathews:mathews,anillo:anillo,zona:zona};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else{root.SVE.LH=API}
})(this);
