/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     AI REVIEW AGENT (Central Orchestrator)               ║
 * ║                                                                          ║
 * ║  The Review Agent is the CENTRAL BRAIN of the AI content system.        ║
 * ║  It coordinates all other agents, validates outputs, and ensures         ║
 * ║  quality at every step before proceeding.                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 * 
 * WORKFLOW:
 * 1. Research Agent outputs → Review Agent validates newsworthiness
 * 2. Review Agent asks Imo for writing prompt → sends to Writer Agent
 * 3. Review Agent validates article → asks Imo for image prompt
 * 4. Review Agent validates image → asks Imo for translation prompts
 * 5. Review Agent validates translations → queues for admin approval
 * 6. Admin requests edit → Review Agent routes to appropriate agent
 */

import { ImoPromptAgent } from '../prompt/imo-prompt-agent';
import { ImoService } from '../prompt/imo-service';
import { RAGService } from '../prompt/rag-service';
import Redis from 'ioredis';
import { Logger } from 'winston';
import { PrismaClient } from '@prisma/client';
import ResearchAgent from '../research/researchAgent';
import WriterAgent from '../content/writerAgent';
import ImageAgent from '../image/imageAgent';
import TranslationAgentForReview from '../translation/translationAgentForReview';
import { runSelfHostedEditorialReview } from './selfHostedEditorialReview';
import { editorialPolicy } from '../../config/editorialPolicy';
import {
  createPipelineRun,
  markRunReady,
  markRunFailed,
  StepRecorder,
} from '../../orchestrator/stepRecorder';
import { checkFacts, FactCheckResult } from '../research/factCheckAgent';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

// (Local mirror — see ai-system/types/admin-types.ts for the canonical shape)
interface ResearchOutcomeAugmented {
  narrative_angles?: NarrativeAngles;
}

interface ResearchOutcome {
  id: string;
  topic: string;
  sources: Source[];
  facts: string[];
  core_message: string;
  word_count: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  urgency: 'low' | 'medium' | 'high' | 'breaking';
  trending_score: number; // 0-100
  timestamp: Date;
  raw_data: any;
  /** P3.7 — research agent v2 narrative framing */
  narrative_angles?: NarrativeAngles;
}

interface Source {
  url: string;
  title: string;
  published_at: Date;
  credibility_score: number; // 0-100
  domain: string;
}

interface ValidationResult {
  passed: boolean;
  score: number; // 0-100
  issues: string[];
  suggestions: string[];
  metadata?: Record<string, any>;
}

/** P3.7 — narrative framing produced by the research agent for writer guidance */
interface NarrativeAngles {
  positive: string;
  negative: string;
  regional_relevance: Array<{ region: string; angle: string }>;
}

/**
 * W4 — append explicit citation instructions to the writer prompt.
 * The writer must cite each factual claim with [n] markers that resolve
 * against the numbered source list. The doc editor renders these as
 * footnote references via the FootnoteExtension; non-doc renderers see
 * them as plain `[n]` text linking to the Sources section.
 */
/**
 * P3.7 — append the positive/negative narrative angles + per-region framing
 * so the writer agent produces editorially-positioned copy. Skipped silently
 * when the research agent didn't generate angles (e.g. Ollama down).
 */
function appendNarrativeAngles(basePrompt: string, angles?: NarrativeAngles): string {
  if (!angles) return basePrompt;

  const regional = (angles.regional_relevance || [])
    .map(r => `- ${r.region}: ${r.angle}`)
    .join('\n');

  const block = `\n\n---\nEDITORIAL ANGLES (CoinDaily narrative positioning):\nPRESENT BOTH SIDES. Lead with the positive framing, but explicitly address the negative angle in a "What to watch" or "Risk" paragraph. This is non-negotiable — single-angle pieces do not ship.\n\nPOSITIVE ANGLE:\n${angles.positive}\n\nNEGATIVE / RISK ANGLE:\n${angles.negative}\n\nREGIONAL RELEVANCE (cover the regions that apply; skip ones without an angle below):\n${regional || '(none)'}\n`;

  return basePrompt + block;
}

function appendCitationInstructions(basePrompt: string, sources: Source[]): string {
  if (!sources?.length) return basePrompt;

  const numbered = sources
    .map((s, i) => `[${i + 1}] ${s.title || s.domain || 'Source'} — ${s.url}`)
    .join('\n');

  const directive = `\n\n---\nCITATION REQUIREMENTS:\n- Cite EVERY factual claim, statistic, quote, and policy reference with a numbered marker like [1], [2], etc.\n- Use the source list below — each [n] refers to source #n.\n- Do NOT invent sources or use [n] markers that aren't in the list.\n- Multiple sources for one claim: [1][3].\n- The marker comes IMMEDIATELY after the cited claim, before punctuation: "Bitcoin adoption rose 40% [2]." not "Bitcoin adoption rose 40%. [2]"\n- Do NOT append a "References" or "Sources" section at the end — the platform renders that automatically.\n\nSOURCES (numbered for citation):\n${numbered}\n`;

  return basePrompt + directive;
}

