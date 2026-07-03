/**
 * BullMQ Queue Definitions
 * Distributed GPU infrastructure queue management.
 *
 * Generation NEVER occurs synchronously.
 * API → BullMQ Queue → Redis → GPU Workers → Storage/CDN
 */
import { Queue, QueueEvents } from 'bullmq';
export declare const QUEUE_NAMES: {
    readonly BREAKING_PRIORITY: "iengine-breaking-priority";
    readonly PREMIUM_PRIORITY: "iengine-premium-priority";
    readonly STANDARD: "iengine-standard";
    readonly THUMBNAIL_FAST: "iengine-thumbnail-fast";
    readonly UPSCALE: "iengine-upscale";
    readonly QUALITY_CHECK: "iengine-quality-check";
    readonly RETRY_FAILED: "iengine-retry-failed";
    readonly DELIVERY: "iengine-delivery";
};
export declare const PRIORITIES: {
    readonly BREAKING: 1;
    readonly PREMIUM: 2;
    readonly STANDARD: 5;
    readonly BACKGROUND: 10;
};
export declare function getQueue(name: string): Queue;
export declare function getQueueEvents(name: string): QueueEvents;
export declare const breakingQueue: () => Queue<any, any, string, any, any, string>;
export declare const premiumQueue: () => Queue<any, any, string, any, any, string>;
export declare const standardQueue: () => Queue<any, any, string, any, any, string>;
export declare const thumbnailQueue: () => Queue<any, any, string, any, any, string>;
export declare const upscaleQueue: () => Queue<any, any, string, any, any, string>;
export declare const qualityCheckQueue: () => Queue<any, any, string, any, any, string>;
export declare const retryQueue: () => Queue<any, any, string, any, any, string>;
export declare const deliveryQueue: () => Queue<any, any, string, any, any, string>;
export interface AddJobOptions {
    priority?: number;
    delay?: number;
    jobId?: string;
}
/**
 * Add an image generation job to the appropriate queue.
 */
export declare function addGenerationJob(queueName: string, jobData: any, options?: AddJobOptions): Promise<string>;
/**
 * Get counts across all queues.
 */
export declare function getAllQueueCounts(): Promise<Record<string, any>>;
/**
 * Gracefully close all queues.
 */
export declare function closeAllQueues(): Promise<void>;
declare const _default: {
    QUEUE_NAMES: {
        readonly BREAKING_PRIORITY: "iengine-breaking-priority";
        readonly PREMIUM_PRIORITY: "iengine-premium-priority";
        readonly STANDARD: "iengine-standard";
        readonly THUMBNAIL_FAST: "iengine-thumbnail-fast";
        readonly UPSCALE: "iengine-upscale";
        readonly QUALITY_CHECK: "iengine-quality-check";
        readonly RETRY_FAILED: "iengine-retry-failed";
        readonly DELIVERY: "iengine-delivery";
    };
    PRIORITIES: {
        readonly BREAKING: 1;
        readonly PREMIUM: 2;
        readonly STANDARD: 5;
        readonly BACKGROUND: 10;
    };
    getQueue: typeof getQueue;
    addGenerationJob: typeof addGenerationJob;
    getAllQueueCounts: typeof getAllQueueCounts;
    closeAllQueues: typeof closeAllQueues;
};
export default _default;
//# sourceMappingURL=bullmq.d.ts.map