# StockScout Trend Birth Roadmap

Status: design roadmap / greenfield-capable

Date: 2026-08-26

## 1. Product thesis

StockScout and LEGACY serve different jobs and should not converge into one blended screener.

### LEGACY = swing trading engine

LEGACY is the frozen Ryan/Minervini-style setup engine. Its job is to find tradeable momentum setups inside an already-established trend.

It is allowed to like a stock even when:
- the trend is already mature;
- the stock has already advanced substantially;
- the current breakout is the third, fourth or later continuation setup;
- the long-term cycle may be closer to its end than its beginning.

What matters to LEGACY is whether the current setup is attractive now: trend quality, Minervini template, VCP, breakout, volume, relative strength, risk/reward, entry quality and related swing-trading evidence.

Typical holding horizon: days to several weeks, sometimes a few months.

### StockScout = position/trend + investing discovery engine

StockScout should answer a different question:

> Is a new important trend being born here, early enough that it may still have months or years of runway?

The primary objective is not to find the cleanest current swing entry. The objective is to detect a structural transition before a stock becomes an obvious mature momentum leader.

StockScout should prefer:
- long structural bases and resets;
- dormant or neglected stocks beginning to attract attention;
- first meaningful accumulation footprints;
- improving relative strength before it becomes extreme;
- MA compression followed by slope turn and expansion;
- late Stage 1 and Stage 1 -> Stage 2 transitions;
- the first important breakout from a long base;
- little multi-year overhead resistance / large resistance runway;
- improving business fundamentals or a credible fundamental inflection;
- emerging industry/group leadership;
- evidence that a new leadership cycle is beginning, not merely continuing.

Typical holding horizon: weeks to months for position trading, and months to years for investing.

## 2. Greenfield decision

This roadmap is deliberately not constrained by the current StockScout Core architecture.

The existing `Garrincha077/StockScreener-next` repository may be:
1. evolved in place;
2. copied into a new experimental repository;
3. used only as a source of proven infrastructure while a new StockScout engine is built separately.

The current app remains valuable because it already contains working pieces such as scan infrastructure, canonical data, charting, RS, Stage, MA Cluster, Group Leadership, fundamentals, review UX and publication tooling.

However, the future StockScout engine is allowed to redesign:
- scoring;
- ranking;
- lifecycle states;
- data schema;
- feature engineering;
- scan cadence;
- historical context requirements;
- UI/workflow;
- research and validation infrastructure.

The only deliberate separation that should remain conceptually stable is:

> LEGACY is a swing engine. StockScout is an early-cycle position/trend/investing engine.

If a new repository is created, the current production/stable repositories remain untouched until the new system earns promotion through validation.

## 3. Core research question

The main StockScout research question becomes:

> What did major future winners look like before they became obvious momentum leaders?

The system should be designed around the period before and during trend birth, not around mature continuation setups.

A useful mental sequence is:

`DORMANT -> ACCUMULATING -> AWAKENING -> LATE STAGE 1 -> STAGE 1->2 -> EARLY LEADER -> ESTABLISHED LEADER -> MATURE / LATE CYCLE`

StockScout should concentrate on the middle of this sequence:

- ACCUMULATING
- AWAKENING
- LATE STAGE 1
- STAGE 1->2
- EARLY LEADER

LEGACY naturally becomes more relevant after a stock reaches established momentum and begins producing high-quality swing setups.

## 4. Desired StockScout evidence model

StockScout should not initially reduce everything to one opaque score. The first objective is to build transparent, inspectable evidence blocks.

### 4.1 Structural base and reset

Measure whether the stock has spent enough time resetting its prior cycle.

Candidate fields:
- base age in weeks/months/years;
- number of months without a sustained Stage 2 trend;
- range width and contraction over time;
- distance from prior major cycle high;
- duration since prior major high;
- depth of prior decline/reset;
- percentage of historical volume transacted inside the current base;
- number of failed breakout attempts inside the base;
- whether the base is forming above, around or below long-term moving averages.

Desired UI examples:
- `3.2Y BASE`
- `18M STRUCTURAL RESET`
- `FIRST MAJOR ATTEMPT`

