"use strict";
/**
 * Visual Bible — Camera Rules
 * Defines cinematic camera behavior per story domain.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cameraRules = void 0;
exports.getCameraDirective = getCameraDirective;
exports.cameraRules = {
    crypto: {
        category: 'crypto',
        objectives: ['energy', 'rebellion', 'movement', 'decentralized power'],
        rules: [
            'low-angle perspective',
            'dynamic framing',
            'asymmetrical composition',
            'strong motion vectors',
            'wide-lens distortion',
            'cinematic parallax',
        ],
        avoid: ['static compositions', 'centered symmetry', 'corporate stiffness'],
    },
    tradfi: {
        category: 'tradfi',
        objectives: ['institutional authority', 'stability', 'financial scale'],
        rules: [
            'symmetrical framing',
            'skyline dominance',
            'long-lens compression',
            'clean geometry',
            'executive perspective',
        ],
        avoid: ['excessive neon', 'cyberpunk chaos', 'unstable framing'],
    },
    ai: {
        category: 'ai',
        objectives: ['intelligence', 'synthetic cognition', 'machine transcendence'],
        rules: [
            'centered focal intelligence',
            'abstract geometry',
            'neural structures',
            'floating information systems',
            'layered depth',
        ],
        avoid: ['chaotic framing', 'low-tech aesthetics', 'human-centric composition'],
    },
    breaking: {
        category: 'breaking-news',
        objectives: ['urgency', 'impact', 'volatility'],
        rules: [
            'diagonal framing',
            'fragmented holograms',
            'rapid motion blur',
            'dramatic contrast',
            'shockwave composition',
        ],
        avoid: ['calm compositions', 'soft lighting', 'passive framing'],
    },
    cybercrime: {
        category: 'cybercrime',
        objectives: ['infiltration', 'surveillance', 'digital threat'],
        rules: [
            'tight framing',
            'surveillance camera angles',
            'fragmented perspective',
            'dutch angle tension',
            'shallow depth of field',
        ],
        avoid: ['bright open compositions', 'optimistic framing', 'warm tones'],
    },
    afrofuturism: {
        category: 'afrofuturism',
        objectives: ['innovation', 'emergence', 'cultural fusion', 'optimism'],
        rules: [
            'street-level realism',
            'human-centric compositions',
            'movement-heavy scenes',
            'optimism-focused framing',
            'wide establishing shots',
        ],
        avoid: ['sterile environments', 'western-only aesthetics', 'poverty imagery'],
    },
};
/**
 * Get camera directive based on story type and narrative.
 */
function getCameraDirective(storyType, narrative) {
    const defaults = {
        'breaking-news': {
            angle: 'dramatic diagonal',
            lens: '20mm ultra-wide',
            movement: 'rapid push-in',
            depth: 'deep focus with motion blur',
        },
        'premium-feature': {
            angle: 'low-angle cinematic',
            lens: '28mm wide',
            movement: 'slow push-in',
            depth: 'deep focus',
        },
        'market-analysis': {
            angle: 'overhead data perspective',
            lens: '35mm standard',
            movement: 'static with parallax layers',
            depth: 'layered depth',
        },
        cybercrime: {
            angle: 'dutch-angle surveillance',
            lens: '50mm tight',
            movement: 'slow tracking',
            depth: 'shallow with bokeh',
        },
        regulation: {
            angle: 'symmetrical institutional',
            lens: '35mm standard',
            movement: 'static authority',
            depth: 'deep architectural focus',
        },
        'ai-future': {
            angle: 'centered intelligence',
            lens: '24mm wide',
            movement: 'orbital float',
            depth: 'infinite layered depth',
        },
        'startup-vc': {
            angle: 'dynamic low-angle',
            lens: '28mm wide',
            movement: 'tracking ascent',
            depth: 'selective focus on subject',
        },
        afrofuturism: {
            angle: 'street-level cinematic',
            lens: '24mm wide',
            movement: 'dynamic follow',
            depth: 'deep environmental focus',
        },
        'thumbnail-fast': {
            angle: 'centered focal',
            lens: '50mm portrait',
            movement: 'static',
            depth: 'extreme shallow with strong bokeh',
        },
        'social-banner': {
            angle: 'dynamic three-quarter',
            lens: '35mm standard',
            movement: 'slight parallax',
            depth: 'moderate depth',
        },
    };
    return defaults[storyType] || defaults['premium-feature'];
}
exports.default = exports.cameraRules;
//# sourceMappingURL=index.js.map