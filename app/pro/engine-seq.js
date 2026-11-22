/* Structiar · secuencia de tajos (implementación propia).
   Idea de Gómez (2015, U. de Chile): las restricciones (toneladas, relleno, metros perforados) y la dilución
   se evalúan juntas; si se imponen por separado el plan suele quedar infactible.
   Dilución por caserón: ELOS de cada caja × área de la caja × densidad del estéril (método de la tesis, tablas 32 y 35).
   ELOS desde N′ y radio hidráulico: 0,73·RH^0,93 / N′^1,06 (ajuste a las lecturas de la misma tesis; error típico 10 %).
   Pensado para minas sin secuencia establecida: pocos datos, valores típicos si faltan, y cada decisión explicada. */
(function(root){'use strict';
function n(x,d){x=+x;return isFinite(x)&&x>0?x:d}
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
/* t: {id,nombre,ancho,alto,largo,manteo,ley,densMin,densEst,elos (manual, m),np (N′),tpm (t por m perforado),relleno ('si'|'no'),antes (id)} */
function tajoCalc(t){var w=n(t.ancho,2),H=n(t.alto,15),L=n(t.largo,20),dip=clamp(n(t.manteo,75),30,90),dm=n(t.densMin,2.8),de=n(t.densEst,2.7),
    Hinc=H/Math.sin(dip*Math.PI/180),HR=(L*Hinc)/(2*(L+Hinc)),np=+t.np>0?+t.np:null,elosM=+t.elos>0?+t.elos:null;
  var eH=elosM!=null?elosM:np!=null?clamp(0.73*Math.pow(HR,0.93)/Math.pow(np,1.06),0.05,4):0.5,eF=elosM!=null?elosM:eH*0.6,
    area=L*H,tonMin=w*H*L*dm,tonEst=(eH+eF)*area*de,tonTot=tonMin+tonEst,dil=tonEst/tonTot*100,ley=+t.ley||0,leyDil=ley*tonMin/tonTot,
    tpm=n(t.tpm,10),perf=tonTot/tpm,rell=t.relleno==='no'?0:(w+eH+eF)*H*L;
  return {id:t.id,nombre:t.nombre||t.id,HR:HR,np:np,elosHW:eH,elosFW:eF,fuenteElos:elosM!=null?'medido':np!=null?'N′':'típico',
    tonMin:tonMin,tonEst:tonEst,tonTot:tonTot,dil:dil,ley:ley,leyDil:leyDil,metal:tonTot*leyDil,perf:perf,relleno:rell,antes:t.antes||null}}
/* cap: {ton, perf, relleno} por mes; meses: cuántos meses planificar.
   Reglas: 1) un tajo empezado se termina antes de abrir otro si hay capacidad; 2) un tajo solo empieza cuando el que
   debe ir antes ya está extraído y, si lleva relleno, rellenado; 3) el relleno de un tajo se hace el mes siguiente a
   terminarlo; 4) entre los disponibles va primero el de más metal por tonelada extraída (ley diluida);
   5) el relleno va primero al tajo que destraba a otro. */
function secuenciar(tajos,cap,meses){var T=tajos.map(tajoCalc),byId={},m=clamp(Math.round(n(meses,6)),1,36),C={ton:n(cap&&cap.ton,1e12),perf:n(cap&&cap.perf,1e12),rell:n(cap&&cap.relleno,1e12)};
  T.forEach(function(x){x.rest=x.tonTot;x.estado='pendiente';x.rellRest=x.relleno;x.inicio=null;x.fin=null;x.finRell=null;byId[x.id]=x});
  function listo(x,mes){if(!x.antes||!byId[x.antes])return true;var a=byId[x.antes];return a.fin!=null&&a.fin<mes&&(a.relleno===0||(a.finRell!=null&&a.finRell<mes))}
  var plan=[];for(var k=1;k<=m;k++){var cT=C.ton,cP=C.perf,cR=C.rell,fila={mes:k,items:[],relleno:[],ton:0,metal:0,perf:0,rell:0,tonEst:0,notas:[],esperan:[]};
    /* relleno de tajos terminados antes de este mes */
    /* primero el relleno que destraba a otro tajo; luego el que terminó antes */
    var bloquea=function(x){return T.some(function(y){return y.antes===x.id&&y.rest>0})};
    T.filter(function(x){return x.fin!=null&&x.fin<k&&x.rellRest>0}).sort(function(a,b){return (bloquea(b)?1:0)-(bloquea(a)?1:0)||a.fin-b.fin}).forEach(function(x){var r=Math.min(x.rellRest,cR);if(r<=0){fila.notas.push(x.nombre+': falta capacidad de relleno');return}x.rellRest-=r;cR-=r;fila.rell+=r;fila.relleno.push({id:x.id,nombre:x.nombre,m3:r});if(x.rellRest<=1e-6){x.rellRest=0;x.finRell=k}});
    var cand=T.filter(function(x){return x.rest>1e-6}).sort(function(a,b){var ia=a.estado==='en curso'?0:1,ib=b.estado==='en curso'?0:1;return ia-ib||b.leyDil-a.leyDil});
    cand.forEach(function(x){if(x.estado!=='en curso'&&!listo(x,k)){var ab=byId[x.antes];x.espera='espera a '+(ab?ab.nombre:'');fila.esperan.push({id:x.id,nombre:x.nombre,antes:ab?ab.nombre:'',falta:ab&&ab.fin!=null&&ab.fin<k?'relleno':'extracción'});return}
      var tPerf=cP*(x.tonTot/x.perf),t=Math.min(x.rest,cT,tPerf);if(t<1)return;
      var f=t/x.tonTot;x.rest-=t;cT-=t;cP-=t*x.perf/x.tonTot;if(x.inicio==null)x.inicio=k;x.estado='en curso';x.espera=null;
      fila.items.push({id:x.id,nombre:x.nombre,ton:t,frac:f,leyDil:x.leyDil,tonEst:x.tonEst*f,perf:x.perf*f});fila.ton+=t;fila.metal+=t*x.leyDil;fila.perf+=x.perf*f;fila.tonEst+=x.tonEst*f;
      if(x.rest<=1e-6){x.rest=0;x.fin=k;x.estado=x.relleno>0?'por rellenar':'terminado'}});
    T.forEach(function(x){if(x.estado==='por rellenar'&&x.finRell!=null)x.estado='terminado'});
    fila.leyDil=fila.ton>0?fila.metal/fila.ton:0;fila.dil=fila.ton>0?fila.tonEst/fila.ton*100:0;
    fila.uso={ton:C.ton<1e11?fila.ton/C.ton:null,perf:C.perf<1e11?fila.perf/C.perf:null,rell:C.rell<1e11?fila.rell/C.rell:null};
    fila.limita=['ton','perf','rell'].filter(function(k2){return fila.uso[k2]!=null&&fila.uso[k2]>0.98});plan.push(fila)}
  var pend=T.filter(function(x){return x.rest>0}).map(function(x){return {id:x.id,nombre:x.nombre,ton:x.rest,motivo:x.espera||(x.antes&&!listo(x,m+1)?'espera a '+byId[x.antes].nombre:'falta capacidad en el horizonte')}});
  return {tajos:T,plan:plan,pendientes:pend,cap:C}}
var API={tajoCalc:tajoCalc,secuenciar:secuenciar};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else{root.SVE=root.SVE||{};root.SVE.SEQ=API}
})(this);