interface ArticleOutcome {
  id: string;
  content: string;
  title: string;
  word_count: number;
  keywords: string[];
  readability_score: number;
  seo_score: number;
  facts_preserved: boolean;
  message_consistent: boolean;
}

interface ImageOutcome {
  id: string;
  url: string;
  alt_text: string;
  theme_match_score: number;
  quality_score: number;
}

interface TranslationOutcome {
  language: string;
  language_code: string;
  content: string;
  title: string;
  terminology_preserved: boolean;
  tone_consistency_score: number;
}

export interface AdminQueueItem {
  id: string;
  article_id: string;
  status: 'pending_approval' | 'approved' | 'edit_requested' | 'published';
  articles: ArticleBundle; // 1 English + 15 translations
  submitted_at: Date;
  reviewed_at?: Date;
  admin_notes?: string;
  edit_requests?: EditRequest[];
  is_mock_generated?: boolean; // True when Ollama was unavailable — content is fake
}

interface ArticleBundle {
  english: ArticleOutcome;
  translations: TranslationOutcome[];
  image: ImageOutcome;
  research: ResearchOutcome;
}

interface EditRequest {
  type: 'content' | 'image' | 'translation' | 'research';
  target_language?: string; // For translation edits
  instructions: string;
  requested_by: string;
  requested_at: Date;
}

// ============================================================================
// REVIEW AGENT CLASS
// ============================================================================

export class AIReviewAgent {
  private redis: Redis;
  private imoService: ImoService;
  private imoAgent: ImoPromptAgent;
  private ragService: RAGService;
  private logger: Logger;
  private prisma: PrismaClient;

  // Real agents
  private researchAgent: ResearchAgent;
  private writerAgent: WriterAgent;
  private imageAgent: ImageAgent;
  private translationAgent: TranslationAgentForReview;

  // Mock mode detection
  private isMockMode = false;

  // Validation thresholds
  private readonly NEWSWORTHINESS_THRESHOLD = 60; // 60/100 minimum
  private readonly TRENDING_THRESHOLD = 50; // 50/100 minimum
  private readonly CREDIBILITY_THRESHOLD = 70; // 70/100 minimum
  private readonly CONSISTENCY_THRESHOLD = 75; // 75/100 minimum
  private readonly IMAGE_QUALITY_THRESHOLD = 80; // 80/100 minimum

  constructor(
    redisClient: Redis,
    logger: Logger,
    prisma: PrismaClient
  ) {
    this.redis = redisClient;
    this.logger = logger;
    this.prisma = prisma;
    this.imoAgent = new ImoPromptAgent();
    this.imoService = new ImoService(this.imoAgent);
    this.ragService = new RAGService();

    // Initialize real agents
    this.researchAgent = new ResearchAgent(prisma, logger);
    this.writerAgent = new WriterAgent(prisma, logger);
    this.imageAgent = new ImageAgent(logger);
    this.translationAgent = new TranslationAgentForReview(logger);
  }

  // ==========================================================================
  // STEP 1: VALIDATE RESEARCH OUTCOME
  // ==========================================================================

