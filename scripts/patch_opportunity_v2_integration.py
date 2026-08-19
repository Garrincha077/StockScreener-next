#!/usr/bin/env python3
"""One-shot integration patch for Opportunity v2.

This file exists only to make the migration reproducible inside GitHub Actions.
The migration workflow removes it after tests/build/deploy pass.
"""
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def patch_workflow() -> None:
    path = Path('.github/workflows/daily_screening_git_storage.yml')
    text = path.read_text(encoding='utf-8')
    text = replace_once(
        text,
        'fundamental_evidence.py apply_fundamental_evidence.py audit_fundamental_evidence.py compute_group_leadership.py audit_group_leadership.py validate_scan_session.py',
        'fundamental_evidence.py apply_fundamental_evidence.py audit_fundamental_evidence.py compute_group_leadership.py audit_group_leadership.py compute_opportunity_v2.py compute_daily_changes.py validate_scan_session.py',
        'py_compile Opportunity v2',
    )
    text = replace_once(
        text,
        'tests/test_fundamental_evidence.py tests/test_group_leadership.py tests/test_prepare_frontend_payloads.py -q',
        'tests/test_fundamental_evidence.py tests/test_group_leadership.py tests/test_opportunity_v2.py tests/test_prepare_frontend_payloads.py -q',
        'pytest Opportunity v2',
    )
    text = replace_once(
        text,
        '          python complete_legacy_capture.py\n          python compute_daily_changes.py data/batch_results/previous_frontend.json frontend/public/data/latest.json\n          python enrich_scan_layers.py\n          python apply_fundamental_evidence.py\n',
        '          python complete_legacy_capture.py\n          python enrich_scan_layers.py\n          python apply_fundamental_evidence.py\n          python compute_opportunity_v2.py\n          python compute_daily_changes.py data/batch_results/previous_frontend.json frontend/public/data/latest.json\n',
        'Opportunity ordering',
    )
    text = replace_once(
        text,
        "          print('Fundamental Evidence:', m.get('fundamentalEvidence',{}))\n",
        "          print('Fundamental Evidence:', m.get('fundamentalEvidence',{}))\n          print('Opportunity model:', p.get('opportunityModel'))\n          print('Opportunity v2:', m.get('opportunityV2',{}))\n",
        'Opportunity diagnostics',
    )
    text = replace_once(
        text,
        '              "fundamental_evidence_model": "stockscout-fundamental-evidence-v1",\n',
        '              "fundamental_evidence_model": "stockscout-fundamental-evidence-v1",\n              "opportunity_model": "stockscout-opportunity-v2-potential-timing",\n',
        'Opportunity metadata',
    )
    text = replace_once(
        text,
        '            echo "**Fundamental Evidence:** transparent v1 score + separate coverage/confidence; does not affect Opportunity"\n            echo ""\n            echo "**Group Leadership:** confidence-weighted behavioral proxies; weak/noisy relationships are pulled toward neutral; Opportunity/Confluence unchanged"\n',
        '            echo "**Opportunity v2:** 55% structural Potential + 45% current Timing; calibrated on the live universe with bounded caps"\n            echo ""\n            echo "**Fundamental Evidence:** transparent v1 score + confidence; used only as a bounded +/-5 Opportunity v2 modifier"\n            echo ""\n            echo "**Group Leadership:** confidence-weighted behavioral proxies; used only as a bounded +/-5 Opportunity v2 modifier"\n',
        'workflow summary wording',
    )
    path.write_text(text, encoding='utf-8')


def patch_daily_diff() -> None:
    path = Path('compute_daily_changes.py')
    text = path.read_text(encoding='utf-8')
    text = replace_once(
        text,
        '    changed_count = 0\n',
        '    opportunity_comparable = bool(previous.get("opportunityModel") and previous.get("opportunityModel") == current.get("opportunityModel"))\n\n    changed_count = 0\n',
        'daily diff model comparability',
    )
    text = replace_once(
        text,
        '        opportunity_delta = rounded_delta(row.get("opportunityScore", row.get("score")), prev.get("opportunityScore", prev.get("score")), 1)\n',
        '        opportunity_delta = rounded_delta(row.get("opportunityScore", row.get("score")), prev.get("opportunityScore", prev.get("score")), 1) if opportunity_comparable else 0\n',
        'daily diff Opportunity delta',
    )
    text = replace_once(
        text,
        '        "previousGeneratedAt": previous.get("generatedAt"),\n',
        '        "previousGeneratedAt": previous.get("generatedAt"),\n        "opportunityComparable": opportunity_comparable,\n',
        'daily diff metadata',
    )
    path.write_text(text, encoding='utf-8')


