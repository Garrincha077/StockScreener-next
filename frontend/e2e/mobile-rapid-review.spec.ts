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

const payload=JSON.stringify({
  version:8,
  generatedAt:'2026-08-18T22:04:51+00:00',
  market:{regime:'TEST',dailyChanges:{}},
  universe,
  chartShards:{},
})

test('Rapid Review progressively renders every mobile match',async({page})=>{
  page.on('pageerror',error=>console.error('PAGE ERROR:',error.message))
  page.on('console',message=>{
    if(message.type()==='error')console.error('BROWSER CONSOLE:',message.text())
  })
  const fulfillPayload=async(route:any)=>route.fulfill({status:200,contentType:'application/json',body:payload})
  await page.route('**/data/core.json*',fulfillPayload)
  await page.route('**/data/latest.json*',fulfillPayload)

  const response=await page.goto('/')
  console.log('Preview response:',response?.status(),page.url())
  await page.waitForTimeout(300)
  if(!(await page.locator('.dv-app').count())){
    console.log('Body before app assertion:',(await page.locator('body').innerText()).slice(0,800))
  }
  await expect(page.locator('.dv-app')).toBeVisible({timeout:10_000})
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
