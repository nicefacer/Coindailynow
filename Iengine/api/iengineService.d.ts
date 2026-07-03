/**
 * Iengine Service
 * The main orchestration service that ties all engines together.
 * This is the primary interface for the backend and CMS integration.
 *
 * Full pipeline:
 *   headline → narrative analysis → emotion analysis → scene planning
 *   → prompt composition → workflow routing → queue submission
 *   → GPU generation → quality scoring → thumbnail generation
 *   → CDN upload → CMS delivery
 */
import { GenerationRequest, GenerationResult, ScenePlan, ThumbnailPlan, NarrativeAnalysis, EmotionAnalysis, WorkflowConfig } from '../types';
export declare class IengineService {
    private narrativeEngine;
    private emotionEngine;
    private scenePlanner;
    private promptComposer;
    private workflowRouter;
    private qualityJudge;
    private thumbnailIntelligence;
    private cdnManager;
    private workflowInjector;
    private comfyClient;
    constructor();
    /**
     * Submit a generation request to the pipeline.
     * This is the primary entry point for the CMS / backend.
     * Returns immediately with a job ID — generation happens asynchronously.
     */
    submitGeneration(request: GenerationRequest): Promise<{
        job_id: string;
        scene_plan: ScenePlan;
        prompt: string;
        negative_prompt: string;
        workflow: WorkflowConfig;
        queue: string;
        estimated_time_seconds: number;
    }>;
    /**
     * Execute the full pipeline synchronously.
     * Use for testing or when immediate results are needed.
     */
    generateDirect(request: GenerationRequest): Promise<GenerationResult>;
    /**
     * Analyze a headline without generating an image.
     * Useful for preview/debugging in the admin dashboard.
     */
    analyzeHeadline(headline: string, excerpt?: string, category?: string, tags?: string[], region?: string): Promise<{
        narrative: NarrativeAnalysis;
        emotion: EmotionAnalysis;
        scene: ScenePlan;
        prompt: string;
        negative_prompt: string;
        workflow: WorkflowConfig;
        thumbnail_plan: ThumbnailPlan;
    }>;
    getQueueStatus(): Promise<Record<string, any>>;
    getComfyUIHealth(): Promise<{
        healthy: boolean;
        queue: any;
    }>;
    private selectQueue;
    private getPriorityValue;
}
export default IengineService;
//# sourceMappingURL=iengineService.d.ts.map