def patch_terminal() -> None:
    path = Path('frontend/src/DeepVueTerminal.tsx')
    text = path.read_text(encoding='utf-8')
    text = replace_once(
        text,
        '  opportunityScore?:number;confluence?:number;structureScore?:number;rsScore?:number;baseScore?:number;triggerScore?:number;freshnessScore?:number;neglectedScore?:number\n',
        '  opportunityScore?:number;opportunityPotential?:number;opportunityTiming?:number;opportunityRank?:number;opportunityTier?:string;opportunityGroupModifier?:number;opportunityFundModifier?:number;opportunityPenalty?:number;emergingLeaderScore?:number;confluence?:number;structureScore?:number;rsScore?:number;baseScore?:number;triggerScore?:number;freshnessScore?:number;neglectedScore?:number\n',
        'frontend Opportunity types',
    )
    text = replace_once(
        text,
        'fundamentalSupport:false,fundamentalEvidenceCoverage:false,',
        'fundamentalSupport:false,fundamentalEvidenceCoverage:false,opportunityGroupModifier:false,opportunityFundModifier:false,opportunityPenalty:false,emergingLeaderScore:false,',
        'frontend hidden Opportunity details',
    )
    text = replace_once(text, "loadLocal('dv-cols-v2',defaultVisibility)", "loadLocal('dv-cols-v3',defaultVisibility)", 'visibility migration read')
    text = replace_once(text, "localStorage.setItem('dv-cols-v2',JSON.stringify(visibility))", "localStorage.setItem('dv-cols-v3',JSON.stringify(visibility))", 'visibility migration write')

    anchor = "    helper.accessor(s=>opp(s),{id:'opportunityScore',header:'Opportunity',cell:i=><b className=\"dv-score\">{fmt(i.getValue(),0)}</b>}),\n"
    block = anchor + (
        "    helper.accessor('opportunityTier',{header:'Tier',cell:i=><b>{i.getValue()||'—'}</b>}),\n"
        "    helper.accessor('opportunityRank',{header:'Opp Rank',cell:i=><b className={num(i.getValue())>=95?'dv-good':''}>{fmt(i.getValue(),0)}</b>}),\n"
        "    helper.accessor('opportunityPotential',{header:'Potential',cell:i=>fmt(i.getValue(),0)}),\n"
        "    helper.accessor('opportunityTiming',{header:'Timing',cell:i=><b className={num(i.getValue())>=80?'dv-good':''}>{fmt(i.getValue(),0)}</b>}),\n"
        "    helper.accessor('opportunityGroupModifier',{header:'Group Δ',cell:i=><span className={num(i.getValue())>0?'dv-good':num(i.getValue())<0?'dv-bad':''}>{num(i.getValue())>0?'+':''}{fmt(i.getValue(),1)}</span>}),\n"
        "    helper.accessor('opportunityFundModifier',{header:'Fund Δ',cell:i=><span className={num(i.getValue())>0?'dv-good':num(i.getValue())<0?'dv-bad':''}>{num(i.getValue())>0?'+':''}{fmt(i.getValue(),1)}</span>}),\n"
        "    helper.accessor('opportunityPenalty',{header:'Penalty',cell:i=><span className={num(i.getValue())>0?'dv-bad':''}>{num(i.getValue())?`-${fmt(i.getValue(),0)}`:'—'}</span>}),\n"
        "    helper.accessor('emergingLeaderScore',{header:'Emerging',cell:i=>fmt(i.getValue(),0)}),\n"
    )
    text = replace_once(text, anchor, block, 'Opportunity columns')
    text = replace_once(
        text,
        'const sets:Record<string,VisibilityState>={Core:defaultVisibility,',
        'const sets:Record<string,VisibilityState>={Core:defaultVisibility,Opportunity:{...defaultVisibility,opportunityTier:true,opportunityRank:true,opportunityPotential:true,opportunityTiming:true,opportunityGroupModifier:true,opportunityFundModifier:true,opportunityPenalty:true,emergingLeaderScore:true},',
        'Opportunity column preset',
    )
    text = replace_once(text, '<small>OPPORTUNITY</small>', "<small>OPPORTUNITY · {stock.opportunityTier||'—'}</small>", 'Opportunity header tier')
    text = replace_once(text, '<b>{opp(stock)}</b>{num(stock.opportunityDelta)!==0', '<b>{opp(stock)}</b><span>Rank {fmt(stock.opportunityRank,0)}</span>{num(stock.opportunityDelta)!==0', 'Opportunity header rank')
    text = replace_once(
        text,
        '<K l="Fund Ev" v={fmt(stock.fundamentalEvidenceScore,0)}/><K l="Fund conf" v={`${fmt(stock.fundamentalEvidenceConfidence,0)}%`}/></div>',
        "<K l=\"Potential\" v={fmt(stock.opportunityPotential,0)}/><K l=\"Timing\" v={fmt(stock.opportunityTiming,0)}/><K l=\"Opp Rank\" v={fmt(stock.opportunityRank,0)}/><K l=\"Group Δ\" v={`${num(stock.opportunityGroupModifier)>0?'+':''}${fmt(stock.opportunityGroupModifier,1)}`}/><K l=\"Fund Δ\" v={`${num(stock.opportunityFundModifier)>0?'+':''}${fmt(stock.opportunityFundModifier,1)}`}/><K l=\"Fund Ev\" v={fmt(stock.fundamentalEvidenceScore,0)}/><K l=\"Fund conf\" v={`${fmt(stock.fundamentalEvidenceConfidence,0)}%`}/></div>",
        'Opportunity KPI breakdown',
    )
    text = replace_once(text, '<small>evidence only · does not affect Opportunity</small>', '<small>confirmation evidence · bounded ±5 Opportunity modifier</small>', 'fundamental wording')
    path.write_text(text, encoding='utf-8')


