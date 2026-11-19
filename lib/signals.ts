// The token radar's second scoring layer: momentum and crowding.
//
// The base model (lib/model.ts) scores a protocol from its TVL, its category multiple, its
// seven-day growth, its age and its chain count. Two more signals sit on top of it, both derived
// only from the snapshot's own figures, so the same function scores every protocol and no name
// is ever special-cased:
//
//   momentum  = 1 + momentum_weight x tanh(change_7d / momentum_scale)
//               A bounded, diminishing-returns read of the week's move. A protocol that jumped
//               120% in a week scores barely more than one that jumped 40%, and a protocol that
//               fell 60% is marked down without being written off. The base model's linear
//               growth term rewards the week's direction; momentum rewards (or punishes) its
//               strength, and the tanh bound keeps one wild week from deciding the board.
//   crowding  = 1 - crowd_weight x HHI(category), clamped to [crowd_floor, 1]
//               HHI is the Herfindahl-Hirschman index of the live-token protocols in the
//               category: the sum of their squared shares of the category's TVL. A category
//               whose multiple is set by one giant (HHI near 1) is discounted up to 20%,
//               because a multiple set by a single protocol is a single data point, not a
//               market. A diffuse category (HHI near 0) is barely discounted at all. A
//               category with no live-token peer borrows the global HHI, the same fallback the
//               base model uses for its multiple.
//
// The dashboard recomputes both from the same figures, so the page and the board agree.

import type { Snapshot, SnapshotProtocol } from './model.ts';

/** The two signals' constants, as the dashboard states them and the sandbox may change them. */
export interface SignalConstants {
  momentum_weight: number;
  momentum_scale: number;
  crowd_weight: number;
  crowd_floor: number;
}

export const SIGNALS: SignalConstants = {
  momentum_weight: 0.12,
  momentum_scale: 30,
  crowd_weight: 0.2,
  crowd_floor: 0.8,
};

/** One category's concentration: its live-token peers, their HHI, and the discount it earns. */
export interface CategoryConcentration {
  category: string;
  peers: number;
  hhi: number;
  multiplier: number;
}

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Clamp `n` into [lo, hi]. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The momentum multiplier one protocol gets from its seven-day move. */
export function momentumMultiplier(change7d: number | null, signals: SignalConstants): number {
  const change = finite(change7d, 0);
  return 1 + signals.momentum_weight * Math.tanh(change / signals.momentum_scale);
}

/**
 * The live-token protocols a multiple or a concentration may be read from: they trade, so their
 * figures are the market's, and CEX rows are not comparable to a launch. This mirrors the live
 * set categoryMultiples reads in lib/model.ts, so the two signals always read the same peers.
 */
export function livePeers(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX',
  );
}

/** The HHI of one list of protocols: the sum of their squared shares of their combined TVL. */
export function hhiOf(protocols: SnapshotProtocol[]): number {
  const total = protocols.reduce((n, p) => n + p.tvl_usd, 0);
  if (total <= 0) return 0;
  return protocols.reduce((n, p) => n + (p.tvl_usd / total) ** 2, 0);
}

/** The crowding discount one HHI earns: a concentrated category is discounted, a diffuse one is not. */
export function crowdMultiplier(hhi: number, signals: SignalConstants): number {
  return clamp(1 - signals.crowd_weight * hhi, signals.crowd_floor, 1);
}

/**
 * Every category's concentration, plus the global one a category with no live peer borrows.
 * The HHI is kept at full precision: the dashboard recomputes the crowding discount from it, and
 * a rounded HHI would recompute to a different discount than the board carries.
 */
export function categoryConcentrations(
  snapshot: Snapshot,
  signals: SignalConstants,
): { byCategory: Map<string, CategoryConcentration>; global: CategoryConcentration } {
  const live = livePeers(snapshot);
  const globalHhi = hhiOf(live);
  const global: CategoryConcentration = {
    category: 'Global',
    peers: live.length,
    hhi: globalHhi,
    multiplier: crowdMultiplier(globalHhi, signals),
  };
  const buckets = new Map<string, SnapshotProtocol[]>();
  for (const p of live) {
    const key = p.category ?? 'Other';
    const list = buckets.get(key) ?? [];
    list.push(p);
    buckets.set(key, list);
  }
  const byCategory = new Map<string, CategoryConcentration>();
  for (const [category, members] of [...buckets.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const hhi = hhiOf(members);
    byCategory.set(category, { category, peers: members.length, hhi, multiplier: crowdMultiplier(hhi, signals) });
  }
  return { byCategory, global };
}

/** The concentration one protocol's category gets: its own, or the global one when it has no live peer. */
export function concentrationFor(
  category: string | null,
  concentrations: { byCategory: Map<string, CategoryConcentration>; global: CategoryConcentration },
): CategoryConcentration {
  return concentrations.byCategory.get(category ?? 'Other') ?? concentrations.global;
}

/** The two signals' multipliers for one protocol, and the HHI they were read from. */
export function signalMultipliers(
  protocol: SnapshotProtocol,
  concentrations: { byCategory: Map<string, CategoryConcentration>; global: CategoryConcentration },
  signals: SignalConstants,
): { momentum: number; crowd: number; hhi: number; peers: number } {
  const concentration = concentrationFor(protocol.category, concentrations);
  return {
    momentum: momentumMultiplier(protocol.change_7d, signals),
    crowd: concentration.multiplier,
    hhi: concentration.hhi,
    peers: concentration.peers,
  };
}

/** The concentrations as a sorted list for the dashboard: most concentrated first. */
export function concentrationList(
  concentrations: { byCategory: Map<string, CategoryConcentration>; global: CategoryConcentration },
): CategoryConcentration[] {
  return [...concentrations.byCategory.values()].sort((a, b) => b.hhi - a.hhi || (a.category < b.category ? -1 : 1));
}

/** The signals' constants rounded for display, so the dashboard's methodology panel can state them. */
export function signalSummary(signals: SignalConstants): { momentum: string; crowd: string } {
  return {
    momentum: `1 + ${signals.momentum_weight} x tanh(change_7d / ${signals.momentum_scale})`,
    crowd: `1 - ${signals.crowd_weight} x HHI, floored at ${signals.crowd_floor}`,
  };
}

/** The momentum multiplier's range over the snapshot's own seven-day moves, for the run summary. */
export function momentumRange(snapshot: Snapshot, signals: SignalConstants): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const p of snapshot.protocols) {
    const m = momentumMultiplier(p.change_7d, signals);
    if (m < min) min = m;
    if (m > max) max = m;
  }
  return { min: round4(min), max: round4(max) };
}

/** The crowding multiplier's range over the snapshot's categories, for the run summary. */
export function crowdRange(
  concentrations: { byCategory: Map<string, CategoryConcentration>; global: CategoryConcentration },
): { min: number; max: number } {
  const values = [...concentrations.byCategory.values()].map((c) => c.multiplier);
  values.push(concentrations.global.multiplier);
  return { min: round4(Math.min(...values)), max: round4(Math.max(...values)) };
}
