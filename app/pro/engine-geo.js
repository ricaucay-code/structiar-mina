/* Structiar Voladura Pro · estructuras (familias de discontinuidades)
   Red estereográfica de igual área (Schmidt), hemisferio inferior. Ángulos en grados, azimut desde el norte.
   Análisis: orientación de familias contra el eje de la labor (desarrollo) y contra la caja techo (tajos),
   factores B y C de Mathews según Potvin (1988). */
(function(root){'use strict';
var PI=Math.PI,rad=function(d){return d*PI/180},deg=function(r){return r*180/PI};
function norm360(a){a%=360;return a<0?a+360:a}
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
/* vector normal (hacia arriba) de un plano con buzamiento dip y dirección de buzamiento dd; ejes x=E, y=N, z=arriba */
function normal(dip,dd){var d=rad(dip),a=rad(dd);return [Math.sin(d)*Math.sin(a),Math.sin(d)*Math.cos(a),Math.cos(d)]}
function anguloPlanos(p1,p2){var n1=normal(p1.dip,p1.dd),n2=normal(p2.dip,p2.dd),c=Math.abs(n1[0]*n2[0]+n1[1]*n2[1]+n1[2]*n2[2]);return deg(Math.acos(clamp(c,0,1)))}
/* proyección de igual área de una línea (trend, plunge) en un círculo de radio Rr */
function proy(trend,plunge,Rr){var r=Rr*Math.SQRT2*Math.sin(rad(90-plunge)/2);return [r*Math.sin(rad(trend)),-r*Math.cos(rad(trend))]}
function polo(dip,dd){return {trend:norm360(dd+180),plunge:90-dip}}
function circuloMayor(dip,dd,Rr){var a=rad(dd-90),d=rad(dip),s=[Math.sin(a),Math.cos(a),0],dv=[Math.sin(rad(dd))*Math.cos(d),Math.cos(rad(dd))*Math.cos(d),-Math.sin(d)],pts=[];
  for(var t=0;t<=180;t+=4){var c=Math.cos(rad(t)),sn=Math.sin(rad(t)),v=[c*s[0]+sn*dv[0],c*s[1]+sn*dv[1],c*s[2]+sn*dv[2]];if(v[2]>0)v=[-v[0],-v[1],-v[2]];
    var pl=deg(Math.asin(clamp(-v[2],-1,1))),tr=norm360(deg(Math.atan2(v[0],v[1])));pts.push(proy(tr,pl,Rr))}return pts}
/* factor B de Mathews (Potvin 1988) según el ángulo relativo entre la familia crítica y la superficie expuesta */
function factorB(ang){var T=[[0,0.3],[10,0.2],[20,0.2],[30,0.4],[45,0.6],[60,0.8],[90,1.0]];for(var i=1;i<T.length;i++)if(ang<=T[i][0]){var a=T[i-1],b=T[i];return a[1]+(b[1]-a[1])*(ang-a[0])/(b[0]-a[0])}return 1}
/* factor C: caída por gravedad o lajamiento C = 8 − 6·cos(α superficie); deslizamiento C = 8 − 7·cos(β familia) */
function factorC(dipSup,dipFam){var g=8-6*Math.cos(rad(dipSup)),s=dipFam==null?99:8-7*Math.cos(rad(dipFam));return {C:Math.max(1,Math.min(g,s)),modo:s<g?'deslizamiento':'gravedad / lajamiento',grav:g,desl:s}}
/* análisis para una labor de desarrollo con rumbo (azimut del eje) */
function analizarLabor(fams,rumbo){return (fams||[]).filter(valida).map(function(f,i){var str=norm360(f.dd-90),diff=Math.abs(((str-rumbo)%180+180)%180);if(diff>90)diff=180-diff;
  var cls,zona,fac;if(f.dip<=30){cls='desfavorable';zona='corona';fac=1.35}else if(f.dip>=60&&diff<=30){cls='desfavorable';zona='hastiales';fac=1.5}else if(diff<=45){cls='regular';zona=f.dip>=45?'hastiales':'hombros';fac=1.2}else{cls='favorable';zona='—';fac=1.0}
  return {i:i,nombre:f.nombre||('J'+(i+1)),dip:f.dip,dd:f.dd,angEje:diff,clase:cls,zona:zona,factor:fac}})}
/* análisis para un tajo: superficie = caja techo (buzamiento de veta, dirección de buzamiento = rumbo + 90) */
function analizarTajo(fams,rumbo,dipVeta){var hw={dip:dipVeta,dd:norm360(rumbo+90)};var out=(fams||[]).filter(valida).map(function(f,i){var ang=anguloPlanos(f,hw);return {i:i,nombre:f.nombre||('J'+(i+1)),dip:f.dip,dd:f.dd,ang:ang,B:factorB(ang)}});
  var crit=out.slice().sort(function(a,b){return a.B-b.B})[0]||null;var C=factorC(dipVeta,crit?crit.dip:null);return {fams:out,crit:crit,B:crit?crit.B:null,C:C.C,modoC:C.modo,hw:hw}}
/* constante de roca de Langefors.
   modo 'auto': c = 0,4/Kr² ; 'manual': c del usuario ; 'qrcs': fórmula empírica con Q de Barton y RCS
   c̄ = 0,1257·e^(0,0109·Q) + 0,11·ln(RCS)  (entrega directamente la c corregida, c̄ = c + 0,05) */
function cRoca(o){var m=o.modo==='qrcs'?'qrcs':(+o.c>0?'manual':'auto'),c,cb,txt;
  if(m==='qrcs'&&+o.q>0&&+o.ucs>0){cb=0.1257*Math.exp(0.0109*o.q)+0.11*Math.log(o.ucs);c=cb-0.05;txt='c̄ = 0,1257·e^(0,0109·Q) + 0,11·ln(RCS) con Q '+fmt(o.q)+' y RCS '+fmt(o.ucs)+' MPa'}
  else if(m==='manual'&&+o.c>0){c=+o.c;cb=c+0.05;txt='c = '+fmt(c)+' (tu constante), c̄ = c + 0,05'}
  else{m='auto';c=0.4*o.kr*o.kr;cb=c+0.05;txt='c = 0,4·Kr² con Kr '+fmt(o.kr)+', c̄ = c + 0,05'}
  return {modo:m,c:c,cbar:cb,txt:txt}}
function fmt(x){return (Math.round(x*100)/100).toString().replace('.',',')}
/* velocidad crítica de partícula (Persson / McKenzie): PPVc = σt·Vp/E ; Vp de Barton: 3500 + 1000·log10(Q) */
function ppvCritica(o){var vp=+o.vp>0?+o.vp:(+o.q>0?3500+1000*Math.log10(+o.q):null);if(!vp)return null;
  var ucs=+o.ucs||80,st=+o.st>0?+o.st:ucs/10,ei=+o.ei>0?+o.ei:0.4*ucs,pc=st*vp/ei;
  return {vp:vp,vpMedida:+o.vp>0,st:st,stEst:!(+o.st>0),ei:ei,eiEst:!(+o.ei>0),ppvc:pc,zonas:[{n:'Dilatación de fracturas',f:0.25,v:pc/4},{n:'Nuevas fracturas',f:1,v:pc},{n:'Daño notorio',f:4,v:4*pc},{n:'Trituración',f:8,v:8*pc}]}}
function valida(f){return f&&isFinite(+f.dip)&&isFinite(+f.dd)&&+f.dip>=0&&+f.dip<=90}
var API={normal:normal,anguloPlanos:anguloPlanos,proy:proy,polo:polo,circuloMayor:circuloMayor,factorB:factorB,factorC:factorC,analizarLabor:analizarLabor,analizarTajo:analizarTajo,valida:valida,cRoca:cRoca,ppvCritica:ppvCritica};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else{root.SVE=root.SVE||{};root.SVE.GEO=API}
})(this);
