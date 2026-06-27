import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatCompactBigInt,
  formatPercent,
  formatTimeRemaining,
  truncateText,
} from '../src/app/view-formatters.js';

test('formats missing deadline', () => {
  assert.equal(formatTimeRemaining(null), 'Deadline unavailable');
});

test('formats future deadline in days and hours', () => {
  assert.equal(formatTimeRemaining(100_000n, 10_000_000), 'Voting closes in 1d 1h');
});

test('formats future deadline in hours and minutes', () => {
  assert.equal(formatTimeRemaining(20_000n, 10_000_000), 'Voting closes in 2h 46m');
});

test('formats past deadline as finalization pending', () => {
  assert.equal(
    formatTimeRemaining(1n, 10_000_000),
    'Deadline reached; finalization pending',
  );
});

test('formats percent compactly', () => {
  assert.equal(formatPercent(25), '25%');
  assert.equal(formatPercent(12.34), '12.3%');
});

test('formats large bigint values compactly', () => {
  assert.equal(formatCompactBigInt(999n), '999');
  assert.equal(formatCompactBigInt(1_250n), '1.2K');
  assert.equal(formatCompactBigInt(12_345_678n), '12.3M');
});

test('truncates text with ellipsis', () => {
  assert.equal(truncateText('abcdef', 5), 'ab...');
});
