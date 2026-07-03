"use strict";
/**
 * Visual Bible — Color Governance
 * Defines strict color palettes per editorial domain.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.colorPalettes = void 0;
exports.getColorPalette = getColorPalette;
exports.buildColorInstruction = buildColorInstruction;
exports.colorPalettes = {
    crypto: {
        name: 'Crypto Core',
        primary: ['#00F0FF', '#8B5CF6', '#FFD700'],
        secondary: ['#0F172A', '#111827'],
        accent: ['#10B981', '#F59E0B'],
    },
    tradfi: {
        name: 'TradFi Institutional',
        primary: ['#0A2540', '#0F766E', '#C0C0C0'],
        secondary: ['#1E293B', '#F8FAFC'],
        accent: ['#059669', '#6366F1'],
    },
    ai: {
        name: 'AI Intelligence',
        primary: ['#60A5FA', '#E2E8F0', '#A78BFA'],
        secondary: ['#0F172A', '#1E293B'],
        accent: ['#22D3EE', '#818CF8'],
    },
    cybercrime: {
        name: 'Cybercrime Dark',
        primary: ['#EF4444', '#22C55E', '#0F172A'],
        secondary: ['#111827', '#1F2937'],
        accent: ['#F97316', '#8B5CF6'],
    },
    afrofuturism: {
        name: 'African Futurism',
        primary: ['#FFB703', '#1D3557', '#FF7F50'],
        secondary: ['#0B132B', '#D4A373'],
        accent: ['#E76F51', '#2A9D8F'],
    },
    latam: {
        name: 'Latin American Frontier',
        primary: ['#FFB703', '#E63946', '#2A9D8F'],
        secondary: ['#264653', '#F4A261'],
        accent: ['#E76F51', '#6A0DAD'],
    },
    caribbean: {
        name: 'Caribbean Digital Islands',
        primary: ['#00CED1', '#FF6B6B', '#2ECC71'],
        secondary: ['#1A1A2E', '#F39C12'],
        accent: ['#E74C3C', '#48C9B0'],
    },
    regulation: {
        name: 'Regulation Authority',
        primary: ['#1E3A5F', '#6B7280', '#D4AF37'],
        secondary: ['#F3F4F6', '#111827'],
        accent: ['#DC2626', '#1D4ED8'],
    },
    market: {
        name: 'Market Analysis',
        primary: ['#10B981', '#EF4444', '#3B82F6'],
        secondary: ['#0F172A', '#1E293B'],
        accent: ['#F59E0B', '#8B5CF6'],
    },
    startup: {
        name: 'Startup Energy',
        primary: ['#8B5CF6', '#EC4899', '#F59E0B'],
        secondary: ['#0F172A', '#1E293B'],
        accent: ['#10B981', '#3B82F6'],
    },
};
/**
 * Resolve color palette for a story type.
 */
function getColorPalette(storyType) {
    const mapping = {
        'breaking-news': 'crypto',
        'premium-feature': 'crypto',
        'market-analysis': 'market',
        cybercrime: 'cybercrime',
        regulation: 'regulation',
        'ai-future': 'ai',
        'startup-vc': 'startup',
        afrofuturism: 'afrofuturism',
        'thumbnail-fast': 'crypto',
        'social-banner': 'crypto',
    };
    const key = mapping[storyType] || 'crypto';
    return exports.colorPalettes[key];
}
/**
 * Build color instruction string for prompt composition.
 */
function buildColorInstruction(palette) {
    const primary = palette.primary.join(', ');
    const secondary = palette.secondary.join(', ');
    return `color palette: ${palette.name} theme with primary tones ${primary} and secondary tones ${secondary}`;
}
exports.default = exports.colorPalettes;
//# sourceMappingURL=index.js.map