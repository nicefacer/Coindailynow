"use strict";
/**
 * Visual Bible — Regional Visual Identities
 * Defines location-specific visual languages for CoinDaily's coverage regions:
 * Africa, Latin America, Caribbean, and global markets.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.regionalProfiles = void 0;
exports.getRegionalProfile = getRegionalProfile;
exports.buildRegionalInstruction = buildRegionalInstruction;
exports.regionalProfiles = {
    'africa-west': {
        id: 'africa-west',
        name: 'West African Futurism',
        palette: ['warm gold', 'deep blue', 'neon amber', 'coral orange'],
        mood: ['digital renaissance', 'emerging power', 'urban innovation', 'youth energy'],
        architecture: [
            'Lagos smart-city skylines',
            'Accra tech hubs',
            'Abuja government districts with holographic overlays',
            'dense urban fintech corridors',
        ],
        lighting: ['humid cinematic glow', 'warm amber sunset', 'neon market lighting', 'tropical digital atmosphere'],
        symbols: [
            'mobile payment terminals',
            'M-Pesa kiosks',
            'youth traders with smartphones',
            'fintech street markets',
            'digital Naira tokens',
        ],
        camera_notes: [
            'street-level realism',
            'human-centric compositions',
            'movement-heavy scenes',
            'optimism-focused framing',
        ],
        environments: [
            'Lagos marina district at twilight',
            'Eko Atlantic smart-city',
            'Lekki tech corridor',
            'Obalende digital market',
            'Accra digital innovation center',
        ],
    },
    'africa-east': {
        id: 'africa-east',
        name: 'East African Futurism',
        palette: ['emerald green', 'savanna gold', 'digital blue', 'sunset orange'],
        mood: ['startup ecosystem energy', 'mobile-first innovation', 'green tech optimism'],
        architecture: [
            'Nairobi Silicon Savannah',
            'iHub innovation centers',
            'Konza Technopolis',
            'Kigali smart-city grids',
        ],
        lighting: ['golden savanna light', 'green tech glow', 'modern office illumination'],
        symbols: [
            'M-Pesa mobile money',
            'iHub coworking spaces',
            'savanna-tech fusion',
            'tea plantation data farms',
            'mobile banking revolution',
        ],
        camera_notes: ['wide establishing shots of tech campuses', 'close-ups of mobile innovation'],
        environments: [
            'Nairobi tech district',
            'Kigali innovation hub',
            'Dar es Salaam fintech corridor',
        ],
    },
    'africa-south': {
        id: 'africa-south',
        name: 'Southern African Tech',
        palette: ['ocean blue', 'gold', 'deep green', 'chrome silver'],
        mood: ['financial sophistication', 'mining-to-digital transition', 'institutional emergence'],
        architecture: [
            'Johannesburg financial district',
            'Cape Town tech hub',
            'modern African banking towers',
        ],
        lighting: ['clean modern institutional', 'ocean-reflected light', 'mining-gold illumination'],
        symbols: [
            'gold-to-digital conversion',
            'Rand digital tokens',
            'mining-tech fusion',
            'institutional trading floors',
        ],
        camera_notes: ['institutional perspective', 'panoramic city views', 'modern corporate angles'],
        environments: [
            'Sandton financial district',
            'Cape Town tech waterfront',
            'Johannesburg blockchain campus',
        ],
    },
    'latam-brazil': {
        id: 'latam-brazil',
        name: 'Brazilian Digital Fronteira',
        palette: ['tropical green', 'canary yellow', 'ocean blue', 'sunset orange', 'favela neon pink'],
        mood: [
            'carnival energy meets fintech',
            'tropical innovation',
            'democratic finance revolution',
            'emerging superpower ambition',
            'street-level digital transformation',
        ],
        architecture: [
            'São Paulo Faria Lima fintech corridor',
            'Rio de Janeiro tech waterfront with Cristo Redentor silhouette',
            'Florianópolis startup island',
            'Brasília modernist government tech district',
            'Recife Porto Digital innovation hub',
            'Belo Horizonte blockchain campus',
        ],
        lighting: [
            'tropical golden hour with digital overlay',
            'carnival neon against warm twilight',
            'Atlantic coast light with holographic reflections',
            'lush green ambient with tech glow',
            'favela neon nightscape',
        ],
        symbols: [
            'PIX instant payment holograms',
            'Real digital currency tokens',
            'Nubank purple fintech interfaces',
            'agricultural commodities tokenization',
            'Amazon rainforest data centers',
            'crypto mining in renewable energy zones',
            'street vendor mobile payment terminals',
            'samba-rhythm data flow patterns',
        ],
        camera_notes: [
            'wide panoramic establishing shots of São Paulo skyline',
            'street-level favela tech innovation',
            'aerial drone perspectives of coastal cities',
            'dynamic carnival-energy movement',
            'human-centric entrepreneurship framing',
        ],
        environments: [
            'São Paulo Faria Lima fintech towers at golden hour',
            'Rio de Janeiro waterfront with holographic skyline',
            'Florianópolis island tech campus',
            'Recife Porto Digital innovation district',
            'Brazilian agritech data farm in cerrado landscape',
            'favela rooftop with São Paulo skyline backdrop',
        ],
    },
    'latam-spanish': {
        id: 'latam-spanish',
        name: 'Latin American Crypto Frontier',
        palette: ['Aztec gold', 'volcanic red', 'Pacific blue', 'jungle emerald', 'desert terracotta'],
        mood: [
            'remittance revolution',
            'inflation-hedge urgency',
            'cross-border innovation',
            'grassroots crypto adoption',
            'El Salvador Bitcoin nation energy',
            'peso-to-crypto liberation',
        ],
        architecture: [
            'Mexico City CDMX fintech district',
            'Buenos Aires Puerto Madero tech hub',
            'Bogotá Rappi-era startup corridor',
            'El Salvador Bitcoin Beach infrastructure',
            'Santiago Chile financial center',
            'Medellín innovation valley (Ruta N)',
        ],
        lighting: [
            'Andean golden altitude light',
            'volcanic sunset dramatic glow',
            'Mexico City smog-filtered neon',
            'Argentine pampas golden hour',
            'Colombian tropical highland clarity',
        ],
        symbols: [
            'Bitcoin ATMs in street markets',
            'remittance corridor holographic bridges',
            'peso/bolivar hyperinflation charts dissolving into crypto',
            'El Salvador Chivo wallet kiosks',
            'Mercado Libre crypto integration',
            'cross-border payment streams',
            'stablecoin lifeline networks',
            'Argentine peso crisis → Bitcoin adoption flow',
            'Venezuelan diaspora crypto remittance paths',
        ],
        camera_notes: [
            'street-level adoption documentation',
            'contrasting old economy vs crypto future',
            'grassroots movement energy',
            'human stories of financial freedom',
            'dramatic altitude and landscape perspectives',
        ],
        environments: [
            'Mexico City CDMX Bitcoin meetup district',
            'El Salvador Bitcoin Beach at sunset',
            'Buenos Aires Puerto Madero fintech towers',
            'Bogotá startup corridor with Andes backdrop',
            'Medellín Ruta N innovation campus',
            'Santiago financial district with Andes mountains',
            'Lima crypto exchange district',
        ],
    },
    caribbean: {
        id: 'caribbean',
        name: 'Caribbean Digital Islands',
        palette: ['turquoise sea', 'coral pink', 'palm green', 'sunset gold', 'volcanic black'],
        mood: [
            'offshore digital innovation',
            'island-tech paradise',
            'regulatory haven energy',
            'tourism-to-crypto bridge',
            'small-nation big-vision ambition',
            'hurricane-resilient digital infrastructure',
        ],
        architecture: [
            'Bahamas SAND dollar digital currency centers',
            'Cayman Islands crypto fund headquarters',
            'Barbados fintech beach offices',
            'Jamaica digital exchange plazas',
            'Puerto Rico crypto hub (Condado corridor)',
            'Trinidad energy-to-crypto facilities',
        ],
        lighting: [
            'Caribbean turquoise water reflections',
            'tropical sunset with digital particle overlay',
            'palm-shadow dappled tech glow',
            'coral reef bioluminescent data aesthetics',
            'hurricane-eye dramatic lighting',
        ],
        symbols: [
            'CBDC sand dollar tokens',
            'island-to-island crypto bridges',
            'offshore digital vaults',
            'coral reef-shaped blockchain networks',
            'palm-tree satellite uplink stations',
            'beach-side crypto ATMs',
            'hurricane-proof data centers',
            'reggae-rhythm transaction flows',
            'rum barrel tokenization',
        ],
        camera_notes: [
            'aerial island-chain perspectives',
            'beach-level tech innovation shots',
            'underwater-to-surface data metaphors',
            'paradise-meets-technology contrast',
            'small-scale intimate innovation framing',
        ],
        environments: [
            'Nassau Bahamas digital currency center',
            'Cayman Islands fund management towers',
            'Puerto Rico Condado crypto corridor at sunset',
            'Barbados fintech beach campus',
            'Jamaica Kingston digital exchange plaza',
            'Trinidad Port of Spain energy-crypto facility',
            'Caribbean island chain with holographic data bridges',
        ],
    },
    global: {
        id: 'global',
        name: 'Global Default',
        palette: ['neon cyan', 'electric purple', 'gold', 'dark navy'],
        mood: ['technological advancement', 'market dynamics', 'digital frontier'],
        architecture: ['futuristic trading floors', 'holographic data centers', 'cyberpunk metropolis'],
        lighting: ['neon volumetric glow', 'holographic ambience', 'cinematic depth lighting'],
        symbols: [
            'holographic crypto coins',
            'blockchain data streams',
            'global financial networks',
        ],
        camera_notes: ['cinematic wide-angle', 'dynamic low-angle power shots'],
        environments: [
            'futuristic trading floor',
            'global financial command center',
            'digital asset vault',
        ],
    },
    'middle-east': {
        id: 'middle-east',
        name: 'Middle East Financial Hub',
        palette: ['desert gold', 'royal blue', 'white marble', 'emerald'],
        mood: ['sovereign wealth', 'luxury innovation', 'desert-tech contrast'],
        architecture: [
            'Dubai financial towers',
            'Abu Dhabi sovereign wealth centers',
            'futuristic desert metropolis',
        ],
        lighting: ['desert sun with tech overlay', 'gold ambient', 'clean luxury illumination'],
        symbols: [
            'sovereign wealth funds',
            'desert-tech oasis',
            'gold-backed digital assets',
            'luxury fintech terminals',
        ],
        camera_notes: ['grand architectural perspective', 'luxury-tech fusion angles'],
        environments: ['Dubai International Financial Centre', 'Abu Dhabi Global Market'],
    },
    asia: {
        id: 'asia',
        name: 'Asian Tech Markets',
        palette: ['red', 'gold', 'neon pink', 'deep black'],
        mood: ['high-frequency trading', 'tech density', 'market velocity'],
        architecture: [
            'Tokyo financial district',
            'Singapore fintech hub',
            'Hong Kong trading towers',
        ],
        lighting: ['dense neon urban', 'high-contrast tech glow', 'rapid market illumination'],
        symbols: [
            'high-frequency trading terminals',
            'dense market data walls',
            'Asian exchange floors',
        ],
        camera_notes: ['tight urban framing', 'high-density compositions'],
        environments: ['Tokyo Kabutocho', 'Singapore CBD', 'Hong Kong Central'],
    },
};
/**
 * Get regional profile by identifier or region detection.
 */
