#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createAgentQueryBackend } from '../../canisters/frontend/web/src/data/query/agent-query-backend.js';
import { parseProposalIntent } from '../../canisters/frontend/web/src/data/proposal-analysis/proposal-action-parser.js';

const proposalId = process.argv[2] ? BigInt(process.argv[2]) : null;
if (proposalId === null) {
  console.error('usage: node tools/scripts/capture-proposal-fixture.mjs <proposal-id> [supported|unsupported|historical]');
  process.exit(1);
}

const kindArg = process.argv[3] ?? 'supported';
const kind = ['supported', 'unsupported', 'historical'].includes(kindArg) ? kindArg : 'supported';
const backend = await createAgentQueryBackend({ host: 'https://icp-api.io', local: false });
const proposal = await backend.getNnsProposal({ proposalId });
if (!proposal) {
  console.error(`proposal ${proposalId} not found`);
  process.exit(1);
}

const intent = parseProposalIntent(proposal);
const fixture = {
  capturedAt: new Date().toISOString(),
  source: 'NNS Governance via NNX query facade',
  proposalId: proposal.id.toString(),
  topicId: proposal.topicId,
  topicLabel: proposal.topicLabel,
  status: proposal.status,
  statusKind: proposal.statusKind,
  statusLabel: proposal.statusLabel,
  rewardStatus: proposal.rewardStatus,
  rewardStatusKind: proposal.rewardStatusKind,
  rewardStatusLabel: proposal.rewardStatusLabel,
  actionTypeName: proposal.actionTypeName,
  actionDescription: proposal.actionDescription,
  actionDetails: proposal.actionDetails,
  actionValues: proposal.actionValues,
  ...(proposal.selfDescribingAction ? { selfDescribingAction: proposal.selfDescribingAction } : {}),
  payloadSummary: proposal.payloadSearchText,
  parsedIntent: {
    actionKind: intent.actionKind,
    confidence: intent.confidence,
    targetSubnetId: intent.targetSubnetId,
    referencedSubnetIds: intent.referencedSubnetIds,
    addNodeIds: intent.addNodeIds,
    removeNodeIds: intent.removeNodeIds,
    isApiBoundaryAction: intent.isApiBoundaryAction,
    createsNewSubnet: intent.createsNewSubnet,
    parseWarnings: intent.parseWarnings,
  },
};

const dir = path.join(
  'canisters/frontend/web/test/fixtures/proposals/mainnet',
  kind,
);
await mkdir(dir, { recursive: true });
const file = path.join(dir, `${proposalId}.json`);
await writeFile(file, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`wrote ${file}`);