### 4.2 Multi-year resistance runway / overhead supply

The system should understand not only the nearest pivot but the stock's multi-year price map.

Candidate fields:
- nearest meaningful resistance above current price;
- distance to prior 3Y / 5Y / 10Y high;
- number and density of historical high-volume congestion zones overhead;
- volume-at-price concentration above current price;
- years since price last traded above the current region;
- whether the stock is entering blue-sky / near-blue-sky territory;
- estimated resistance runway as percent and ATR units.

Desired UI examples:
- `LOW OVERHEAD SUPPLY`
- `4.6Y RESISTANCE RUNWAY`
- `BLUE-SKY CANDIDATE`

This is one of the clearest differences from a pure swing engine: StockScout should care deeply whether a new trend has room to become large.

### 4.3 Accumulation footprints

The engine should detect institutional-looking attention before the chart becomes obvious.

Candidate evidence:
- abnormal daily/weekly volume relative to 20D / 50D / 1Y baseline;
- high-volume up days versus high-volume down days;
- weekly accumulation events inside a base;
- gap + volume events after long neglect;
- repeated closes in the upper portion of the daily/weekly range on abnormal volume;
- price response per unit of volume;
- unusually high dollar volume relative to the stock's own history;
- volume dry-up between accumulation events;
- clusters of accumulation events separated by constructive pauses.

Important distinction:

> One random volume spike is not enough. We want a change in the character of participation.

Desired UI examples:
- `4 ACCUMULATION WEEKS`
- `UP-VOLUME SHIFT`
- `ATTENTION INFLECTION`

### 4.4 Relative-strength inflection

High RS is useful, but StockScout should care especially about the transition from weak/ignored to improving leadership.

Candidate fields:
- RS rank today;
- RS rank 20D / 60D / 120D ago;
- RS velocity;
- RS acceleration;
- RS slope versus SPY and versus industry group;
- new RS highs before price highs;
- percentile crossing events such as 50, 70, 80 and 90;
- persistence of RS improvement.

Example:

`RS 42 -> 55 -> 68 -> 79`

may be more interesting to StockScout than a stock that has been at RS 98 for a year.

Desired UI examples:
- `RS INFLECTING`
- `RS +31 / 3M`
- `RS LEADING PRICE`

### 4.5 MA compression -> slope turn -> expansion

The existing MA Cluster concept is useful but should evolve from a static snapshot into a temporal process.

Measure:
- compression of 10W / 20W / 30W / 40W or equivalent daily MAs;
- duration of compression;
- slope history of each important MA;
- transition from falling -> flat -> rising;
- order in which shorter MAs reclaim longer MAs;
- first clean expansion after long compression;
- price behavior around the cluster;
- volume during MA reclaim / expansion.

Desired states:
- `COMPRESSED`
- `TURNING UP`
- `EARLY EXPANSION`
- `ESTABLISHED EXPANSION`

### 4.6 Stage maturity and transition

A single Stage label is not sufficient for the new mission.

StockScout should distinguish at minimum:
- Early Stage 1
- Mature Stage 1
- Late Stage 1
- Stage 1 -> 2 transition
- Early Stage 2
- Established Stage 2
- Late / extended Stage 2
- Stage 2 deterioration

Useful fields:
- weeks spent in Stage 1;
- weeks since 30/40W MA turned flat/up;
- weeks since first Stage 2 confirmation;
- breakout count since Stage 2 began;
- percentage advance since trend birth;
- distance from long-term MA at current point;
- number of successful continuation bases already completed.

This creates an explicit `trend age` concept.

### 4.7 First-breakout / early-cycle detection

Not all breakouts are equivalent.

StockScout should know whether the current move is:
- first breakout from a multi-year base;
- first breakout from a 1Y base;
- first continuation base after trend birth;
- later continuation breakout;
- potentially climactic / mature breakout.

The preferred StockScout event is the first or very early breakout associated with a real structural change.

Desired UI examples:
- `FIRST BREAKOUT`
- `EARLY CYCLE`
- `TREND AGE 7W`

