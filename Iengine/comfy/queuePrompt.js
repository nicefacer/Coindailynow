"use strict";
/**
 * ComfyUI Queue Prompt Client
 * Submits workflows to the ComfyUI API and retrieves results.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComfyUIClient = void 0;
class ComfyUIClient {
    baseUrl;
    clientId;
    constructor(baseUrl) {
        this.baseUrl = baseUrl || process.env.COMFYUI_URL || 'http://localhost:8188';
        this.clientId = `iengine_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    }
    /**
     * Submit a workflow to ComfyUI for execution.
     */
    async queuePrompt(workflow) {
        const response = await fetch(`${this.baseUrl}/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: workflow,
                client_id: this.clientId,
            }),
            signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) {
            const error = await response.text().catch(() => 'Unknown error');
            throw new Error(`ComfyUI prompt submission failed: ${response.status} — ${error}`);
        }
        return await response.json();
    }
    /**
     * Get the history/result of a completed prompt.
     */
    async getHistory(promptId) {
        const response = await fetch(`${this.baseUrl}/history/${promptId}`, {
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
            throw new Error(`Failed to get history for ${promptId}: ${response.status}`);
        }
        return await response.json();
    }
    /**
     * Get the generated image from ComfyUI output.
     */
    async getImage(filename, subfolder = '', type = 'output') {
        const params = new URLSearchParams({ filename, subfolder, type });
        const response = await fetch(`${this.baseUrl}/view?${params}`, {
            signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) {
            throw new Error(`Failed to get image ${filename}: ${response.status}`);
        }
        return Buffer.from(await response.arrayBuffer());
    }
    /**
     * Poll for completion of a prompt.
     */
    async waitForCompletion(promptId, timeoutMs = 120000, pollIntervalMs = 1000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            try {
                const history = await this.getHistory(promptId);
                const result = history[promptId];
                if (result) {
                    const outputs = result.outputs || {};
                    const images = [];
                    for (const nodeOutput of Object.values(outputs)) {
                        if (nodeOutput.images) {
                            images.push(...nodeOutput.images);
                        }
                    }
                    if (images.length > 0) {
                        return { images };
                    }
                    if (result.status?.status_str === 'error') {
                        throw new Error(`ComfyUI execution error: ${JSON.stringify(result.status)}`);
                    }
                }
            }
            catch (error) {
                if (error.message?.includes('execution error'))
                    throw error;
            }
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        }
        throw new Error(`ComfyUI prompt ${promptId} timed out after ${timeoutMs}ms`);
    }
    /**
     * Check ComfyUI server health.
     */
    async healthCheck() {
        try {
            const response = await fetch(`${this.baseUrl}/system_stats`, {
                signal: AbortSignal.timeout(5000),
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    /**
     * Get current queue status.
     */
    async getQueueStatus() {
        try {
            const response = await fetch(`${this.baseUrl}/queue`, {
                signal: AbortSignal.timeout(5000),
            });
            if (!response.ok)
                return { queue_running: 0, queue_pending: 0 };
            const data = await response.json();
            return {
                queue_running: data.queue_running?.length || 0,
                queue_pending: data.queue_pending?.length || 0,
            };
        }
        catch {
            return { queue_running: 0, queue_pending: 0 };
        }
    }
    /**
     * Get available checkpoints.
     */
    async getCheckpoints() {
        try {
            const response = await fetch(`${this.baseUrl}/object_info/CheckpointLoaderSimple`, {
                signal: AbortSignal.timeout(5000),
            });
            if (!response.ok)
                return [];
            const data = await response.json();
            return data.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
        }
        catch {
            return [];
        }
    }
    get id() {
        return this.clientId;
    }
}
exports.ComfyUIClient = ComfyUIClient;
exports.default = ComfyUIClient;
//# sourceMappingURL=queuePrompt.js.map