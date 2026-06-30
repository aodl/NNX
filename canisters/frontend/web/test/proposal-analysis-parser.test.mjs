import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProposalIntent } from '../src/data/proposal-analysis/proposal-action-parser.js';

const nodeA = '2vxsx-fae';
const nodeB = 'uuc56-gyb';
const subnet = 'aaaaa-aa';

test('ChangeSubnetMembership extracts add and remove nodes', () => {
  const intent = parseProposalIntent({
    id: 123n,
    actionTypeName: 'ChangeSubnetMembership',
    actionValues: [
      { name: 'target_subnet_id', value: subnet },
      { name: 'node_ids_add', value: nodeA },
      { name: 'node_ids_remove', value: nodeB },
    ],
  });
  assert.equal(intent.actionKind, 'ChangeSubnetMembership');
  assert.deepEqual(intent.addNodeIds, [nodeA]);
  assert.deepEqual(intent.removeNodeIds, [nodeB]);
  assert.equal(intent.targetSubnetId, subnet);
  assert.equal(intent.confidence, 'high');
});

test('CreateSubnet extracts node IDs', () => {
  const intent = parseProposalIntent({
    id: 1n,
    actionTypeName: 'CreateSubnet',
    actionValues: [{ name: 'node_ids', value: `${nodeA}\n${nodeB}` }],
  });
  assert.equal(intent.actionKind, 'CreateSubnet');
  assert.deepEqual(intent.addNodeIds, [nodeA, nodeB]);
  assert.equal(intent.createsNewSubnet, true);
});

test('RemoveNodesFromSubnet extracts nodes', () => {
  const intent = parseProposalIntent({
    actionTypeName: 'RemoveNodesFromSubnet',
    actionValues: [{ name: 'nodes', value: nodeA }],
  });
  assert.equal(intent.actionKind, 'RemoveNodesFromSubnet');
  assert.deepEqual(intent.removeNodeIds, [nodeA]);
});

test('API boundary actions extract nodes', () => {
  assert.deepEqual(parseProposalIntent({
    actionTypeName: 'AddApiBoundaryNodes',
    actionValues: [{ name: 'node_ids', value: nodeA }],
  }).addNodeIds, [nodeA]);
  assert.deepEqual(parseProposalIntent({
    actionTypeName: 'RemoveApiBoundaryNodes',
    actionValues: [{ name: 'node_ids', value: nodeB }],
  }).removeNodeIds, [nodeB]);
});

test('Unsupported action returns Unsupported and does not throw', () => {
  const intent = parseProposalIntent({ actionTypeName: 'BlessReplicaVersion' });
  assert.equal(intent.actionKind, 'Unsupported');
  assert.equal(intent.confidence, 'unsupported');
});

test('Fallback free-text parser has low confidence', () => {
  const intent = parseProposalIntent({
    actionDescription: 'Add nodes',
    payloadSearchText: `dashboard URL containing ${nodeA}`,
  });
  assert.equal(intent.actionKind, 'ChangeSubnetMembership');
  assert.deepEqual(intent.addNodeIds, [nodeA]);
  assert.equal(intent.confidence, 'low');
});

test('future unknown action type is unsupported and non-fatal', () => {
  const intent = parseProposalIntent({
    actionTypeName: 'FutureNnsActionWithNodes',
    actionValues: [{ name: 'node_ids', value: nodeA }],
  });
  assert.equal(intent.actionKind, 'Unsupported');
  assert.equal(intent.confidence, 'unsupported');
  assert.deepEqual(intent.allNodeIds, []);
});

test('malformed action text does not throw', () => {
  const intent = parseProposalIntent({
    actionDescription: 'Add nodes',
    payloadSearchText: 'node ids: not-a-principal javascript:alert(1)',
  });
  assert.equal(intent.actionKind, 'ChangeSubnetMembership');
  assert.equal(intent.confidence, 'low');
  assert.deepEqual(intent.allNodeIds, []);
});

test('missing structured fields falls back to free text', () => {
  const intent = parseProposalIntent({
    actionTypeName: 'RemoveNodesFromSubnet',
    payloadSearchText: `remove ${nodeB}`,
  });
  assert.deepEqual(intent.removeNodeIds, [nodeB]);
  assert.equal(intent.confidence, 'low');
});

test('structured fields win over conflicting free text with medium confidence', () => {
  const intent = parseProposalIntent({
    actionTypeName: 'ChangeSubnetMembership',
    actionValues: [
      { name: 'target_subnet_id', value: subnet },
      { name: 'node_ids_add', value: nodeA },
    ],
    payloadSearchText: `old text mentions ${nodeB}`,
  });
  assert.deepEqual(intent.addNodeIds, [nodeA]);
  assert.deepEqual(intent.removeNodeIds, []);
  assert.equal(intent.confidence, 'medium');
  assert.match(intent.parseWarnings.join('\n'), /Structured action fields differed/);
});

test('node-principal versus subnet-principal structured ambiguity keeps subnet out of nodes', () => {
  const intent = parseProposalIntent({
    actionTypeName: 'ChangeSubnetMembership',
    actionValues: [
      { name: 'target_subnet_id', value: subnet },
      { name: 'node_ids_add', value: `${nodeA}\n${subnet}` },
    ],
  });
  assert.deepEqual(intent.addNodeIds, [nodeA]);
  assert.equal(intent.targetSubnetId, subnet);
});
