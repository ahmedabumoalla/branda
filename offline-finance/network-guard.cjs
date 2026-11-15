'use strict';
function installNetworkGuard(){
 const allowed=host=>['127.0.0.1','localhost','::1','[::1]',''].includes(String(host||'').toLowerCase());
 const net=require('node:net'),original=net.Socket.prototype.connect;
 // net.connect passes [options, callback, normalizedSymbol] to Socket.connect.
 // Inspect the inner options as well as direct port/host and options overloads.
 net.Socket.prototype.connect=function(...args){
  const values=Array.isArray(args[0])?args[0]:args,arg=values[0];
  const options=arg&&typeof arg==='object'?arg:null;
  const host=options?.host??(typeof values[1]==='string'?values[1]:'');
  if(!allowed(host)||options?.path||(typeof arg==='string'&&!/^\d+$/.test(arg)))throw new Error('الاتصالات الخارجية غير متاحة في النسخة المحلية');
  // A caller-provided DNS lookup must not redirect localhost to an external IP.
  if(options&&String(host).toLowerCase()==='localhost'&&options.lookup)options.lookup=(_host,opts,callback)=>{const address=opts?.family===6?'::1':'127.0.0.1',family=opts?.family===6?6:4;callback(null,...(opts?.all?[[{address,family}]]:[address,family]));};
  return original.apply(this,args);
 };
 const dns=require('node:dns'),lookup=dns.lookup;dns.lookup=function(host,...args){if(!allowed(host))throw new Error('الاتصالات الخارجية غير متاحة في النسخة المحلية');return lookup.call(this,host,...args);};
 const fetchOriginal=globalThis.fetch;globalThis.fetch=(input,options)=>{const u=new URL(input instanceof Request?input.url:String(input));if(!allowed(u.hostname)||u.protocol!=='http:')return Promise.reject(new Error('هذه الخدمة تحتاج اتصالًا بالإنترنت وهي غير متاحة محليًا'));return fetchOriginal(input,options);};
}
module.exports={installNetworkGuard};
