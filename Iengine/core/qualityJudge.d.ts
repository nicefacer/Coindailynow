/**
 * AI Quality Judge
 * Automated quality scoring and validation for generated images.
 *
 * Pipeline:
 *   Generated Image → CLIP Scoring → Aesthetic Ranking
 *   → Artifact Detection → Composition Validation → Approval/Rejection
 */
import { QualityScores, ScenePlan } from '../types';
export declare class QualityJudge {
    private clipEndpoint;
    private aestheticEndpoint;
    constructor();
    /**
     * Run the full quality scoring pipeline on a generated image.
     */
    score(imageBuffer: Buffer, prompt: string, scene: ScenePlan): Promise<QualityScores>;
    /**
     * Quick validation (skip expensive CLIP call) for breaking-news speed.
     */
    quickScore(imageBuffer: Buffer): Promise<{
        approved: boolean;
        overall: number;
    }>;
    /**
     * Score semantic alignment between image and prompt using CLIP.
     */
    private scoreCLIP;
    /**
     * Score aesthetic quality using LAION aesthetic predictor.
     */
    private scoreAesthetic;
    /**
     * Technical validation: blur, anatomy, artifacts, etc.
     */
    private validateTechnical;
    /**
     * Editorial validation: emotional clarity, hierarchy, brand consistency.
     */
    private validateEditorial;
    private calculateArtifactScore;
    private calculateBrandAlignment;
    private calculateTechnicalQuality;
    private calculateOverall;
    private getRejectionsReasons;
    private heuristicClipScore;
    private heuristicAestheticScore;
}
export default QualityJudge;
//# sourceMappingURL=qualityJudge.d.ts.map