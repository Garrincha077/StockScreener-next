import test from 'node:test'
import assert from 'node:assert/strict'
import {isHorizontalAlert,linePriceAt,type ChartAlert} from './chartAlerts.ts'

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