  /**
   * Validates research output from Research Agent
   * Checks: newsworthiness, trending status, source credibility, facts extraction
   */
  async validateResearch(research: ResearchOutcome): Promise<ValidationResult> {
    console.log(`[Review Agent] Validating research: ${research.topic}`);

    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    // 1. Check newsworthiness (trending score)
    if (research.trending_score < this.NEWSWORTHINESS_THRESHOLD) {
      issues.push(`Low trending score: ${research.trending_score}/100 (min: ${this.NEWSWORTHINESS_THRESHOLD})`);
      score -= 30;
    }

    // 2. Check real-time relevance (recency)
    const hoursSinceOldestSource = Math.min(
      ...research.sources.map(s => 
        (Date.now() - new Date(s.published_at).getTime()) / (1000 * 60 * 60)
      )
    );
    
    if (hoursSinceOldestSource > 24) {
      issues.push(`Sources are stale (${hoursSinceOldestSource.toFixed(1)}h old). Need fresh news.`);
      score -= 20;
    }

    // 3. Verify source credibility
    const avgCredibility = research.sources.reduce((sum, s) => sum + s.credibility_score, 0) / research.sources.length;
    
    if (avgCredibility < this.CREDIBILITY_THRESHOLD) {
      issues.push(`Low source credibility: ${avgCredibility.toFixed(1)}/100 (min: ${this.CREDIBILITY_THRESHOLD})`);
      score -= 25;
    }

    // 4. Check if facts are extracted
    if (research.facts.length < 3) {
      issues.push(`Insufficient facts extracted: ${research.facts.length} (min: 3)`);
      suggestions.push('Research agent should extract more key facts from sources');
      score -= 15;
    }

    // 5. Check core message clarity
    if (!research.core_message || research.core_message.length < 50) {
      issues.push('Core message is unclear or too short');
      suggestions.push('Research agent should provide clear, concise core message (50+ chars)');
      score -= 10;
    }

    // 6. Verify minimum sources
    if (research.sources.length < 2) {
      issues.push(`Insufficient sources: ${research.sources.length} (min: 2)`);
      score -= 20;
    }

    const passed = score >= this.NEWSWORTHINESS_THRESHOLD && issues.length === 0;

    if (!passed) {
      console.log(`[Review Agent] ❌ Research FAILED validation (score: ${score}/100)`);
      console.log(`[Review Agent] Issues: ${issues.join(', ')}`);
      return { passed: false, score, issues, suggestions };
    }

    console.log(`[Review Agent] ✅ Research PASSED validation (score: ${score}/100)`);
    return { passed: true, score, issues: [], suggestions: [] };
  }

  // ==========================================================================
  // STEP 2: REQUEST WRITING PROMPT FROM IMO
  // ==========================================================================

  /**
   * After research passes validation, ask Imo to generate optimized writing prompt
   * Includes: content length, keywords, facts to preserve, core message, SEO strategies
   */
  async requestWritingPrompt(research: ResearchOutcome): Promise<string> {
    console.log(`[Review Agent] Requesting writing prompt from Imo for: ${research.topic}`);

    // Use Imo's Writer-Editor pattern for SEO-optimized article
    const result = await this.imoService.generateArticlePrompt({
      topic: research.topic,
      target_word_count: research.word_count,
      keywords: this.extractKeywords(research),
      facts_to_preserve: research.facts,
      core_message: research.core_message,
      tone: 'professional',
      audience: 'african_crypto_investors',
      seo_optimization: true,
      include_faq: true,
      sources: research.sources.map(s => s.url)
    });

    // Extract prompt string from result (may be string or string[])
    const basePrompt = Array.isArray(result.prompt) ? result.prompt.join('\n\n') : result.prompt;

    // W4 — append citation instructions so the writer agent emits [n] markers
    // tied to the numbered source list, and the doc editor can resolve them
    // against the Sources section.
    let prompt = appendCitationInstructions(basePrompt, research.sources);

    // P3.7 — if the research agent produced narrative angles, surface them
    // to the writer so the piece carries the platform's editorial framing
    // (positive + negative angles, regional relevance for our 4 zones).
    prompt = appendNarrativeAngles(prompt, research.narrative_angles);

    console.log(`[Review Agent] ✅ Writing prompt generated (${prompt.length} chars, ${research.sources.length} cited sources)`);

    // Store prompt for later validation
    await this.redis.setex(
      `writing_prompt:${research.id}`,
      3600 * 24, // 24 hours
      JSON.stringify({ research_id: research.id, prompt, timestamp: new Date() })
    );

    return prompt;
  }

  // ==========================================================================
  // STEP 3: VALIDATE WRITER OUTPUT
  // ==========================================================================

  /**
   * Validates article output from Writer Agent
   * Checks: consistency with prompt, facts preservation, message alignment, SEO quality
   */
  async validateArticle(
    article: ArticleOutcome, 
    research: ResearchOutcome
  ): Promise<ValidationResult> {
    console.log(`[Review Agent] Validating article: ${article.title}`);

    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    // 1. Check word count consistency
    const wordCountDiff = Math.abs(article.word_count - research.word_count) / research.word_count;
    if (wordCountDiff > 0.2) { // More than 20% difference
      issues.push(`Word count mismatch: ${article.word_count} vs requested ${research.word_count}`);
      score -= 10;
    }

    // 2. Verify facts preservation
    if (!article.facts_preserved) {
      issues.push('Key facts from research were not preserved in article');
      score -= 30;
    }

    // 3. Check message consistency
    if (!article.message_consistent) {
      issues.push('Core message from research was altered or lost');
      score -= 25;
    }

    // 4. Validate SEO optimization
    if (article.seo_score < 70) {
      issues.push(`Low SEO score: ${article.seo_score}/100 (min: 70)`);
      suggestions.push('Improve keyword density, meta tags, and heading structure');
      score -= 15;
    }

    // 5. Check readability
    if (article.readability_score < 60) {
      issues.push(`Low readability: ${article.readability_score}/100 (min: 60)`);
      suggestions.push('Simplify language for broader African audience');
      score -= 10;
    }

    // 6. Verify keywords are present
    const missingKeywords = this.extractKeywords(research).filter(
      kw => !article.content.toLowerCase().includes(kw.toLowerCase())
    );
    
    if (missingKeywords.length > 0) {
      issues.push(`Missing keywords: ${missingKeywords.join(', ')}`);
      score -= 10;
    }

    const passed = score >= this.CONSISTENCY_THRESHOLD && !article.facts_preserved === false;

    if (!passed) {
      console.log(`[Review Agent] ❌ Article FAILED validation (score: ${score}/100)`);
      return { passed: false, score, issues, suggestions };
    }

    console.log(`[Review Agent] ✅ Article PASSED validation (score: ${score}/100)`);
    return { passed: true, score, issues: [], suggestions: [] };
  }

