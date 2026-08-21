import test from 'node:test'
import assert from 'node:assert/strict'
import {matchesGroups,matchesRule,validateRule,type Rule,type RuleGroup} from './filterEngine.ts'

const rule=(value:string,op:Rule['op']='>='):Rule=>({id:'rule',field:'rsRank',op,value})

test('empty and non-numeric numeric rules are invalid and never match',()=>{
  for(const value of ['', 'not-a-number']){
    const candidate=rule(value)
    assert.ok(validateRule(candidate))
    assert.equal(matchesRule({rsRank:90},candidate),false)
  }
})

test('malformed between rules are invalid and never match',()=>{
  for(const value of ['10','10,','10,nope','10,20,30']){
    const candidate=rule(value,'between')
    assert.ok(validateRule(candidate))
    assert.equal(matchesRule({rsRank:15},candidate),false)
  }
})

test('invalid rules are ignored without widening an existing valid filter',()=>{
  const groups:RuleGroup[]=[{id:'group',logic:'ALL',rules:[rule('80'),{...rule(''),id:'invalid'}]}]
  assert.equal(matchesGroups({rsRank:90},groups,'ALL'),true)
  assert.equal(matchesGroups({rsRank:70},groups,'ALL'),false)
})