### 4.8 Fundamental inflection for investing horizon

For the investing side, StockScout should go beyond static quality and look for change.

Candidate evidence:
- EPS growth acceleration;
- revenue growth acceleration;
- margin inflection;
- FCF inflection;
- return on capital trend;
- estimate revisions;
- earnings surprise history;
- transition from losses to profits;
- improving balance-sheet risk;
- share-count trend;
- operating leverage;
- business-cycle or product-cycle inflection.

The objective is not to require perfect fundamentals. It is to detect when business reality is beginning to improve at the same time as market behavior.

Desired UI examples:
- `FUNDAMENTALS TURNING`
- `EPS ACCELERATION`
- `MARGIN INFLECTION`
- `ESTIMATES RISING`

### 4.9 Group / thematic leadership in formation

Current Group Leadership should evolve to detect emergence, not only current rank.

Candidate fields:
- group rank now versus 1M / 3M / 6M ago;
- breadth of improving stocks inside the group;
- number of new highs in the group;
- relative-strength acceleration of the group;
- concentration versus broad participation;
- whether the candidate is leading its own group's move;
- optional thematic/catalyst classification where reliable.

Desired UI examples:
- `GROUP RANK 72 -> 18`
- `EMERGING GROUP`
- `STOCK LEADS GROUP`

### 4.10 Episodic attention / catalyst layer

Catalysts are useful but should not become a mandatory black box.

Possible evidence:
- earnings gaps;
- major guidance changes;
- product launches;
- regulatory / contract / industry events;
- management changes;
- capital structure changes;
- major estimate revision clusters;
- high-volume price reaction with or without identified news.

The price/volume response remains primary. News classification is supporting evidence.

## 5. Lifecycle engine

Rather than immediately building a new 0-100 mega-score, create a lifecycle classifier with explainable evidence.

Proposed states:

### DORMANT
- no meaningful leadership;
- long flat/down history;
- weak or neutral RS;
- no persistent accumulation.

### ACCUMULATING
- still broadly in a base;
- first repeated high-volume footprints;
- improved up/down volume character;
- little price progress yet.

### AWAKENING
- RS inflection;
- MA compression or early reclaim;
- stronger volume response;
- price moves toward upper base region;
- group/fundamental evidence may be improving.

### LATE STAGE 1
- long base is mature;
- long-term MA flat or beginning to rise;
- price holds above improving MA structure;
- resistance is being tested repeatedly;
- accumulation evidence remains constructive.

### STAGE 1 -> 2 TRANSITION
- decisive structural breakout or equivalent transition;
- long-term MA turns upward;
- RS confirms/accelerates;
- participation expands;
- transition should still be early in trend age.

### EARLY LEADER
- Stage 2 established but young;
- first pullback/base or first continuation structure;
- RS/group/fundamental leadership strengthening;
- substantial runway may remain.

### ESTABLISHED LEADER
- proven trend and momentum;
- still relevant for position management;
- increasingly suitable for LEGACY swing setups;
- no longer the primary discovery target for StockScout.

### MATURE / LATE CYCLE
- old trend;
- multiple prior breakouts;
- high extension;
- increasing failed-breakout or distribution risk;
- StockScout should flag lifecycle maturity rather than rank it as a fresh discovery.

## 6. Position mode and Investing mode

StockScout may ultimately expose two related but distinct views over the same evidence graph.

### Position / Trend mode

Optimizes for:
- Stage 1 -> 2 transitions;
- price/volume structure;
- trend age;
- RS acceleration;
- group emergence;
- first breakout / first pullback;
- risk of structural failure.

Expected holding period: several weeks to many months.

### Investing / Structural Winner mode

Adds stronger emphasis on:
- multi-year base/reset;
- long resistance runway;
- fundamental inflection;
- earnings/revenue/margin trajectory;
- long-duration group/theme change;
- quality of business improvement;
- potential for a multi-year leadership cycle.

Expected holding period: months to years.

The modes should share raw evidence. They need not share identical ranking logic.

## 7. Relationship with LEGACY

LEGACY remains separate and should not be blended into StockScout discovery logic by default.

