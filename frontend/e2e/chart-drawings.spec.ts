import {expect,test} from '@playwright/test'

const generatedAt='2026-08-20T22:09:11.073071+00:00'
const ticker='T001'
const bars=(()=>{
  const out:any[]=[]
  const date=new Date('2026-01-05T00:00:00Z')
  let index=0
  while(out.length<165){
    const day=date.getUTCDay()
    if(day!==0&&day!==6){
      const base=100+index*.32+Math.sin(index/6)*3
      const open=base-.7,close=base+.6,high=base+2,low=base-2
      out.push([date.toISOString().slice(0,10),open,high,low,close,1_000_000+index*1000,35+index*.08])
      index++
    }
    date.setUTCDate(date.getUTCDate()+1)
  }
  return out
})()

const core=JSON.stringify({
  version:8,generatedAt,market:{regime:'TEST',dailyChanges:{changed:0}},
  universe:[{ticker,price:bars.at(-1)[4],stage:2,stageName:'Stage 2',primarySetup:'Fresh Stage 2',opportunityScore:92,opportunityTier:'READY',opportunityRank:98,rsRank:95,fundamentalEvidenceScore:70,volumeRatio:1.3,distance10w:1}],
  chartShards:{[ticker]:'000.json'},
})
const manifest=JSON.stringify({
  manifestVersion:2,model:'test',generatedAt,universe:1,
  marketSession:{date:'2026-08-20',status:'closed',timezone:'America/New_York'},
  provenance:{source:{kind:'canonical-audit',path:'latest.json',sha256:'source',bytes:1},publication:{kind:'frontend-projection',model:'test',sourceSha256:'source'}},
  assets:{
    core:{path:'core.json',sha256:'core',bytes:1,coverage:1,coveragePct:100},
    legacyIndex:{path:'legacy/index.json',sha256:'index',bytes:1,coverage:1,coveragePct:100},
    legacyDetails:{path:'legacy/details',sha256:'details',bytes:1,coverage:1,coveragePct:100,shardCount:128},
    legacyConfirmation:{path:'shadow/legacy-confirmation.json',sha256:'confirmation',bytes:1,coverage:1,coveragePct:100},
    charts:{path:'charts',sha256:'charts-sha',bytes:1,coverage:1,coveragePct:100,shardCount:128},
  },
})