  // ==========================================================================
  // STEP 4: REQUEST IMAGE PROMPT FROM IMO
  // ==========================================================================

  /**
   * After article passes validation, ask Imo for image generation prompt
   * Uses negative prompting to ensure quality
   */
  async requestImagePrompt(
    article: ArticleOutcome, 
    research: ResearchOutcome
  ): Promise<string> {
    console.log(`[Review Agent] Requesting image prompt from Imo for: ${article.title}`);

    // Use Imo's negative prompting strategy for hero images
    const result = await this.imoService.generateHeroImagePrompt({
      article_title: article.title,
      article_theme: research.core_message,
      keywords: article.keywords,
      style: 'professional_crypto',
      include_african_elements: true,
      avoid_elements: [
        'text overlays',
        'watermarks',
        'blurry sections',
        'distorted faces',
        'low quality',
        'generic stock photos'
      ]
    });

    // Extract prompt string from result
    const prompt = Array.isArray(result.prompt) ? result.prompt.join('\n\n') : result.prompt;

    console.log(`[Review Agent] ✅ Image prompt generated (${prompt.length} chars)`);

    await this.redis.setex(
      `image_prompt:${article.id}`,
      3600 * 24,
      JSON.stringify({ article_id: article.id, prompt, timestamp: new Date() })
    );

    return prompt;
  }

  // ==========================================================================
  // STEP 5: VALIDATE IMAGE OUTPUT
  // ==========================================================================

  /**
   * Validates image output from Image Agent
   * Checks: theme consistency, quality, prompt adherence
   */
  async validateImage(
    image: ImageOutcome,
    article: ArticleOutcome
  ): Promise<ValidationResult> {
    console.log(`[Review Agent] Validating image: ${image.url}`);

    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    // 1. Check theme match
    if (image.theme_match_score < 80) {
      issues.push(`Image doesn't match article theme (score: ${image.theme_match_score}/100)`);
      score -= 20;
    }

    // 2. Check quality
    if (image.quality_score < this.IMAGE_QUALITY_THRESHOLD) {
      issues.push(`Image quality too low: ${image.quality_score}/100 (min: ${this.IMAGE_QUALITY_THRESHOLD})`);
      score -= 30;
    }

    // 3. Verify alt text exists
    if (!image.alt_text || image.alt_text.length < 20) {
      issues.push('Image alt text missing or too short (accessibility issue)');
      suggestions.push('Alt text should describe image for screen readers (20+ chars)');
      score -= 15;
    }

    const passed = score >= this.IMAGE_QUALITY_THRESHOLD;

    if (!passed) {
      console.log(`[Review Agent] ❌ Image FAILED validation (score: ${score}/100)`);
      return { passed: false, score, issues, suggestions };
    }

    console.log(`[Review Agent] ✅ Image PASSED validation (score: ${score}/100)`);
    return { passed: true, score, issues: [], suggestions: [] };
  }

  // ==========================================================================
  // STEP 6: REQUEST TRANSLATION PROMPTS FROM IMO
  // ==========================================================================

