/**
 * Thumbnail Intelligence Engine
 * CTR Optimization — hero images and thumbnails are NOT the same thing.
 *
 * Handles:
 *  - Saliency-based focal point extraction
 *  - Platform-specific crop generation
 *  - Contrast and emotional clarity optimization
 *  - Mobile visibility validation
 */
import { ThumbnailPlan, ScenePlan } from '../types';
export declare class ThumbnailIntelligence {
    /**
     * Generate a thumbnail plan from a scene plan.
     */
    plan(scene: ScenePlan): ThumbnailPlan;
    /**
     * Build thumbnail-specific prompt modifications.
     */
    buildThumbnailPromptOverrides(plan: ThumbnailPlan): {
        prompt_suffix: string;
        composition_override: string;
    };
    /**
     * Validate that a generated thumbnail meets quality standards.
     */
    validateThumbnail(imageBuffer: Buffer, plan: ThumbnailPlan): Promise<{
        valid: boolean;
        issues: string[];
    }>;
    private extractFocalSubject;
    private extractThumbnailEmotion;
    private determineCropFocus;
    private determineContrast;
    private assessMobileVisibility;
    private selectPlatformVariants;
}
export default ThumbnailIntelligence;
//# sourceMappingURL=thumbnailIntelligence.d.ts.map