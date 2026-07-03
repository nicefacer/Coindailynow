/**
 * Visual Bible — Color Governance
 * Defines strict color palettes per editorial domain.
 */
import { ColorPalette, StoryType } from '../../types';
export declare const colorPalettes: Record<string, ColorPalette>;
/**
 * Resolve color palette for a story type.
 */
export declare function getColorPalette(storyType: StoryType): ColorPalette;
/**
 * Build color instruction string for prompt composition.
 */
export declare function buildColorInstruction(palette: ColorPalette): string;
export default colorPalettes;
//# sourceMappingURL=index.d.ts.map