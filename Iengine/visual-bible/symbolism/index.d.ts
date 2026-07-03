/**
 * Visual Bible — Symbolism Engine
 * Maintains symbolic consistency across editorial domains.
 */
import { SymbolSet, StoryType } from '../../types';
export declare const symbolSets: Record<string, SymbolSet>;
/**
 * Get symbols relevant to a story type.
 */
export declare function getSymbols(storyType: StoryType, limit?: number): string[];
/**
 * Get context environments for symbols.
 */
export declare function getSymbolContexts(storyType: StoryType): string[];
export default symbolSets;
//# sourceMappingURL=index.d.ts.map