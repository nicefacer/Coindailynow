/**
 * Image Agent Bridge
 * Connects the existing ai-system ImageAgent to the Iengine pipeline.
 * Drop-in replacement that routes through the full Visual Intelligence Engine
 * instead of raw SDXL prompting.
 */
export interface ArticleContext {
    id?: string;
    title: string;
    excerpt?: string;
    category?: string;
    tags?: string[];
    region?: string;
}
export interface BridgeImageResult {
    id: string;
    url: string;
    alt_text: string;
    theme_match_score: number;
    quality_score: number;
    scene_plan?: any;
    metadata?: any;
}
export declare class ImageAgentBridge {
    private service;
    constructor();
    /**
     * Generate an image through the Iengine pipeline.
     * Compatible with the existing ImageAgent.generateWithPrompt() interface.
     */
    generate(article: ArticleContext): Promise<BridgeImageResult>;
    /**
     * Analyze an article headline and return the scene plan + prompt
     * without actually generating an image.
     */
    analyze(article: ArticleContext): Promise<{
        narrative: import("../types").NarrativeAnalysis;
        emotion: import("../types").EmotionAnalysis;
        scene: import("../types").ScenePlan;
        prompt: string;
        negative_prompt: string;
        workflow: import("../types").WorkflowConfig;
        thumbnail_plan: import("../types").ThumbnailPlan;
    }>;
    /**
     * Submit an async generation job (non-blocking).
     */
    submitAsync(article: ArticleContext, callbackUrl?: string): Promise<{
        job_id: string;
        scene_plan: import("../types").ScenePlan;
        prompt: string;
        negative_prompt: string;
        workflow: import("../types").WorkflowConfig;
        queue: string;
        estimated_time_seconds: number;
    }>;
    private generateAltText;
}
export default ImageAgentBridge;
//# sourceMappingURL=imageAgentBridge.d.ts.map