import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeWatchlist,WATCHLIST_KEY} from '../watchlistStore'

test('shared watchlist preserves the existing storage key',()=>{
  assert.equal(WATCHLIST_KEY,'stockscout-watchlist')
})

test('shared watchlist normalizes tickers and removes invalid duplicates',()=>{
  assert.deepEqual(normalizeWatchlist([' t001 ','T001','t002','',null,42,'T003']),['T001','T002','T003'])
  assert.deepEqual(normalizeWatchlist(null),[])
})
