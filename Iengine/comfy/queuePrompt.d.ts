/**
 * ComfyUI Queue Prompt Client
 * Submits workflows to the ComfyUI API and retrieves results.
 */
import { ComfyUIWorkflow, ComfyUIPromptResponse } from '../types';
export declare class ComfyUIClient {
    private baseUrl;
    private clientId;
    constructor(baseUrl?: string);
    /**
     * Submit a workflow to ComfyUI for execution.
     */
    queuePrompt(workflow: ComfyUIWorkflow): Promise<ComfyUIPromptResponse>;
    /**
     * Get the history/result of a completed prompt.
     */
    getHistory(promptId: string): Promise<any>;
    /**
     * Get the generated image from ComfyUI output.
     */
    getImage(filename: string, subfolder?: string, type?: string): Promise<Buffer>;
    /**
     * Poll for completion of a prompt.
     */
    waitForCompletion(promptId: string, timeoutMs?: number, pollIntervalMs?: number): Promise<{
        images: Array<{
            filename: string;
            subfolder: string;
            type: string;
        }>;
    }>;
    /**
     * Check ComfyUI server health.
     */
    healthCheck(): Promise<boolean>;
    /**
     * Get current queue status.
     */
    getQueueStatus(): Promise<{
        queue_running: number;
        queue_pending: number;
    }>;
    /**
     * Get available checkpoints.
     */
    getCheckpoints(): Promise<string[]>;
    get id(): string;
}
export default ComfyUIClient;
//# sourceMappingURL=queuePrompt.d.ts.map