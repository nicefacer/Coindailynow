/**
 * Editorial policy flags — set via environment on the AI pipeline host.
 */
export const editorialPolicy = {
  /**
   * Block queueing until self-hosted editorial review passes (Ollama / DeepSeek R1).
   * Default: on in production unless explicitly disabled.
   */
  requireEditorialReview:
    process.env.REQUIRE_EDITORIAL_REVIEW !== 'false' &&
    (process.env.NODE_ENV === 'production' || process.env.REQUIRE_EDITORIAL_REVIEW === 'true'),

  /** Minimum quality score (0–100) from self-hosted reviewer. */
  editorialMinScore: parseInt(process.env.EDITORIAL_MIN_SCORE || '70', 10),

  /**
   * Optional Google Gemini pass — off by default (self-hosted only).
   * Set REQUIRE_GEMINI_EDITORIAL_REVIEW=true only if you add GEMINI_API_KEY.
   */
  requireGeminiReview: process.env.REQUIRE_GEMINI_EDITORIAL_REVIEW === 'true',

  /** @deprecated alias */
  geminiMinScore: parseInt(
    process.env.GEMINI_EDITORIAL_MIN_SCORE || process.env.EDITORIAL_MIN_SCORE || '70',
    10,
  ),

  /** Launch languages for QA sampling export. */
  launchQaLanguages: ['en', 'ha', 'yo', 'sw', 'zu'] as const,

  /**
   * P3.9 — block the pipeline when fact-check fails or is unavailable.
   * Default on. Set REQUIRE_FACT_CHECK=false in dev to soft-pass while
   * iterating on the fact-check agent.
   */
  requireFactCheck: process.env.REQUIRE_FACT_CHECK !== 'false',

  /**
   * P3.9 — if requireFactCheck is true AND Ollama is unreachable, treat as
   * soft-pass (warn but proceed) rather than hard-block. Default false.
   */
  factCheckSoftFailOnOutage: process.env.FACT_CHECK_SOFT_FAIL_ON_OUTAGE === 'true',
};