Useful relationship:

1. StockScout discovers a stock early.
2. The stock progresses through its lifecycle.
3. Once momentum is established, LEGACY may begin producing high-quality swing setups.
4. LEGACY can then be used for tactical entries/add-ons/exits without redefining why StockScout owns or follows the stock.

This allows the same ticker to serve different horizons at different times.

Example conceptual timeline:

`StockScout ACCUMULATING @ $18 -> AWAKENING @ $21 -> 1->2 @ $25 -> EARLY LEADER @ $29 -> LEGACY VCP BUY @ $36`

The fact that LEGACY enters later is not a failure. It is performing a different job.

## 8. Historical research program

Before finalizing ranking/scoring, create a historical winner study.

### Winner cohorts

Build historical samples of stocks that later achieved, for example:
- +50% within 6-12 months;
- 2x within 12-24 months;
- 3x / 5x over longer windows;
- major sustained relative-strength leadership.

Avoid survivor-only analysis. Include controls and failed candidates.

### Observation windows

For each major winner, inspect snapshots approximately:
- 240 trading days before trend birth;
- 120D before;
- 60D before;
- 20D before;
- at breakout / Stage transition;
- 20D / 60D / 120D after.

### Questions

- How long was the base?
- Was there multi-year overhead resistance?
- When did abnormal volume first appear?
- When did RS turn?
- When did the 30/40W MA turn?
- Did fundamentals inflect before or after price?
- Was the industry group already strong or only improving?
- How many breakouts had already occurred?
- What separated true trend births from false starts?

### Research influences

Use practitioner ideas as hypotheses, not unquestioned rules:
- Weinstein Stage Analysis;
- O'Neil / CAN SLIM winner studies;
- Minervini trend and setup concepts;
- Marios Stamatoudis / neglect-to-attention and early momentum-cycle concepts;
- momentum / 52-week-high / industry-momentum / earnings-drift academic literature;
- StockScout's own observed winners and failures.

All external ideas should be converted into measurable fields and independently tested where possible.

## 9. Validation metrics

A successful StockScout redesign should be judged by whether it finds important trends early enough to matter.

Candidate metrics:
- probability of Stage 2 transition after an early signal;
- 20D / 60D / 120D / 250D forward return;
- MFE and MAE;
- time from first StockScout detection to major breakout;
- time from first StockScout detection to later LEGACY setup;
- return captured before the first LEGACY BUY;
- false-start / failed-breakout rate;
- maximum drawdown after detection;
- persistence of trend after detection;
- 2x / 3x winner capture rate;
- miss rate: major winners never detected early;
- precision by lifecycle state;
- results relative to SPY and relevant industry group.

For investing mode also measure:
- 1Y / 2Y / 3Y outcomes where data permits;
- fundamental trajectory after detection;
- duration of leadership cycle.

## 10. Proposed implementation roadmap

This roadmap is intentionally separate from the current repository's numbered Phase 6/7 work.

### Step A — Architecture and historical audit

Goal: decide what to reuse and what to replace.

Tasks:
- inventory current Stage, RS, MA Cluster, Emerging Leader, Opportunity, Group Leadership and fundamental logic;
- map every current field to the new Trend Birth thesis;
- classify each current component as `KEEP`, `EXTEND`, `REPLACE`, or `DROP`;
- identify required additional historical data depth;
- decide whether to continue in Next or create a new repository.

Deliverable:
- architecture map;
- field-gap matrix;
- repo decision.

### Step B — Trend Birth evidence layer v1

Build raw transparent fields first:
- base age;
- trend age;
- breakout count;
- resistance runway;
- overhead supply;
- RS history/velocity;
- MA compression and slope-turn history;
- accumulation footprints;
- Stage maturity / transition state.

Do not optimize weights yet.

Deliverable:
- per-ticker evidence object;
- audit report on real candidates;
- simple UI badges/columns.

### Step C — Fundamental and group inflection v1

Add:
- revenue/EPS/margin/FCF trajectory;
- revisions and surprises if data quality allows;
- group rank velocity;
- group breadth/leadership emergence;
- optional catalyst/attention evidence.

