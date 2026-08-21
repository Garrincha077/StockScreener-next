import {expect,test} from '@playwright/test'

const generatedAt='2026-08-20T22:09:11.073071+00:00'
const tickers=['T001','T002']
const bars=(()=>{
  const out:any[]=[]
  const date=new Date('2026-01-05T00:00:00Z')
  let index=0
  while(out.length<165){
    const day=date.getUTCDay()
    if(day!==0&&day!==6){
      const base=100+index*.28+Math.sin(index/7)*2
      out.push([date.toISOString().slice(0,10),base-.5,base+1.8,base-1.7,base+.4,900_000+index*1200,40+index*.05])
      index++
    }
    date.setUTCDate(date.getUTCDate()+1)
  }
  return out
})()
const core=JSON.stringify({
  version:8,generatedAt,market:{regime:'TEST',dailyChanges:{changed:0}},
  universe:tickers.map((ticker,index)=>({ticker,price:bars.at(-1)[4]+index,stage:2,stageName:'Stage 2',primarySetup:'Fresh Stage 2',opportunityScore:90-index,opportunityTier:'READY',opportunityRank:97-index,rsRank:94-index,fundamentalEvidenceScore:70,volumeRatio:1.2,distance10w:1})),
  chartShards:{T001:'000.json',T002:'000.json'},
})
const manifest=JSON.stringify({
  manifestVersion:2,model:'test',generatedAt,universe:2,
  marketSession:{date:'2026-08-20',status:'closed',timezone:'America/New_York'},
  provenance:{source:{kind:'canonical-audit',path:'latest.json',sha256:'source',bytes:1},publication:{kind:'frontend-projection',model:'test',sourceSha256:'source'}},
  assets:{
    core:{path:'core.json',sha256:'core',bytes:1,coverage:2,coveragePct:100},
    legacyIndex:{path:'legacy/index.json',sha256:'index',bytes:1,coverage:2,coveragePct:100},
    legacyDetails:{path:'legacy/details',sha256:'details',bytes:1,coverage:2,coveragePct:100,shardCount:128},
    legacyConfirmation:{path:'shadow/legacy-confirmation.json',sha256:'confirmation',bytes:1,coverage:2,coveragePct:100},
    charts:{path:'charts',sha256:'charts-sha',bytes:1,coverage:2,coveragePct:100,shardCount:128},
  },
})
const snapshot={
  drawings:[
    {id:'d1',ticker:'T001',kind:'horizontal',interval:'W',points:[{time:'2026-08-17',price:145},{time:'2026-08-17',price:145}],extension:'pane',label:null,style:{},metadata:{},created_at:'2026-08-20T12:00:00Z',updated_at:'2026-08-20T12:00:00Z'},
    {id:'d2',ticker:'T002',kind:'trendline',interval:'D',points:[{time:'2026-08-14',price:92},{time:'2026-08-18',price:94}],extension:'ray_right',label:null,style:{},metadata:{},created_at:'2026-08-20T12:00:00Z',updated_at:'2026-08-20T12:00:00Z'},
  ],
  rules:[
    {id:'r1',drawing_id:'d1',condition:'cross_above',source:'close',lifecycle:'rearm',enabled:true,notify_in_app:true,notify_telegram:true,created_at:'2026-08-20T12:00:00Z',updated_at:'2026-08-20T12:00:00Z'},
    {id:'r2',drawing_id:'d2',condition:'cross_below',source:'close',lifecycle:'one_shot',enabled:false,notify_in_app:true,notify_telegram:false,created_at:'2026-08-20T12:00:00Z',updated_at:'2026-08-20T12:00:00Z'},
  ],
  status:[
    {drawing_id:'d1',rule_id:'r1',projected_line_price:145,latest_close:143,latest_high:144,latest_low:141,distance_pct:-1.38,latest_market_date:'2026-08-17',state:'active',review_reason:null,evaluated_at:'2026-08-20T22:20:00Z',updated_at:'2026-08-20T22:20:00Z'},
    {drawing_id:'d2',rule_id:'r2',projected_line_price:94,latest_close:95,latest_high:96,latest_low:93,distance_pct:1.06,latest_market_date:'2026-08-20',state:'paused',review_reason:null,evaluated_at:'2026-08-20T22:20:00Z',updated_at:'2026-08-20T22:20:00Z'},
  ],
  events:[
    {id:'e1',drawing_id:'d2',rule_id:'r2',ticker:'T002',event_type:'break_down',interval:'D',source:'close',scan_generated_at:generatedAt,market_date:'2026-08-20',prev_line_price:93,current_line_price:94,close_price:95,message:'test event',telegram_status:'not_configured',telegram_sent_at:null,telegram_error:null,created_at:'2026-08-20T22:20:00Z'},
  ],
}

