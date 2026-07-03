/**
 * Narrative Intelligence Engine
 * Layer 1 — Fast rule-based story decomposition.
 * Extracts topic, category, sentiment, entities, urgency, and symbolic archetypes
 * from headlines and article metadata WITHOUT requiring an LLM call.
 */
import { NarrativeAnalysis } from '../types';
export declare class NarrativeEngine {
    private topicClassifier;
    private urgencyDetector;
    private regionDetector;
    constructor();
    /**
     * Analyze headline + metadata to produce a structured narrative analysis.
     * This is Layer 1: fast, rule-based, no LLM dependency.
     */
    analyze(headline: string, excerpt?: string, category?: string, tags?: string[]): NarrativeAnalysis;
    /**
     * Detect region based on text content.
     */
    detectRegion(text: string): string;
    private extractEntities;
    private extractKeywords;
    private detectSentiment;
    private scoreGeopoliticalTension;
    private detectMarketEmotion;
    private detectInstitutionalRetail;
    private detectArchetypes;
}
export default NarrativeEngine;
//# sourceMappingURL=narrativeEngine.d.ts.map