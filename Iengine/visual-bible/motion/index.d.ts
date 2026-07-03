/**
 * Visual Bible — Motion Rules
 * Defines motion and movement behavior per story domain.
 */
import { MotionDirective, StoryType } from '../../types';
export declare const motionRules: Record<string, {
    description: string;
    directives: string[];
    intensity: MotionDirective['intensity'];
}>;
export declare function getMotionDirective(storyType: StoryType): MotionDirective;
export default motionRules;
//# sourceMappingURL=index.d.ts.map