test('global alerts center summarizes all tickers and opens the selected drawing manager',async({page})=>{
  await page.route('**/data/manifest.json*',route=>route.fulfill({status:200,contentType:'application/json',body:manifest}))
  await page.route('**/data/core.json*',route=>route.fulfill({status:200,contentType:'application/json',body:core}))
  await page.route('**/data/charts/000.json*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({T001:bars,T002:bars})}))
  await page.route('**/data/validation-status.json*',route=>route.fulfill({status:404,body:''}))
  await page.route('**/data/shadow/legacy-confirmation.json*',route=>route.fulfill({status:404,body:''}))
  await page.route('**/functions/v1/stockscout-next-alerts-v2',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(snapshot)}))

  await page.goto('/')
  const launch=page.getByRole('button',{name:/All Alerts/})
  await expect(launch).toContainText('1')
  await launch.click()
  const center=page.getByRole('complementary',{name:'Global alerts center'})
  await expect(center).toBeVisible()
  const tabs=center.getByRole('navigation',{name:'Alert center views'})
  const activeTab=tabs.getByRole('button',{name:/^Active 1$/})
  const nearTab=tabs.getByRole('button',{name:/^Near Trigger 1$/})
  const triggeredTab=tabs.getByRole('button',{name:/^Triggered 1$/})
  const pausedTab=tabs.getByRole('button',{name:/^Paused 1$/})
  const allTab=tabs.getByRole('button',{name:/^All Drawings 2$/})
  await expect(activeTab).toBeVisible()
  await expect(nearTab).toBeVisible()
  await expect(triggeredTab).toBeVisible()
  await expect(pausedTab).toBeVisible()
  await expect(allTab).toBeVisible()

  await nearTab.click()
  await expect(center).toContainText('not a StockScout score')
  const nearRows=center.locator('.cad-center-row')
  await expect(nearRows).toHaveCount(1)
  await expect(nearRows.first()).toContainText('T001')
  await expect(nearRows.first()).toContainText('1.4% below')

  await triggeredTab.click()
  await expect(center.locator('.cad-center-event')).toHaveCount(1)
  await expect(center.locator('.cad-center-event')).toContainText('T002')
  await expect(center.locator('.cad-center-event')).toContainText('Crossed below')

  await allTab.click()
  await expect(center.locator('.cad-center-row')).toHaveCount(2)
  const filter=center.getByLabel('Filter global alerts by ticker')
  await filter.fill('T002')
  await expect(center.locator('.cad-center-row')).toHaveCount(1)
  const t2=center.locator('.cad-center-row').first()
  await expect(t2).toContainText('T002')
  await expect(t2).toContainText('D · Trend')
  await t2.click()

  await expect(center).toHaveCount(0)
  const manager=page.getByRole('complementary',{name:'StockScout drawings and alerts'})
  await expect(manager).toBeVisible()
  await expect(manager).toContainText('T002')
  await expect(manager.getByRole('region',{name:'Selected drawing alert settings'})).toContainText('Trend')
  await expect.poll(()=>page.evaluate(()=>location.hash)).toBe('#T002')
  await expect(page.locator('.cad-main-svg [data-drawing-id="d2"]')).toBeVisible()
})
