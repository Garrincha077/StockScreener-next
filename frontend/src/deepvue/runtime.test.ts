import test from 'node:test'
import assert from 'node:assert/strict'
import {RetryJsonCache,fetchJsonWithRetry,nextGridCount} from './runtime.ts'

test('nextGridCount advances in bounded batches',()=>{
  assert.equal(nextGridCount(16,123),32)
  assert.equal(nextGridCount(112,123),123)
  assert.equal(nextGridCount(123,123),123)
})

test('fetchJsonWithRetry recovers from a transient HTTP failure',async()=>{
  let calls=0
  const fetcher=async()=>{
    calls++
    return calls===1?new Response('nope',{status:503}):Response.json({ok:true})
  }
  const value=await fetchJsonWithRetry<{ok:boolean}>('/chart.json',{attempts:2,baseDelayMs:0},fetcher)
  assert.deepEqual(value,{ok:true})
  assert.equal(calls,2)
})

test('chart requests bypass stale browser/CDN cache by default',async()=>{
  let requested=''
  let cacheMode:RequestCache|undefined
  const fetcher=async(input:RequestInfo|URL,init?:RequestInit)=>{
    requested=String(input)
    cacheMode=init?.cache
    return Response.json({ok:true})
  }
  await fetchJsonWithRetry<{ok:boolean}>('/data/charts/001.json?v=snapshot',{attempts:1,baseDelayMs:0},fetcher)
  assert.equal(cacheMode,'no-store')
  assert.match(requested,/\/data\/charts\/001\.json\?v=snapshot&_cb=/)
})

test('RetryJsonCache evicts a rejected promise so a later request can recover',async()=>{
  let calls=0
  const fetcher=async()=>{
    calls++
    return calls===1?new Response('nope',{status:503}):Response.json({rows:[1,2,3]})
  }
  const cache=new RetryJsonCache<{rows:number[]}>(fetcher,async()=>{}, {attempts:1,baseDelayMs:0})
  await assert.rejects(cache.load('snapshot:001','/chart.json'))
  const value=await cache.load('snapshot:001','/chart.json')
  assert.deepEqual(value,{rows:[1,2,3]})
  assert.equal(calls,2)
})