test('drawings live on the main chart, edit there and persist across reload',async({page})=>{
  let nextDrawing=1,nextRule=1,drawingUpserts=0
  const drawings:any[]=[]
  const rules:any[]=[]
  const rawDrawing=(drawing:any,id:string,createdAt?:string)=>({
    id,ticker:String(drawing.ticker).toUpperCase(),kind:drawing.kind,interval:drawing.interval,points:drawing.points,extension:drawing.extension,
    label:drawing.label??null,style:drawing.style??{},metadata:drawing.metadata??{},created_at:createdAt??'2026-08-21T18:00:00Z',updated_at:'2026-08-21T18:00:00Z',legacy_alert_id:null,
  })
  const rawRule=(rule:any,id:string)=>({
    id,drawing_id:rule.drawingId,condition:rule.condition,source:rule.source,lifecycle:rule.lifecycle,enabled:rule.enabled,
    notify_in_app:rule.notifyInApp,notify_telegram:rule.notifyTelegram,created_at:'2026-08-21T18:00:00Z',updated_at:'2026-08-21T18:00:00Z',legacy_alert_id:null,
  })

  await page.route('**/data/manifest.json*',route=>route.fulfill({status:200,contentType:'application/json',body:manifest}))
  await page.route('**/data/core.json*',route=>route.fulfill({status:200,contentType:'application/json',body:core}))
  await page.route('**/data/charts/000.json*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({[ticker]:bars})}))
  await page.route('**/data/validation-status.json*',route=>route.fulfill({status:404,body:''}))
  await page.route('**/data/shadow/legacy-confirmation.json*',route=>route.fulfill({status:404,body:''}))
  await page.route('**/functions/v1/stockscout-next-alerts-v2',async route=>{
    const body=route.request().postDataJSON() as any
    if(body.action==='snapshot')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({drawings,rules,status:[],events:[]})})
    if(body.action==='drawing_upsert'){
      drawingUpserts++
      const existing=body.drawing.id?drawings.find((item:any)=>item.id===body.drawing.id):null
      const id=existing?.id??`d${nextDrawing++}`
      const row=rawDrawing(body.drawing,id,existing?.created_at)
      const index=drawings.findIndex((item:any)=>item.id===id)
      if(index>=0)drawings[index]=row;else drawings.unshift(row)
      return route.fulfill({status:existing?200:201,contentType:'application/json',body:JSON.stringify({drawing:row})})
    }
    if(body.action==='drawing_delete'){
      const index=drawings.findIndex((item:any)=>item.id===body.id);if(index>=0)drawings.splice(index,1)
      for(let i=rules.length-1;i>=0;i--)if(rules[i].drawing_id===body.id)rules.splice(i,1)
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})})
    }
    if(body.action==='rule_upsert'){
      const existing=body.rule.id?rules.find((item:any)=>item.id===body.rule.id):rules.find((item:any)=>item.drawing_id===body.rule.drawingId)
      const id=existing?.id??`r${nextRule++}`
      const row=rawRule(body.rule,id)
      const index=rules.findIndex((item:any)=>item.id===id)
      if(index>=0)rules[index]=row;else rules.unshift(row)
      return route.fulfill({status:existing?200:201,contentType:'application/json',body:JSON.stringify({rule:row})})
    }
    if(body.action==='rule_delete'){
      const index=rules.findIndex((item:any)=>item.id===body.id);if(index>=0)rules.splice(index,1)
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})})
    }
    return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'unexpected action'})})
  })

  await page.goto('/')
  const chart=page.locator('.dv-chart')
  await chart.scrollIntoViewIfNeeded()
  await expect(chart).toBeVisible()
  await expect(page.getByRole('toolbar',{name:'Chart drawing tools'})).toBeVisible()
  await expect(page.locator('.cad-main-capture')).toHaveCount(0)

  const surfaceBox=await page.locator('.dv-chart-surface').boundingBox()
  expect(surfaceBox).not.toBeNull()
  const box=surfaceBox!

  await page.getByRole('button',{name:'Draw horizontal line'}).click()
  await expect(page.locator('.cad-main-capture')).toBeVisible()
  await page.locator('.cad-main-capture').click({position:{x:box.width*.56,y:box.height*.45}})
  await expect(page.locator('.cad-main-svg [data-drawing-id="d1"]')).toBeVisible()
  expect(drawings[0].interval).toBe('W')
  expect(drawings[0].kind).toBe('horizontal')
  expect(drawings[0].points[0].price).toBe(drawings[0].points[1].price)

  await page.getByRole('button',{name:'Draw trendline'}).click()
  const capture=page.locator('.cad-main-capture')
  await capture.click({position:{x:box.width*.30,y:box.height*.62}})
  await expect(page.locator('.cad-main-hint')).toContainText('anchor B')
  await capture.click({position:{x:box.width*.68,y:box.height*.32}})
  await expect(page.locator('.cad-main-svg [data-drawing-id="d2"]')).toBeVisible()
  await expect(page.locator('.cad-main-svg [data-drawing-id="d2"] .cad-main-ray')).toBeVisible()
  expect(drawings.find(item=>item.id==='d2')?.kind).toBe('trendline')

  await page.locator('.ss-alerts-launch').click()
  const manager=page.locator('.cad-manager')
  await expect(manager).toBeVisible()
  await expect(manager.locator('.cad-chart-stage')).toHaveCount(0)
  await expect(manager).toContainText('edit on main chart')
  const horizontalRow=manager.locator('.cad-manager-row').filter({hasText:'Horizontal'}).first()
  await horizontalRow.click()
  await horizontalRow.locator('select').selectOption('touch')
  await expect.poll(()=>rules.find(item=>item.drawing_id==='d1')?.condition).toBe('touch')
  await manager.getByRole('button',{name:'Close drawings and alerts'}).click()

  const horizontalHandle=page.locator('.cad-main-handle-overlay [data-drawing-id="d1"] .cad-main-handle')
  await expect(horizontalHandle).toBeVisible()
  await expect(page.locator('.cad-main-svg [data-drawing-id="d1"] .cad-main-badge')).toContainText('Touch')
  const originalPrice=drawings.find(item=>item.id==='d1').points[0].price
  const handleBox=await horizontalHandle.boundingBox()
  expect(handleBox).not.toBeNull()
  await page.mouse.move(handleBox!.x+handleBox!.width/2,handleBox!.y+handleBox!.height/2)
  await page.mouse.down()
  await page.mouse.move(handleBox!.x+handleBox!.width/2,handleBox!.y-28,{steps:5})
  await page.mouse.up()
  await expect.poll(()=>drawingUpserts).toBeGreaterThanOrEqual(3)
  const edited=drawings.find(item=>item.id==='d1')
  expect(edited.points[0].price).not.toBe(originalPrice)
  expect(edited.points[0].price).toBeCloseTo(edited.points[1].price,8)

  await page.reload()
  await chart.scrollIntoViewIfNeeded()
  await expect(page.locator('.cad-main-svg [data-drawing-id="d1"]')).toBeVisible()
  await expect(page.locator('.cad-main-svg [data-drawing-id="d2"]')).toBeVisible()
  await expect(page.locator('.cad-main-svg [data-drawing-id="d1"] .cad-main-badge')).toContainText('Touch')
  await expect(page.locator('.cad-main-capture')).toHaveCount(0)

  const upsertsBeforePan=drawingUpserts
  const afterReloadBox=await page.locator('.dv-chart-surface').boundingBox()
  expect(afterReloadBox).not.toBeNull()
  await page.mouse.move(afterReloadBox!.x+afterReloadBox!.width*.42,afterReloadBox!.y+afterReloadBox!.height*.76)
  await page.mouse.down()
  await page.mouse.move(afterReloadBox!.x+afterReloadBox!.width*.52,afterReloadBox!.y+afterReloadBox!.height*.76,{steps:4})
  await page.mouse.up()
  expect(drawingUpserts).toBe(upsertsBeforePan)
})
