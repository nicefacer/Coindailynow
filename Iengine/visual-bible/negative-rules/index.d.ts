/**
 * Visual Bible — Negative Rules
 * Universal suppression rules to prevent quality degradation.
 */
export declare const universalNegatives: string[];
export declare const domainNegatives: Record<string, string[]>;
/**
 * Build the full negative prompt string for a given domain.
 */
export declare function buildNegativePrompt(domain: string): string;
/**
 * Get domain key from story type.
 */
export declare function getDomainFromStoryType(storyType: string): string;
declare const _default: {
    universalNegatives: string[];
    domainNegatives: Record<string, string[]>;
    buildNegativePrompt: typeof buildNegativePrompt;
};
export default _default;
//# sourceMappingURL=index.d.ts.map