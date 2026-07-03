/**
 * Visual Bible — Story Type Definitions
 * Maps editorial story types to generation parameters.
 */
import { StoryType, WorkflowType } from '../../types';
export interface StoryTypeConfig {
    type: StoryType;
    description: string;
    workflow: WorkflowType;
    priority: number;
    sla_seconds: number;
    generation_params: {
        steps: number;
        cfg: number;
        width: number;
        height: number;
        model: string;
        sampler: string;
        scheduler: string;
    };
    use_controlnet: boolean;
    use_upscaler: boolean;
    use_ipadapter: boolean;
    keywords: string[];
}
export declare const storyTypeConfigs: Record<StoryType, StoryTypeConfig>;
/**
 * Detect story type from headline, tags, and category using keyword matching.
 */
export declare function detectStoryType(headline: string, category?: string, tags?: string[]): StoryType;
/**
 * Get story type config.
 */
export declare function getStoryTypeConfig(storyType: StoryType): StoryTypeConfig;
export default storyTypeConfigs;
//# sourceMappingURL=index.d.ts.map