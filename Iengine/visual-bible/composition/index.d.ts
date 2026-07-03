/**
 * Visual Bible — Composition Rules
 * Defines framing and compositional structure per story domain.
 */
import { CompositionDirective, StoryType } from '../../types';
export declare const compositionRules: Record<string, {
    description: string;
    principles: string[];
    avoid: string[];
}>;
export declare function getCompositionDirective(storyType: StoryType): CompositionDirective;
export default compositionRules;
//# sourceMappingURL=index.d.ts.map