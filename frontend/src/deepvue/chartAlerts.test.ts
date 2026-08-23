import test from 'node:test'
import assert from 'node:assert/strict'
import {isHorizontalAlert,linePriceAt,normalizeChartAlertsV2Snapshot,type ChartAlert} from './chartAlerts.ts'

const base:ChartAlert={
  ticker:'TEST',
  points:[{time:'2026-08-01',price:10},{time:'2026-08-11',price:20}],
  mode:'break_up',
  enabled:true,
  notifyTelegram:true,
}

test('linePriceAt projects a two-anchor trendline',()=>{
  assert.equal(linePriceAt(base.points,'2026-08-06'),15)
  assert.equal(linePriceAt(base.points,'2026-08-16'),25)
})

test('horizontal drawings stay flat through time',()=>{
  const alert={...base,points:[{time:'2026-08-01',price:12.5},{time:'2026-08-11',price:12.5}] as ChartAlert['points']}
  assert.equal(isHorizontalAlert(alert),true)
  assert.equal(linePriceAt(alert.points,'2026-09-01'),12.5)
})

test('sloped drawings are not horizontal',()=>{
  assert.equal(isHorizontalAlert(base),false)
})

test('v2 snapshot keeps drawing interval, rule semantics, status, event provenance and evaluator health',()=>{
  const snapshot=normalizeChartAlertsV2Snapshot({
    drawings:[{id:'d1',ticker:'test',kind:'trendline',interval:'W',points:[{time:'2026-08-10',price:10},{time:'2026-08-17',price:12}],extension:'ray_right',style:{width:2},metadata:{source:'test'},created_at:'2026-08-21T10:00:00Z',updated_at:'2026-08-21T11:00:00Z'}],
    rules:[{id:'r1',drawing_id:'d1',condition:'cross_above',source:'close',lifecycle:'one_shot',enabled:true,notify_in_app:true,notify_telegram:false}],
    status:[{drawing_id:'d1',rule_id:'r1',projected_line_price:'13.5',latest_close:'13.1',distance_pct:'-2.963',state:'active',latest_market_date:'2026-08-17',evaluated_at:'2026-08-23T08:15:00Z'}],
    events:[{id:'e1',drawing_id:'d1',rule_id:'r1',ticker:'TEST',event_type:'break_up',interval:'W',source:'close',scan_generated_at:'2026-08-20T22:09:11Z',market_date:'2026-08-17',prev_line_price:'12',current_line_price:'13.5',close_price:'13.6',message:'triggered',telegram_status:'not_configured',created_at:'2026-08-21T12:00:00Z'}],
    evaluatorHealth:{state:'healthy',activeRules:1,evaluatedRules:1,needsReview:0,staleRules:0,lastEvaluatedAt:'2026-08-23T08:15:00Z',staleAfterMinutes:150},
  })
  assert.equal(snapshot.drawings[0].ticker,'TEST')
  assert.equal(snapshot.drawings[0].interval,'W')
  assert.equal(snapshot.drawings[0].extension,'ray_right')
  assert.equal(snapshot.rules[0].drawingId,'d1')
  assert.equal(snapshot.rules[0].condition,'cross_above')
  assert.equal(snapshot.rules[0].lifecycle,'one_shot')
  assert.equal(snapshot.status[0].projectedLinePrice,13.5)
  assert.equal(snapshot.status[0].distancePct,-2.963)
  assert.equal(snapshot.events[0].interval,'W')
  assert.equal(snapshot.events[0].currentLinePrice,13.5)
  assert.equal(snapshot.evaluatorHealth.state,'healthy')
  assert.equal(snapshot.evaluatorHealth.activeRules,1)
  assert.equal(snapshot.evaluatorHealth.lastEvaluatedAt,'2026-08-23T08:15:00Z')
})

test('missing evaluator health fails safe to waiting rather than claiming green',()=>{
  const snapshot=normalizeChartAlertsV2Snapshot({})
  assert.equal(snapshot.evaluatorHealth.state,'waiting')
  assert.equal(snapshot.evaluatorHealth.activeRules,0)
  assert.equal(snapshot.evaluatorHealth.lastEvaluatedAt,null)
})
