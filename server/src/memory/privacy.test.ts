import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MEMORY_CATEGORIES } from './categories.js';
import {
  MEMORY_CONTENT_MAX_LENGTH,
  SECRET_REDACTION_TOKEN,
  containsObviousSecret,
  filterSafeMemoryCandidates,
  redactSecrets,
} from './privacy.js';

describe('privacy — containsObviousSecret', () => {
  it('allows stable preference text', () => {
    assert.equal(
      containsObviousSecret(
        'I prefer TypeScript for backend and frontend projects.',
      ),
      false,
    );
  });

  it('detects password statements', () => {
    assert.equal(
      containsObviousSecret('My password is SuperSecret123.'),
      true,
    );
  });

  it('detects API key statements and sk-style keys', () => {
    assert.equal(
      containsObviousSecret('My API key is sk-test-123456.'),
      true,
    );
    assert.equal(containsObviousSecret('token sk-test-abcdefghi'), true);
  });

  it('detects bearer tokens and authorization headers', () => {
    assert.equal(
      containsObviousSecret('Authorization: Bearer abc.def.ghi'),
      true,
    );
    assert.equal(containsObviousSecret('bearer eyJhbGciOi.abc.def'), true);
  });
});

describe('privacy — redactSecrets', () => {
  it('preserves non-secret text', () => {
    const input = 'I prefer TypeScript for my projects.';
    const result = redactSecrets(input);
    assert.equal(result.redacted, false);
    assert.equal(result.text, input);
  });

  it('redacts secrets while keeping surrounding preference context', () => {
    const result = redactSecrets(
      'I prefer PostgreSQL. My API key is sk-test-123456.',
    );
    assert.equal(result.redacted, true);
    assert.match(result.text, /prefer PostgreSQL/i);
    assert.match(result.text, new RegExp(SECRET_REDACTION_TOKEN));
    assert.equal(containsObviousSecret(result.text), false);
    assert.doesNotMatch(result.text, /sk-test-123456/);
  });

  it('redacts password values', () => {
    const result = redactSecrets('My password is SuperSecret123.');
    assert.equal(result.redacted, true);
    assert.doesNotMatch(result.text, /SuperSecret123/);
  });
});

describe('privacy — filterSafeMemoryCandidates', () => {
  it('accepts a stable preference candidate', () => {
    const { accepted, discardedCount } = filterSafeMemoryCandidates(
      [
        {
          content: 'Prefers TypeScript for backend and frontend projects',
          category: 'preference',
          importance: 0.7,
        },
      ],
      { allowedCategories: MEMORY_CATEGORIES },
    );

    assert.equal(discardedCount, 0);
    assert.equal(accepted.length, 1);
  });

  it('discards candidates that contain passwords', () => {
    const { accepted, discardedCount } = filterSafeMemoryCandidates([
      {
        content: 'User password is SuperSecret123',
        category: 'personal',
        importance: 1,
      },
    ]);

    assert.equal(accepted.length, 0);
    assert.equal(discardedCount, 1);
  });

  it('discards candidates that contain API keys even with high importance', () => {
    const { accepted, discardedCount } = filterSafeMemoryCandidates([
      {
        content: 'API key is sk-test-123456',
        category: 'professional',
        importance: 1,
      },
      {
        content: 'Prefers PostgreSQL',
        category: 'preference',
        importance: 0.8,
      },
    ]);

    assert.equal(discardedCount, 1);
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0]?.content, 'Prefers PostgreSQL');
  });

  it('discards invalid importance values', () => {
    const { accepted, discardedCount } = filterSafeMemoryCandidates([
      {
        content: 'Prefers TypeScript',
        category: 'preference',
        importance: 1.5,
      },
      {
        content: 'Prefers TypeScript',
        category: 'preference',
        importance: -0.1,
      },
    ]);

    assert.equal(accepted.length, 0);
    assert.equal(discardedCount, 2);
  });

  it('discards oversized content', () => {
    const { accepted, discardedCount } = filterSafeMemoryCandidates([
      {
        content: 'x'.repeat(MEMORY_CONTENT_MAX_LENGTH + 1),
        category: 'other',
        importance: 0.5,
      },
    ]);

    assert.equal(accepted.length, 0);
    assert.equal(discardedCount, 1);
  });

  it('discards invalid categories when allow-list is provided', () => {
    const { accepted, discardedCount } = filterSafeMemoryCandidates(
      [
        {
          content: 'Prefers TypeScript',
          category: 'not-a-real-category',
          importance: 0.5,
        },
      ],
      { allowedCategories: MEMORY_CATEGORIES },
    );

    assert.equal(accepted.length, 0);
    assert.equal(discardedCount, 1);
  });
});
