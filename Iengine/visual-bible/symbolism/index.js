"use strict";
/**
 * Visual Bible — Symbolism Engine
 * Maintains symbolic consistency across editorial domains.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.symbolSets = void 0;
exports.getSymbols = getSymbols;
exports.getSymbolContexts = getSymbolContexts;
exports.symbolSets = {
    crypto: {
        category: 'crypto',
        symbols: [
            'holographic coins',
            'blockchain streams',
            'decentralized crowds',
            'glowing validators',
            'digital freedom motifs',
            'floating transaction chains',
            'mining rigs with energy fields',
            'crypto wallet holograms',
        ],
        contexts: [
            'digital marketplaces',
            'decentralized networks',
            'peer-to-peer exchanges',
            'mining operations',
        ],
    },
    ai: {
        category: 'ai',
        symbols: [
            'neural lattices',
            'synthetic eyes',
            'machine consciousness',
            'intelligence spheres',
            'data neural networks',
            'quantum processing cores',
            'algorithmic patterns',
            'digital brain structures',
        ],
        contexts: [
            'research laboratories',
            'data centers',
            'neural processing environments',
            'abstract cognitive spaces',
        ],
    },
    regulation: {
        category: 'regulation',
        symbols: [
            'digital courtrooms',
            'surveillance grids',
            'cyber legislation',
            'institutional barriers',
            'government seals holographic',
            'compliance checkpoints',
            'regulatory frameworks',
            'legal document holograms',
        ],
        contexts: [
            'government buildings',
            'regulatory chambers',
            'compliance offices',
            'institutional corridors',
        ],
    },
    afrofuturism: {
        category: 'afrofuturism',
        symbols: [
            'smart-city Lagos skylines',
            'fintech kiosks',
            'mobile finance',
            'digital markets',
            'youth innovation hubs',
            'mobile payment terminals',
            'pan-African data networks',
            'solar-tech infrastructure',
        ],
        contexts: [
            'Lagos fintech districts',
            'Nairobi startup ecosystems',
            'African smart cities',
            'mobile money corridors',
            'digital marketplace streets',
        ],
    },
    cybercrime: {
        category: 'cybercrime',
        symbols: [
            'corrupted interfaces',
            'glitch artifacts',
            'surveillance terminals',
            'dark web portals',
            'hacked data streams',
            'digital evidence trails',
            'anonymous masks',
            'encrypted communication nodes',
        ],
        contexts: [
            'dark server rooms',
            'surveillance centers',
            'compromised networks',
            'underground digital bazaars',
        ],
    },
    latam: {
        category: 'latam',
        symbols: [
            'PIX instant payment holograms',
            'Bitcoin ATMs in street markets',
            'remittance corridor holographic bridges',
            'El Salvador Chivo wallet kiosks',
            'peso hyperinflation charts dissolving into crypto',
            'cross-border payment streams',
            'stablecoin lifeline networks',
            'Nubank fintech interfaces',
        ],
        contexts: [
            'São Paulo Faria Lima fintech corridor',
            'El Salvador Bitcoin Beach',
            'Buenos Aires crypto exchange district',
            'Mexico City CDMX fintech hub',
            'Medellín innovation valley',
        ],
    },
    caribbean: {
        category: 'caribbean',
        symbols: [
            'CBDC sand dollar tokens',
            'island-to-island crypto bridges',
            'offshore digital vaults',
            'coral reef blockchain networks',
            'palm-tree satellite uplinks',
            'beach-side crypto ATMs',
            'hurricane-proof data centers',
        ],
        contexts: [
            'Nassau digital currency center',
            'Cayman Islands fund towers',
            'Puerto Rico crypto corridor',
            'Barbados fintech beach campus',
            'Caribbean data bridge archipelago',
        ],
    },
    tradfi: {
        category: 'tradfi',
        symbols: [
            'institutional towers',
            'financial dashboards',
            'trading floor terminals',
            'global market maps',
            'bond yield curves',
            'institutional portfolios',
            'executive boardrooms',
            'vault architectures',
        ],
        contexts: [
            'Wall Street corridors',
            'central bank interiors',
            'institutional trading floors',
            'financial district skylines',
        ],
    },
    market: {
        category: 'market-analysis',
        symbols: [
            'candlestick charts holographic',
            'volume bars',
            'trend lines',
            'order book depth visualizations',
            'price action waves',
            'market sentiment gauges',
            'liquidation cascades',
            'whale movement indicators',
        ],
        contexts: [
            'trading dashboards',
            'analytics rooms',
            'market monitoring centers',
            'data visualization spaces',
        ],
    },
};
/**
 * Get symbols relevant to a story type.
 */
function getSymbols(storyType, limit = 4) {
    const mapping = {
        'breaking-news': 'crypto',
        'premium-feature': 'crypto',
        'market-analysis': 'market',
        cybercrime: 'cybercrime',
        regulation: 'regulation',
        'ai-future': 'ai',
        'startup-vc': 'crypto',
        afrofuturism: 'afrofuturism',
        'thumbnail-fast': 'crypto',
        'social-banner': 'crypto',
    };
    const key = mapping[storyType] || 'crypto';
    const set = exports.symbolSets[key];
    if (!set)
        return [];
    return set.symbols.slice(0, limit);
}
/**
 * Get context environments for symbols.
 */
function getSymbolContexts(storyType) {
    const mapping = {
        'breaking-news': 'crypto',
        'premium-feature': 'crypto',
        'market-analysis': 'market',
        cybercrime: 'cybercrime',
        regulation: 'regulation',
        'ai-future': 'ai',
        'startup-vc': 'crypto',
        afrofuturism: 'afrofuturism',
        'thumbnail-fast': 'crypto',
        'social-banner': 'crypto',
    };
    const key = mapping[storyType] || 'crypto';
    return exports.symbolSets[key]?.contexts || [];
}
exports.default = exports.symbolSets;
//# sourceMappingURL=index.js.map