/** Free deterministic review. This module performs no model or network calls. */
import { BUY_THRESHOLD } from './thresholds.mjs';
export const RULES_VERSION = 'rules-review-v1.1.0';
const RULE_IDS = ['trend','momentum','participation','risk'];
const SIGNALS = new Set(['BUY','WATCH','WAIT','UNAVAILABLE']);

/** Requires a complete, internally consistent rule review; transport checks freshness/mode. */
export function rulesBuyEligible(analysis) {
  if (!analysis || analysis.analysisMethod !== 'rules' || analysis.reviewStatus !== 'ready'
    || analysis.signal !== 'BUY' || !Number.isFinite(analysis.score) || analysis.score < BUY_THRESHOLD || analysis.score > 100
    || analysis.technicalAgreement?.passed !== true
    || !Array.isArray(analysis.gates) || !analysis.gates.length || !analysis.gates.every(gate => gate?.passed === true)
    || !Array.isArray(analysis.agents) || analysis.agents.length !== RULE_IDS.length) return false;
  if (!RULE_IDS.every(id => analysis.agents.filter(agent => agent?.id === id).length === 1)) return false;
  return analysis.agents.find(agent => agent.id === 'trend').status === 'bullish'
    && analysis.agents.find(agent => agent.id === 'momentum').status === 'bullish'
    && analysis.agents.find(agent => agent.id === 'risk').status === 'pass';
}

export function rulesAnalysis(baseline, { demo = false } = {}) {
  const source = baseline && typeof baseline === 'object' ? baseline : {};
  const signal = SIGNALS.has(source.signal) ? source.signal : 'UNAVAILABLE';
  const result = {
    ...source,
    signal,
    analysisMethod:'rules',
    reviewStatus:signal === 'UNAVAILABLE' ? 'unavailable' : 'ready',
    aiStatus:'not-used',
    ai:{status:'not-used',calls:0,model:null},
    marketAgents:[],
    research:null,
    agents:Array.isArray(source.agents) ? source.agents : [],
    gates:Array.isArray(source.gates) ? source.gates : [],
    reviewVersion:RULES_VERSION,
    strategyVersion:`${source.strategyVersion || 'market-evidence'}+${RULES_VERSION}`,
    technicalAgreement:source.technicalAgreement ? {
      ...source.technicalAgreement,
      detail:`Weighted rule alignment ${Number.isFinite(source.score) ? source.score : 'unavailable'}/100. Technical agreement requires at least ${BUY_THRESHOLD}/100 with bullish trend and momentum. A final BUY also requires the risk agent and every data/risk check to pass. Alignment is not a success probability.`,
    } : null,
  };
  if (result.gates.length && result.technicalAgreement) {
    result.gates = [...result.gates,{name:'Rule agreement',passed:result.technicalAgreement.passed === true,detail:result.technicalAgreement.detail}];
  }
  const entry = source.strategy === 'daytrade' ? 'an intraday spot-buy setup' : 'a long-term accumulation entry';
  if (signal === 'BUY' && !rulesBuyEligible(result)) {
    result.signal = 'UNAVAILABLE';
    result.reviewStatus = 'unavailable';
    result.score = null;
    result.summary = 'The rule result is incomplete or inconsistent. No buy signal was issued.';
    result.gates = [...result.gates,{name:'Complete rule review',passed:false,detail:`BUY requires all four rule agents, alignment of at least ${BUY_THRESHOLD}, bullish trend and momentum, and every data/risk check passing.`}];
  } else if (signal === 'BUY') {
    result.summary = `The trend and momentum rules are bullish, weighted alignment is ${source.score}/100, and all data/risk checks pass for ${entry}. This is an unvalidated research signal; inspect the evidence before acting.`;
  } else if (signal === 'WATCH') {
    result.summary = `Some measured evidence supports ${entry}, but the full buy criteria are not met. Keep watching the rule evidence.`;
  } else if (signal === 'WAIT') {
    result.summary = result.gates.some(gate => gate?.name !== 'Rule agreement' && gate?.passed !== true)
      ? 'A data or risk check blocks buying. Review the failed checks and wait for conditions to improve.'
      : `The measured rules do not currently qualify ${entry}. Wait for stronger rule alignment.`;
  } else {
    result.score = null;
    result.summary = source.summary || 'A complete, valid market snapshot is required. No signal is available.';
  }
  if (demo) result.summary = `Demo only: synthetic candles illustrate the rule review. ${result.summary} Demo results never trigger alerts.`;
  return result;
}
