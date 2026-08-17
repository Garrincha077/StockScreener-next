import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const legacyMultiSort = `function applyMultiSort(rows:Stock[],sorting:SortingState){if(!sorting.length)return rows;return rows.map((stock,index)=>({stock,index})).sort((a,b)=>{for(const s of sorting){const av=sortValue(a.stock,s.id),bv=sortValue(b.stock,s.id);const c=compareValues(av,bv);if(c!==0)return s.desc?-c:c}const t=a.stock.ticker.localeCompare(b.stock.ticker);return t||a.index-b.index}).map(x=>x.stock)}`

const balancedMultiSort = `function applyMultiSort(rows:Stock[],sorting:SortingState){
  rows.forEach(stock=>{delete (stock as any).__mixScore})
  if(!sorting.length)return rows
  const prioritySort=()=>rows.map((stock,index)=>({stock,index})).sort((a,b)=>{for(const s of sorting){const av=sortValue(a.stock,s.id),bv=sortValue(b.stock,s.id);const c=compareValues(av,bv);if(c!==0)return s.desc?-c:c}const t=a.stock.ticker.localeCompare(b.stock.ticker);return t||a.index-b.index}).map(x=>x.stock)
  if(sorting.length===1)return prioritySort()

  const accum=new Map<string,{log:number;arith:number;weight:number}>()
  rows.forEach(stock=>accum.set(stock.ticker,{log:0,arith:0,weight:0}))
  let activeCriteria=0

  sorting.forEach((sort,sortIndex)=>{
    const values=rows.map((stock,index)=>({stock,index,value:sortValue(stock,sort.id)})).filter(x=>typeof x.value==='number'&&Number.isFinite(x.value)) as {stock:Stock;index:number;value:number}[]
    if(values.length<2)return
    activeCriteria++
    values.sort((a,b)=>sort.desc?b.value-a.value:a.value-b.value||a.index-b.index)
    const percentile=new Map<string,number>()
    let i=0
    while(i<values.length){
      let j=i+1
      while(j<values.length&&values[j].value===values[i].value)j++
      const avgPosition=(i+j-1)/2
      const score=values.length===1?100:100-(avgPosition/(values.length-1))*99
      for(let k=i;k<j;k++)percentile.set(values[k].stock.ticker,score)
      i=j
    }
    const weight=Math.max(.55,1-sortIndex*.10)
    rows.forEach(stock=>{
      const p=Math.max(1,percentile.get(stock.ticker)??1)
      const a=accum.get(stock.ticker)!
      a.log+=Math.log(p)*weight
      a.arith+=p*weight
      a.weight+=weight
    })
  })

  if(activeCriteria<2)return prioritySort()
  rows.forEach(stock=>{
    const a=accum.get(stock.ticker)!
    ;(stock as any).__mixScore=a.weight?Math.exp(a.log/a.weight):0
    ;(stock as any).__mixAverage=a.weight?a.arith/a.weight:0
  })
  return rows.map((stock,index)=>({stock,index})).sort((a,b)=>{
    const mixDiff=((b.stock as any).__mixScore||0)-((a.stock as any).__mixScore||0)
    if(Math.abs(mixDiff)>1e-9)return mixDiff
    const avgDiff=((b.stock as any).__mixAverage||0)-((a.stock as any).__mixAverage||0)
    if(Math.abs(avgDiff)>1e-9)return avgDiff
    const first=sorting[0],c=compareValues(sortValue(a.stock,first.id),sortValue(b.stock,first.id))
    if(c!==0)return first.desc?-c:c
    return a.stock.ticker.localeCompare(b.stock.ticker)||a.index-b.index
  }).map(x=>x.stock)
}`

const opportunityColumn = `helper.accessor(s=>opp(s),{id:'opportunityScore',header:'Opportunity',cell:i=><b className="dv-score">{fmt(i.getValue(),0)}</b>}),`
const originalColumns = `
    helper.accessor('originalBuyScore' as any,{id:'originalBuyScore',header:'Orig Buy',cell:i=><b className={num(i.getValue())>=90?'dv-good':''}>{fmt(i.getValue(),0)}</b>}),
    helper.accessor('originalRR' as any,{id:'originalRR',header:'Orig R/R',cell:i=><b className={num(i.getValue())>=2?'dv-good':''}>{fmt(i.getValue(),1)}:1</b>}),
    helper.accessor('originalTTPasses' as any,{id:'originalTTPasses',header:'Orig TT',cell:i=>\`\${fmt(i.getValue(),0)}/8\`}),
    helper.accessor('originalVcpQuality' as any,{id:'originalVcpQuality',header:'Orig VCP',cell:i=>fmt(i.getValue(),0)}),
    helper.accessor('originalAdVolumeRatio' as any,{id:'originalAdVolumeRatio',header:'Orig A/D',cell:i=>\`\${fmt(i.getValue(),2)}x\`}),
    helper.accessor('originalRiskPct' as any,{id:'originalRiskPct',header:'Orig Risk',cell:i=>\`\${fmt(i.getValue(),1)}%\`}),
    helper.accessor('originalSellScore' as any,{id:'originalSellScore',header:'Orig Sell',cell:i=><b className={num(i.getValue())>=60?'dv-bad':''}>{fmt(i.getValue(),0)}</b>}),`

function balancedMixPlugin(): Plugin {
  return {
    name: 'stockscout-balanced-multisort',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/DeepVueTerminal.tsx')) return null
      if (!code.includes(legacyMultiSort)) {
        this.warn('Balanced multi-sort patch target was not found; source may have changed.')
        return null
      }
      let next = code.replace(legacyMultiSort, balancedMultiSort)
      next = next
        .replace('<span>MULTI-SORT</span>', '<span>BALANCED MIX</span>')
        .replace('Click headers to build #1 → #2 → #3 priorities', 'Select 2+ numeric columns to build a balanced percentile mix')
        .replace("'First clicked column is priority #1; next is #2'", "'2+ sorts = percentile MIX; #1 gets only a mild extra weight'")
      if (next.includes(opportunityColumn) && !next.includes("header:'Orig Buy'")) {
        next = next.replace(opportunityColumn, opportunityColumn + originalColumns)
      }
      next = next.replace(
        'const defaultVisibility:VisibilityState={',
        "const defaultVisibility:VisibilityState={originalTTPasses:false,originalVcpQuality:false,originalAdVolumeRatio:false,originalRiskPct:false,originalSellScore:false,"
      )
      return { code: next, map: null }
    },
  }
}

export default defineConfig({
  plugins: [balancedMixPlugin(), react()],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
