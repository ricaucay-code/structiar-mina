/* Structiar Voladura Pro · revisión de planes de voladura emitidos (taladros largos y slot)
   Implementación propia. Filosofía: respetar la decisión del ingeniero (si una desviación de la regla
   está justificada, se documenta y se traduce en controles para el carguío) y detectar las
   inconsistencias entre hojas que en campo llevan a errores del minero: diámetros que no calzan con
   los kg, rótulos de secuencia distintos a los del plano, taladros tapados cargados como diseño,
   indicadores con el denominador equivocado, densidades supuestas que no se cumplen al cargar. */
(function(root){'use strict';
var PI=Math.PI;
var DENS={anfo:0.85,emulsion:1.15,granel:1.15,cartucho:1.15,hidrogel:1.2};
function tipoExp(t){t=String(t||'').toLowerCase();if(/anfo|nitrato/.test(t))return 'anfo';if(/rioflex|granel|bomb|subtek|fortis|bulk/.test(t))return 'granel';if(/emul|cart|stick|emulex|semexsa/.test(t))return 'cartucho';if(/hidro|gel/.test(t))return 'hidrogel';return t?'otro':''}
function num(v){if(v==null)return null;v=String(v).trim().replace(/^"|"$/g,'').replace(/\s*(kg|m|mm|ms|und|u)$/i,'');if(v==='')return null;if(/^-?\d+,\d+$/.test(v))v=v.replace(',','.');var n=+v;return isFinite(n)?n:null}

/* ---------- lectura de la hoja de carga ---------- */
var COLS={anillo:/^anillo|ring|fila|seccion/,taladro:/^tal|^hole|^id|^n.?°?$|barreno/,diam:/diam|ø|phi/,long:/^long.*(total|tal|perf)|^longitud$|^long$|length/,carga:/(long.*carga|carga.*\(m\)|^carga$|columna)/,fin:/fin.*carga|taco.*sup|collar|relleno.*sup/,tacoInf:/taco.*inf|relleno.*inf/,exp:/^explosivo$|tipo.*exp|producto/,kg:/(^kg|explosivo.*kg|peso|total.*kg|^carga.*kg)/,det:/deton|det\./,t:/tiempo|ms|retardo|delay/,estado:/estado|limpieza|condici|obs/,real:/real|medid|limpi.*long/,anfoKg:/anfo/,granelKg:/rioflex|granel|bulk/,emuU:/emul/};
function parsePlan(txt){var L=String(txt||'').split(/\r?\n/).filter(function(l){return l.trim()});if(L.length<2)throw new Error('La hoja no tiene filas.');
  var dl=[';','\t',','].map(function(d){return [d,L[0].split(d).length]}).sort(function(a,b){return b[1]-a[1]})[0][0];
  var h=L[0].split(dl).map(function(x){return x.trim().toLowerCase().replace(/^"|"$/g,'')}),ix={};
  function find(re,excl){for(var i=0;i<h.length;i++){if(excl&&excl.indexOf(i)>=0)continue;if(re.test(h[i]))return i}return -1}
  ix.anillo=find(COLS.anillo);ix.taladro=find(COLS.taladro,[ix.anillo]);ix.diam=find(COLS.diam);ix.long=(function(){for(var i=0;i<h.length;i++)if(/^(long|length|largo)/.test(h[i])&&!/carga|real|taco|relleno|fin/.test(h[i]))return i;return -1})();ix.fin=find(COLS.fin);ix.carga=find(COLS.carga,[ix.long,ix.fin]);ix.tacoInf=find(COLS.tacoInf);
  ix.kg=find(/explosivo.*kg|total.*kg|peso|^kg$/);ix.anfoKg=find(COLS.anfoKg);ix.granelKg=find(COLS.granelKg);ix.emuU=find(COLS.emuU);ix.exp=find(COLS.exp,[ix.kg]);ix.det=find(COLS.det);ix.t=find(COLS.t);ix.estado=find(COLS.estado);ix.real=find(/real|medid/,[ix.long,ix.estado]);
  if(ix.taladro<0||ix.long<0)throw new Error('Se necesitan al menos las columnas taladro y longitud.');
  var out=[];L.slice(1).forEach(function(l){var c=l.split(dl).map(function(x){return x.trim().replace(/^"|"$/g,'')});function g(k){return ix[k]>=0?c[ix[k]]:null}
    var tal=g('taladro');if(!tal)return;var d=num(g('diam'));if(d!=null&&d<10)d=Math.round(d*25.4);
    var o={anillo:String(g('anillo')||'').trim().toUpperCase()||'—',id:String(tal).trim().toUpperCase(),d:d,L:num(g('long')),carga:num(g('carga')),fin:num(g('fin')),tacoInf:num(g('tacoInf')),kg:num(g('kg')),anfo:num(g('anfoKg')),granel:num(g('granelKg')),emuU:num(g('emuU')),exp:g('exp')||'',det:num(g('det')),t:num(g('t')),estado:String(g('estado')||''),real:num(g('real'))};
    if(o.kg==null){var s=(o.anfo||0)+(o.granel||0);if(s>0)o.kg=s}
    if(!o.exp){o.exp=o.granel>0?'granel':o.anfo>0?'anfo':o.emuU>0?'cartucho':''}
    if(o.carga==null&&o.L!=null&&o.fin!=null)o.carga=Math.max(0,o.L-o.fin-(o.tacoInf||0));
    out.push(o)});
  if(!out.length)throw new Error('No se reconocieron taladros.');return out}

/* ---------- revisión ---------- */
/* o: {holes, orden:'SLOT,A1,A2,…' (posición desde la cara libre), justificacion, dens:{anfo,granel,cartucho}, ton:{anillo:t}, zonas:{anillo:'cara'|'anillos'},
       fcDecl:{cara,anillos}, vol, vacio, espon, ppv:{K,beta,dist,lim}, dDefault } */
function revisar(o){var H=(o.holes||[]).map(function(h){return Object.assign({},h)}),F=[],dens=Object.assign({},DENS,o.dens||{}),dDef=+o.dDefault||89;
  function add(sev,k,txt,campo,accion,ref){F.push({sev:sev,k:k,txt:txt,campo:campo||'',accion:accion||'',ref:ref||''})}
  /* 1) carga lineal y diámetro */
  var malDiam=[],dens2=[];H.forEach(function(h){var d=(h.d||dDef)/1000,A=PI/4*d*d,tp=tipoExp(h.exp);h.tipo=tp;
    if(h.kg>0&&h.carga>0&&tp!=='cartucho'){var q=h.kg/h.carga,rho=q/A/1000;h.q=q;h.rho=rho;
      if(rho>1.4){var dEq=Math.sqrt(q/((dens[tp]||1.15)*1000)/(PI/4))*1000;h.dEq=dEq;malDiam.push(h)}
      else if(tp==='anfo')dens2.push(rho)}});
  if(malDiam.length){var kgSobra=malDiam.reduce(function(s,h){var dd=(h.d||dDef)/1000;return s+(h.kg-h.carga*PI/4*dd*dd*(dens[h.tipo]||1.15)*1000)},0);
    add('alta','diam',malDiam.length+' taladro'+(malDiam.length>1?'s':'')+' con más kg de los que caben en el diámetro declarado ('+malDiam.slice(0,8).map(function(h){return h.anillo+'-'+h.id}).join(', ')+(malDiam.length>8?'…':'')+'). La carga equivale a un diámetro de ≈ '+Math.round(mean(malDiam.map(function(h){return h.dEq})))+' mm.',
      'El cargador llena hasta donde entra: si el taladro es del diámetro declarado se cargarán ≈ '+Math.round(kgSobra)+' kg menos de lo planificado y el factor de carga real bajará.','Confirma el diámetro real (¿escariado o broca mayor?) y corrige la hoja, o recalcula los kg con el diámetro de campo.','carga lineal = ρ·π·d²/4')}
  if(dens2.length>=3){var rm=mean(dens2);if(rm<dens.anfo*0.9)add('media','dens','La hoja de carga supone ANFO a '+rm.toFixed(2)+' g/cm³ en promedio. Cargado con equipo neumático suele quedar en '+dens.anfo.toFixed(2)+' g/cm³ o más.',
    'La carga real puede ser ≈ '+Math.round((dens.anfo/rm-1)*100)+' % mayor que la planificada: más kg por retardo, más vibración y daño que lo calculado.','Pesa o mide los kg cargados en 3–5 taladros y fija la densidad real en la plantilla de la hoja.','densidad de carguío neumático')}
  /* 2) estado de limpieza contra la carga */
  H.forEach(function(h){var e=h.estado.toLowerCase(),tap=/tapad|obstru|cerrad|no llega|falla/.test(e),Lr=h.real!=null?h.real:(function(){var m=e.match(/(\d+(?:[.,]\d+)?)\s*m/);return m?+m[1].replace(',','.'):null})();h.Lr=Lr;h.tapado=tap;
    if(tap&&h.kg>0){var tope=h.fin!=null&&Lr!=null?Lr-h.fin:null;
      if(Lr==null)add('alta','tap',h.anillo+'-'+h.id+' figura como "'+h.estado+'" pero mantiene '+Math.round(h.kg)+' kg de diseño sin longitud real.','El cargador no sabe hasta dónde cargar: puede sobrecargar el collar o dejar el taladro sin carga útil.','Registra la longitud real libre y ajusta la carga (o anúlalo) en la hoja que va al frente.');
      else if(tope!=null&&h.carga!=null&&tope<h.carga-0.5)add('media','tap',h.anillo+'-'+h.id+': libre hasta '+Lr+' m; la columna de diseño ('+h.carga.toFixed(1)+' m) no cabe. Carga posible ≈ '+Math.max(0,tope).toFixed(1)+' m.','Si se carga desde el collar, la carga queda concentrada arriba y daña la corona.','Ajusta kg y posición del cebo a la longitud libre; considera reperforar.')}
    if(h.kg>0&&(h.det||0)<2&&h.kg>40)add('baja','red',h.anillo+'-'+h.id+' lleva '+(h.det||0)+' detonador con '+Math.round(h.kg)+' kg.','Sin redundancia, un corte o falla deja un tiro quedado dentro de la masa.','Usa doble cebado en taladros > 40 kg.')});
  /* 3) taco superior */
  var cortos=H.filter(function(h){return h.kg>0&&h.fin!=null&&h.fin<15*((h.d||dDef)/1000)&&h.L>8});if(cortos.length)add('media','taco',cortos.length+' taladros largos con taco superior < 15 diámetros ('+cortos.slice(0,6).map(function(h){return h.anillo+'-'+h.id+' '+h.fin+' m'}).join(', ')+').','En abanicos los collares convergen: con taco corto se daña el piso del nivel de perforación y la boca de los taladros vecinos.','Taco 20–25·d o fin de carga escalonado (≈ 20/50/125·d) entre taladros vecinos.','Onederra y Chitombo (2007)');
  /* collares escalonados */
  var porAn={};H.forEach(function(h){(porAn[h.anillo]=porAn[h.anillo]||[]).push(h)});
  Object.keys(porAn).forEach(function(a){var fs=porAn[a].filter(function(h){return h.kg>0&&h.fin!=null&&h.L>10}).map(function(h){return h.fin});if(fs.length>=5){var u=fs.filter(function(v,i){return fs.indexOf(v)===i});if(u.length===1)add('baja','esc','Anillo '+a+': todos los taladros largos terminan la carga a '+u[0]+' m del collar.','Sin escalonar, la energía se concentra en la zona del collar.','Alterna el fin de carga entre taladros vecinos (corto / medio / largo).','Onederra y Chitombo (2007)')}});
  /* 4) secuencia contra la cara libre */
  var orden=String(o.orden||'').split(/[,;>\s]+/).map(function(x){return x.trim().toUpperCase()}).filter(Boolean),t0={};
  H.forEach(function(h){if(h.t!=null&&h.kg>0)t0[h.anillo]=Math.min(t0[h.anillo]==null?1e9:t0[h.anillo],h.t)});
  var sinT=H.filter(function(h){return h.kg>0&&h.t==null}),tSinC=H.filter(function(h){return !(h.kg>0)&&h.t!=null});
  if(sinT.length)add('alta','seq',sinT.length+' taladros cargados sin tiempo de salida ('+sinT.slice(0,6).map(function(h){return h.anillo+'-'+h.id}).join(', ')+').','Un taladro cargado sin programar queda como tiro quedado.','Asigna tiempo o anula la carga.');
  if(tSinC.length)add('media','seq',tSinC.length+' taladros con tiempo pero sin carga ('+tSinC.slice(0,6).map(function(h){return h.anillo+'-'+h.id}).join(', ')+').','Diferencia entre la hoja de secuencia y la de carga: el amarrador puede confundir el taladro.','Retira el tiempo o confirma que el taladro se carga.');
  var seq=null;if(orden.length>=2){var conT=orden.filter(function(a){return t0[a]!=null}),inv=[];for(var i=1;i<conT.length;i++)if(t0[conT[i]]<t0[conT[i-1]])inv.push(conT[i]+' sale antes que '+conT[i-1]);
    seq={orden:conT.map(function(a){return {a:a,t:t0[a]}}),inv:inv};
    if(inv.length){var j=String(o.justificacion||'').trim();
      if(j)add('info','seqj','Secuencia distinta al orden desde la cara libre ('+inv.join('; ')+'). Justificación del ingeniero: "'+j+'".','La decisión se respeta; el riesgo pasa al carguío y al amarre: cualquier confusión de rótulos congela la voladura.','Controles: (1) misma nomenclatura de anillos en plano, hoja de carga y programa del equipo de iniciación; (2) verificación cruzada del programa antes de conectar; (3) hoja de campo con el orden de salida en grande; (4) inspección del frente libre real antes de cargar.');
      else add('critica','seq','Los anillos no salen en orden desde la cara libre: '+inv.join('; ')+'.','Un anillo que sale sin cara libre congela, sobreexcava y deja bloques.','Si es intencional (terreno, cara libre alternativa), escribe la justificación para documentarla; si no, corrige la secuencia o los rótulos.')}}
  /* rótulos: anillos en la secuencia que no existen en el orden indicado */
  if(orden.length){var falt=Object.keys(t0).filter(function(a){return orden.indexOf(a)<0});if(falt.length)add('media','rot','Anillos con carga que no figuran en el orden desde la cara libre: '+falt.join(', ')+'.','Nomenclatura distinta entre hojas.','Unifica los rótulos (p. ej. A1…A5, A–E) en todas las hojas.')}
  /* 5) carga por ventana de 8 ms y vibración */
  var ev=H.filter(function(h){return h.kg>0&&h.t!=null}).map(function(h){return [h.t,h.kg]}).sort(function(a,b){return a[0]-b[0]}),mx=0,w=null;
  for(var a2=0;a2<ev.length;a2++){var s=0;for(var b=a2;b<ev.length&&ev[b][0]-ev[a2][0]<8;b++)s+=ev[b][1];if(s>mx){mx=s;w=ev[a2][0]}}
  var vib=null;if(mx>0){var p=o.ppv||{};if(+p.K>0&&+p.beta>0&&+p.dist>0){var ppv=p.K*Math.pow(p.dist/Math.sqrt(mx),-p.beta),qa=Math.pow(p.dist/Math.pow(p.lim/p.K,-1/p.beta),2);vib={ppv:ppv,qa:qa};
      if(+p.lim>0&&ppv>p.lim)add('alta','vib','Carga máxima en 8 ms: '+Math.round(mx)+' kg (desde '+w+' ms). PPV estimada a '+p.dist+' m: '+Math.round(ppv)+' mm/s contra límite '+p.lim+' mm/s.','Riesgo de dañar el relleno o la cámara vecina.','Separa los taladros que coinciden en 8 ms o reduce su carga (admisible ≈ '+Math.round(qa)+' kg).')}
    else add('info','vib','Carga máxima en una ventana de 8 ms: '+Math.round(mx)+' kg (desde '+w+' ms). Sin chequeo de vibración: ingresa K, β, distancia y límite.','No se puede verificar el efecto sobre el relleno o las cámaras vecinas.','Usa la ley de vibración de tu mina (pestaña Real).')}
  /* 6) indicadores por zona */
  var ton=o.ton||{},zon=o.zonas||{},Z={cara:{kg:0,t:0},anillos:{kg:0,t:0}},tot={kg:0,t:0},porA={};H.forEach(function(h){if(!(h.kg>0))return;porA[h.anillo]=(porA[h.anillo]||0)+h.kg});
  Object.keys(porA).forEach(function(a){var t=+ton[a]||0,z=zon[a]||(/^(slot|s\d|chim|[a-e]$|easer|cara)/i.test(a)?'cara':'anillos');Z[z].kg+=porA[a];Z[z].t+=t;tot.kg+=porA[a];tot.t+=t});
  var ind=null;if(tot.t>0){ind={cara:Z.cara.t?Z.cara.kg/Z.cara.t:null,anillos:Z.anillos.t?Z.anillos.kg/Z.anillos.t:null,total:tot.kg/tot.t,porA:Object.keys(porA).map(function(a){return {a:a,kg:porA[a],t:+ton[a]||0,fc:+ton[a]?porA[a]/ton[a]:null}})};
    var fd=o.fcDecl||{};['cara','anillos'].forEach(function(k){var dcl=+fd[k],real=ind[k];if(dcl>0&&real){var alt=Z[k].kg/tot.t;if(Math.abs(dcl-real)/real>0.2)add('media','ind','Factor de carga declarado en '+(k==='cara'?'cara libre':'anillos')+': '+dcl.toFixed(2)+' kg/t; calculado con las toneladas de esa zona: '+real.toFixed(2)+' kg/t'+(Math.abs(alt-dcl)<0.02?' (el declarado usa las toneladas totales como denominador)':'')+'.','El aprobador lee el indicador equivocado: puede creer que falta energía donde sobra.','Divide los kg de cada zona entre las toneladas de esa misma zona.')}})}
  /* 7) vacíos */
  var vac=null;if(+o.vol>0&&+o.vacio>0){var fe=+o.espon||1.35;vac={rel:o.vol*fe/(o.vol+ +o.vacio)*100,fe:fe,feLim:(o.vol+ +o.vacio)/o.vol};
    add(vac.rel>100?'critica':vac.rel>90?'alta':'info','vac','Relación de vacío '+vac.rel.toFixed(0)+' % con esponjamiento '+fe+'. La voladura se congela si el esponjamiento real supera '+vac.feLim.toFixed(2)+'.',vac.rel>90?'Margen insuficiente: el esponjamiento real del primer disparo suele estar entre 1,3 y 1,5.':'Margen adecuado.',vac.rel>90?'Divide la voladura o confirma con escáner el vacío limpiado antes de cargar.':'')}
  var orden2={critica:0,alta:1,media:2,baja:3,info:4};F.sort(function(a,b){return orden2[a.sev]-orden2[b.sev]});
  return {holes:H,hallazgos:F,seq:seq,maxKg8:mx,tMax:w,vib:vib,ind:ind,vac:vac,n:H.length,nCarg:H.filter(function(h){return h.kg>0}).length,kg:H.reduce(function(s,h){return s+(h.kg||0)},0),
    resumen:{critica:F.filter(function(f){return f.sev==='critica'}).length,alta:F.filter(function(f){return f.sev==='alta'}).length,media:F.filter(function(f){return f.sev==='media'}).length}}}
function mean(a){return a.length?a.reduce(function(s,v){return s+v},0)/a.length:0}
/* hoja de campo: orden de salida por anillo con ajustes de los tapados */
function hojaCampo(R){var por={};R.holes.forEach(function(h){(por[h.anillo]=por[h.anillo]||[]).push(h)});
  return Object.keys(por).map(function(a){var hs=por[a].slice().sort(function(x,y){return (x.t==null?1e9:x.t)-(y.t==null?1e9:y.t)});return {a:a,t:Math.min.apply(null,hs.filter(function(h){return h.t!=null}).map(function(h){return h.t}).concat([1e9])),holes:hs}}).sort(function(x,y){return x.t-y.t})}
var API={parsePlan:parsePlan,revisar:revisar,hojaCampo:hojaCampo,tipoExp:tipoExp,DENS:DENS};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else{root.SVE=root.SVE||{};root.SVE.PLAN=API}
})(this);