def patch_filters() -> None:
    path = Path('frontend/src/deepvue/filterEngine.ts')
    text = path.read_text(encoding='utf-8')
    text = replace_once(
        text,
        "  {id:'opportunityScore',label:'Emerging Score',kind:'number',defaultOp:'>='},\n",
        "  {id:'opportunityScore',label:'Opportunity v2 0-100',kind:'number',defaultOp:'>='},\n  {id:'opportunityRank',label:'Opportunity Rank 1-99',kind:'number',defaultOp:'>='},\n  {id:'opportunityTier',label:'Opportunity Tier',kind:'text',defaultOp:'='},\n  {id:'opportunityPotential',label:'Opportunity Potential 0-100',kind:'number',defaultOp:'>='},\n  {id:'opportunityTiming',label:'Opportunity Timing 0-100',kind:'number',defaultOp:'>='},\n  {id:'opportunityGroupModifier',label:'Opportunity Group modifier',kind:'number',defaultOp:'>='},\n  {id:'opportunityFundModifier',label:'Opportunity Fundamental modifier',kind:'number',defaultOp:'>='},\n  {id:'opportunityPenalty',label:'Opportunity penalty',kind:'number',defaultOp:'<='},\n  {id:'emergingLeaderScore',label:'Emerging discovery score 0-100',kind:'number',defaultOp:'>='},\n",
        'Opportunity filter fields',
    )
    text = replace_once(text, "  {id:'opportunityDelta',label:'Δ Emerging Score',kind:'number',defaultOp:'>='},\n", "  {id:'opportunityDelta',label:'Δ Opportunity Score',kind:'number',defaultOp:'>='},\n", 'Opportunity delta label')
    anchor = "export const builtInScreens:ScreenState[]=[\n"
    screen = anchor + "  {\n    name:'Prime / Ready Opportunities',rootLogic:'ALL',recipe:'All',query:'',pageSize:100,\n    visibility:{opportunityTier:true,opportunityRank:true,opportunityPotential:true,opportunityTiming:true,rsRank:true,volumeRatio:true,fundamentalEvidenceScore:true},\n    sorting:[{id:'opportunityScore',desc:true},{id:'opportunityRank',desc:true},{id:'opportunityTiming',desc:true},{id:'opportunityPotential',desc:true}],\n    groups:[group('ALL',[rule('opportunityScore','>=','80'),rule('opportunityRank','>=','90'),rule('extended','false')])],\n  },\n"
    text = replace_once(text, anchor, screen, 'Prime Opportunity screen')
    path.write_text(text, encoding='utf-8')


def main() -> None:
    patch_workflow()
    patch_daily_diff()
    patch_terminal()
    patch_filters()
    print('Opportunity v2 integration patch applied')


if __name__ == '__main__':
    main()
