const { test } = require('node:test');
const assert = require('node:assert/strict');
const { percentile, summarize } = require('./search-scale-metrics.cjs');
test('p95 retains the nearest-rank tail and does not mutate collected samples', () => {
 const values=Array.from({length:20},(_,i)=>20-i);assert.equal(percentile(values,.95),19);assert.equal(values[0],20);
});
test('slow tails and fast incorrect results cannot pass latency evidence', () => {
 const samples=Array.from({length:20},()=>({elapsedMs:20,correct:true}));
 assert.equal(summarize(samples,20).passed,true);
 samples[0]={elapsedMs:1100,correct:false};assert.equal(summarize(samples,20).passed,false);
 samples[0].correct=true;samples[1]={elapsedMs:1200,correct:true};assert.equal(summarize(samples,20).passed,false);
});
test('missing observations, empty results and invalid duration evidence fail closed', () => {
 assert.equal(summarize([{elapsedMs:5,correct:true}],20).passed,false);
 assert.equal(summarize([],20).passed,false);
 assert.throws(()=>summarize([{elapsedMs:NaN,correct:true}],1));
 assert.throws(()=>summarize([{elapsedMs:-1,correct:true}],1));
});
