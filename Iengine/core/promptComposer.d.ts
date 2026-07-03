/**
 * Prompt Composer
 * Translates structured Scene Plans into optimized generation prompts.
 *
 * The LLM does NOT generate final prompts directly.
 * Instead: Scene Planner → Structured JSON → Prompt Composer
 * This gives consistency, auditability, optimization, and easier upgrades.
 */
import { ScenePlan } from '../types';
export declare class PromptComposer {
    /**
     * Compose a complete positive prompt from a scene plan.
     */
    composePositive(scene: ScenePlan): string;
    /**
     * Compose a complete negative prompt from the scene plan.
     */
    composeNegative(scene: ScenePlan): string;
    /**
     * Compose both positive and negative prompts.
     */
    compose(scene: ScenePlan): {
        positive: string;
        negative: string;
    };
    private buildQualityPrefix;
    private buildSceneDescription;
    private buildCameraInstruction;
    private buildEnvironmentInstruction;
    private buildSubjectInstruction;
    private buildLightingInstruction;
    private buildMotionInstruction;
    private buildSymbolismInstruction;
    private buildCompositionInstruction;
    private buildStyleSuffix;
}
export default PromptComposer;
//# sourceMappingURL=promptComposer.d.ts.map