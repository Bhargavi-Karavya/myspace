import type { MemoryCategory } from './categories.js';

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'if',
  'then',
  'than',
  'so',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'of',
  'on',
  'to',
  'with',
  'about',
  'is',
  'am',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'can',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'he',
  'she',
  'it',
  'they',
  'them',
  'their',
  'this',
  'that',
  'these',
  'those',
  'not',
  'no',
  'nor',
  'only',
  'just',
  'also',
  'very',
  'too',
  'now',
  'user',
]);

/** Minimum meaningful token length after normalization. */
const MIN_TOKEN_LENGTH = 3;

/**
 * Require enough shared tokens that the smaller set is mostly covered.
 * Intentionally conservative — Phase 3.7 is deterministic pre-embedding matching.
 */
const MIN_SHARED_TOKENS = 2;
const MIN_OVERLAP_RATIO = 0.5;

export type MatchableMemory = {
  id: string;
  content: string;
  category: MemoryCategory;
  importance: number;
};

export type MemoryMatchResult = {
  memory: MatchableMemory;
  /** True when normalized content is effectively identical (skip write). */
  identical: boolean;
  score: number;
};

/**
 * Lowercase, strip punctuation, collapse whitespace.
 */
export function normalizeMemoryText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Light stemming so interview/interviews and prepare/preparing overlap.
 */
function stemToken(token: string): string {
  if (token.length <= 3) return token;

  if (token.endsWith('ies') && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith('ing') && token.length > 5) {
    return token.slice(0, -3);
  }
  // preparation → prepar (aligns with preparing → prepar)
  if (token.endsWith('ation') && token.length > 6) {
    return token.slice(0, -5);
  }
  if (token.endsWith('tion') && token.length > 6) {
    return token.slice(0, -4);
  }
  if (token.endsWith('ed') && token.length > 4) {
    return token.slice(0, -2);
  }
  if (token.endsWith('es') && token.length > 4) {
    return token.slice(0, -2);
  }
  if (token.endsWith('s') && token.length > 3 && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }

  return token;
}

/**
 * Meaningful keyword tokens for overlap matching.
 */
export function memoryTokens(text: string): Set<string> {
  const tokens = normalizeMemoryText(text)
    .split(' ')
    .filter((token) => token.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(token))
    .map(stemToken);

  return new Set(tokens);
}

function sharedTokenCount(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) {
      shared += 1;
    }
  }
  return shared;
}

/**
 * Overlap ratio relative to the smaller token set (how much of the shorter
 * memory is covered by the longer one).
 */
export function tokenOverlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const shared = sharedTokenCount(a, b);
  return shared / Math.min(a.size, b.size);
}

function isStrongMatch(candidateTokens: Set<string>, existingTokens: Set<string>): boolean {
  if (candidateTokens.size === 0 || existingTokens.size === 0) {
    return false;
  }

  const shared = sharedTokenCount(candidateTokens, existingTokens);
  const ratio = tokenOverlapRatio(candidateTokens, existingTokens);

  // Single-token memories (e.g. "TypeScript") need an exact token hit.
  if (Math.min(candidateTokens.size, existingTokens.size) === 1) {
    return shared === 1 && ratio === 1;
  }

  return shared >= MIN_SHARED_TOKENS && ratio >= MIN_OVERLAP_RATIO;
}

/**
 * Find the strongest same-category text match among existing memories.
 * Callers should only pass memories already filtered to the candidate category.
 */
export function findBestMemoryMatch(
  candidateContent: string,
  existing: MatchableMemory[],
): MemoryMatchResult | null {
  const normalizedCandidate = normalizeMemoryText(candidateContent);
  if (!normalizedCandidate) return null;

  const candidateTokens = memoryTokens(candidateContent);
  let best: MemoryMatchResult | null = null;

  for (const memory of existing) {
    const normalizedExisting = normalizeMemoryText(memory.content);

    if (normalizedExisting === normalizedCandidate) {
      return { memory, identical: true, score: 1 };
    }

    const existingTokens = memoryTokens(memory.content);
    if (!isStrongMatch(candidateTokens, existingTokens)) {
      continue;
    }

    const score = tokenOverlapRatio(candidateTokens, existingTokens);
    if (!best || score > best.score) {
      best = { memory, identical: false, score };
    }
  }

  return best;
}
