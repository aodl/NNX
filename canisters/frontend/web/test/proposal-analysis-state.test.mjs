import assert from 'node:assert/strict';
import test from 'node:test';
import { simulateProposalStateChange } from '../src/data/proposal-analysis/proposal-state-simulator.js';

test('pre-execution add applies to after state', () => {
  assert.deepEqual(simulateProposalStateChange({
    lifecycle: 'pre_execution',
    currentNodeIds: ['a'],
    addNodeIds: ['b'],
  }).afterNodeIds, ['a', 'b']);
});

test('pre-execution remove applies to after state', () => {
  assert.deepEqual(simulateProposalStateChange({
    lifecycle: 'pre_execution',
    currentNodeIds: ['a', 'b'],
    removeNodeIds: ['a'],
  }).afterNodeIds, ['b']);
});

test('post-execution add infers before state', () => {
  const state = simulateProposalStateChange({
    lifecycle: 'post_execution_success',
    currentNodeIds: ['a', 'b'],
    addNodeIds: ['b'],
  });
  assert.deepEqual(state.beforeNodeIds, ['a']);
  assert.deepEqual(state.afterNodeIds, ['a', 'b']);
});

test('post-execution remove infers before state', () => {
  const state = simulateProposalStateChange({
    lifecycle: 'post_execution_success',
    currentNodeIds: ['b'],
    removeNodeIds: ['a'],
  });
  assert.deepEqual(state.beforeNodeIds, ['b', 'a']);
  assert.deepEqual(state.afterNodeIds, ['b']);
});

test('failed and rejected proposals do not apply effects', () => {
  for (const lifecycle of ['post_execution_failed', 'rejected']) {
    assert.deepEqual(simulateProposalStateChange({
      lifecycle,
      currentNodeIds: ['a'],
      addNodeIds: ['b'],
      removeNodeIds: ['a'],
    }).afterNodeIds, ['a']);
  }
});

test('create subnet pending and executed states are lifecycle-aware', () => {
  assert.deepEqual(simulateProposalStateChange({
    lifecycle: 'pre_execution',
    createsNewSubnet: true,
    addNodeIds: ['a', 'b'],
  }).afterNodeIds, ['a', 'b']);
  assert.deepEqual(simulateProposalStateChange({
    lifecycle: 'post_execution_success',
    createsNewSubnet: true,
    currentNodeIds: ['a'],
    addNodeIds: ['a'],
  }).afterNodeIds, ['a']);
});
