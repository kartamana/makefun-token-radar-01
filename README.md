# makefun-token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/kartamana/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/kartamana/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks every pre-token protocol in a sealed DefiLlama snapshot by what its launch would be worth, and shows how to farm each one. The board covers the snapshot's whole 40-protocol watchlist plus every other rankable pre-token protocol it finds below (and above) the floor — 198 rows in all. Implied value comes from the snapshot's own figures: TVL times the median market-cap/TVL of the live-token protocols in the same category, adjusted for seven-day growth, age with no token, and how many chains the protocol runs on. No protocol name is special-cased, and no wrapped, staked or bridged product of a token that already trades is ever ranked as a launch. The dashboard is a static page with no network: a sortable, filterable board, a detail view for every protocol with its model breakdown and seven-step farm plan, a live-token view set aside with real market caps, and a what-if sandbox that re-scores the board from the same function.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input token-radar-01-kit/input/snapshot.json
```

Then open `out/dashboard/index.html`. Node.js 22.18 or later is required; the program uses the standard library only.

---

<sub>Entered on [make.fun](https://make.fun/?ref=z277p55j&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
