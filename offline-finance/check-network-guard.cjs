'use strict';
const assert=require('node:assert/strict'),net=require('node:net'),dns=require('node:dns'),http=require('node:http');
// The original connection primitives are replaced before the guard is installed.
// No test below can open a network connection or perform DNS resolution.
let connections=0,fetches=0,lookups=0,checks=0;
net.Socket.prototype.connect=function(){connections++;return this;};
dns.lookup=function(){lookups++;return 'stub';};
globalThis.fetch=async()=>{fetches++;return new Response('local');};
require('./network-guard.cjs').installNetworkGuard();
const check=fn=>{fn();checks++;};
(async()=>{
 for(const args of [[443,'203.0.113.5'],[{port:443,host:'203.0.113.5'}],[[{port:443,host:'203.0.113.5'},()=>{}]],[{port:443,host:'example.invalid'}],[{path:'\\\\remote\\pipe\\name'}]])check(()=>assert.throws(()=>net.Socket.prototype.connect.apply({},args),/غير متاحة/));
 for(const args of [[80,'127.0.0.1'],[{port:80,host:'localhost'}],[[{port:80,host:'::1'},()=>{}]],[80]])check(()=>assert.doesNotThrow(()=>net.Socket.prototype.connect.apply({},args)));
 check(()=>assert.equal(connections,4));
 check(()=>assert.throws(()=>net.connect({host:'203.0.113.5',port:443}),/غير متاحة/));
 check(()=>assert.throws(()=>http.request('http://203.0.113.5/'),/غير متاحة/));
 check(()=>assert.throws(()=>dns.lookup('example.invalid'),/غير متاحة/));
 check(()=>assert.equal(lookups,0));
 const local=http.request('http://127.0.0.1/');local.on('error',()=>{});local.destroy();check(()=>assert.equal(connections,5));
 await assert.rejects(()=>fetch('https://example.invalid/'),/غير متاحة/);checks++;
 await assert.rejects(()=>fetch('http://203.0.113.5/'),/غير متاحة/);checks++;
 await assert.rejects(()=>fetch('https://localhost/'),/غير متاحة/);checks++;
 check(()=>assert.equal(fetches,0));await fetch('http://127.0.0.1/');check(()=>assert.equal(fetches,1));
 const redirect={host:'localhost',port:80,lookup:()=>assert.fail('Custom external resolver called')};net.Socket.prototype.connect.call({},[redirect,()=>{}]);redirect.lookup('localhost',{all:true},(error,addresses)=>{check(()=>assert.equal(error,null));check(()=>assert.deepEqual(addresses,[{address:'127.0.0.1',family:4}]));});
 console.log(JSON.stringify({pass:true,checks,network:'All native network and DNS calls replaced by inert stubs',at:new Date().toISOString(),runtime:process.version}));
})().catch(error=>{console.error(error);process.exitCode=1;});