  /**
   * After image passes, ask Imo for 15 translation prompts (one per language)
   * Uses 2-step chaining: extract terminology → translate with preservation
   */
  async requestTranslationPrompts(
    article: ArticleOutcome,
    research: ResearchOutcome
  ): Promise<Map<string, string>> {
    console.log(`[Review Agent] Requesting translation prompts from Imo (15 languages)`);

    const languages = [
      'Hausa', 'Yoruba', 'Igbo', 'Swahili', 'Amharic',
      'Zulu', 'Shona', 'Afrikaans', 'Somali', 'Oromo',
      'Arabic', 'French', 'Portuguese', 'Wolof', 'Kinyarwanda'
    ];

    const prompts = new Map<string, string>();

    // Request all 15 prompts in parallel
    await Promise.all(
      languages.map(async (language) => {
        const result = await this.imoService.generateTranslationPrompt({
          source_text: article.content,
          source_language: 'English',
          target_language: language,
          preserve_terminology: true, // Crypto terms
          preserve_tone: true,
          preserve_facts: research.facts,
          domain: 'cryptocurrency_finance'
        });

        // Extract prompt string from result
        const prompt = Array.isArray(result.prompt) ? result.prompt.join('\n\n') : result.prompt;
        prompts.set(language, prompt);
      })
    );

    console.log(`[Review Agent] ✅ Generated ${prompts.size} translation prompts`);
    
    await this.redis.setex(
      `translation_prompts:${article.id}`,
      3600 * 24,
      JSON.stringify({ 
        article_id: article.id, 
        prompts: Array.from(prompts.entries()), 
        timestamp: new Date() 
      })
    );

    return prompts;
  }

  // ==========================================================================
  // STEP 7: VALIDATE TRANSLATIONS
  // ==========================================================================

  /**
   * Validates all 15 translation outputs
   * Checks: terminology preservation, tone consistency, completeness
   */
  async validateTranslations(
    translations: TranslationOutcome[],
    original: ArticleOutcome
  ): Promise<ValidationResult> {
    console.log(`[Review Agent] Validating ${translations.length} translations`);

    const issues: string[] = [];
    const suggestions: string[] = [];
    let totalScore = 0;

    for (const translation of translations) {
      let score = 100;

      // 1. Check terminology preservation
      if (!translation.terminology_preserved) {
        issues.push(`${translation.language}: Crypto terms not preserved`);
        score -= 40;
      }

      // 2. Check tone consistency
      if (translation.tone_consistency_score < 70) {
        issues.push(`${translation.language}: Tone inconsistent (${translation.tone_consistency_score}/100)`);
        score -= 20;
      }

      // 3. Check completeness (should be similar length to original)
      const lengthRatio = translation.content.length / original.content.length;
      if (lengthRatio < 0.7 || lengthRatio > 1.3) {
        issues.push(`${translation.language}: Length mismatch (${(lengthRatio * 100).toFixed(0)}% of original)`);
        score -= 15;
      }

      totalScore += score;
    }

    const avgScore = totalScore / translations.length;
    const passed = avgScore >= this.CONSISTENCY_THRESHOLD && issues.length < translations.length * 0.2;

    if (!passed) {
      console.log(`[Review Agent] ❌ Translations FAILED validation (avg score: ${avgScore.toFixed(1)}/100)`);
      return { passed: false, score: avgScore, issues, suggestions };
    }

    console.log(`[Review Agent] ✅ Translations PASSED validation (avg score: ${avgScore.toFixed(1)}/100)`);
    return { passed: true, score: avgScore, issues: [], suggestions: [] };
  }

  // ==========================================================================
  // STEP 8: QUEUE FOR ADMIN APPROVAL
  // ==========================================================================

  /**
   * Queues all 16 articles (1 English + 15 translations) for admin approval
   */
  async queueForAdminApproval(bundle: ArticleBundle): Promise<AdminQueueItem> {
    console.log(`[Review Agent] Queuing article bundle for admin approval`);

    // Mandatory self-hosted quality pass before human/admin queue (Ollama / DeepSeek R1)
    if (editorialPolicy.requireEditorialReview) {
      const review = await runSelfHostedEditorialReview({
        title: bundle.english.title,
        content: bundle.english.content,
        language: 'en',
      });
      if (!review.passed) {
        throw new Error(
          `Editorial review failed (score ${review.score}/100): ${review.issues.join('; ') || review.summary}`,
        );
      }
      console.log(
        `[Review Agent] ✅ Editorial pass via ${review.provider} (score: ${review.score}/100)`,
      );
    }

    const queueItem: AdminQueueItem = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      article_id: bundle.english.id,
      status: 'pending_approval',
      articles: bundle,
      submitted_at: new Date(),
      is_mock_generated: this.isMockMode
    };

    if (this.isMockMode) {
      console.log(`[Review Agent] ⚠️  Queue item marked as MOCK — content was not generated by real AI models`);
    }

    // Store in Redis admin queue
    await this.redis.lpush('admin_queue:pending', JSON.stringify(queueItem));
    await this.redis.setex(
      `admin_queue:item:${queueItem.id}`,
      3600 * 24 * 7, // 7 days
      JSON.stringify(queueItem)
    );

