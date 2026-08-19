import {expect,test} from '@playwright/test'

const universe=Array.from({length:50},(_,index)=>({
  ticker:`T${String(index+1).padStart(3,'0')}`,
  price:10+index,
  stage:2,
  stageName:'Stage 2',
  opportunityScore:100-index,
  rsRank:99-index,
  volumeRatio:1.2,
  distance10w:0,
  setupTags:['Fresh Stage 2'],
}))

test('Rapid Review progressively renders every mobile match',async({page})=>{
  await page.route('**/data/core.json*',async route=>{
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({
        version:8,
        generatedAt:'2026-08-18T22:04:51+00:00',
        market:{regime:'TEST',dailyChanges:{}},
        universe,
        chartShards:{},
      }),
    })
  })

  await page.goto('/')
  await expect(page.getByRole('button',{name:'Grid',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Grid',exact:true}).click()

  const summary=page.locator('.dv-gridview > header span')
  const sentinel=page.locator('.dv-grid-sentinel')
  await expect(summary).toContainText('16 of 50')
  await expect(page.locator('.dv-minicard')).toHaveCount(16)

  for(let attempt=0;attempt<5;attempt++){
    if((await summary.textContent())?.includes('50 of 50'))break
    await sentinel.scrollIntoViewIfNeeded()
    await page.waitForTimeout(150)
  }

  await expect(summary).toContainText('50 of 50')
  await expect(page.locator('.dv-minicard')).toHaveCount(50)
})
