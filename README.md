# makefun-token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/kartamana/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/kartamana/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks every pre-token protocol in a sealed DefiLlama snapshot by what its launch would be worth, and shows how to farm each one. The board covers the snapshot's whole 40-protocol watchlist plus every other rankable pre-token protocol it finds below (and above) the floor — 198 rows in all. Implied value comes from the snapshot's own figures: TVL times the median market-cap/TVL of the live-token protocols in the same category, adjusted for seven-day growth, for the week's momentum, for age with no token, for how many chains the protocol runs on, and for how concentrated its category is. No protocol name is special-cased, and no wrapped, staked or bridged product of a token that already trades is ever ranked as a launch. The dashboard is a static page with no network: a sortable, filterable board with a momentum column and a high-momentum filter, a detail view for every protocol with its model breakdown and seven-step farm plan, a live-token view set aside with real market caps, and a what-if sandbox that re-scores the board from the same function.

## What the model scores

Six multipliers, all recomputed from the snapshot on every run:

- **Category** — the median market-cap/TVL of the live-token protocols in the same category (at least 3 peers, else the global median), clamped to 0.05–1.00.
- **Growth** — `1 + clamp(change_7d, -60, 120) / 100 × 0.5`, the week's direction.
- **Momentum** — `1 + 0.12 × tanh(change_7d / 30)`, a bounded read of the week's strength: a 120% jump scores barely more than a 40% one, and a sharp fall is marked down without being written off.
- **Maturity** — `0.6 + min(age_days, 1095) / 1095 × 0.4`, how long the protocol has run with no token.
- **Breadth** — `1 + 0.02 × min(chains − 1, 10)`, how many chains it reaches.
- **Crowding** — `1 − 0.2 × HHI(category)`, floored at 0.8: the Herfindahl index of the live-token protocols in the category, so a multiple set by one giant is discounted and a diffuse category is barely discounted.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input token-radar-01-kit/input/snapshot.json
```

Then open `out/dashboard/index.html`. Node.js 22.18 or later is required; the program uses the standard library only.

---

<sub>Entered on [make.fun](https://make.fun/?ref=z277p55j&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
