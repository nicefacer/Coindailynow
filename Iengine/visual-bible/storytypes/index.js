"use strict";
/**
 * Visual Bible — Story Type Definitions
 * Maps editorial story types to generation parameters.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.storyTypeConfigs = void 0;
exports.detectStoryType = detectStoryType;
exports.getStoryTypeConfig = getStoryTypeConfig;
exports.storyTypeConfigs = {
    'breaking-news': {
        type: 'breaking-news',
        description: 'Fast turnaround for ETF approvals, exchange hacks, market crashes, SEC actions',
        workflow: 'breaking-fast',
        priority: 1,
        sla_seconds: 10,
        generation_params: {
            steps: 20,
            cfg: 5,
            width: 768,
            height: 768,
            model: 'sdxl-lightning',
            sampler: 'euler',
            scheduler: 'sgm_uniform',
        },
        use_controlnet: false,
        use_upscaler: false,
        use_ipadapter: false,
        keywords: ['breaking', 'urgent', 'flash', 'alert', 'crash', 'hack', 'emergency'],
    },
    'premium-feature': {
        type: 'premium-feature',
        description: 'Homepage hero imagery with cinematic detail',
        workflow: 'premium-cinematic',
        priority: 2,
        sla_seconds: 90,
        generation_params: {
            steps: 40,
            cfg: 7,
            width: 1024,
            height: 1024,
            model: 'juggernautxl-v9',
            sampler: 'dpmpp_2m',
            scheduler: 'karras',
        },
        use_controlnet: true,
        use_upscaler: true,
        use_ipadapter: true,
        keywords: ['feature', 'exclusive', 'analysis', 'deep-dive', 'investigation'],
    },
    'market-analysis': {
        type: 'market-analysis',
        description: 'Market data visualization and analysis imagery',
        workflow: 'premium-cinematic',
        priority: 3,
        sla_seconds: 60,
        generation_params: {
            steps: 30,
            cfg: 6,
            width: 1024,
            height: 576,
            model: 'juggernautxl-v9',
            sampler: 'dpmpp_2m',
            scheduler: 'karras',
        },
        use_controlnet: false,
        use_upscaler: true,
        use_ipadapter: false,
        keywords: ['market', 'price', 'chart', 'analysis', 'forecast', 'technical'],
    },
    cybercrime: {
        type: 'cybercrime',
        description: 'Dark infiltration aesthetics for hack/security stories',
        workflow: 'cybercrime-dark',
        priority: 2,
        sla_seconds: 60,
        generation_params: {
            steps: 35,
            cfg: 7,
            width: 1024,
            height: 1024,
            model: 'juggernautxl-v9',
            sampler: 'dpmpp_2m',
            scheduler: 'karras',
        },
        use_controlnet: false,
        use_upscaler: true,
        use_ipadapter: false,
        keywords: ['hack', 'breach', 'exploit', 'vulnerability', 'attack', 'scam', 'fraud'],
    },
    regulation: {
        type: 'regulation',
        description: 'Institutional authority for regulatory stories',
        workflow: 'premium-cinematic',
        priority: 3,
        sla_seconds: 60,
        generation_params: {
            steps: 35,
            cfg: 6,
            width: 1024,
            height: 1024,
            model: 'juggernautxl-v9',
            sampler: 'dpmpp_2m',
            scheduler: 'karras',
        },
        use_controlnet: false,
        use_upscaler: true,
        use_ipadapter: false,
        keywords: ['regulation', 'sec', 'compliance', 'law', 'policy', 'ban', 'license', 'cbdc'],
    },
    'ai-future': {
        type: 'ai-future',
        description: 'Intelligence and machine transcendence visuals',
        workflow: 'premium-cinematic',
        priority: 3,
        sla_seconds: 60,
        generation_params: {
            steps: 40,
            cfg: 7,
            width: 1024,
            height: 1024,
            model: 'juggernautxl-v9',
            sampler: 'dpmpp_2m',
            scheduler: 'karras',
        },
        use_controlnet: true,
        use_upscaler: true,
        use_ipadapter: false,
        keywords: ['ai', 'artificial intelligence', 'machine learning', 'neural', 'gpt', 'llm', 'deepfake'],
    },
    'startup-vc': {
        type: 'startup-vc',
        description: 'Startup energy and venture capital stories',
        workflow: 'premium-cinematic',
        priority: 4,
        sla_seconds: 60,
        generation_params: {
            steps: 30,
            cfg: 6,
            width: 1024,
            height: 1024,
            model: 'juggernautxl-v9',
            sampler: 'dpmpp_2m',
            scheduler: 'karras',
        },
        use_controlnet: false,
        use_upscaler: true,
        use_ipadapter: false,
        keywords: ['startup', 'funding', 'venture', 'seed', 'series', 'raise', 'unicorn'],
    },
    afrofuturism: {
        type: 'afrofuturism',
        description: 'Regional brand differentiation — African digital futures',
        workflow: 'afrofuturist',
        priority: 2,
        sla_seconds: 90,
        generation_params: {
            steps: 40,
            cfg: 7,
            width: 1024,
            height: 1024,
            model: 'juggernautxl-v9',
            sampler: 'dpmpp_2m',
            scheduler: 'karras',
        },
        use_controlnet: true,
        use_upscaler: true,
        use_ipadapter: true,
        keywords: ['africa', 'lagos', 'nairobi', 'nigerian', 'kenyan', 'mpesa', 'fintech', 'african'],
    },
    'thumbnail-fast': {
        type: 'thumbnail-fast',
        description: 'Optimized CTR thumbnails',
        workflow: 'thumbnail-optimized',
        priority: 3,
        sla_seconds: 15,
        generation_params: {
            steps: 16,
            cfg: 4,
            width: 512,
            height: 512,
            model: 'sdxl-lightning',
            sampler: 'euler',
            scheduler: 'sgm_uniform',
        },
        use_controlnet: false,
        use_upscaler: false,
        use_ipadapter: false,
        keywords: [],
    },
    'social-banner': {
        type: 'social-banner',
        description: 'Social media banners for X/Twitter, YouTube, Telegram',
        workflow: 'social-crop',
        priority: 4,
        sla_seconds: 30,
        generation_params: {
            steps: 25,
            cfg: 5,
            width: 1200,
            height: 630,
            model: 'sdxl-lightning',
            sampler: 'dpmpp_2m',
            scheduler: 'karras',
        },
        use_controlnet: false,
        use_upscaler: false,
        use_ipadapter: false,
        keywords: [],
    },
};
/**
 * Detect story type from headline, tags, and category using keyword matching.
 */
function detectStoryType(headline, category, tags) {
    const text = `${headline} ${category || ''} ${(tags || []).join(' ')}`.toLowerCase();
    const scored = [];
    for (const [, config] of Object.entries(exports.storyTypeConfigs)) {
        if (config.keywords.length === 0)
            continue;
        let score = 0;
        for (const kw of config.keywords) {
            if (text.includes(kw))
                score++;
        }
        if (score > 0)
            scored.push({ type: config.type, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.length > 0 ? scored[0].type : 'premium-feature';
}
/**
 * Get story type config.
 */
function getStoryTypeConfig(storyType) {
    return exports.storyTypeConfigs[storyType] || exports.storyTypeConfigs['premium-feature'];
}
exports.default = exports.storyTypeConfigs;
//# sourceMappingURL=index.js.map