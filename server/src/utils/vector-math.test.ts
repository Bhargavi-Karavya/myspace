import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  VectorMathError,
  normalizeVector,
  vectorMagnitude,
} from './vector-math.js';

describe('vectorMagnitude', () => {
  it('returns 5 for [3, 4]', () => {
    assert.equal(vectorMagnitude([3, 4]), 5);
  });

  it('returns 5 for [-3, 4]', () => {
    assert.equal(vectorMagnitude([-3, 4]), 5);
  });

  it('throws for an empty vector', () => {
    assert.throws(() => vectorMagnitude([]), VectorMathError);
  });
});

describe('normalizeVector', () => {
  it('normalizes [3, 4] to approximately [0.6, 0.8]', () => {
    const normalized = normalizeVector([3, 4]);
    assert.equal(normalized.length, 2);
    assert.ok(Math.abs(normalized[0]! - 0.6) < 1e-12);
    assert.ok(Math.abs(normalized[1]! - 0.8) < 1e-12);
  });

  it('produces a vector with magnitude approximately 1', () => {
    const normalized = normalizeVector([3, 4]);
    assert.ok(Math.abs(vectorMagnitude(normalized) - 1) < 1e-12);
  });

  it('throws for a zero-magnitude vector', () => {
    assert.throws(
      () => normalizeVector([0, 0, 0]),
      (error: unknown) =>
        error instanceof VectorMathError &&
        /zero-magnitude/i.test(error.message),
    );
  });

  it('throws for an empty vector', () => {
    assert.throws(() => normalizeVector([]), VectorMathError);
  });
});
