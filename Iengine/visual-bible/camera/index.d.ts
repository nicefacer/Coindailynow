/**
 * Visual Bible — Camera Rules
 * Defines cinematic camera behavior per story domain.
 */
import { VisualBibleRule, CameraDirective, StoryType } from '../../types';
export declare const cameraRules: Record<string, VisualBibleRule>;
/**
 * Get camera directive based on story type and narrative.
 */
export declare function getCameraDirective(storyType: StoryType, narrative: string): CameraDirective;
export default cameraRules;
//# sourceMappingURL=index.d.ts.map