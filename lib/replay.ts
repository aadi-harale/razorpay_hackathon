import { randomUUID } from "node:crypto";
import { DEMO } from "@/lib/config";
import { calculateAccounting, compareMargin } from "@/lib/engines/accounting";
import { db } from "@/lib/db";
import { safeJson } from "@/lib/security";

export type ReplayBlocker = "HARD_EVIDENCE_UNKNOWN" | "DELIVERY_CONSTRAINT" | "INVENTORY" | "EXTERNAL_AGENT_UNKNOWN" | "BUYER_BUDGET" | "MERCHANT_POLICY";

type GeneratedIntent = {
  index: number;
  quantity: number;
  budgetMaxPaise: number;
  destination: "Pune" | "Mumbai" | "Delhi";
  initialBlockers: ReplayBlocker[];
};

type Outcome = { paid: boolean; contributionPaise: number; grossPaise: number; blockers: ReplayBlocker[]; route: string | null };
export type ReplayIntentResult = {
  index: number;
  quantity: number;
  budgetMaxPaise: number;
  destination: string;
  representedGmvPaise: number;
  initialBlockers: ReplayBlocker[];
  control: Outcome;
  treatment: Outcome;
};

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function generateIntents(count: number, seed: number): GeneratedIntent[] {
  const random = rng(seed);
  const cities = ["Pune", "Mumbai", "Delhi"] as const;
  const out: GeneratedIntent[] = [];
  for (let i = 0; i < count; i++) {
    const quantity = 16 + Math.floor(random() * 10);
    const merchandise = quantity * DEMO.unitGrossPaise;
    const centralTotal = merchandise + DEMO.locations.central.buyerShippingChargePaise;
    const budgetJitter = Math.floor((random() - 0.45) * 95_000);
    const budgetMaxPaise = Math.max(100_000, centralTotal + budgetJitter);
    const destination = cities[Math.floor(random() * cities.length)];
    const blockers: ReplayBlocker[] = [];
    if (random() < 0.075) blockers.push("HARD_EVIDENCE_UNKNOWN");
    if (random() < 0.055) blockers.push("DELIVERY_CONSTRAINT");
    if (random() < 0.045) blockers.push("INVENTORY");
    if (random() < 0.025) blockers.push("EXTERNAL_AGENT_UNKNOWN");
    out.push({ index: i, quantity, budgetMaxPaise, destination, initialBlockers: blockers });
  }
  return out;
}

function accountingFor(intent: GeneratedIntent, route: typeof DEMO.locations.central | typeof DEMO.locations.edge) {
  return calculateAccounting({
    merchandiseGrossPaise: DEMO.unitGrossPaise * intent.quantity,
    buyerShippingChargePaise: route.buyerShippingChargePaise,
    outputGstRate: DEMO.outputGstRate,
    economicCogsPaise: DEMO.unitEconomicCogsPaise * intent.quantity,
    fulfilmentCostPaise: route.fulfilmentCostPaise,
    processorPlatformRate: DEMO.gatewayPlatformRate,
    gatewayFeeGstRate: DEMO.gatewayFeeGstRate,
    gatewayFeeGstRecoverable: true
  });
}

function runIntent(intent: GeneratedIntent, rescue: boolean, repaired: Set<ReplayBlocker> = new Set()): Outcome {
  const blockers = intent.initialBlockers.filter((b) => !repaired.has(b));
  if (blockers.length) return { paid: false, contributionPaise: 0, grossPaise: 0, blockers, route: null };

  const central = accountingFor(intent, DEMO.locations.central);
  const centralBlockers: ReplayBlocker[] = [];
  if (central.grossCustomerPayablePaise > intent.budgetMaxPaise) centralBlockers.push("BUYER_BUDGET");
  if (!compareMargin(central.contributionMargin, DEMO.contributionFloor)) centralBlockers.push("MERCHANT_POLICY");
  if (!centralBlockers.length) return { paid: true, contributionPaise: central.contributionPaise, grossPaise: central.grossCustomerPayablePaise, blockers: [], route: DEMO.locations.central.id };
  if (!rescue) return { paid: false, contributionPaise: 0, grossPaise: 0, blockers: centralBlockers, route: null };

  if (intent.destination === "Pune") {
    const edge = accountingFor(intent, DEMO.locations.edge);
    const edgeBlockers: ReplayBlocker[] = [];
    if (edge.grossCustomerPayablePaise > intent.budgetMaxPaise) edgeBlockers.push("BUYER_BUDGET");
    if (!compareMargin(edge.contributionMargin, DEMO.contributionFloor)) edgeBlockers.push("MERCHANT_POLICY");
    if (!edgeBlockers.length) return { paid: true, contributionPaise: edge.contributionPaise, grossPaise: edge.grossCustomerPayablePaise, blockers: [], route: DEMO.locations.edge.id };
    return { paid: false, contributionPaise: 0, grossPaise: 0, blockers: edgeBlockers, route: null };
  }
  return { paid: false, contributionPaise: 0, grossPaise: 0, blockers: centralBlockers, route: null };
}

