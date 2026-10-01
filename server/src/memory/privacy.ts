/**
 * Phase 3.11 — lightweight deterministic privacy helpers.
 * Defense-in-depth for secrets; not a complete secret scanner.
 */

/** Aligned with chat / memory request max message length. */
export const MEMORY_CONTENT_MAX_LENGTH = 5000;

/** Placeholder used when redacting secret material from user text. */
export const SECRET_REDACTION_TOKEN = '[REDACTED]';

type SecretPattern = {
  /** Safe label for internal metrics only — never includes matched text. */
  label: string;
  pattern: RegExp;
};

/**
 * Obvious credential / secret shapes.
 * Intentionally simple — prefer false negatives over complex scanning.
 */
const SECRET_PATTERNS: SecretPattern[] = [
  {
    label: 'password_assignment',
    pattern:
      /\b(?:my\s+)?passwords?\s*(?:is|are|=|:)\s*["']?[^\s"',;]+["']?/gi,
  },
  {
    label: 'api_key_assignment',
    pattern:
      /\b(?:my\s+)?api[\s_-]?keys?\s*(?:is|are|=|:)\s*["']?[^\s"',;]+["']?/gi,
  },
  {
    label: 'secret_key_assignment',
    pattern:
      /\b(?:my\s+)?secret[\s_-]?keys?\s*(?:is|are|=|:)\s*["']?[^\s"',;]+["']?/gi,
  },
  {
    label: 'access_token_assignment',
    pattern:
      /\b(?:my\s+)?(?:access|auth|refresh)[\s_-]?tokens?\s*(?:is|are|=|:)\s*["']?[^\s"',;]+["']?/gi,
  },
  {
    label: 'private_key_block',
    pattern:
      /-----BEGIN(?:\s+\w+)?\s+PRIVATE KEY-----[\s\S]*?-----END(?:\s+\w+)?\s+PRIVATE KEY-----/gi,
  },
  {
    label: 'authorization_header',
    pattern: /\bauthorization\s*[:=]\s*["']?[^\s"',;]+["']?/gi,
  },
  {
    label: 'bearer_token',
    pattern: /\bbearer\s+[a-z0-9\-._~+/]+=*/gi,
  },
  {
    label: 'sk_style_key',
    pattern: /\bsk-[a-z0-9\-_]{8,}\b/gi,
  },
  {
    label: 'aws_access_key',
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    label: 'jwt_like',
    pattern: /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g,
  },
];

/**
 * True when text contains an obvious credential / secret pattern.
 * Does not return or log the matched secret.
 */
export function containsObviousSecret(text: string): boolean {
  if (!text) return false;
  for (const { pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * Replace obvious secret material with a placeholder so the rest of the
 * message can still be used for memory extraction.
 */
export function redactSecrets(text: string): {
  text: string;
  redacted: boolean;
} {
  let result = text;
  let redacted = false;

  for (const { pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    const next = result.replace(pattern, SECRET_REDACTION_TOKEN);
    if (next !== result) {
      redacted = true;
      result = next;
    }
  }

  return { text: result, redacted };
}

export type MemoryPrivacyCandidate = {
  content: string;
  category: string;
  importance: number;
};

export type MemoryPrivacyFilterResult<T extends MemoryPrivacyCandidate> = {
  accepted: T[];
  discardedCount: number;
};

/**
 * Final safety gate before PostgreSQL writes.
 * Discards candidates with empty/oversized content, invalid importance,
 * or obvious secrets. Never logs candidate content.
 */
export function filterSafeMemoryCandidates<T extends MemoryPrivacyCandidate>(
  candidates: T[],
  options?: {
    allowedCategories?: readonly string[];
  },
): MemoryPrivacyFilterResult<T> {
  const allowed = options?.allowedCategories;
  const accepted: T[] = [];
  let discardedCount = 0;

  for (const candidate of candidates) {
    const content =
      typeof candidate.content === 'string' ? candidate.content.trim() : '';

    if (!content) {
      discardedCount += 1;
      continue;
    }

    if (content.length > MEMORY_CONTENT_MAX_LENGTH) {
      discardedCount += 1;
      continue;
    }

    if (
      typeof candidate.importance !== 'number' ||
      Number.isNaN(candidate.importance) ||
      candidate.importance < 0 ||
      candidate.importance > 1
    ) {
      discardedCount += 1;
      continue;
    }

    if (allowed && !allowed.includes(candidate.category)) {
      discardedCount += 1;
      continue;
    }

    if (containsObviousSecret(content)) {
      discardedCount += 1;
      continue;
    }

    accepted.push({
      ...candidate,
      content,
    });
  }

  return { accepted, discardedCount };
}
