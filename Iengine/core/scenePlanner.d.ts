/**
 * Scene Planner — The Cinematic Brain
 * Converts editorial meaning into cinematic scene structure.
 *
 * Core principle:
 *   headline → narrative abstraction → scene structure
 * NOT:
 *   headline → prompt
 */
import { ScenePlan, NarrativeAnalysis, EmotionAnalysis } from '../types';
export declare class ScenePlanner {
    private ollamaUrl;
    private model;
    constructor();
    /**
     * Plan a complete cinematic scene from narrative + emotion analysis.
     * Calls local self-hosted Ollama for semantic framing with a rule-based fallback.
     */
    plan(narrative: NarrativeAnalysis, emotion: EmotionAnalysis, region?: string, headline?: string): Promise<ScenePlan>;
    /**
     * Validate that the LLM response contains the complete required structure.
     */
    private validateScenePlan;
    /**
     * Rule-based scene planner (fallback/offline method).
     */
    private planRuleBased;
    private planCamera;
    private planEnvironment;
    private getAtmosphere;
    private planSubjects;
    private entityToVisualSubject;
    private planLighting;
    private planMotion;
    private planSymbolism;
    private planComposition;
    private selectStyleProfile;
    private buildNarrativeAbstraction;
}
export default ScenePlanner;
//# sourceMappingURL=scenePlanner.d.ts.map