function getRegionalProfile(region) {
    if (!region)
        return exports.regionalProfiles['global'];
    const lower = region.toLowerCase();
    if (lower.includes('lagos') || lower.includes('nigeria') || lower.includes('ghana') || lower.includes('west africa')) {
        return exports.regionalProfiles['africa-west'];
    }
    if (lower.includes('nairobi') || lower.includes('kenya') || lower.includes('rwanda') || lower.includes('east africa')) {
        return exports.regionalProfiles['africa-east'];
    }
    if (lower.includes('johannesburg') || lower.includes('south africa') || lower.includes('cape town')) {
        return exports.regionalProfiles['africa-south'];
    }
    if (lower.includes('brazil') || lower.includes('são paulo') || lower.includes('sao paulo') || lower.includes('rio de janeiro') || lower.includes('brazilian') || lower.includes('pix') || lower.includes('nubank')) {
        return exports.regionalProfiles['latam-brazil'];
    }
    if (lower.includes('mexico') || lower.includes('argentina') || lower.includes('colombia') || lower.includes('el salvador') || lower.includes('venezuela') || lower.includes('chile') || lower.includes('peru') || lower.includes('bogota') || lower.includes('buenos aires') || lower.includes('cdmx') || lower.includes('medellín') || lower.includes('medellin') || lower.includes('latin america') || lower.includes('latam')) {
        return exports.regionalProfiles['latam-spanish'];
    }
    if (lower.includes('caribbean') || lower.includes('bahamas') || lower.includes('cayman') || lower.includes('jamaica') || lower.includes('barbados') || lower.includes('puerto rico') || lower.includes('trinidad') || lower.includes('sand dollar') || lower.includes('haiti') || lower.includes('dominican')) {
        return exports.regionalProfiles['caribbean'];
    }
    if (lower.includes('dubai') || lower.includes('abu dhabi') || lower.includes('middle east') || lower.includes('saudi')) {
        return exports.regionalProfiles['middle-east'];
    }
    if (lower.includes('tokyo') || lower.includes('singapore') || lower.includes('hong kong') || lower.includes('asia')) {
        return exports.regionalProfiles['asia'];
    }
    if (lower.includes('africa')) {
        return exports.regionalProfiles['africa-west'];
    }
    return exports.regionalProfiles['global'];
}
/**
 * Build regional environment instruction for prompt.
 */
function buildRegionalInstruction(profile) {
    const env = profile.environments[Math.floor(Math.random() * profile.environments.length)];
    const mood = profile.mood[Math.floor(Math.random() * profile.mood.length)];
    const lighting = profile.lighting[Math.floor(Math.random() * profile.lighting.length)];
    return `regional identity: ${profile.name}, environment: ${env}, mood: ${mood}, lighting atmosphere: ${lighting}`;
}
exports.default = exports.regionalProfiles;
//# sourceMappingURL=index.js.map