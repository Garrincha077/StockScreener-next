import {useEffect,useMemo,useState} from 'react'
import './groups.css'

type GroupRow={ticker:string;name:string;rank:number;rel1m:number;rel3m:number;rel6m:number;stocks:number;stage2Pct:number;earlyLeaders:number;medianOpportunity:number;topTickers:string[]}
type Stock={ticker:string;leadershipScore?:number;opportunityScore?:number;rsRank?:number;sectorProxy?:string;sectorRank?:number;industryProxy?:string;industryRank?:number;primarySetup?:string}
type Payload={generatedAt:string;market:Record<string,any>;universe:Stock[];groups?:{method:string;description:string;sectorCoverage:number;industryCoverage:number;sectors:GroupRow[];industries:GroupRow[]}}
type Mode='Sectors'|'Industries'
type Sort='rank'|'early'|'breadth'|'opportunity'

const fmt=(v:any,d=1)=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(d):'—'
const signed=(v:any,d=1)=>typeof v==='number'&&Number.isFinite(v)?`${v>0?'+':''}${v.toFixed(d)}%`:'—'
const score=(s:Stock)=>s.leadershipScore??s.opportunityScore??0

export default function GroupsPage({onBack,onOpenTicker}:{onBack:()=>void;onOpenTicker:(ticker:string)=>void}){
  const[payload,setPayload]=useState<Payload|null>(null),[error,setError]=useState('')
  const[mode,setMode]=useState<Mode>('Sectors'),[sort,setSort]=useState<Sort>('rank')
  useEffect(()=>{fetch(`./data/latest.json?t=${Date.now()}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}).then(setPayload).catch(e=>setError(String(e)))},[])
  const groups=mode==='Sectors'?payload?.groups?.sectors||[]:payload?.groups?.industries||[]
  const ordered=useMemo(()=>[...groups].sort((a,b)=>{
    if(sort==='early')return b.earlyLeaders-a.earlyLeaders||b.rank-a.rank
    if(sort==='breadth')return b.stage2Pct-a.stage2Pct||b.rank-a.rank
    if(sort==='opportunity')return b.medianOpportunity-a.medianOpportunity||b.rank-a.rank
    return b.rank-a.rank||b.earlyLeaders-a.earlyLeaders
  }),[groups,sort])
  const stockLeaders=useMemo(()=>[...(payload?.universe||[])].sort((a,b)=>score(b)-score(a)||(b.rsRank||0)-(a.rsRank||0)).slice(0,20),[payload])
  if(!payload)return <div className="grp-loading">{error||'Loading group leadership…'}</div>
  const coverage=mode==='Sectors'?payload.groups?.sectorCoverage||0:payload.groups?.industryCoverage||0
  const total=payload.universe?.length||0
  return <div className="grp-app">
    <header className="grp-top"><div><button onClick={onBack}>← Terminal</button><span className="grp-dot">◉</span><b>STOCKSCOUT GROUPS</b><small>RELATIVE LEADERSHIP</small></div><div><span>{payload.market?.regime||'UNKNOWN'}</span><span>{coverage.toLocaleString()}/{total.toLocaleString()} mapped</span><span>{payload.market?.groupModel||'no group model'}</span></div></header>
    <section className="grp-hero"><div><small>LEADING SECTOR</small><b>{payload.market?.topSector||'—'}</b><span>Rank {payload.market?.topSectorRank||'—'}/99</span></div><div><small>LEADING INDUSTRY PROXY</small><b>{payload.market?.topIndustry||'—'}</b><span>Rank {payload.market?.topIndustryRank||'—'}/99</span></div><div><small>METHOD</small><b>Behavioral proxy</b><span>6M SPY-relative correlation</span></div></section>
    <section className="grp-note"><b>How to read this:</b> groups are assigned from market behaviour, not official GICS metadata. A stock maps to the liquid ETF whose daily returns <em>relative to SPY</em> most closely match it over ~6 months. Group ranks combine 1M/3M/6M relative momentum. This is intended as confirmation for trade leadership, not company taxonomy.</section>
    <section className="grp-controls"><div><button className={mode==='Sectors'?'active':''} onClick={()=>setMode('Sectors')}>Sectors</button><button className={mode==='Industries'?'active':''} onClick={()=>setMode('Industries')}>Industry proxies</button></div><label>Sort <select value={sort} onChange={e=>setSort(e.target.value as Sort)}><option value="rank">Relative rank</option><option value="early">Early leaders</option><option value="breadth">Stage 2 breadth</option><option value="opportunity">Median opportunity</option></select></label></section>
    <main className="grp-layout"><section className="grp-board"><header><span>#</span><span>Group</span><span>1M RS</span><span>3M RS</span><span>6M RS</span><span>S2 breadth</span><span>Early</span><span>Median opp</span><span>Top stocks</span></header>{ordered.map((g,i)=><article key={g.ticker}><div className="grp-rank"><b>{g.rank}</b><i><em style={{width:`${Math.max(2,g.rank)}%`}}/></i><small>{i+1}</small></div><div className="grp-name"><b>{g.name}</b><span>{g.ticker} · {g.stocks} mapped</span></div><strong className={g.rel1m>=0?'good':'bad'}>{signed(g.rel1m)}</strong><strong className={g.rel3m>=0?'good':'bad'}>{signed(g.rel3m)}</strong><strong className={g.rel6m>=0?'good':'bad'}>{signed(g.rel6m)}</strong><div className="grp-breadth"><b>{fmt(g.stage2Pct)}%</b><i><em style={{width:`${Math.max(0,Math.min(100,g.stage2Pct))}%`}}/></i></div><b className={g.earlyLeaders>0?'good':''}>{g.earlyLeaders}</b><b>{fmt(g.medianOpportunity,0)}</b><div className="grp-tickers">{g.topTickers.slice(0,5).map(t=><button key={t} onClick={()=>onOpenTicker(t)}>{t}</button>)}</div></article>)}</section>
      <aside className="grp-leaders"><h2>Leadership-adjusted stocks</h2><p>80% individual early-opportunity score + 20% sector/industry leadership.</p>{stockLeaders.map((s,i)=><button key={s.ticker} onClick={()=>onOpenTicker(s.ticker)}><em>{i+1}</em><div><b>{s.ticker}</b><span>{s.primarySetup||'—'}</span><small>{s.industryProxy||s.sectorProxy||'Unclassified'}</small></div><strong>{score(s)}</strong><span>RS {fmt(s.rsRank,0)}</span></button>)}</aside>
    </main>
  </div>
}
