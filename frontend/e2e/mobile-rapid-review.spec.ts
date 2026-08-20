import {expect,test} from '@playwright/test'

const universe=Array.from({length:50},(_,index)=>({
  ticker:`T${String(index+1).padStart(3,'0')}`,
  price:10+index,
  stage:2,
  stageName:'Stage 2',
  primarySetup:index===0?'Fresh Breakout':'Fresh Stage 2',
  opportunityScore:100-index,
  opportunityTier:index<10?'READY':'WATCH',
  opportunityRank:99-index,
  opportunityPotential:90-index/2,
  opportunityTiming:80-index/2,
  rsRank:99-index,
  groupRank:80-index/2,
  fundamentalEvidenceScore:70,
  volumeRatio:1.2,
  distance10w:0,
  setupTags:['Fresh Stage 2'],
  changedToday:index<3,
  newUniverseMember:index===1,
  changeImpact:index<3?3-index:0,
  changeLabels:index<3?[`Change ${index+1}`]:[],
}))

const generatedAt='2026-08-20T08:00:00+00:00'
const payload=JSON.stringify({
  version:8,
  generatedAt,
  market:{regime:'TEST',dailyChanges:{changed:3}},
  universe,
  chartShards:{},
})
const manifest=JSON.stringify({generatedAt,universe:50})

test('Phase 4 inbox, reviewed progress, queue, ticker sync and Rapid Review work on mobile',async({page})=>{
  page.on('pageerror',error=>console.error('PAGE ERROR:',error.message))
  page.on('console',message=>{
    if(message.type()==='error')console.error('BROWSER CONSOLE:',message.text())
  })
  const fulfillPayload=async(route:any)=>route.fulfill({status:200,contentType:'application/json',body:payload})
  await page.route('**/data/core.json*',fulfillPayload)
  await page.route('**/data/latest.json*',fulfillPayload)
  await page.route('**/data/manifest.json*',route=>route.fulfill({status:200,contentType:'application/json',body:manifest}))
  await page.route('**/data/validation-status.json*',route=>route.fulfill({status:404,body:''}))

  const response=await page.goto('/')
  console.log('Preview response:',response?.status(),page.url())
  await expect(page.locator('.dv-app')).toBeVisible({timeout:10_000})
  await expect(page.locator('.p4-review')).toBeVisible()
  await expect(page.locator('.p4-health')).toContainText('Data healthy')

  const todayButton=page.locator('.p4-inbox-actions button').filter({hasText:/Today/})
  await expect(todayButton).toContainText('3 unseen')
  await todayButton.click()
  await expect(page.locator('.p4-inbox-drawer')).toContainText('3 candidates')
  await expect(page.locator('.p4-inbox-drawer')).toContainText('3 unseen')

  await page.locator('.p4-inbox-list button').first().click()
  const why=page.locator('.p4-why')
  await expect(why).toBeVisible()
  await expect(why).toContainText('WHY T001?')
  await expect(why).toContainText('Review 1 / 3')
  await expect(why).toContainText('transparent decomposition')
  await expect(why).toContainText('Opportunity')
  await expect(todayButton).toContainText('2 unseen')

  await page.locator('.p4-next').click()
  await expect(why).toContainText('WHY T002?')
  await expect(why).toContainText('Review 2 / 3')
  await expect(todayButton).toContainText('1 unseen')
  await page.getByRole('button',{name:'Close why panel'}).click()

  await todayButton.click()
  await expect(page.locator('.p4-inbox-list button.reviewed')).toHaveCount(2)
  await expect(page.locator('.p4-inbox-list button').first()).toContainText('reviewed')
  await page.getByRole('button',{name:'Close review inbox'}).click()

  const gridButton=page.locator('.dv-top nav button').filter({hasText:/^Grid$/})
  await expect(gridButton).toHaveCount(1)
  await gridButton.click({force:true})

  const summary=page.locator('.dv-gridview > header span')
  const sentinel=page.locator('.dv-grid-sentinel')
  await expect(summary).toContainText('16 of 50')
  await expect(page.locator('.dv-minicard')).toHaveCount(16)

  // A normal Grid selection uses history.replaceState, not hashchange. The
  // Phase 4 review bar must still follow the active StockScout ticker.
  await page.locator('.dv-minicard').nth(3).click()
  const whyButton=page.locator('.p4-inbox-actions button').filter({hasText:/Why this stock\?/})
  await expect(whyButton).toContainText('T004',{timeout:2_000})
  await whyButton.click()
  await expect(page.locator('.p4-why')).toContainText('WHY T004?')
  await page.getByRole('button',{name:'Close why panel'}).click()

  for(let attempt=0;attempt<5;attempt++){
    if((await summary.textContent())?.includes('50 of 50'))break
    await sentinel.scrollIntoViewIfNeeded()
    await page.waitForTimeout(150)
  }

  await expect(summary).toContainText('50 of 50')
  await expect(page.locator('.dv-minicard')).toHaveCount(50)
})