"use strict";
/**
 * Image Agent Bridge
 * Connects the existing ai-system ImageAgent to the Iengine pipeline.
 * Drop-in replacement that routes through the full Visual Intelligence Engine
 * instead of raw SDXL prompting.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageAgentBridge = void 0;
const iengineService_1 = require("./iengineService");
class ImageAgentBridge {
    service;
    constructor() {
        this.service = new iengineService_1.IengineService();
    }
    /**
     * Generate an image through the Iengine pipeline.
     * Compatible with the existing ImageAgent.generateWithPrompt() interface.
     */
    async generate(article) {
        const request = {
            id: `bridge_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
            articleId: article.id,
            headline: article.title,
            excerpt: article.excerpt,
            category: article.category,
            tags: article.tags,
            region: article.region,
        };
        try {
            const result = await this.service.generateDirect(request);
            return {
                id: result.id,
                url: result.image_url || result.cdn_urls?.original || '',
                alt_text: this.generateAltText(article),
                theme_match_score: Math.round(result.quality_scores.brand_alignment * 100),
                quality_score: Math.round(result.quality_scores.overall_score * 100),
                scene_plan: result.scene_plan,
                metadata: result.metadata,
            };
        }
        catch (error) {
            console.error('[ImageAgentBridge] Generation failed, falling back:', error.message);
            throw error;
        }
    }
    /**
     * Analyze an article headline and return the scene plan + prompt
     * without actually generating an image.
     */
    async analyze(article) {
        return await this.service.analyzeHeadline(article.title, article.excerpt, article.category, article.tags, article.region);
    }
    /**
     * Submit an async generation job (non-blocking).
     */
    async submitAsync(article, callbackUrl) {
        const request = {
            id: `bridge_async_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
            articleId: article.id,
            headline: article.title,
            excerpt: article.excerpt,
            category: article.category,
            tags: article.tags,
            region: article.region,
            callback_url: callbackUrl,
        };
        return this.service.submitGeneration(request);
    }
    generateAltText(article) {
        const keywords = article.tags?.slice(0, 3).join(', ') || 'cryptocurrency';
        return `Featured image for: ${article.title}. Visual elements: ${keywords} — CoinDaily Africa`;
    }
}
exports.ImageAgentBridge = ImageAgentBridge;
exports.default = ImageAgentBridge;
//# sourceMappingURL=imageAgentBridge.js.map