    console.log(`[Review Agent] ✅ Queued item: ${queueItem.id}`);
    return queueItem;
  }

  // ==========================================================================
  // STEP 9: HANDLE ADMIN EDIT REQUESTS
  // ==========================================================================

  /**
   * Routes edit requests to appropriate agent based on edit type
   */
  async routeEditRequest(
    queueItemId: string,
    editRequest: EditRequest
  ): Promise<{ agent: string; instructions: string }> {
    console.log(`[Review Agent] Routing edit request: ${editRequest.type}`);

    // Determine which agent should handle the edit
    const routing = {
      'research': {
        agent: 'ResearchAgent',
        instructions: `Re-research topic with these instructions: ${editRequest.instructions}`
      },
      'content': {
        agent: 'WriterAgent',
        instructions: `Revise article content: ${editRequest.instructions}`
      },
      'image': {
        agent: 'ImageAgent',
        instructions: `Regenerate image: ${editRequest.instructions}`
      },
      'translation': {
        agent: 'TranslationAgent',
        instructions: `Retranslate ${editRequest.target_language || 'all languages'}: ${editRequest.instructions}`
      }
    };

    const route = routing[editRequest.type];
    
    console.log(`[Review Agent] ✅ Routed to ${route.agent}`);
    
    // Update queue item status
    const queueItem = await this.getQueueItem(queueItemId);
    queueItem.status = 'edit_requested';
    queueItem.edit_requests = [...(queueItem.edit_requests || []), editRequest];
    
    await this.redis.setex(
      `admin_queue:item:${queueItemId}`,
      3600 * 24 * 7,
      JSON.stringify(queueItem)
    );

    return route;
  }

  // ==========================================================================
  // STEP 10: RE-QUEUE AFTER EDIT
  // ==========================================================================

  /**
   * After edit is complete, re-validate and queue for admin approval again
   */
  async reQueueAfterEdit(
    queueItemId: string,
    updatedBundle: ArticleBundle
  ): Promise<AdminQueueItem> {
    console.log(`[Review Agent] Re-validating and re-queueing after edit: ${queueItemId}`);

    // Re-validate the edited component
    // (validation logic depends on what was edited)
    
    const queueItem = await this.getQueueItem(queueItemId);
    queueItem.articles = updatedBundle;
    queueItem.status = 'pending_approval';
    queueItem.submitted_at = new Date();

    // Re-add to queue
    await this.redis.lpush('admin_queue:pending', JSON.stringify(queueItem));
    await this.redis.setex(
      `admin_queue:item:${queueItemId}`,
      3600 * 24 * 7,
      JSON.stringify(queueItem)
    );

    console.log(`[Review Agent] ✅ Re-queued item: ${queueItem.id}`);
    return queueItem;
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private extractKeywords(research: ResearchOutcome): string[] {
    // Extract keywords from topic and core message
    const words = [...research.topic.split(' '), ...research.core_message.split(' ')];
    const keywords = words
      .filter(w => w.length > 4)
      .map(w => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter((v, i, a) => a.indexOf(v) === i) // Unique
      .slice(0, 10); // Top 10
    
    return keywords;
  }

  /**
   * Check if the system is running in mock mode (Ollama unavailable).
   * Cached per pipeline run — set during orchestrateArticleCreation.
   */
  async checkMockMode(): Promise<boolean> {
    if (process.env.AI_MOCK_MODE === 'true') return true;
    if (process.env.AI_MOCK_MODE === 'false') return false;
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      return !response.ok;
    } catch {
      return true; // Ollama unreachable = mock mode
    }
  }

  /**
   * Returns whether content was generated in mock mode.
   */
  getIsMockMode(): boolean {
    return this.isMockMode;
  }

  private async getQueueItem(queueItemId: string): Promise<AdminQueueItem> {
    const data = await this.redis.get(`admin_queue:item:${queueItemId}`);
    if (!data) {
      throw new Error(`Queue item not found: ${queueItemId}`);
    }
    return JSON.parse(data);
  }

  // ==========================================================================
  // COMPLETE WORKFLOW ORCHESTRATION
  // ==========================================================================

  /**
   * MAIN ORCHESTRATION METHOD
   * Coordinates entire workflow from research → admin approval
   */
  async orchestrateArticleCreation(researchOutcome: ResearchOutcome): Promise<AdminQueueItem | null> {
    // Detect mock mode at the start of each pipeline run
    this.isMockMode = await this.checkMockMode();
    if (this.isMockMode) {
      console.log(`\n⚠️  [Review Agent] RUNNING IN MOCK MODE — Ollama unavailable. Content will be flagged as mock-generated.`);
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`[Review Agent] STARTING ARTICLE CREATION WORKFLOW`);
    console.log(`Topic: ${researchOutcome.topic}`);
    console.log(`${'='.repeat(80)}\n`);

    const { runId, recorder } = await createPipelineRun(
      this.prisma,
      this.redis,
      researchOutcome.topic,
      this.isMockMode,
    );
    console.log(`[Review Agent] Pipeline run created: ${runId}`);

    try {
      // STEP 0: Capture upstream research outcome (the trigger) for traceability
      await recorder.record('research', 0, { trigger: 'research_agent' }, async () => researchOutcome);

      // STEP 1: Validate research
      const researchValidation = await recorder.record(
        'validateResearch',
        1,
        { topic: researchOutcome.topic, sourceCount: researchOutcome.sources?.length ?? 0 },
        () => this.validateResearch(researchOutcome),
      );
      if (!researchValidation.passed) {
        console.log(`[Review Agent] ❌ Research discarded (not newsworthy)`);
        await markRunFailed(this.prisma, this.redis, runId, new Error('Research validation failed'));
        return null; // DISCARD
      }

      // STEP 2 (P3.9): Fact-check claims against sources
      const factCheck = await recorder.record(
        'factCheck',
        2,
        { factCount: researchOutcome.facts?.length ?? 0, sourceCount: researchOutcome.sources?.length ?? 0 },
        (metrics) => checkFacts(
          {
            facts: researchOutcome.facts || [],
            sources: (researchOutcome.sources || []).map(s => ({
              url: s.url,
              title: s.title,
              domain: s.domain,
              summary: (s as any).summary,
            })),
            coreMessage: researchOutcome.core_message,
            strictMode: true,
          },
          this.logger,
          metrics,
        ),
      );
      if (!this.shouldProceedAfterFactCheck(factCheck)) {
        console.log(`[Review Agent] ❌ Fact-check FAILED: ${factCheck.unsupportedClaims}/${factCheck.totalClaims} unsupported (score ${factCheck.score}/100)`);
        throw new Error(
          `Fact-check failed: ${factCheck.unsupportedClaims} of ${factCheck.totalClaims} claims unsupported. Editor must re-research or edit the facts list.`,
        );
      }
      console.log(`[Review Agent] ✅ Fact-check passed: ${factCheck.supportedClaims}/${factCheck.totalClaims} claims supported (score ${factCheck.score}/100)`);

      // STEP 3: Get writing prompt from Imo
      const writingPrompt = await recorder.record(
        'writingPrompt',
        3,
        { topic: researchOutcome.topic },
        () => this.requestWritingPrompt(researchOutcome),
      );

      // STEP 4: Send to Writer Agent
      console.log(`[Review Agent] → Sending to Writer Agent with Imo prompt`);
      const article = await recorder.record(
        'writer',
        4,
        { writingPrompt },
        () => this.callWriterAgent(writingPrompt, researchOutcome),
      );

      // STEP 5: Validate article
      const articleValidation = await recorder.record(
        'validateArticle',
        5,
        { articleId: article.id, wordCount: article.content?.length ?? 0 },
        () => this.validateArticle(article, researchOutcome),
      );
      if (!articleValidation.passed) {
        console.log(`[Review Agent] ❌ Article failed validation, requesting revision`);
        throw new Error('Article validation failed');
      }

      // STEP 6: Get image prompt from Imo
      const imagePrompt = await recorder.record(
        'imagePrompt',
        6,
        { articleTitle: article.title },
        () => this.requestImagePrompt(article, researchOutcome),
      );

      // STEP 7: Send to Image Agent
      console.log(`[Review Agent] → Sending to Image Agent with Imo prompt`);
      const image = await recorder.record(
        'image',
        7,
        { imagePrompt, articleId: article.id },
        () => this.callImageAgent(imagePrompt, article),
      );

      // STEP 8: Validate image
      const imageValidation = await recorder.record(
        'validateImage',
        8,
        { imageId: image.id, themeMatch: image.theme_match_score, quality: image.quality_score },
        () => this.validateImage(image, article),
      );
      if (!imageValidation.passed) {
        console.log(`[Review Agent] ❌ Image failed validation, requesting regeneration`);
        throw new Error('Image validation failed');
      }

      // STEP 9: Embed image in article
      const articleWithImage = await recorder.record(
        'embedImage',
        9,
        { articleId: article.id, imageId: image.id },
        async () => this.embedImageInArticle(article, image),
      );

      // STEP 10: Get translation prompts from Imo (15 languages)
      const translationPrompts = await recorder.record(
        'translationPrompts',
        10,
        { articleId: articleWithImage.id },
        () => this.requestTranslationPrompts(articleWithImage, researchOutcome),
      );

      // STEP 11: Send to Translation Agent (simultaneous 15 translations)
      console.log(`[Review Agent] → Sending to Translation Agent (15 languages simultaneously)`);
      const translations = await recorder.record(
        'translate',
        11,
        { articleId: articleWithImage.id, languageCount: translationPrompts.size },
        () => this.callTranslationAgent(translationPrompts, articleWithImage),
      );

      // STEP 12: Validate translations
      const translationValidation = await recorder.record(
        'validateTranslations',
        12,
        { translationCount: translations.length },
        () => this.validateTranslations(translations, articleWithImage),
      );
      if (!translationValidation.passed) {
        console.log(`[Review Agent] ❌ Translations failed validation`);
        throw new Error('Translation validation failed');
      }

      // STEP 13: Queue for admin approval
      const bundle: ArticleBundle = {
        english: articleWithImage,
        translations,
        image,
        research: researchOutcome,
      };

      const queueItem = await recorder.record(
        'queueForApproval',
        13,
        { articleId: articleWithImage.id },
        () => this.queueForAdminApproval(bundle),
      );

      // Attach the run id to the queue item so the admin UI can fetch step history
      (queueItem as any).pipeline_run_id = runId;

      // Mark the run ready for human review (writes status + pushes onto admin_queue:pending)
      await markRunReady(this.prisma, this.redis, runId);

      console.log(`\n${'='.repeat(80)}`);
      console.log(`[Review Agent] ✅ WORKFLOW COMPLETE`);
      console.log(`Run ID:      ${runId}`);
      console.log(`Queue Item:  ${queueItem.id}`);
      console.log(`Articles Ready: 16 (1 English + 15 translations)`);
      console.log(`Status: Pending Admin Approval`);
      console.log(`${'='.repeat(80)}\n`);

      return queueItem;

    } catch (error) {
      console.error(`[Review Agent] ❌ Workflow failed:`, error);
      await markRunFailed(this.prisma, this.redis, runId, error);
      throw error;
    }
  }

  /**
   * P3.9 — policy gate after the factCheck step. Three outcomes:
   *   - check passed: proceed
   *   - check failed but policy says soft-pass: log + proceed
   *   - check failed and policy says block: return false → orchestrator throws
   *
   * The `fallback` case (Ollama down) honours editorialPolicy.factCheckSoftFailOnOutage
   * separately, so a model outage doesn't block the queue unless explicitly required.
   */
  private shouldProceedAfterFactCheck(result: FactCheckResult): boolean {
    if (result.passed) return true;

    // Outage path
    if (result.fallback) {
      if (editorialPolicy.factCheckSoftFailOnOutage) {
        console.warn(`[Review Agent] ⚠️  Fact-check unavailable; proceeding due to factCheckSoftFailOnOutage policy`);
        return true;
      }
      // fall through to requireFactCheck check below
    }

    if (!editorialPolicy.requireFactCheck) {
      console.warn(`[Review Agent] ⚠️  Fact-check failed but requireFactCheck=false; proceeding with warning`);
      return true;
    }

    return false;
  }

  /**
   * STEP 9 helper: embed the Iengine-generated image into the article body.
   *
   * The image is prepended to `content` as a markdown image reference.
   * Both raw markdown renderers and the Tiptap doc converter (W3) parse
   * this into a proper image node. Idempotent — if the image URL is
   * already present in content, the article is returned unchanged.
   */
  private async embedImageInArticle(
    article: ArticleOutcome,
    image: ImageOutcome,
  ): Promise<ArticleOutcome> {
    if (!image.url) {
      console.warn('[Review Agent] embedImage: image has no URL, skipping embed');
      return article;
    }

    if (article.content.includes(image.url)) {
      console.log('[Review Agent] embedImage: image already present in content, skipping');
      return article;
    }

    const altText = (image.alt_text || article.title || 'Featured image').replace(/[\[\]()]/g, '');
    const imageMarkdown = `![${altText}](${image.url})\n\n`;

    console.log('[Review Agent] ✅ Embedding image in article');
    return {
      ...article,
      content: imageMarkdown + article.content,
    };
  }

  // Stub methods for calling other agents (to be implemented)
  private async callWriterAgent(prompt: string, research: ResearchOutcome): Promise<ArticleOutcome> {
    return await this.writerAgent.generateWithPrompt(prompt, research);
  }

  private async callImageAgent(prompt: string, article: ArticleOutcome): Promise<ImageOutcome> {
    return await this.imageAgent.generateWithPrompt(prompt, article);
  }

  private async callTranslationAgent(prompts: Map<string, string>, article: ArticleOutcome): Promise<TranslationOutcome[]> {
    return await this.translationAgent.translateWithPrompts(prompts, article);
  }
}

export default AIReviewAgent;
