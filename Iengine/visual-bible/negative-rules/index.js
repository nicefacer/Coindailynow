"use strict";
/**
 * Visual Bible — Negative Rules
 * Universal suppression rules to prevent quality degradation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.domainNegatives = exports.universalNegatives = void 0;
exports.buildNegativePrompt = buildNegativePrompt;
exports.getDomainFromStoryType = getDomainFromStoryType;
exports.universalNegatives = [
    'watermark',
    'text',
    'text artifacts',
    'logos',
    'signature',
    'username',
    'deformed anatomy',
    'duplicate limbs',
    'malformed hands',
    'extra fingers',
    'fused fingers',
    'too many fingers',
    'missing fingers',
    'poorly drawn hands',
    'poorly drawn face',
    'bad anatomy',
    'wrong anatomy',
    'extra limbs',
    'missing limbs',
    'floating limbs',
    'disconnected limbs',
    'mutation',
    'mutated',
    'ugly',
    'disgusting',
    'blurry',
    'poor perspective',
    'blurry background',
    'AI-generated typography',
    'low quality',
    'low resolution',
    'jpeg artifacts',
    'compression artifacts',
    'pixelated',
    'grainy',
    'noisy',
    'overexposed',
    'underexposed',
    'chromatic aberration',
    'distorted',
    'disfigured',
    'gross proportions',
    'malformed',
    'cropped',
    'out of frame',
    'worst quality',
    'normal quality',
];
exports.domainNegatives = {
    crypto: [
        'stock photo generic',
        'clipart',
        'cartoon style',
        'realistic human faces',
        'natural landscape without tech',
    ],
    tradfi: [
        'neon chaos',
        'cyberpunk excess',
        'unstable framing',
        'informal aesthetics',
        'street art style',
    ],
    ai: [
        'organic naturalism',
        'low-tech aesthetics',
        'rustic environments',
        'warm cozy lighting',
    ],
    cybercrime: [
        'bright cheerful lighting',
        'optimistic framing',
        'warm inviting tones',
        'natural sunlight',
        'happy atmosphere',
    ],
    afrofuturism: [
        'poverty imagery',
        'colonial aesthetics',
        'western-only architecture',
        'stereotypical depictions',
        'rural underdevelopment',
        'aid/charity imagery',
    ],
    latam: [
        'poverty exploitation',
        'cartel and violence imagery',
        'stereotypical depictions',
        'colonial narratives',
        'disaster exploitation',
        'slum tourism aesthetics',
    ],
    caribbean: [
        'disaster exploitation',
        'tourist-only clichés',
        'poverty imagery',
        'colonial plantation aesthetics',
        'storm damage focus',
        'stereotypical beach-only imagery',
    ],
    breaking: [
        'calm atmosphere',
        'peaceful composition',
        'soft pastel colors',
        'relaxed framing',
    ],
    regulation: [
        'informal settings',
        'chaotic environments',
        'neon party lighting',
        'street-level chaos',
    ],
};
/**
 * Build the full negative prompt string for a given domain.
 */
function buildNegativePrompt(domain) {
    const domainSpecific = exports.domainNegatives[domain] || [];
    const allNegatives = [...exports.universalNegatives, ...domainSpecific];
    return allNegatives.join(', ');
}
/**
 * Get domain key from story type.
 */
function getDomainFromStoryType(storyType) {
    const mapping = {
        'breaking-news': 'breaking',
        'premium-feature': 'crypto',
        'market-analysis': 'crypto',
        cybercrime: 'cybercrime',
        regulation: 'regulation',
        'ai-future': 'ai',
        'startup-vc': 'crypto',
        afrofuturism: 'afrofuturism',
        'thumbnail-fast': 'crypto',
        'social-banner': 'crypto',
    };
    return mapping[storyType] || 'crypto';
}
exports.default = { universalNegatives: exports.universalNegatives, domainNegatives: exports.domainNegatives, buildNegativePrompt };
//# sourceMappingURL=index.js.map