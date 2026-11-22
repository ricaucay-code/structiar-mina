/* Structiar · pronóstico de avance con simulación del ciclo (implementación propia).
   Método: Monte Carlo del ciclo de perforación y voladura con turnos (Vargas, Koppe y Pérez, TUST 40, 2014).
   Cada operación tiene media y desviación; dentro del turno una operación solo empieza si queda más que la
   tolerancia; si el turno termina con una operación a medias, se retoma en el siguiente con un tiempo de reinicio. */
(function(root){'use strict';
function rng(seed){var s=seed>>>0||1;return function(){s=(s*1664525+1013904223)>>>0;return (s+0.5)/4294967296}}
function gauss(r){var u=r(),v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
/* gamma con forma k y escala θ (Marsaglia–Tsang) */
function gamma(r,k){if(k<1){return gamma(r,k+1)*Math.pow(r(),1/k)}var d=k-1/3,c=1/Math.sqrt(9*d);for(;;){var x=gauss(r),v=1+c*x;if(v<=0)continue;v=v*v*v;var u=r();if(u<1-0.0331*x*x*x*x||Math.log(u)<0.5*x*x+d*(1-v+Math.log(v)))return d*v}}
function muestra(r,op){var m=+op.media||0,s=+op.desv||0;if(s<=0||m<=0)return Math.max(0,m);var k=(m*m)/(s*s),th=(s*s)/m,x=gamma(r,k)*th;if(op.min!=null)x=Math.max(+op.min,x);if(op.max!=null)x=Math.min(+op.max,x);return x}
function pct(a,p){return a[Math.min(a.length-1,Math.max(0,Math.round((a.length-1)*p)))]}
/* p: {ops:[{n,media,desv,min,max}], turno:min, tol:min, reinicio:min, turnosDia, L:m perforado, eff:% (media), effDesv:%, largo:m, sims} */
function simular(p){var r=rng(p.seed||7),N=Math.max(100,Math.min(20000,p.sims||3000)),dt=+p.turno||540,tol=+p.tol||0,beg=+p.reinicio||0,res=[],ciclosT=[],ops=p.ops||[];
  if(!ops.length||!(p.largo>0)||!(p.L>0))return null;
  for(var i=0;i<N;i++){var dev=0,turnos=0,t=0,k=0,ciclos=0,guard=0,rest=0;
    while(dev<p.largo&&guard++<200000){turnos++;t=rest;rest=0;
      while(t<=dt-tol&&dev<p.largo){var d=muestra(r,ops[k]);t+=d;k++;if(k>=ops.length){k=0;ciclos++;var e=Math.max(0.3,Math.min(1,((+p.eff||90)+gauss(r)*(+p.effDesv||0))/100));dev+=p.L*e}}
      if(t>dt)rest=Math.min(dt,t-dt+beg)}
    res.push(turnos);ciclosT.push(ciclos/turnos)}
  res.sort(function(a,b){return a-b});var td=+p.turnosDia||2,m=res.reduce(function(a,b){return a+b},0)/N;
  return {turnos:{p10:pct(res,0.1),p50:pct(res,0.5),p90:pct(res,0.9),media:m,min:res[0],max:res[N-1]},dias:{p10:pct(res,0.1)/td,p50:pct(res,0.5)/td,p90:pct(res,0.9)/td},
    ciclosTurno:ciclosT.reduce(function(a,b){return a+b},0)/N,mTurno:p.largo/m,mDia:p.largo/m*td,hist:res}}
/* plan convencional (determinístico): ciclos por turno = turno efectivo / suma de medias */
function planFijo(p){var c=(p.ops||[]).reduce(function(a,o){return a+(+o.media||0)},0);if(!c)return null;var cT=(+p.turno||540)/c,mT=cT*p.L*(+p.eff||90)/100;return {ciclosTurno:cT,mTurno:mT,turnos:p.largo/mT,dias:p.largo/mT/(+p.turnosDia||2)}}
/* metros alcanzables en un número fijo de turnos (para cerrar el mes): misma lógica de turnos y reinicios */
function metrosEnTurnos(p,nT){var r=rng(p.seed||11),N=Math.max(100,Math.min(5000,p.sims||1500)),dt=+p.turno||540,tol=+p.tol||0,beg=+p.reinicio||0,ops=p.ops||[],out=[];
  if(!ops.length||!(p.L>0)||!(nT>0))return {p10:0,p50:0,p90:0,media:0};
  for(var i=0;i<N;i++){var m=0,k=0,rest=0;for(var t0=0;t0<nT;t0++){var t=rest;rest=0;
      while(t<=dt-tol){t+=muestra(r,ops[k]);k++;if(k>=ops.length){k=0;var e=Math.max(0.3,Math.min(1,((+p.eff||90)+gauss(r)*(+p.effDesv||0))/100));m+=p.L*e}}
      if(t>dt)rest=Math.min(dt,t-dt+beg)}
    out.push(m)}
  out.sort(function(a,b){return a-b});
  /* p10 = valor que se supera 9 de cada 10 veces (pesimista); p90 = optimista */
  return {p10:pct(out,0.1),p50:pct(out,0.5),p90:pct(out,0.9),media:out.reduce(function(a,b){return a+b},0)/N}}
var API={simular:simular,planFijo:planFijo,metrosEnTurnos:metrosEnTurnos};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else{root.SVE=root.SVE||{};root.SVE.CIC=API}
})(this);
