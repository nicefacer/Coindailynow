"use strict";
/**
 * Visual Bible — Lighting Rules
 * Defines lighting behavior per story domain.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.lightingRules = void 0;
exports.getLightingDirective = getLightingDirective;
exports.lightingRules = {
    crypto: {
        description: 'Neon-digital market glow',
        directives: [
            'neon cyan glow',
            'electric purple edge light',
            'gold market illumination',
            'holographic volumetrics',
        ],
        avoid: ['flat corporate lighting', 'daylight naturalism'],
    },
    tradfi: {
        description: 'Institutional power lighting',
        directives: [
            'navy ambient glow',
            'silver highlights',
            'emerald accent lighting',
            'clean institutional illumination',
        ],
        avoid: ['neon chaos', 'cyberpunk glow', 'dramatic shadows'],
    },
    ai: {
        description: 'Synthetic intelligence glow',
        directives: [
            'white-blue diffusion',
            'chrome reflections',
            'synthetic ambient glow',
            'holographic data illumination',
        ],
        avoid: ['warm tones', 'organic lighting', 'shadow-heavy'],
    },
    cybercrime: {
        description: 'Alert infiltration lighting',
        directives: [
            'red alert lighting',
            'dark server contrast',
            'fragmented monitor illumination',
            'green terminal glow',
        ],
        avoid: ['warm ambient', 'bright open lighting', 'natural sunlight'],
    },
    afrofuturism: {
        description: 'Warm urban emergence',
        directives: [
            'warm sunlight gradients',
            'amber neon',
            'rich atmospheric gold',
            'humid urban glow',
        ],
        avoid: ['cold sterile lighting', 'western corporate', 'overexposed flat'],
    },
    latam: {
        description: 'Tropical fintech revolution glow',
        directives: [
            'tropical golden hour warmth',
            'carnival neon vibrancy',
            'volcanic sunset drama',
            'Atlantic coast reflection light',
            'favela neon nightscape energy',
        ],
        avoid: ['sterile corporate lighting', 'cold northern light', 'muted desaturated tones'],
    },
    caribbean: {
        description: 'Island digital paradise illumination',
        directives: [
            'turquoise water reflection light',
            'tropical sunset with particle overlay',
            'palm-shadow dappled tech glow',
            'coral bioluminescent data aesthetics',
            'clear Caribbean sky brilliance',
        ],
        avoid: ['cold industrial lighting', 'grey overcast', 'dark oppressive tones'],
    },
    regulation: {
        description: 'Cold institutional authority',
        directives: [
            'cold blue tension',
            'institutional fluorescent',
            'dramatic courtroom contrast',
            'surveillance lighting',
        ],
        avoid: ['warm inviting tones', 'neon chaos', 'soft diffusion'],
    },
    breaking: {
        description: 'Urgent volatile illumination',
        directives: [
            'high-contrast dramatic',
            'emergency red accents',
            'volatile market glow',
            'flashpoint illumination',
        ],
        avoid: ['calm ambient', 'soft pastels', 'even lighting'],
    },
};
function getLightingDirective(storyType) {
    const defaults = {
        'breaking-news': {
            primary: 'high-contrast dramatic flashpoint lighting',
            secondary: 'volatile red and gold emergency accents',
            ambient: 'dark urgent atmosphere',
            volumetric: true,
        },
        'premium-feature': {
            primary: 'cinematic neon cyan and gold glow',
            secondary: 'electric purple edge lighting',
            ambient: 'deep atmospheric volumetrics',
            volumetric: true,
        },
        'market-analysis': {
            primary: 'holographic data display illumination',
            secondary: 'neon chart glow',
            ambient: 'dark trading floor atmosphere',
            volumetric: false,
        },
        cybercrime: {
            primary: 'red alert with monitor illumination',
            secondary: 'green terminal glow',
            ambient: 'dark server room atmosphere',
            volumetric: false,
        },
        regulation: {
            primary: 'cold blue institutional tension',
            secondary: 'dramatic courtroom contrast',
            ambient: 'formal authority atmosphere',
            volumetric: false,
        },
        'ai-future': {
            primary: 'white-blue synthetic intelligence diffusion',
            secondary: 'chrome holographic reflections',
            ambient: 'ethereal machine consciousness glow',
            volumetric: true,
        },
        'startup-vc': {
            primary: 'energetic warm innovation glow',
            secondary: 'tech-forward neon accents',
            ambient: 'optimistic modern atmosphere',
            volumetric: false,
        },
        afrofuturism: {
            primary: 'warm amber cinematic sunset glow',
            secondary: 'humid neon urban accents',
            ambient: 'rich atmospheric gold with digital undertones',
            volumetric: true,
        },
        'thumbnail-fast': {
            primary: 'high-contrast focal spotlight',
            secondary: 'strong rim lighting for silhouette',
            ambient: 'clean dark background',
            volumetric: false,
        },
        'social-banner': {
            primary: 'vibrant attention-grabbing illumination',
            secondary: 'brand-color accent lighting',
            ambient: 'clean modern atmosphere',
            volumetric: false,
        },
    };
    return defaults[storyType] || defaults['premium-feature'];
}
exports.default = exports.lightingRules;
//# sourceMappingURL=index.js.map