export function pairedReplayDetailed(count = 1000, seed = 20260904): ReplayIntentResult[] {
  return generateIntents(count, seed).map((intent) => {
    const control = runIntent(intent, false);
    const treatment = control.paid ? control : runIntent(intent, true);
    return {
      index: intent.index,
      quantity: intent.quantity,
      budgetMaxPaise: intent.budgetMaxPaise,
      destination: intent.destination,
      representedGmvPaise: intent.budgetMaxPaise,
      initialBlockers: [...intent.initialBlockers],
      control,
      treatment
    };
  });
}

function summarize(results: ReplayIntentResult[]) {
  let controlPaid = 0, treatmentPaid = 0, controlContribution = 0, treatmentContribution = 0, controlGmv = 0, treatmentGmv = 0;
  const reasons: Record<string, number> = {
    "Buyer budget": 0,
    "Missing current evidence": 0,
    "Delivery constraint": 0,
    Inventory: 0,
    "Policy block": 0,
    "Unknown reason": 0
  };
  let eligible = 0, offers = 0, regressions = 0;
  for (const r of results) {
    if (!r.initialBlockers.length) eligible++;
    if (!r.initialBlockers.length) offers++;
    if (r.control.paid) { controlPaid++; controlContribution += r.control.contributionPaise; controlGmv += r.control.grossPaise; }
    if (r.treatment.paid) { treatmentPaid++; treatmentContribution += r.treatment.contributionPaise; treatmentGmv += r.treatment.grossPaise; }
    if (r.control.paid && !r.treatment.paid) regressions++;
    const baselineReasons = r.initialBlockers.length ? r.initialBlockers : r.control.blockers;
    for (const b of baselineReasons) {
      if (b === "BUYER_BUDGET") reasons["Buyer budget"]++;
      else if (b === "HARD_EVIDENCE_UNKNOWN") reasons["Missing current evidence"]++;
      else if (b === "DELIVERY_CONSTRAINT") reasons["Delivery constraint"]++;
      else if (b === "INVENTORY") reasons.Inventory++;
      else if (b === "MERCHANT_POLICY") reasons["Policy block"]++;
      else if (b === "EXTERNAL_AGENT_UNKNOWN") reasons["Unknown reason"]++;
    }
  }
  return {
    intents: results.length,
    candidateGenerated: results.length,
    eligible,
    offers,
    controlPaid,
    treatmentPaid,
    attributable: treatmentPaid - controlPaid,
    regressions,
    controlContributionPaise: controlContribution,
    treatmentContributionPaise: treatmentContribution,
    incrementalContributionPaise: treatmentContribution - controlContribution,
    controlGmvPaise: controlGmv,
    treatmentGmvPaise: treatmentGmv,
    netGmvDeltaPaise: treatmentGmv - controlGmv,
    reasons,
    label: "Simulation estimate — deterministic paired replay, not causal proof"
  };
}

export function pairedReplaySummary(count = 1000, seed = 20260904) {
  return summarize(pairedReplayDetailed(count, seed));
}

function singleFixAnalysis(results: ReplayIntentResult[], blocker: ReplayBlocker, seed = 20260904) {
  let affected = 0, newlyConverted = 0, gmv = 0, contribution = 0;
  const generated = generateIntents(results.length, seed);
  for (const original of results) {
    if (!original.initialBlockers.includes(blocker)) continue;
    affected++;
    const intent = generated[original.index];
    const repairedOutcome = runIntent(intent, true, new Set([blocker]));
    if (!original.treatment.paid && repairedOutcome.paid) {
      newlyConverted++;
      gmv += repairedOutcome.grossPaise;
      contribution += repairedOutcome.contributionPaise;
    }
  }
  return { affected, newlyConverted, gmvPaise: gmv, contributionPaise: contribution };
}

export function multiFixCombinations(results = pairedReplayDetailed()) {
  const map = new Map<string, { affected: number; representedGmvPaise: number }>();
  for (const r of results) {
    if (r.initialBlockers.length < 2) continue;
    const key = [...r.initialBlockers].sort().join(" + ");
    const item = map.get(key) ?? { affected: 0, representedGmvPaise: 0 };
    item.affected++;
    item.representedGmvPaise += r.representedGmvPaise;
    map.set(key, item);
  }
  return [...map.entries()].map(([combination, value]) => ({ combination, ...value })).sort((a,b) => b.representedGmvPaise - a.representedGmvPaise);
}

