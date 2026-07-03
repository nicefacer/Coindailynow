"use strict";
/**
 * Visual Bible — Composition Rules
 * Defines framing and compositional structure per story domain.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.compositionRules = void 0;
exports.getCompositionDirective = getCompositionDirective;
exports.compositionRules = {
    crypto: {
        description: 'Dynamic asymmetrical power',
        principles: [
            'rule of thirds with dynamic bias',
            'asymmetrical balance',
            'strong diagonal lines',
            'multiple depth layers',
            'leading lines toward focal crypto element',
        ],
        avoid: ['centered static', 'flat composition', 'single plane'],
    },
    tradfi: {
        description: 'Symmetrical institutional authority',
        principles: [
            'centered symmetry',
            'golden ratio proportions',
            'architectural framing',
            'clean geometric lines',
            'formal balance',
        ],
        avoid: ['asymmetrical chaos', 'dynamic distortion', 'informal framing'],
    },
    ai: {
        description: 'Centered intelligence radiance',
        principles: [
            'central focal intelligence',
            'radial symmetry from core',
            'layered depth with data planes',
            'fibonacci spiral structure',
            'abstract geometric harmony',
        ],
        avoid: ['chaotic scatter', 'unstructured elements', 'organic randomness'],
    },
    breaking: {
        description: 'Fragmented urgency',
        principles: [
            'diagonal tension lines',
            'fractured framing',
            'off-center impact point',
            'convergence toward crisis point',
            'compressed negative space',
        ],
        avoid: ['calm balanced', 'open breathing room', 'relaxed proportions'],
    },
    afrofuturism: {
        description: 'Human-centric environmental depth',
        principles: [
            'foreground-midground-background layering',
            'human scale within urban context',
            'environmental storytelling depth',
            'cultural pattern integration',
            'optimism-oriented upward framing',
        ],
        avoid: ['sterile isolation', 'western-default framing', 'abstract detachment'],
    },
};
function getCompositionDirective(storyType) {
    const defaults = {
        'breaking-news': {
            rule: 'diagonal tension with convergence toward crisis focal point',
            focal_point: 'off-center impact zone',
            balance: 'intentionally unbalanced for urgency',
            depth_layers: 3,
        },
        'premium-feature': {
            rule: 'cinematic rule of thirds with layered depth',
            focal_point: 'primary subject at power point',
            balance: 'dynamic asymmetrical balance',
            depth_layers: 4,
        },
        'market-analysis': {
            rule: 'data-centric grid with informational hierarchy',
            focal_point: 'central data visualization',
            balance: 'structured grid balance',
            depth_layers: 2,
        },
        cybercrime: {
            rule: 'fractured surveillance framing with tight crop',
            focal_point: 'threat element in shadow',
            balance: 'tension-heavy imbalance',
            depth_layers: 3,
        },
        regulation: {
            rule: 'symmetrical institutional authority framing',
            focal_point: 'centered institutional symbol',
            balance: 'formal symmetrical balance',
            depth_layers: 2,
        },
        'ai-future': {
            rule: 'radial intelligence emanation from central core',
            focal_point: 'centered AI consciousness element',
            balance: 'concentric radial harmony',
            depth_layers: 5,
        },
        'startup-vc': {
            rule: 'ascending diagonal with growth trajectory',
            focal_point: 'innovation subject ascending',
            balance: 'upward-biased dynamic',
            depth_layers: 3,
        },
        afrofuturism: {
            rule: 'environmental depth with human-centric foreground',
            focal_point: 'human innovation in urban context',
            balance: 'layered environmental balance',
            depth_layers: 4,
        },
        'thumbnail-fast': {
            rule: 'single dominant focal point with clean isolation',
            focal_point: 'centered hero element',
            balance: 'strong centered weight',
            depth_layers: 2,
        },
        'social-banner': {
            rule: 'wide-format dynamic with left-biased focal for text overlay',
            focal_point: 'left-of-center primary subject',
            balance: 'left-heavy for text space',
            depth_layers: 2,
        },
    };
    return defaults[storyType] || defaults['premium-feature'];
}
exports.default = exports.compositionRules;
//# sourceMappingURL=index.js.map