Deliverable:
- combined technical + business transition profile.

### Step D — Lifecycle classifier v1

Implement explainable lifecycle states:
- Dormant;
- Accumulating;
- Awakening;
- Late Stage 1;
- 1->2 Transition;
- Early Leader;
- Established Leader;
- Mature/Late Cycle.

Each classification must expose reasons and evidence, not only a label.

Deliverable:
- lifecycle state + confidence + reasons.

### Step E — Historical winner / failure study

Create reproducible historical cohorts and controls.

Deliverable:
- feature prevalence before major winners;
- feature prevalence in false starts;
- lead-time analysis;
- ablation results;
- clear list of useful versus redundant features.

### Step F — Ranking redesign

Only after Step E, decide whether to:
- retain Opportunity v2;
- replace it;
- split ranking into Position and Investing models;
- use a state-first ranking instead of a universal score.

Preferred direction:
- lifecycle state first;
- evidence strength second;
- ranking within comparable lifecycle states;
- avoid comparing a Dormant accumulation candidate directly against a mature momentum leader with one universal number unless evidence strongly supports it.

Deliverable:
- StockScout Position ranking;
- StockScout Investing ranking;
- transparent decomposition.

### Step G — Product workflow redesign

Potential core screens:
- `Accumulating`
- `Awakening`
- `Late Stage 1`
- `1->2 Transition`
- `Early Leaders`
- `Long Base / Low Overhead Supply`
- `Fundamental Inflection`
- `New Attention / High Volume`
- `Mature Leaders`

The daily workflow should emphasize changes of state:
- newly entered Awakening;
- newly entered 1->2 Transition;
- first abnormal accumulation event;
- RS inflection;
- failed transition / lifecycle downgrade.

### Step H — Position management layer

Once discovery is reliable, add optional long-duration management evidence:
- weekly structural stop;
- 10W / 30W / 40W trend health;
- distribution / failed-breakout risk;
- trend age and extension;
- partial-profit / add-on context;
- lifecycle downgrade.

This remains conceptually separate from LEGACY swing management.

### Step I — Repository / production decision

If the redesign is large enough, create a new repository and promote only after parallel operation.

Possible structure:
- current `stock-screener2`: stable fallback;
- current `StockScreener-next`: proven current-generation app / reference;
- new repo: Trend Birth / StockScout v2 greenfield implementation.

Promotion requires evidence, not feature parity for its own sake.

## 11. What should not drive the redesign

Avoid these traps:
- simply adding more weight to stocks already at RS 95-99;
- rewarding late continuation breakouts as if they were fresh trend births;
- treating all Stage 2 stocks as equally early;
- using one-day volume spikes without persistence/context;
- confusing a low-priced deep decline with a genuine long base;
- requiring a perfect Minervini setup before StockScout becomes interested;
- optimizing exclusively for 5D/20D returns when the mission is months/years;
- using LEGACY confirmation as a mandatory gate;
- adding another opaque mega-score before raw evidence is understood;
- preserving old scoring solely because it already exists.

## 12. Definition of success

The redesign is successful if StockScout repeatedly surfaces stocks during the early structural transition, before they become obvious mature momentum names, while giving enough transparent evidence to distinguish genuine trend birth from noise.

The ideal StockScout candidate should make the user think:

> Something important is beginning here. The stock has spent a long time resetting, supply above is limited, participation is changing, relative strength is turning, the long-term structure is moving from Stage 1 toward Stage 2, and the business/group evidence is improving. This may be worth following for the next several quarters or years.

LEGACY can later answer a different question:

> Is there a good swing setup in this established winner right now?

That separation is intentional and should remain visible in both architecture and UI.

## 13. Immediate next action

Do not start by changing scoring.

Start with **Step A — Architecture and historical audit** and produce a field-gap matrix showing:
- what current StockScout already measures well;
- what it measures but without enough historical context;
- what is missing for Trend Birth detection;
- which existing components can be reused in a future copied/new repository;
- whether the redesign is better implemented inside `StockScreener-next` or as a new repo.

Only after that audit should implementation begin.