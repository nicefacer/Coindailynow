/**
 * ComfyUI JSON Injector
 * Dynamic workflow mutation engine.
 * Transforms scene data into executable ComfyUI workflows
 * by injecting prompts, parameters, seeds, and routing.
 */
import { WorkflowConfig, ComfyUIWorkflow } from '../types';
interface InjectionParams {
    workflowPath?: string;
    workflowJson?: ComfyUIWorkflow;
    positivePrompt: string;
    negativePrompt: string;
    width: number;
    height: number;
    steps: number;
    cfg: number;
    seed?: number;
    sampler?: string;
    scheduler?: string;
    model?: string;
    loras?: string[];
    batchSize?: number;
}
export declare class WorkflowInjector {
    /**
     * Load a base workflow template and inject dynamic parameters.
     */
    inject(params: InjectionParams): ComfyUIWorkflow;
    /**
     * Build a workflow from a WorkflowConfig + prompts.
     */
    buildFromConfig(config: WorkflowConfig, positivePrompt: string, negativePrompt: string, seed?: number): ComfyUIWorkflow;
    private injectPrompts;
    private injectSampler;
    private injectDimensions;
    private injectModel;
    private injectLoras;
    private resolveWorkflowPath;
    /**
     * Default SDXL workflow when no template is found.
     */
    private getDefaultWorkflow;
}
export default WorkflowInjector;
//# sourceMappingURL=injectWorkflow.d.ts.map