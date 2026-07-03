"use strict";
/**
 * Prompt Composer
 * Translates structured Scene Plans into optimized generation prompts.
 *
 * The LLM does NOT generate final prompts directly.
 * Instead: Scene Planner → Structured JSON → Prompt Composer
 * This gives consistency, auditability, optimization, and easier upgrades.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptComposer = void 0;
const color_1 = require("../visual-bible/color");
const negative_rules_1 = require("../visual-bible/negative-rules");
const regional_1 = require("../visual-bible/regional");
class PromptComposer {
    /**
     * Compose a complete positive prompt from a scene plan.
     */
    composePositive(scene) {
        const parts = [];
        parts.push(this.buildQualityPrefix(scene.story_type));
        parts.push(this.buildSceneDescription(scene));
        parts.push(this.buildCameraInstruction(scene));
        parts.push(this.buildEnvironmentInstruction(scene));
        parts.push(this.buildSubjectInstruction(scene));
        parts.push(this.buildLightingInstruction(scene));
        parts.push(this.buildMotionInstruction(scene));
        parts.push(this.buildSymbolismInstruction(scene));
        parts.push(this.buildCompositionInstruction(scene));
        const palette = (0, color_1.getColorPalette)(scene.story_type);
        parts.push((0, color_1.buildColorInstruction)(palette));
        if (scene.regional_profile !== 'global') {
            const regional = (0, regional_1.getRegionalProfile)(scene.regional_profile);
            parts.push((0, regional_1.buildRegionalInstruction)(regional));
        }
        parts.push(this.buildStyleSuffix(scene));
        return parts
            .filter(p => p.length > 0)
            .join(', ');
    }
    /**
     * Compose a complete negative prompt from the scene plan.
     */
    composeNegative(scene) {
        const domain = (0, negative_rules_1.getDomainFromStoryType)(scene.story_type);
        return (0, negative_rules_1.buildNegativePrompt)(domain);
    }
    /**
     * Compose both positive and negative prompts.
     */
    compose(scene) {
        return {
            positive: this.composePositive(scene),
            negative: this.composeNegative(scene),
        };
    }
    buildQualityPrefix(storyType) {
        const premiumTypes = ['premium-feature', 'afrofuturism', 'ai-future'];
        if (premiumTypes.includes(storyType)) {
            return 'masterpiece, best quality, ultra detailed, 8k resolution, professional photography, cinematic composition';
        }
        if (storyType === 'thumbnail-fast') {
            return 'high contrast, bold composition, clear focal point, professional quality';
        }
        return 'best quality, detailed, professional, cinematic lighting, 4k resolution';
    }
    buildSceneDescription(scene) {
        return `scene depicting ${scene.narrative}, emotional atmosphere of ${scene.emotion}`;
    }
    buildCameraInstruction(scene) {
        const cam = scene.camera;
        const parts = [
            `camera angle: ${cam.angle}`,
            `lens: ${cam.lens}`,
        ];
        if (cam.movement !== 'static') {
            parts.push(`implied movement: ${cam.movement}`);
        }
        parts.push(`depth of field: ${cam.depth}`);
        return parts.join(', ');
    }
    buildEnvironmentInstruction(scene) {
        const env = scene.environment;
        return `environment: ${env.location}, time: ${env.time}, atmosphere: ${env.weather}, architecture style: ${env.architecture}`;
    }
    buildSubjectInstruction(scene) {
        const primary = scene.subjects.filter(s => s.importance === 'primary');
        const secondary = scene.subjects.filter(s => s.importance === 'secondary');
        const parts = [];
        if (primary.length > 0) {
            parts.push(`primary focal subject: ${primary.map(s => s.type).join(' and ')}`);
        }
        if (secondary.length > 0) {
            parts.push(`secondary elements: ${secondary.map(s => s.type).join(', ')}`);
        }
        return parts.join(', ');
    }
    buildLightingInstruction(scene) {
        const lit = scene.lighting;
        const parts = [`lighting: ${lit.primary}`];
        if (lit.secondary)
            parts.push(lit.secondary);
        if (lit.volumetric)
            parts.push('volumetric god rays');
        if (lit.ambient)
            parts.push(`ambient: ${lit.ambient}`);
        return parts.join(', ');
    }
    buildMotionInstruction(scene) {
        const mot = scene.motion;
        if (mot.intensity === 'subtle') {
            return `subtle motion suggestion: ${mot.type}`;
        }
        return `dynamic motion: ${mot.type}, ${mot.intensity} intensity${mot.direction ? ', direction: ' + mot.direction : ''}`;
    }
    buildSymbolismInstruction(scene) {
        if (scene.symbolism.length === 0)
            return '';
        return `symbolic elements: ${scene.symbolism.join(', ')}`;
    }
    buildCompositionInstruction(scene) {
        const comp = scene.composition;
        return `composition: ${comp.rule}, focal point: ${comp.focal_point}, balance: ${comp.balance}${comp.depth_layers ? ', depth layers: ' + comp.depth_layers : ''}`;
    }
    buildStyleSuffix(scene) {
        const styleMap = {
            'crypto-core': 'cyberpunk crypto aesthetic, neon blockchain art',
            'tradfi-institutional': 'institutional financial aesthetic, clean corporate design',
            'ai-futurism': 'synthetic intelligence aesthetic, neural art style',
            'cybercrime-dark': 'dark cyber infiltration aesthetic, surveillance noir',
            'regulation-authority': 'institutional authority aesthetic, formal governance design',
            afrofuturism: 'African futurism aesthetic, pan-African tech innovation art',
            'latam-frontier': 'Latin American crypto frontier aesthetic, tropical fintech revolution, remittance innovation art',
            'caribbean-digital': 'Caribbean digital island aesthetic, turquoise offshore innovation, CBDC paradise art',
            'crypto-tradfi-fusion': 'institutional crypto aesthetic, finance meets blockchain',
            'startup-energy': 'innovation startup aesthetic, dynamic entrepreneurship art',
        };
        return styleMap[scene.style_profile] || 'professional editorial aesthetic';
    }
}
exports.PromptComposer = PromptComposer;
exports.default = PromptComposer;
//# sourceMappingURL=promptComposer.js.map