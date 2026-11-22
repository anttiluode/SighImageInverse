/* Run with: node tests/inverse.test.js
   Deterministic kill tests: actual unknown-law recovery, held-out transfer,
   exact Sigh operator convention, lack-of-information null.
*/
"use strict";
const assert = require("node:assert/strict");
const C = require("../solver.js");
function sample(N, seed) {
  let state = seed >>> 0;
  const out = new Float64Array(N * N);
  for (let y=0;y<N;y++) for(let x=0;x<N;x++) {
    state = (Math.imul(state,1664525)+1013904223)>>>0;
    out[y*N+x] = .27*(state/4294967296-.5)+.22*Math.sin(x*.17+y*.05)+.15*Math.cos(x*.33-y*.16);
  }
  return out;
}
function test(name, fn) { try { fn(); console.log("PASS",name); } catch(e) { console.error("FAIL",name); throw e; } }
const mystery = [.10,.29,.70,.96,1,.95,.78,.46,.22,.09];
test("radix-2 FFT lossless numerical round trip",()=>{
 const N=32,a=sample(N,42),f=C.fft2(a,N);
 const b=C.fromSpectrum(f.re,f.im,N);
 assert.ok(C.rmse(a,b)<1e-12);
});
test("Sigh k² bins have DC=0 and Nyquist corner=255",()=>{
 assert.equal(C.lookupIndex(0,0,64),0);
 assert.equal(C.lookupIndex(32,32,64),255);
 assert.equal(C.lookupIndex(0,32,64),127);
});
test("Sigh feedback recursion obeys h0=1 and g=1 is invariant",()=>{
 for(let n=1;n<=8;n++) {
   assert.equal(C.transfer(1,n,.4),1);
   assert.equal(C.transfer(0,n,.4),.4);
 }
});
for(const alpha of [0,.2]) for(const passes of [1,5]) {
 test("recovers ten-band mystery, passes="+passes+" alpha="+alpha,()=>{
   const N=64,a=sample(N,2381),b=C.forward(a,N,mystery,passes,alpha);
   const prep=C.prepare(a,b,N,passes,alpha),res=C.greedy(prep,90);
   assert.ok(res.history.length>10,"No actual probes made");
   for(let i=0;i<10;i++) assert.ok(Math.abs(res.gains[i]-mystery[i])<.006,"Band "+i+" mismatch");
   assert.ok(C.rmse(C.forward(a,N,res.gains,passes,alpha),b)<.00002);
   assert.ok(Number.isFinite(res.history.at(-1).holdout));
   // Transfer: new input was not used to recover the EQ.
   const unseen=sample(N,92771);
   assert.ok(C.rmse(C.forward(unseen,N,res.gains,passes,alpha),C.forward(unseen,N,mystery,passes,alpha))<.00002);
 });
}
test("null experiment: all-zero original cannot identify any EQ band",()=>{
 const N=64,zeros=new Float64Array(N*N);
 const b=C.forward(zeros,N,mystery,4,0);
 const prep=C.prepare(zeros,b,N,4,0),ans=C.greedy(prep,50);
 assert.equal(prep.items.length,0);
 assert.equal(ans.history.length,1);
 assert.ok(ans.gains.every(x=>x===1)); // prior, not discovery
 assert.ok(ans.known.every(x=>x===0));
});
test("cannot perfectly explain a spatially shifted target with a radial zero-phase EQ",()=>{
 const N=64,a=sample(N,15);
 const rotated = new Float64Array(N*N);
 for(let y=0;y<N;y++)for(let x=0;x<N;x++)rotated[y*N+x]=a[y*N+(x+3)%N];
 const p=C.prepare(a,rotated,N,1,0),g=C.greedy(p,80);
 const reconstruction=C.forward(a,N,g.gains,1,0);
 assert.ok(C.rmse(reconstruction,rotated)>.02,"A shift was incorrectly claimed as a radial EQ");
});
console.log("All inverse Sigh tests passed.");