export function opportunityCards(results = pairedReplayDetailed(), seed = 20260904) {
  const replay = summarize(results);
  const evidence = singleFixAnalysis(results, "HARD_EVIDENCE_UNKNOWN", seed);
  const inventory = singleFixAnalysis(results, "INVENTORY", seed);
  return [
    {
      id: "opp_edge",
      kind: "FULFILMENT_POLICY",
      title: "Prefer Pune edge fulfilment when central shipping breaks the buyer mandate",
      affected: replay.reasons["Buyer budget"] ?? 0,
      newlyConverted: replay.attributable,
      lostConversions: replay.regressions,
      netGmvDeltaPaise: replay.netGmvDeltaPaise,
      contributionPaise: replay.incrementalContributionPaise,
      status: "Simulation estimate",
      unmodelled: "Cross-SKU substitution",
      note: "Same intents, same merchant snapshot and deterministic buyer model. Treatment adds rescue only after baseline rejection."
    },
    {
      id: "opp_evidence",
      kind: "DATA_REPAIR",
      title: "Resolve current evidence gaps that independently block otherwise viable purchases",
      affected: evidence.affected,
      newlyConverted: evidence.newlyConverted,
      lostConversions: 0,
      netGmvDeltaPaise: evidence.gmvPaise,
      contributionPaise: evidence.contributionPaise,
      status: "Single-fix replay",
      unmodelled: "External document acquisition cost",
      note: "Value is counted only when repairing HARD_EVIDENCE_UNKNOWN alone flips a previously rejected intent to paid."
    },
    {
      id: "opp_inventory",
      kind: "INVENTORY_POLICY",
      title: "Repair verified inventory availability only where that single blocker unlocks conversion",
      affected: inventory.affected,
      newlyConverted: inventory.newlyConverted,
      lostConversions: 0,
      netGmvDeltaPaise: inventory.gmvPaise,
      contributionPaise: inventory.contributionPaise,
      status: "Single-fix replay",
      unmodelled: "Inventory procurement carrying cost",
      note: "No fractional attribution. Multi-blocker intents are reported separately."
    }
  ].sort((a,b) => b.contributionPaise - a.contributionPaise);
}

export function statefulPortfolioReplaySummary(count = 120, seed = 20260904) {
  const intents = generateIntents(count, seed);
  const state: { control: Record<"central"|"edge", number>; treatment: Record<"central"|"edge", number> } = {
    control: { central: DEMO.locations.central.stock, edge: DEMO.locations.edge.stock },
    treatment: { central: DEMO.locations.central.stock, edge: DEMO.locations.edge.stock }
  };
  let controlPaid = 0, treatmentPaid = 0, controlContribution = 0, treatmentContribution = 0, regressions = 0;
  const contention: Array<{ index: number; reason: string }> = [];

  for (const intent of intents) {
    const control = runIntent(intent, false);
    let controlFinal = control;
    if (control.paid) {
      const key = control.route === DEMO.locations.edge.id ? "edge" : "central";
      if (state.control[key] >= intent.quantity) state.control[key] -= intent.quantity;
      else controlFinal = { paid: false, contributionPaise: 0, grossPaise: 0, blockers: ["INVENTORY"], route: null };
    }
    const treatment = controlFinal.paid ? runIntent(intent, false) : runIntent(intent, true);
    let treatmentFinal = treatment;
    if (treatment.paid) {
      const key = treatment.route === DEMO.locations.edge.id ? "edge" : "central";
      if (state.treatment[key] >= intent.quantity) state.treatment[key] -= intent.quantity;
      else {
        treatmentFinal = { paid: false, contributionPaise: 0, grossPaise: 0, blockers: ["INVENTORY"], route: null };
        contention.push({ index: intent.index, reason: `${key.toUpperCase()} inventory exhausted by earlier treatment conversions.` });
      }
    }
    if (controlFinal.paid) { controlPaid++; controlContribution += controlFinal.contributionPaise; }
    if (treatmentFinal.paid) { treatmentPaid++; treatmentContribution += treatmentFinal.contributionPaise; }
    if (controlFinal.paid && !treatmentFinal.paid) regressions++;
  }
  return {
    intents: count,
    controlPaid,
    treatmentPaid,
    attributable: treatmentPaid - controlPaid,
    regressions,
    controlContributionPaise: controlContribution,
    treatmentContributionPaise: treatmentContribution,
    incrementalContributionPaise: treatmentContribution - controlContribution,
    endingInventory: state,
    contention: contention.slice(0, 12),
    label: "Stateful portfolio simulation — inventory depletion is modelled; substitution is UNMODELLED."
  };
}

