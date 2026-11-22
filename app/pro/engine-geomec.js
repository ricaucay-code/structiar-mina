/* Structiar · ficha geomecánica por frente (implementación propia, métodos públicos).
   - Q de Barton (Barton, Lien y Lunde 1974): Q = (RQD/Jn)·(Jr/Ja)·(Jw/SRF), con RQD mínimo 10.
   - RMR ↔ Q (Bieniawski 1976): RMR = 9·ln Q + 44.
   - Claro máximo sin sostener (Barton 1974): 2·ESR·Q^0,4. Largo de perno: L = 2 + 0,15·B/ESR.
   - ESR: excavación minera temporal 3,0; permanente (galería principal, rampa, crucero de acceso) 1,6.
   - N′ de Mathews/Potvin para tajos: N′ = Q′·A·B·C, con Q′ = (RQD/Jn)·(Jr/Ja). */
(function(root){'use strict';
function n(x){x=+x;return isFinite(x)?x:null}
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
var CLASES=[['I',81,'Muy buena'],['II',61,'Buena'],['III',41,'Regular'],['IV',21,'Mala'],['V',0,'Muy mala']];
function clase(rmr){rmr=n(rmr);if(rmr==null)return null;for(var i=0;i<CLASES.length;i++)if(rmr>=CLASES[i][1])return CLASES[i][0];return 'V'}
function claseNombre(c){var x=CLASES.filter(function(k){return k[0]===c})[0];return x?x[2]:''}
function qBarton(g){var rqd=n(g.rqd),jn=n(g.jn),jr=n(g.jr),ja=n(g.ja),jw=n(g.jw),srf=n(g.srf);if(rqd==null||!jn||jr==null||!ja)return null;
  rqd=clamp(rqd,10,100);jw=jw==null?1:jw;srf=srf||1;return {q:(rqd/jn)*(jr/ja)*(jw/srf),qp:(rqd/jn)*(jr/ja)}}
function rmrDeQ(q){return q>0?9*Math.log(q)+44:null}
function qDeRmr(r){return Math.exp((r-44)/9)}
/* g: {rqd,jn,jr,ja,jw,srf, rmr (medido, opcional), ucs, perm:'perm'|'temp', A,B,C (tajo)}; fr: {ancho, alto, tipo} */
function evaluar(g,fr){g=g||{};fr=fr||{};var Q=qBarton(g),rmrMed=n(g.rmr),q=Q?Q.q:(rmrMed!=null?qDeRmr(rmrMed):null),qp=Q?Q.qp:null;
  if(q==null)return null;
  var rmrQ=rmrDeQ(q),rmr=rmrMed!=null?rmrMed:rmrQ,cl=clase(rmr),esr=g.perm==='temp'?3:1.6,B=Math.max(n(fr.ancho)||0,0),Hh=n(fr.alto)||0,
    span=2*esr*Math.pow(q,0.4),perno=2+0.15*Math.max(B,0.1)/esr,De=B/esr,dif=rmrMed!=null&&Q?Math.abs(rmrMed-rmrQ):null;
  var Np=null;if(qp!=null&&n(g.A)!=null&&n(g.B)!=null&&n(g.C)!=null)Np=qp*n(g.A)*n(g.B)*n(g.C);
  var r={q:q,qp:qp,rmr:rmr,rmrDeQ:rmrQ,rmrMedido:rmrMed,clase:cl,claseNombre:claseNombre(cl),esr:esr,De:De,spanMax:span,
    necesitaSost:B>span,perno:perno,Np:Np,ucs:n(g.ucs),consistente:dif==null||dif<=15,difRmr:dif,alertas:[]};
  if(dif!=null&&dif>15)r.alertas.push('El RMR medido ('+Math.round(rmrMed)+') y el que sale de la Q ('+Math.round(rmrQ)+') difieren '+Math.round(dif)+' puntos: revisa el mapeo.');
  if(B>span)r.alertas.push('El ancho de '+B.toFixed(1)+' m supera el claro máximo sin sostener ('+span.toFixed(1)+' m): necesita sostenimiento sistemático.');
  /* en tajos las cajas se evalúan con Mathews (N′ y radio hidráulico) en Barrenación larga, no con el claro de Barton */
  if(g.perm!=='temp'&&Hh>0&&span<Hh)r.alertas.push('La altura de los hastiales ('+Hh.toFixed(1)+' m) supera el claro estable: revisa su sostenimiento.');
  if(g.perm==='temp'&&Np!=null)r.alertas.push('Tajo: la estabilidad de las cajas y la dilución se calculan con N′ = '+Np.toFixed(1)+' en Voladura Pro · Barrenación larga.');
  return r}
var API={evaluar:evaluar,qBarton:qBarton,rmrDeQ:rmrDeQ,qDeRmr:qDeRmr,clase:clase,claseNombre:claseNombre};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else{root.SVE=root.SVE||{};root.SVE.GM=API}
})(this);
