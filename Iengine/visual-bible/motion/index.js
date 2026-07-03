"use strict";
/**
 * Visual Bible — Motion Rules
 * Defines motion and movement behavior per story domain.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.motionRules = void 0;
exports.getMotionDirective = getMotionDirective;
exports.motionRules = {
    crypto: {
        description: 'Dynamic decentralized energy',
        directives: [
            'flowing blockchain particles',
            'orbiting coins',
            'pulsing neon trails',
            'holographic data streams',
        ],
        intensity: 'dynamic',
    },
    tradfi: {
        description: 'Stable institutional movement',
        directives: [
            'slow data ticker scrolling',
            'subtle market flow',
            'steady architectural presence',
            'measured portfolio shifts',
        ],
        intensity: 'subtle',
    },
    ai: {
        description: 'Neural processing flow',
        directives: [
            'neural signal propagation',
            'data flow through lattices',
            'cognitive processing pulses',
            'algorithmic pattern evolution',
        ],
        intensity: 'moderate',
    },
    breaking: {
        description: 'Explosive urgency',
        directives: [
            'rapid fragmentation',
            'shockwave expansion',
            'volatile market spikes',
            'emergency alert pulses',
        ],
        intensity: 'extreme',
    },
    cybercrime: {
        description: 'Infiltration stealth',
        directives: [
            'glitch distortion',
            'data breach cascades',
            'encrypted signal interference',
            'surveillance sweep',
        ],
        intensity: 'moderate',
    },
    afrofuturism: {
        description: 'Urban emergence energy',
        directives: [
            'bustling street life',
            'mobile transaction flows',
            'innovation hub activity',
            'cultural festival energy',
        ],
        intensity: 'dynamic',
    },
};
function getMotionDirective(storyType) {
    const defaults = {
        'breaking-news': {
            type: 'explosive shockwave with volatile fragmentation',
            intensity: 'extreme',
            direction: 'radial outward',
        },
        'premium-feature': {
            type: 'slow cinematic movement with atmospheric particles',
            intensity: 'moderate',
            direction: 'forward push',
        },
        'market-analysis': {
            type: 'flowing data streams and chart animations',
            intensity: 'moderate',
            direction: 'horizontal flow',
        },
        cybercrime: {
            type: 'glitch distortion with surveillance sweep',
            intensity: 'moderate',
            direction: 'diagonal interference',
        },
        regulation: {
            type: 'slow institutional authority movement',
            intensity: 'subtle',
            direction: 'static with subtle shifts',
        },
        'ai-future': {
            type: 'neural signal propagation through cognitive lattices',
            intensity: 'moderate',
            direction: 'omnidirectional pulse',
        },
        'startup-vc': {
            type: 'ascending energy with innovation sparks',
            intensity: 'dynamic',
            direction: 'upward trajectory',
        },
        afrofuturism: {
            type: 'bustling urban innovation with cultural energy',
            intensity: 'dynamic',
            direction: 'street-level flow',
        },
        'thumbnail-fast': {
            type: 'frozen high-impact moment',
            intensity: 'subtle',
            direction: 'static focal',
        },
        'social-banner': {
            type: 'dynamic attention-grabbing movement',
            intensity: 'dynamic',
            direction: 'diagonal energy',
        },
    };
    return defaults[storyType] || defaults['premium-feature'];
}
exports.default = exports.motionRules;
//# sourceMappingURL=index.js.map