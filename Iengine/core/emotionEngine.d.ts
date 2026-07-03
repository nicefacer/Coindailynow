/**
 * Emotion Intelligence Engine
 * Converts narrative analysis into emotional framing for visual direction.
 */
import { EmotionAnalysis, NarrativeAnalysis } from '../types';
export declare class EmotionEngine {
    /**
     * Derive emotional direction from narrative analysis.
     */
    analyze(narrative: NarrativeAnalysis): EmotionAnalysis;
    /**
     * Build emotion instruction string for prompt composition.
     */
    buildEmotionInstruction(emotion: EmotionAnalysis): string;
    private calculateIntensity;
    private deriveSecondaryEmotion;
    private determineValence;
}
export default EmotionEngine;
//# sourceMappingURL=emotionEngine.d.ts.map