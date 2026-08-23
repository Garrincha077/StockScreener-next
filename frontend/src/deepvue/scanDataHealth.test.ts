import test from 'node:test'
import assert from 'node:assert/strict'
import {scanCoverageRows,scanDataHealth,scanIdentity} from '../scanDataHealth.ts'
import type {StockScoutCore,StockScoutManifest} from '../data/StockScoutDataProvider.tsx'

const generatedAt='2026-08-20T08:00:00Z'
const asset=(path:string,coveragePct=100,coverage=100)=>({path,sha256:`sha-${path}`,bytes:1,coverage,coveragePct})
const manifest=(charts=100):StockScoutManifest=>({
  manifestVersion:2,model:'test',scanId:'scan-authoritative-123',generatedAt,universe:1,
  marketSession:{date:'2026-08-19',status:'closed',timezone:'America/New_York'},
  provenance:{
    source:{
      kind:'canonical-audit',path:'latest.json',sha256:'abcdef1234567890',bytes:1,
      repository:'Garrincha077/stock-screener2',ref:'main',workflowRunId:'32530930150',workflowRunAttempt:'1',sourceCommit:'stableabc',generatedAt,
    },
    publication:{
      kind:'frontend-projection',model:'test',sourceSha256:'abcdef1234567890',
      repository:'Garrincha077/StockScreener-next',ref:'main',workflowRunId:'999',commitSha:'nextabc',publicationId:'Garrincha077/StockScreener-next#999',
    },
  },
  assets:{core:asset('core.json'),legacyIndex:asset('legacy/index.json'),legacyDetails:{...asset('legacy/details'),shardCount:128},legacyConfirmation:asset('shadow/legacy-confirmation.json'),charts:{...asset('charts',charts,Math.round(charts)),shardCount:128}},
})
const core:StockScoutCore={generatedAt,market:{},universe:[{ticker:'AAA'}]}
const now=Date.parse('2026-08-20T10:00:00Z')

test('scan health is healthy only when snapshot, validation and coverage are aligned',()=>{
  const health=scanDataHealth(core,manifest(98),{conclusion:'success',run_id:123},now)
  assert.equal(health.status,'HEALTHY')
  assert.equal(health.coverageIssues.length,0)
})

test('scan health reports partial when chart coverage is below the publish-quality threshold',()=>{
  const health=scanDataHealth(core,manifest(72),{conclusion:'success',run_id:123},now)
  assert.equal(health.status,'PARTIAL')
  assert.deepEqual(health.coverageIssues.map(row=>row.key),['charts'])
  assert.match(health.detail,/Charts 72\.0%/)
})

test('scan health preserves mismatch as a stronger failure than coverage',()=>{
  const next=manifest(72)
  next.generatedAt='2026-08-20T09:00:00Z'
  const health=scanDataHealth(core,next,{conclusion:'success',run_id:123},now)
  assert.equal(health.status,'MISMATCH')
})

test('scan identity prefers embedded authoritative scan and workflow provenance',()=>{
  const identity=scanIdentity(manifest())
  assert.equal(identity.id,'scan-authoritative-123')
  assert.equal(identity.session,'2026-08-19')
  assert.equal(identity.sourceSha,'abcdef1234567890')
  assert.equal(identity.sourceRunId,'32530930150')
  assert.equal(identity.sourceRepository,'Garrincha077/stock-screener2')
  assert.equal(identity.sourceRef,'main')
  assert.equal(identity.sourceCommit,'stableabc')
  assert.equal(identity.publicationRunId,'999')
  assert.equal(identity.publicationRepository,'Garrincha077/StockScreener-next')
  assert.equal(identity.publicationId,'Garrincha077/StockScreener-next#999')
})

test('scan identity keeps deterministic fallback for older unstamped manifests',()=>{
  const next=manifest()
  delete next.scanId
  next.provenance.source.workflowRunId=null
  next.provenance.publication.workflowRunId=null
  const identity=scanIdentity(next)
  assert.equal(identity.id,'2026-08-19:abcdef123456')
})

test('coverage rows make chart and legacy thresholds explicit',()=>{
  const rows=scanCoverageRows(manifest(94))
  assert.equal(rows.find(row=>row.key==='charts')?.minimumPct,95)
  assert.equal(rows.find(row=>row.key==='charts')?.healthy,false)
  assert.equal(rows.find(row=>row.key==='legacyConfirmation')?.minimumPct,100)
})
