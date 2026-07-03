/**
 * Type definitions for Admin Queue and Review Agent workflow
 */

export interface ResearchOutcome {
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
  /** P3.7 — positive + negative editorial framing for narrative control */
  narrative_angles?: {
    positive: string;
    negative: string;
    regional_relevance: Array<{ region: string; angle: string }>;
  };
}

export interface Source {
  url: string;
  title: string;
  published_at: Date;
  credibility_score: number; // 0-100
  domain: string;
}

export type QueueStatus = 'pending_approval' | 'approved' | 'edit_requested' | 'published';

export interface ValidationResult {
  passed: boolean;
  score?: number; // 0-100
  reason?: string;
  issues?: string[];
  suggestions?: string[];
  details?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface ArticleOutcome {
  id: string;
  content: string;
  title: string;
  word_count: number;
  keywords: string[];
  readability_score: number;
  seo_score: number;
  facts_preserved: boolean;
  message_consistent: boolean;
  featured_image?: string;
  featured_image_alt?: string;
}

export interface ImageOutcome {
  id: string;
  url: string;
  alt_text: string;
  theme_match_score: number;
  quality_score: number;
  prompt_used?: string;
  negative_prompt_used?: string;
  model?: string;
  processing_time_ms?: number;
}

export interface TranslationOutcome {
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
  status: QueueStatus;
  articles: ArticleBundle;
  submitted_at: Date;
  reviewed_at?: Date;
  admin_notes?: string;
  edit_requests?: EditRequest[];
  research_data?: ResearchOutcome;
}

export interface ArticleBundle {
  english: ArticleOutcome;
  translations: TranslationOutcome[];
  image: ImageOutcome;
  research?: ResearchOutcome;
}

export interface EditRequest {
  type: 'content' | 'image' | 'translation' | 'research';
  target_language?: string; // For translation edits
  instructions: string;
  requested_by: string;
  requested_at: Date;
}
