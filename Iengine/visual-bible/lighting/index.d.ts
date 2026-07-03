/**
 * Visual Bible — Lighting Rules
 * Defines lighting behavior per story domain.
 */
import { LightingDirective, StoryType } from '../../types';
export declare const lightingRules: Record<string, {
    description: string;
    directives: string[];
    avoid: string[];
}>;
export declare function getLightingDirective(storyType: StoryType): LightingDirective;
export default lightingRules;
//# sourceMappingURL=index.d.ts.map