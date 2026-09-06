// Shared run state. Deliberately a plain module singleton — Phaser scenes
// come and go, this doesn't.

import { getCaseByIndex, caseCount } from './caseLoader.js';
import { defaultPlan } from './scanEngine.js';

const state = {
  money: 0,
  caseIndex: 0,
  casesPerLevel: 3,
  attempt: 1, // bumped on retry, feeds the scan seed so layouts re-roll
  request: {},
  // The labor plan: which staffing tier is bought, how it's split between
  // breadth and depth, and how carefully each document is read. Lazily
  // initialised from the case's own defaults the first time it's read.
  plan: null,
  // Which document ids the player put in the box (Phase 3A). What's packed is
  // what gets reviewed — there is no random draw any more.
  packed: null,
  // A reporting-only view of the box as it is being packed. Deliberately
  // separate from `packed`, which is the committed list the scan reads: a
  // complaint about packing is almost always written *while* packing, so the
  // feedback box needs the live numbers without touching review semantics.
  packingSnapshot: null,
  lastResult: null,
  caseLedger: [] // { caseId, net, cleared }
};

export function currentCase() {
  return getCaseByIndex(state.caseIndex);
}

export function getMoney() {
  return state.money;
}

export function addMoney(amount) {
  state.money += amount;
  return state.money;
}

export function getCaseIndex() {
  return state.caseIndex;
}

export function getAttempt() {
  return state.attempt;
}

// Phase 1 stub: every discovered specifier is treated as already unlocked,
// so the request-building and scan loop can be validated on its own. Phases
// 2-3 gate these behind the interrogatories / deposition mini-games.
export function unlockedSpecifiers() {
  return currentCase().requestFields.discoverable.map((f) => f.id);
}

export function setRequest(request) {
  state.request = request;
}

export function getRequest() {
  return state.request;
}

export function getPlan() {
  if (!state.plan) state.plan = defaultPlan(currentCase());
  return state.plan;
}

export function setPlan(patch) {
  state.plan = { ...getPlan(), ...patch };
  return state.plan;
}

export function setPacked(ids) {
  state.packed = ids ? ids.slice() : null;
  return state.packed;
}

export function getPacked() {
  return state.packed;
}

export function setPackingSnapshot(snapshot) {
  state.packingSnapshot = snapshot;
}

export function setResult(result) {
  state.lastResult = result;
}

export function getResult() {
  return state.lastResult;
}

export function commitResult(result) {
  addMoney(result.net);
  state.caseLedger.push({
    caseId: currentCase().id,
    net: result.net,
    cleared: result.net >= currentCase().moneyThreshold
  });
}

export function retryCase() {
  // Re-roll the document layouts so a retry isn't a memorisation exercise.
  state.attempt += 1;
  state.request = {};
  state.packed = null;
  state.packingSnapshot = null;
  state.lastResult = null;
}

function resetPlan() {
  // Tier/notch/style ids are per-case, so a plan never carries across cases.
  state.plan = null;
}

export function advanceCase() {
  state.caseIndex += 1;
  state.attempt = 1;
  state.request = {};
  state.packed = null;
  state.packingSnapshot = null;
  state.lastResult = null;
  resetPlan();
  return state.caseIndex;
}

export function hasNextCase() {
  return state.caseIndex + 1 < caseCount();
}

export function getLedger() {
  return state.caseLedger;
}

export default state;
