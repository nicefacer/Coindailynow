"use strict";
/**
 * Workflow Router
 * Routes generation requests to the correct ComfyUI workflow
 * based on story type, urgency, and resource availability.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowRouter = exports.workflowConfigs = void 0;
// ─── Workflow Configurations ─────────────────────────────────────────────────
exports.workflowConfigs = {
    'breaking-fast': {
        name: 'breaking-fast',
        model: 'sdxl-lightning',
        steps: 20,
        cfg: 5,
        width: 768,
        height: 768,
        sampler: 'euler',
        scheduler: 'sgm_uniform',
        use_controlnet: false,
        use_ipadapter: false,
        use_upscaler: false,
        sla_seconds: 10,
    },
    'premium-cinematic': {
        name: 'premium-cinematic',
        model: 'juggernautxl-v9',
        steps: 40,
        cfg: 7,
        width: 1024,
        height: 1024,
        sampler: 'dpmpp_2m',
        scheduler: 'karras',
        use_controlnet: true,
        use_ipadapter: true,
        use_upscaler: true,
        lora: ['cinematic_lighting_v1'],
        sla_seconds: 90,
    },
    'cybercrime-dark': {
        name: 'cybercrime-dark',
        model: 'juggernautxl-v9',
        steps: 35,
        cfg: 7,
        width: 1024,
        height: 1024,
        sampler: 'dpmpp_2m',
        scheduler: 'karras',
        use_controlnet: false,
        use_ipadapter: false,
        use_upscaler: true,
        lora: ['dark_cyber_v1'],
        sla_seconds: 60,
    },
    afrofuturist: {
        name: 'afrofuturist',
        model: 'juggernautxl-v9',
        steps: 40,
        cfg: 7,
        width: 1024,
        height: 1024,
        sampler: 'dpmpp_2m',
        scheduler: 'karras',
        use_controlnet: true,
        use_ipadapter: true,
        use_upscaler: true,
        lora: ['afrofuturism_v1', 'warm_cinematic_v1'],
        sla_seconds: 90,
    },
    'market-chart': {
        name: 'market-chart',
        model: 'juggernautxl-v9',
        steps: 30,
        cfg: 6,
        width: 1024,
        height: 576,
        sampler: 'dpmpp_2m',
        scheduler: 'karras',
        use_controlnet: false,
        use_ipadapter: false,
        use_upscaler: true,
        sla_seconds: 60,
    },
    'thumbnail-optimized': {
        name: 'thumbnail-optimized',
        model: 'sdxl-lightning',
        steps: 16,
        cfg: 4,
        width: 512,
        height: 512,
        sampler: 'euler',
        scheduler: 'sgm_uniform',
        use_controlnet: false,
        use_ipadapter: false,
        use_upscaler: false,
        sla_seconds: 15,
    },
    'social-crop': {
        name: 'social-crop',
        model: 'sdxl-lightning',
        steps: 25,
        cfg: 5,
        width: 1200,
        height: 630,
        sampler: 'dpmpp_2m',
        scheduler: 'karras',
        use_controlnet: false,
        use_ipadapter: false,
        use_upscaler: false,
        sla_seconds: 30,
    },
};
// ─── Router ──────────────────────────────────────────────────────────────────
class WorkflowRouter {
    /**
     * Route a scene plan to the appropriate workflow config.
     */
    route(scene) {
        const config = exports.workflowConfigs[scene.workflow];
        if (!config) {
            return exports.workflowConfigs['premium-cinematic'];
        }
        if (scene.urgency === 'critical' && scene.workflow !== 'breaking-fast') {
            return this.applyUrgencyOverride(config);
        }
        return config;
    }
    /**
     * Route by story type directly (simpler path).
     */
    routeByStoryType(storyType, urgency = 'medium') {
        if (urgency === 'critical') {
            return exports.workflowConfigs['breaking-fast'];
        }
        const typeMap = {
            'breaking-news': 'breaking-fast',
            'premium-feature': 'premium-cinematic',
            'market-analysis': 'market-chart',
            cybercrime: 'cybercrime-dark',
            regulation: 'premium-cinematic',
            'ai-future': 'premium-cinematic',
            'startup-vc': 'premium-cinematic',
            afrofuturism: 'afrofuturist',
            'thumbnail-fast': 'thumbnail-optimized',
            'social-banner': 'social-crop',
        };
        const workflowType = typeMap[storyType] || 'premium-cinematic';
        return exports.workflowConfigs[workflowType];
    }
    /**
     * Get all available workflow types.
     */
    getAvailableWorkflows() {
        return Object.keys(exports.workflowConfigs);
    }
    /**
     * Get workflow config by name.
     */
    getWorkflow(name) {
        return exports.workflowConfigs[name] || exports.workflowConfigs['premium-cinematic'];
    }
    /**
     * Apply urgency override to reduce generation time.
     */
    applyUrgencyOverride(config) {
        return {
            ...config,
            steps: Math.min(config.steps, 25),
            use_controlnet: false,
            use_ipadapter: false,
            use_upscaler: false,
            sla_seconds: Math.min(config.sla_seconds, 15),
        };
    }
}
exports.WorkflowRouter = WorkflowRouter;
exports.default = WorkflowRouter;
//# sourceMappingURL=workflowRouter.js.map