import test from 'node:test'
import assert from 'node:assert/strict'
import {chartAlertGeometryVectors} from '../../../shared/chartAlertGeometryVectors.ts'
import {
  evaluateAlertGeometry as evaluateFrontend,
  projectAlertLineAtTime as projectFrontend,
  type GeometryBar as FrontendBar,
  type GeometryPoint as FrontendPoint,
} from './chartAlertGeometryContract.ts'
import {
  evaluateAlertGeometry as evaluateEvaluator,
  projectAlertLineAtTime as projectEvaluator,
  type GeometryBar as EvaluatorBar,
  type GeometryPoint as EvaluatorPoint,
} from '../../../supabase/functions/stockscout-next-alerts/chartAlertGeometryContract.ts'

const closeEnough=(actual:number|null,expected:number|null,label:string)=>{
  if(expected==null){assert.equal(actual,null,label);return}
  assert.notEqual(actual,null,label)
  assert.ok(Math.abs((actual as number)-expected)<1e-9,`${label}: expected ${expected}, got ${actual}`)
}

for(const vector of chartAlertGeometryVectors){
  test(`chart-alert geometry contract: ${vector.name}`,()=>{
    if(vector.kind==='projection'){
      const frontend=projectFrontend(vector.points as [FrontendPoint,FrontendPoint],vector.bars as FrontendBar[],vector.interval,vector.atTime)
      const evaluator=projectEvaluator(vector.points as [EvaluatorPoint,EvaluatorPoint],vector.bars as EvaluatorBar[],vector.interval,vector.atTime)
      closeEnough(frontend,vector.expected,'frontend projection')
      closeEnough(evaluator,vector.expected,'evaluator projection')
      closeEnough(frontend,evaluator,'frontend/evaluator parity')
      return
    }

    const rule={points:vector.points,interval:vector.interval,condition:vector.condition,basis:vector.basis}
    const frontend=evaluateFrontend(rule as Parameters<typeof evaluateFrontend>[0],vector.bars as FrontendBar[])
    const evaluator=evaluateEvaluator(rule as Parameters<typeof evaluateEvaluator>[0],vector.bars as EvaluatorBar[])

    assert.equal(frontend.valid,vector.expectedValid,'frontend valid')
    assert.equal(evaluator.valid,vector.expectedValid,'evaluator valid')
    assert.equal(frontend.fired,vector.expectedFired,'frontend fired')
    assert.equal(evaluator.fired,vector.expectedFired,'evaluator fired')
    closeEnough(frontend.prevLine,vector.expectedPrevLine,'frontend previous line')
    closeEnough(evaluator.prevLine,vector.expectedPrevLine,'evaluator previous line')
    closeEnough(frontend.line,vector.expectedLine,'frontend current line')
    closeEnough(evaluator.line,vector.expectedLine,'evaluator current line')
    assert.deepEqual(frontend,evaluator,'frontend/evaluator full result parity')
  })
}
