import {expect,test} from '@playwright/test'

const generatedAt='2026-08-21T22:21:16.292856+00:00'
const sourceSha='18cc2e50d10be50e322879e5272b5220fd469dae92ac472b3eea5e0286bc7908'
const asset=(path:string)=>({path,sha256:`sha-${path}`,bytes:1,coverage:1,coveragePct:100})
const core={
  generatedAt,
  market:{regime:'TEST'},
  universe:[{ticker:'AAA',price:10,opportunityScore:80,stage:2,stageName:'Stage 2',primarySetup:'Fresh Stage 2'}],
  chartShards:{},
}
const manifest={
  manifestVersion:2,
  model:'stockscout-client-core-v2',
  scanId:'scan-authoritative-test',
  generatedAt,
  marketSession:{date:'2026-08-21',status:'closed',timezone:'America/New_York'},
  universe:1,
  provenance:{
    source:{
      kind:'canonical-audit',path:'latest.json',sha256:sourceSha,bytes:1,
      repository:'Garrincha077/stock-screener2',ref:'main',workflowRunId:'32530930150',workflowRunAttempt:'1',sourceCommit:'8c7d3cefc2029b448ce4e6ec49c735090832dff6',generatedAt,
    },
    publication:{
      kind:'frontend-projection',model:'stockscout-client-core-v2',sourceSha256:sourceSha,
      repository:'Garrincha077/StockScreener-next',ref:'main',workflowRunId:'999',commitSha:'abcdef1234567890',publicationId:'Garrincha077/StockScreener-next#999',
    },
  },
  assets:{
    core:asset('core.json'),legacyIndex:asset('legacy/index.json'),legacyDetails:{...asset('legacy/details'),shardCount:128},legacyConfirmation:asset('shadow/legacy-confirmation.json'),charts:{...asset('charts'),shardCount:128},
  },
}

test('Scan/Data Health exposes authoritative Stable and Next publication identity',async({page})=>{
  await page.route('**/data/manifest.json*',route=>route.fulfill({json:manifest}))
  await page.route('**/data/core.json*',route=>route.fulfill({json:core}))
  await page.route('**/data/validation-status.json*',route=>route.fulfill({json:{conclusion:'success',run_id:369,head_sha:'validatedsha'}}))
  await page.route('**/data/charts/**',route=>route.fulfill({status:404,body:''}))

  await page.goto('/')
  const trigger=page.locator('.sdh-trigger')
  await expect(trigger).toBeVisible()
  await expect(trigger).toContainText('Scan 2026-08-21')
  await expect(trigger).toContainText('Stable #32530930150')
  await trigger.click()

  const panel=page.locator('.sdh-panel')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('scan-authoritative-test')
  await expect(panel).toContainText('Stable source workflow')
  await expect(panel).toContainText('#32530930150')
  await expect(panel).toContainText('Garrincha077/stock-screener2@main')
  await expect(panel).toContainText('8c7d3cefc202')
  await expect(panel).toContainText('Next publication workflow')
  await expect(panel).toContainText('#999')
  await expect(panel).toContainText('Garrincha077/StockScreener-next@main')
  await expect(panel).not.toContainText('run id is not carried in this manifest')
})
