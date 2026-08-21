import {expect,test} from '@playwright/test'

const generatedAt='2026-08-21T00:00:00+00:00'

const payload=JSON.stringify({
  version:8,
  generatedAt,
  market:{regime:'TEST'},
  universe:[{
    ticker:'FUND',price:10,stage:2,stageName:'Stage 2',primarySetup:'Test setup',
    opportunityScore:80,opportunityTier:'READY',opportunityRank:90,
    fundamentalEvidenceScore:72,fundamentalEvidenceConfidence:80,fundamentalEvidenceCoverage:100,
    fundamentalGrowthScore:77,fundamentalMarginScore:66,fundamentalInventoryScore:55,
  }],
  chartShards:{},
})

const manifest=JSON.stringify({
  manifestVersion:2,model:'test',generatedAt,universe:1,
  marketSession:{date:'2099-01-01',status:'closed',timezone:'America/New_York'},
  provenance:{source:{sha256:'source'},publication:{sourceSha256:'source'}},
  assets:{},
})

test('fundamental evidence dimension bars receive projected values',async({page})=>{
  await page.route('**/data/core.json*',route=>route.fulfill({status:200,contentType:'application/json',body:payload}))
  await page.route('**/data/manifest.json*',route=>route.fulfill({status:200,contentType:'application/json',body:manifest}))
  await page.route('**/data/validation-status.json*',route=>route.fulfill({status:404,body:''}))
  await page.route('**/data/charts/**',route=>route.fulfill({status:404,body:''}))

  await page.goto('/')
  const fundBox=page.locator('.dv-fundbox')
  await expect(fundBox).toBeVisible()
  await expect(fundBox.locator('.dv-dims strong')).toHaveText(['77','66','55'])
})
