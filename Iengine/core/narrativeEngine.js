"use strict";
/**
 * Narrative Intelligence Engine
 * Layer 1 — Fast rule-based story decomposition.
 * Extracts topic, category, sentiment, entities, urgency, and symbolic archetypes
 * from headlines and article metadata WITHOUT requiring an LLM call.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NarrativeEngine = void 0;
const storytypes_1 = require("../visual-bible/storytypes");
const topicClassifier_1 = require("./topicClassifier");
const urgencyDetector_1 = require("./urgencyDetector");
const regionDetector_1 = require("./regionDetector");
const regionEntities_json_1 = __importDefault(require("../data/regionEntities.json"));
// ─── Keyword Maps ────────────────────────────────────────────────────────────
const SENTIMENT_KEYWORDS = {
    bullish: ['surge', 'rally', 'soar', 'breakout', 'all-time high', 'ath', 'moon', 'pump', 'bullish', 'gain', 'record', 'milestone', 'approval', 'adopt', 'partnership'],
    bearish: ['crash', 'plunge', 'dump', 'collapse', 'plummet', 'liquidat', 'bearish', 'loss', 'sell-off', 'decline', 'drop', 'slump', 'fear'],
    neutral: ['report', 'announce', 'update', 'launch', 'release', 'plan', 'consider', 'explore'],
};
const INSTITUTIONAL_KEYWORDS = ['blackrock', 'fidelity', 'jpmorgan', 'goldman', 'institution', 'bank', 'hedge fund', 'etf', 'sovereign', 'pension'];
const RETAIL_KEYWORDS = ['retail', 'trader', 'community', 'memecoin', 'degen', 'airdrop', 'discord', 'telegram'];
const SYMBOLIC_ARCHETYPES = {
    'institutional dominance': ['blackrock', 'fidelity', 'etf', 'institutional', 'jpmorgan'],
    'market volatility': ['crash', 'surge', 'volatile', 'liquidat', 'flash'],
    'digital revolution': ['adoption', 'mainstream', 'billion users', 'milestone'],
    'regulatory confrontation': ['sec', 'lawsuit', 'ban', 'enforcement', 'fine'],
    'technological breakthrough': ['launch', 'upgrade', 'breakthrough', 'innovation', 'deploy'],
    'security crisis': ['hack', 'exploit', 'breach', 'drain', 'rug pull'],
    'african emergence': ['africa', 'nigeria', 'kenya', 'mpesa', 'fintech hub'],
    'latam crypto adoption': ['el salvador', 'bitcoin beach', 'chivo', 'pix', 'nubank', 'mercado libre', 'argentina peso', 'venezuela bolivar', 'remittance'],
    'caribbean digital islands': ['bahamas', 'sand dollar', 'cayman', 'caribbean', 'offshore', 'cbdc'],
    'ai convergence': ['ai', 'gpt', 'machine learning', 'neural', 'autonomous'],
};
// ─── Core Engine ─────────────────────────────────────────────────────────────
class NarrativeEngine {
    topicClassifier;
    urgencyDetector;
    regionDetector;
    constructor() {
        this.topicClassifier = new topicClassifier_1.TopicClassifier();
        this.urgencyDetector = new urgencyDetector_1.UrgencyDetector();
        this.regionDetector = new regionDetector_1.RegionDetector();
    }
    /**
     * Analyze headline + metadata to produce a structured narrative analysis.
     * This is Layer 1: fast, rule-based, no LLM dependency.
     */
    analyze(headline, excerpt, category, tags) {
        const text = `${headline} ${excerpt || ''} ${category || ''} ${(tags || []).join(' ')}`.toLowerCase();
        const topic = this.topicClassifier.classify(text);
        const storyType = (0, storytypes_1.detectStoryType)(headline, category, tags);
        const entities = this.extractEntities(text);
        const keywords = this.extractKeywords(headline, text);
        const sentiment = this.detectSentiment(text);
        const urgency = this.urgencyDetector.detect(text);
        const geopoliticalTension = this.scoreGeopoliticalTension(text);
        const marketEmotion = this.detectMarketEmotion(text, sentiment);
        const institutionalRetail = this.detectInstitutionalRetail(text);
        const archetypes = this.detectArchetypes(text);
        return {
            topic,
            category: category || topic,
            story_type: storyType,
            entities,
            keywords,
            sentiment,
            geopolitical_tension: geopoliticalTension,
            market_emotion: marketEmotion,
            institutional_vs_retail: institutionalRetail,
            urgency,
            symbolic_archetypes: archetypes,
        };
    }
    /**
     * Detect region based on text content.
     */
    detectRegion(text) {
        return this.regionDetector.detect(text);
    }
    extractEntities(text) {
        const entities = [];
        // Flatten all keywords from regionEntities as entities to detect
        const knownEntities = [
            'bitcoin', 'ethereum', 'binance', 'coinbase', 'sec', 'blackrock',
            'fidelity', 'jpmorgan', 'tether', 'usdc', 'solana', 'cardano',
            'ripple', 'xrp', 'dogecoin', 'polygon', 'avalanche', 'chainlink',
            'openai', 'google', 'apple', 'tesla', 'microstrategy', 'grayscale',
            'fed', 'ecb', 'imf', 'nubank', 'mercado libre',
        ];
        // Also add region-specific entities
        for (const list of Object.values(regionEntities_json_1.default)) {
            if (Array.isArray(list)) {
                knownEntities.push(...list);
            }
        }
        const uniqueEntities = [...new Set(knownEntities)];
        for (const entity of uniqueEntities) {
            if (text.includes(entity)) {
                entities.push(entity);
            }
        }
        return entities.slice(0, 8);
    }
    extractKeywords(headline, text) {
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
            'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
            'should', 'may', 'might', 'can', 'this', 'that', 'it', 'its', 'as',
            'not', 'no', 'so', 'up', 'if', 'about', 'into', 'than', 'then',
            'out', 'also', 'after', 'before', 'new', 'more', 'over',
        ]);
        const words = headline
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.has(w));
        return [...new Set(words)].slice(0, 8);
    }
    detectSentiment(text) {
        let bullishScore = 0;
        let bearishScore = 0;
        for (const kw of SENTIMENT_KEYWORDS.bullish) {
            if (text.includes(kw))
                bullishScore++;
        }
        for (const kw of SENTIMENT_KEYWORDS.bearish) {
            if (text.includes(kw))
                bearishScore++;
        }
        if (bullishScore > 0 && bearishScore > 0)
            return 'mixed';
        if (bullishScore > bearishScore)
            return 'bullish';
        if (bearishScore > bullishScore)
            return 'bearish';
        return 'neutral';
    }
    scoreGeopoliticalTension(text) {
        const tensionKeywords = [
            'ban', 'sanction', 'war', 'conflict', 'embargo', 'crisis',
            'enforcement', 'lawsuit', 'investigation', 'seizure', 'arrest',
        ];
        let score = 0;
        for (const kw of tensionKeywords) {
            if (text.includes(kw))
                score += 0.15;
        }
        return Math.min(score, 1);
    }
    detectMarketEmotion(text, sentiment) {
        if (sentiment === 'bullish') {
            if (text.includes('all-time') || text.includes('record'))
                return 'euphoria';
            if (text.includes('rally') || text.includes('surge'))
                return 'excitement';
            return 'optimism';
        }
        if (sentiment === 'bearish') {
            if (text.includes('crash') || text.includes('collapse'))
                return 'panic';
            if (text.includes('liquidat') || text.includes('sell-off'))
                return 'fear';
            return 'uncertainty';
        }
        if (text.includes('wait') || text.includes('delay'))
            return 'anticipation';
        if (text.includes('stable') || text.includes('steady'))
            return 'stability';
        return 'measured observation';
    }
    detectInstitutionalRetail(text) {
        let instScore = 0;
        let retailScore = 0;
        for (const kw of INSTITUTIONAL_KEYWORDS) {
            if (text.includes(kw))
                instScore++;
        }
        for (const kw of RETAIL_KEYWORDS) {
            if (text.includes(kw))
                retailScore++;
        }
        if (instScore > 0 && retailScore > 0)
            return 'mixed';
        if (instScore > retailScore)
            return 'institutional';
        if (retailScore > instScore)
            return 'retail';
        return 'mixed';
    }
    detectArchetypes(text) {
        const matched = [];
        for (const [archetype, keywords] of Object.entries(SYMBOLIC_ARCHETYPES)) {
            for (const kw of keywords) {
                if (text.includes(kw)) {
                    matched.push(archetype);
                    break;
                }
            }
        }
        return matched.slice(0, 3);
    }
}
exports.NarrativeEngine = NarrativeEngine;
exports.default = NarrativeEngine;
//# sourceMappingURL=narrativeEngine.js.map