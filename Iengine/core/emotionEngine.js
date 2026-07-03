"use strict";
/**
 * Emotion Intelligence Engine
 * Converts narrative analysis into emotional framing for visual direction.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmotionEngine = void 0;
// ─── Emotion Mappings ────────────────────────────────────────────────────────
const EMOTION_MAP = {
    euphoria: {
        primary: 'euphoric triumph',
        visual_mood: 'explosive golden energy with ascending motion',
        color_temperature: 'warm',
    },
    excitement: {
        primary: 'electric excitement',
        visual_mood: 'dynamic neon energy with forward momentum',
        color_temperature: 'warm',
    },
    optimism: {
        primary: 'confident optimism',
        visual_mood: 'warm ascending glow with expanding horizon',
        color_temperature: 'warm',
    },
    panic: {
        primary: 'market panic',
        visual_mood: 'fragmented chaos with descending volatility',
        color_temperature: 'cool',
    },
    fear: {
        primary: 'fearful uncertainty',
        visual_mood: 'dark tension with contracting atmosphere',
        color_temperature: 'cool',
    },
    uncertainty: {
        primary: 'cautious uncertainty',
        visual_mood: 'suspended tension with unclear direction',
        color_temperature: 'neutral',
    },
    anticipation: {
        primary: 'tense anticipation',
        visual_mood: 'building pressure with countdown energy',
        color_temperature: 'mixed',
    },
    stability: {
        primary: 'measured stability',
        visual_mood: 'balanced equilibrium with institutional calm',
        color_temperature: 'neutral',
    },
    'measured observation': {
        primary: 'analytical observation',
        visual_mood: 'data-driven clarity with professional neutrality',
        color_temperature: 'cool',
    },
};
const STORY_TYPE_EMOTIONS = {
    'breaking-news': { default_emotion: 'urgency and impact', intensity_modifier: 1.3 },
    'premium-feature': { default_emotion: 'editorial depth', intensity_modifier: 1.0 },
    'market-analysis': { default_emotion: 'analytical precision', intensity_modifier: 0.8 },
    cybercrime: { default_emotion: 'dark infiltration threat', intensity_modifier: 1.1 },
    regulation: { default_emotion: 'institutional authority', intensity_modifier: 0.9 },
    'ai-future': { default_emotion: 'synthetic transcendence', intensity_modifier: 1.0 },
    'startup-vc': { default_emotion: 'innovative energy', intensity_modifier: 0.9 },
    afrofuturism: { default_emotion: 'emergent optimism', intensity_modifier: 1.0 },
    'thumbnail-fast': { default_emotion: 'instant emotional clarity', intensity_modifier: 1.2 },
    'social-banner': { default_emotion: 'shareable impact', intensity_modifier: 1.1 },
};
// ─── Core Engine ─────────────────────────────────────────────────────────────
class EmotionEngine {
    /**
     * Derive emotional direction from narrative analysis.
     */
    analyze(narrative) {
        const emotionData = EMOTION_MAP[narrative.market_emotion] || EMOTION_MAP['measured observation'];
        const storyModifier = STORY_TYPE_EMOTIONS[narrative.story_type] || STORY_TYPE_EMOTIONS['premium-feature'];
        const baseIntensity = this.calculateIntensity(narrative);
        const modifiedIntensity = Math.min(baseIntensity * storyModifier.intensity_modifier, 1);
        const secondaryEmotion = this.deriveSecondaryEmotion(narrative);
        const valence = this.determineValence(narrative.sentiment, narrative.market_emotion);
        return {
            primary_emotion: emotionData.primary,
            secondary_emotion: secondaryEmotion,
            intensity: modifiedIntensity,
            valence,
            visual_mood: emotionData.visual_mood,
            color_temperature: emotionData.color_temperature,
        };
    }
    /**
     * Build emotion instruction string for prompt composition.
     */
    buildEmotionInstruction(emotion) {
        const parts = [];
        parts.push(`emotional tone: ${emotion.primary_emotion}`);
        if (emotion.secondary_emotion) {
            parts.push(`with undertones of ${emotion.secondary_emotion}`);
        }
        parts.push(`visual mood: ${emotion.visual_mood}`);
        parts.push(`intensity: ${(emotion.intensity * 10).toFixed(1)}/10`);
        parts.push(`color temperature: ${emotion.color_temperature}`);
        return parts.join(', ');
    }
    calculateIntensity(narrative) {
        let intensity = 0.5;
        switch (narrative.urgency) {
            case 'critical':
                intensity = 0.95;
                break;
            case 'high':
                intensity = 0.8;
                break;
            case 'medium':
                intensity = 0.6;
                break;
            case 'low':
                intensity = 0.4;
                break;
        }
        if (narrative.geopolitical_tension > 0.5) {
            intensity = Math.min(intensity + 0.15, 1);
        }
        if (narrative.sentiment === 'bullish' || narrative.sentiment === 'bearish') {
            intensity = Math.min(intensity + 0.1, 1);
        }
        return intensity;
    }
    deriveSecondaryEmotion(narrative) {
        if (narrative.symbolic_archetypes.includes('institutional dominance')) {
            return 'institutional weight and power';
        }
        if (narrative.symbolic_archetypes.includes('security crisis')) {
            return 'vulnerability and exposure';
        }
        if (narrative.symbolic_archetypes.includes('african emergence')) {
            return 'cultural pride and innovation';
        }
        if (narrative.symbolic_archetypes.includes('latam crypto adoption')) {
            return 'financial liberation and grassroots resilience';
        }
        if (narrative.symbolic_archetypes.includes('caribbean digital islands')) {
            return 'island-scale ambition and digital sovereignty';
        }
        if (narrative.symbolic_archetypes.includes('ai convergence')) {
            return 'technological wonder and caution';
        }
        if (narrative.geopolitical_tension > 0.3) {
            return 'geopolitical unease';
        }
        return undefined;
    }
    determineValence(sentiment, marketEmotion) {
        if (['euphoria', 'excitement', 'optimism'].includes(marketEmotion))
            return 'positive';
        if (['panic', 'fear'].includes(marketEmotion))
            return 'negative';
        if (sentiment === 'mixed')
            return 'mixed';
        return 'neutral';
    }
}
exports.EmotionEngine = EmotionEngine;
exports.default = EmotionEngine;
//# sourceMappingURL=emotionEngine.js.map