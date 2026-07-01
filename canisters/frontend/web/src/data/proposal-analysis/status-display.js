import { proposalLifecycle } from './proposal-analysis-types.js';

const TERMINAL_DECISIONS = new Set(['executed', 'failed', 'rejected']);

export function proposalStatusDisplay(proposal = {}) {
  const decisionStatusKind = proposal.statusKind ?? 'unknown';
  const decisionStatusLabel = proposal.statusLabel ?? 'Unknown';
  const rewardStatusKind = proposal.rewardStatusKind ?? 'unknown';
  const rewardStatusLabel = proposal.rewardStatusLabel ?? 'Unknown';
  const lifecycle = proposal.analysis?.lifecycle ?? proposalLifecycle(proposal);
  const canStillVoteForRewards = rewardStatusKind === 'accepting-votes';
  const hasDecision = TERMINAL_DECISIONS.has(decisionStatusKind) || decisionStatusKind === 'adopted';
  const hasExecuted = decisionStatusKind === 'executed';

  return Object.freeze({
    decisionStatusKind,
    decisionStatusLabel,
    rewardStatusKind,
    rewardStatusLabel,
    lifecycle,
    canStillVoteForRewards,
    hasDecision,
    hasExecuted,
    decisionMadeStillAcceptingRewardVotes: TERMINAL_DECISIONS.has(decisionStatusKind)
      && canStillVoteForRewards,
  });
}

