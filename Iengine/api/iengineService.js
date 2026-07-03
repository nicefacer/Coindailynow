"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.IengineService = void 0;
const narrativeEngine_1 = require("../core/narrativeEngine");
const emotionEngine_1 = require("../core/emotionEngine");
const scenePlanner_1 = require("../core/scenePlanner");
const promptComposer_1 = require("../core/promptComposer");
const workflowRouter_1 = require("../core/workflowRouter");
const qualityJudge_1 = require("../core/qualityJudge");
const thumbnailIntelligence_1 = require("../quality/thumbnailIntelligence");
const cdnManager_1 = require("../storage/cdnManager");
const injectWorkflow_1 = require("../comfy/injectWorkflow");
const queuePrompt_1 = require("../comfy/queuePrompt");
const bullmq_1 = require("../queues/bullmq");
class IengineService {
    narrativeEngine;
    emotionEngine;
    scenePlanner;
    promptComposer;
    workflowRouter;
    qualityJudge;
    thumbnailIntelligence;
    cdnManager;
    workflowInjector;
    comfyClient;
    constructor() {
        this.narrativeEngine = new narrativeEngine_1.NarrativeEngine();
        this.emotionEngine = new emotionEngine_1.EmotionEngine();
        this.scenePlanner = new scenePlanner_1.ScenePlanner();
        this.promptComposer = new promptComposer_1.PromptComposer();
        this.workflowRouter = new workflowRouter_1.WorkflowRouter();
        this.qualityJudge = new qualityJudge_1.QualityJudge();
        this.thumbnailIntelligence = new thumbnailIntelligence_1.ThumbnailIntelligence();
        this.cdnManager = new cdnManager_1.CDNManager();
        this.workflowInjector = new injectWorkflow_1.WorkflowInjector();
        this.comfyClient = new queuePrompt_1.ComfyUIClient();
    }
    // ─── Full Pipeline (Async via Queue) ─────────────────────────────────────
    /**
     * Submit a generation request to the pipeline.
     * This is the primary entry point for the CMS / backend.
     * Returns immediately with a job ID — generation happens asynchronously.
     */
    async submitGeneration(request) {
        const narrative = this.narrativeEngine.analyze(request.headline, request.excerpt, request.category, request.tags);
        const emotion = this.emotionEngine.analyze(narrative);
        const scene = await this.scenePlanner.plan(narrative, emotion, request.region, request.headline);
        const { positive, negative } = this.promptComposer.compose(scene);
        const workflow = this.workflowRouter.route(scene);
        const queueName = this.selectQueue(narrative.urgency, request.priority);
        const priority = this.getPriorityValue(narrative.urgency);
        const jobData = {
            request,
            scene_plan: scene,
            prompt: positive,
            negative_prompt: negative,
            workflow_config: workflow,
            narrative,
            emotion,
        };
        const jobId = await (0, bullmq_1.addGenerationJob)(queueName, jobData, {
            priority,
            jobId: request.id,
        });
        return {
            job_id: jobId,
            scene_plan: scene,
            prompt: positive,
            negative_prompt: negative,
            workflow,
            queue: queueName,
            estimated_time_seconds: workflow.sla_seconds,
        };
    }
    // ─── Synchronous Pipeline (Direct Execution) ────────────────────────────
    /**
     * Execute the full pipeline synchronously.
     * Use for testing or when immediate results are needed.
     */
    async generateDirect(request) {
        const startTime = Date.now();
        const narrative = this.narrativeEngine.analyze(request.headline, request.excerpt, request.category, request.tags);
        const emotion = this.emotionEngine.analyze(narrative);
        const scene = await this.scenePlanner.plan(narrative, emotion, request.region, request.headline);
        const { positive, negative } = this.promptComposer.compose(scene);
        const workflow = this.workflowRouter.route(scene);
        const seed = Math.floor(Math.random() * 2147483647);
        const comfyWorkflow = this.workflowInjector.buildFromConfig(workflow, positive, negative, seed);
        const promptResponse = await this.comfyClient.queuePrompt(comfyWorkflow);
        const completion = await this.comfyClient.waitForCompletion(promptResponse.prompt_id, workflow.sla_seconds * 2 * 1000);
        let imageBuffer = null;
        if (completion.images.length > 0) {
            imageBuffer = await this.comfyClient.getImage(completion.images[0].filename, completion.images[0].subfolder, completion.images[0].type);
        }
        let qualityScores;
        if (imageBuffer) {
            qualityScores = await this.qualityJudge.score(imageBuffer, positive, scene);
        }
        else {
            qualityScores = {
                clip_score: 0, aesthetic_score: 0, artifact_score: 1,
                brand_alignment: 0, composition_score: 0, technical_quality: 0,
                overall_score: 0, approved: false,
                rejection_reasons: ['No image generated'],
            };
        }
        let cdnUrls = {};
        if (imageBuffer && qualityScores.approved) {
            const uploadResult = await this.cdnManager.uploadWithOptimization(imageBuffer, `iengine_${request.id}_${Date.now()}.png`);
            cdnUrls = {
                original: uploadResult.original_url || '',
                webp: uploadResult.webp_url || '',
                avif: uploadResult.avif_url || '',
                thumbnail: uploadResult.thumbnail_url || '',
            };
        }
        return {
            id: `gen_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
            request_id: request.id,
            article_id: request.articleId,
            scene_plan: scene,
            prompt: positive,
            negative_prompt: negative,
            workflow_used: workflow.name,
            image_url: cdnUrls.original || '',
            thumbnail_url: cdnUrls.thumbnail,
            cdn_urls: cdnUrls,
            quality_scores: qualityScores,
            variants: [],
            metadata: {
                generation_time_ms: Date.now() - startTime,
                model_used: workflow.model,
                seed,
                steps: workflow.steps,
                cfg: workflow.cfg,
                sampler: workflow.sampler,
                scheduler: workflow.scheduler,
                loras: workflow.lora,
            },
            status: qualityScores.approved ? 'approved' : 'rejected',
            created_at: new Date(),
            completed_at: new Date(),
        };
    }
    // ─── Individual Engine Access ────────────────────────────────────────────
    /**
     * Analyze a headline without generating an image.
     * Useful for preview/debugging in the admin dashboard.
     */
    async analyzeHeadline(headline, excerpt, category, tags, region) {
        const narrative = this.narrativeEngine.analyze(headline, excerpt, category, tags);
        const emotion = this.emotionEngine.analyze(narrative);
        const scene = await this.scenePlanner.plan(narrative, emotion, region, headline);
        const { positive, negative } = this.promptComposer.compose(scene);
        const workflow = this.workflowRouter.route(scene);
        const thumbnailPlan = this.thumbnailIntelligence.plan(scene);
        return {
            narrative,
            emotion,
            scene,
            prompt: positive,
            negative_prompt: negative,
            workflow,
            thumbnail_plan: thumbnailPlan,
        };
    }
    // ─── Queue Status ────────────────────────────────────────────────────────
    async getQueueStatus() {
        return (0, bullmq_1.getAllQueueCounts)();
    }
    // ─── ComfyUI Health ──────────────────────────────────────────────────────
    async getComfyUIHealth() {
        const healthy = await this.comfyClient.healthCheck();
        const queue = await this.comfyClient.getQueueStatus();
        return { healthy, queue };
    }
    // ─── Helpers ─────────────────────────────────────────────────────────────
    selectQueue(urgency, priority) {
        if (urgency === 'critical' || priority === 1)
            return bullmq_1.QUEUE_NAMES.BREAKING_PRIORITY;
        if (urgency === 'high' || priority === 2)
            return bullmq_1.QUEUE_NAMES.PREMIUM_PRIORITY;
        return bullmq_1.QUEUE_NAMES.STANDARD;
    }
    getPriorityValue(urgency) {
        switch (urgency) {
            case 'critical': return bullmq_1.PRIORITIES.BREAKING;
            case 'high': return bullmq_1.PRIORITIES.PREMIUM;
            case 'medium': return bullmq_1.PRIORITIES.STANDARD;
            case 'low': return bullmq_1.PRIORITIES.BACKGROUND;
            default: return bullmq_1.PRIORITIES.STANDARD;
        }
    }
}
exports.IengineService = IengineService;
exports.default = IengineService;
//# sourceMappingURL=iengineService.js.map