export function persistReplayRun(input: { count?: number; seed?: number; mode?: "ISOLATED" | "STATEFUL" } = {}) {
  const count = input.count ?? 1000;
  const seed = input.seed ?? 20260904;
  const mode = input.mode ?? "ISOLATED";
  const runId = `replay_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  if (mode === "STATEFUL") {
    const summary = statefulPortfolioReplaySummary(Math.min(count, 500), seed);
    db.prepare(`INSERT INTO replay_runs (id, merchant_id, mode, seed, intents, control_paid, treatment_paid, regressions, control_contribution_paise, treatment_contribution_paise, incremental_contribution_paise, summary_json, label, created_at)
      VALUES (?, ?, 'STATEFUL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(runId, DEMO.merchantId, seed, summary.intents, summary.controlPaid, summary.treatmentPaid, summary.regressions, summary.controlContributionPaise, summary.treatmentContributionPaise, summary.incrementalContributionPaise, safeJson(summary), summary.label, createdAt);
    return { runId, mode, summary, opportunities: [] };
  }

  const results = pairedReplayDetailed(count, seed);
  const summary = summarize(results);
  const opportunities = opportunityCards(results, seed);
  const combos = multiFixCombinations(results);
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO replay_runs (id, merchant_id, mode, seed, intents, control_paid, treatment_paid, regressions, control_contribution_paise, treatment_contribution_paise, incremental_contribution_paise, summary_json, label, created_at)
      VALUES (?, ?, 'ISOLATED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(runId, DEMO.merchantId, seed, summary.intents, summary.controlPaid, summary.treatmentPaid, summary.regressions, summary.controlContributionPaise, summary.treatmentContributionPaise, summary.incrementalContributionPaise, safeJson({ ...summary, multiFixCombinations: combos }), summary.label, createdAt);
    const insertResult = db.prepare(`INSERT INTO replay_results (id, run_id, intent_index, control_paid, treatment_paid, control_contribution_paise, treatment_contribution_paise, baseline_blockers, treatment_blockers, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const r of results) {
      insertResult.run(`rr_${randomUUID()}`, runId, r.index, r.control.paid ? 1 : 0, r.treatment.paid ? 1 : 0, r.control.contributionPaise, r.treatment.contributionPaise, safeJson(r.initialBlockers.length ? r.initialBlockers : r.control.blockers), safeJson(r.treatment.blockers), safeJson({ quantity: r.quantity, budgetMaxPaise: r.budgetMaxPaise, destination: r.destination, representedGmvPaise: r.representedGmvPaise, controlRoute: r.control.route, treatmentRoute: r.treatment.route }));
    }
    const insertOpp = db.prepare(`INSERT INTO opportunities (id, run_id, kind, title, affected, newly_converted, lost_conversions, net_gmv_delta_paise, net_incremental_contribution_paise, status, unmodelled, note, rank, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    opportunities.forEach((o, index) => insertOpp.run(`opp_${randomUUID()}`, runId, o.kind, o.title, o.affected, o.newlyConverted, o.lostConversions, o.netGmvDeltaPaise, o.contributionPaise, o.status, o.unmodelled, o.note, index + 1, createdAt));
  });
  tx();
  return { runId, mode, summary, opportunities, multiFixCombinations: combos };
}

export function latestPersistedReplay(mode?: "ISOLATED" | "STATEFUL") {
  const run = (mode
    ? db.prepare(`SELECT * FROM replay_runs WHERE merchant_id=? AND mode=? ORDER BY created_at DESC LIMIT 1`).get(DEMO.merchantId, mode)
    : db.prepare(`SELECT * FROM replay_runs WHERE merchant_id=? ORDER BY created_at DESC LIMIT 1`).get(DEMO.merchantId)) as Record<string, unknown> | undefined;
  if (!run) return null;
  const opportunities = db.prepare(`SELECT * FROM opportunities WHERE run_id=? ORDER BY rank ASC`).all(String(run.id));
  return { run, summary: JSON.parse(String(run.summary_json)), opportunities };
}

export function replayDashboardData() {
  const persisted = latestPersistedReplay("ISOLATED");
  if (!persisted) {
    const detailed = pairedReplayDetailed();
    return { persisted: false, summary: summarize(detailed), opportunities: opportunityCards(detailed), multiFixCombinations: multiFixCombinations(detailed) };
  }
  const opportunities = (persisted.opportunities as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    kind: String(row.kind),
    title: String(row.title),
    affected: Number(row.affected),
    newlyConverted: Number(row.newly_converted),
    lostConversions: Number(row.lost_conversions),
    netGmvDeltaPaise: Number(row.net_gmv_delta_paise),
    contributionPaise: Number(row.net_incremental_contribution_paise),
    status: String(row.status),
    unmodelled: row.unmodelled ? String(row.unmodelled) : "None",
    note: String(row.note)
  }));
  const summary = persisted.summary as ReturnType<typeof pairedReplaySummary> & { multiFixCombinations?: ReturnType<typeof multiFixCombinations> };
  return { persisted: true, summary, opportunities, multiFixCombinations: summary.multiFixCombinations ?? [] };
}
