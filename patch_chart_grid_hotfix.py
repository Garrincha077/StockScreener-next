from pathlib import Path

runtime = Path('frontend/src/deepvue/runtime.ts')
r = runtime.read_text(encoding='utf-8')
old = "export const GRID_STEP=16\n\nexport function nextGridCount"
new = "export const GRID_STEP=16\nexport const CHART_SHARD_COUNT=128\n\nexport function chartShardFor(ticker:string,shardCount=CHART_SHARD_COUNT){\n  const normalized=ticker.trim().toUpperCase()\n  let value=0\n  for(let i=0;i<normalized.length;i++)value+=(i+1)*normalized.charCodeAt(i)\n  return `${String(value%Math.max(1,Math.floor(shardCount))).padStart(3,'0')}.json`\n}\n\nexport function nextGridCount"
if old not in r:
    raise SystemExit('runtime insertion anchor not found')
r = r.replace(old, new, 1)
runtime.write_text(r, encoding='utf-8')

app = Path('frontend/src/DeepVueTerminal.tsx')
s = app.read_text(encoding='utf-8')
replacements = [
    (
        "import {RetryJsonCache,nextGridCount} from './deepvue/runtime'",
        "import {RetryJsonCache,chartShardFor,nextGridCount} from './deepvue/runtime'",
    ),
    (
        "if(!payload)return[];const shard=payload.chartShards?.[ticker];if(!shard)return[]",
        "if(!payload)return[];const shard=payload.chartShards?.[ticker]||chartShardFor(ticker)",
    ),
    (
        "if(!node||count>=stocks.length||!window.matchMedia('(max-width: 700px)').matches)return",
        "if(!node||count>=stocks.length)return",
    ),
]
for old_text, new_text in replacements:
    if old_text not in s:
        raise SystemExit(f'DeepVue anchor not found: {old_text}')
    s = s.replace(old_text, new_text, 1)
app.write_text(s, encoding='utf-8')

print('Applied deterministic chart-shard fallback and viewport-independent Rapid Review loading.')
