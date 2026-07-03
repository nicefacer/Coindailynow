"use strict";
/**
 * BullMQ Queue Definitions
 * Distributed GPU infrastructure queue management.
 *
 * Generation NEVER occurs synchronously.
 * API → BullMQ Queue → Redis → GPU Workers → Storage/CDN
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliveryQueue = exports.retryQueue = exports.qualityCheckQueue = exports.upscaleQueue = exports.thumbnailQueue = exports.standardQueue = exports.premiumQueue = exports.breakingQueue = exports.PRIORITIES = exports.QUEUE_NAMES = void 0;
exports.getQueue = getQueue;
exports.getQueueEvents = getQueueEvents;
exports.addGenerationJob = addGenerationJob;
exports.getAllQueueCounts = getAllQueueCounts;
exports.closeAllQueues = closeAllQueues;
const bullmq_1 = require("bullmq");
const redis_1 = require("./redis");
// ─── Queue Names ─────────────────────────────────────────────────────────────
exports.QUEUE_NAMES = {
    BREAKING_PRIORITY: 'iengine-breaking-priority',
    PREMIUM_PRIORITY: 'iengine-premium-priority',
    STANDARD: 'iengine-standard',
    THUMBNAIL_FAST: 'iengine-thumbnail-fast',
    UPSCALE: 'iengine-upscale',
    QUALITY_CHECK: 'iengine-quality-check',
    RETRY_FAILED: 'iengine-retry-failed',
    DELIVERY: 'iengine-delivery',
};
// ─── Priority Values (lower = higher priority) ──────────────────────────────
exports.PRIORITIES = {
    BREAKING: 1,
    PREMIUM: 2,
    STANDARD: 5,
    BACKGROUND: 10,
};
// ─── Queue Factory ───────────────────────────────────────────────────────────
const queues = new Map();
const queueEvents = new Map();
function getQueue(name) {
    if (!queues.has(name)) {
        const connection = (0, redis_1.createRedisConnection)();
        const queue = new bullmq_1.Queue(name, {
            connection,
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000,
                },
                removeOnComplete: {
                    age: 3600,
                    count: 1000,
                },
                removeOnFail: {
                    age: 86400,
                    count: 5000,
                },
            },
        });
        queues.set(name, queue);
    }
    return queues.get(name);
}
function getQueueEvents(name) {
    if (!queueEvents.has(name)) {
        const connection = (0, redis_1.createRedisConnection)();
        const events = new bullmq_1.QueueEvents(name, { connection });
        queueEvents.set(name, events);
    }
    return queueEvents.get(name);
}
// ─── Convenience Accessors ───────────────────────────────────────────────────
const breakingQueue = () => getQueue(exports.QUEUE_NAMES.BREAKING_PRIORITY);
exports.breakingQueue = breakingQueue;
const premiumQueue = () => getQueue(exports.QUEUE_NAMES.PREMIUM_PRIORITY);
exports.premiumQueue = premiumQueue;
const standardQueue = () => getQueue(exports.QUEUE_NAMES.STANDARD);
exports.standardQueue = standardQueue;
const thumbnailQueue = () => getQueue(exports.QUEUE_NAMES.THUMBNAIL_FAST);
exports.thumbnailQueue = thumbnailQueue;
const upscaleQueue = () => getQueue(exports.QUEUE_NAMES.UPSCALE);
exports.upscaleQueue = upscaleQueue;
const qualityCheckQueue = () => getQueue(exports.QUEUE_NAMES.QUALITY_CHECK);
exports.qualityCheckQueue = qualityCheckQueue;
const retryQueue = () => getQueue(exports.QUEUE_NAMES.RETRY_FAILED);
exports.retryQueue = retryQueue;
const deliveryQueue = () => getQueue(exports.QUEUE_NAMES.DELIVERY);
exports.deliveryQueue = deliveryQueue;
/**
 * Add an image generation job to the appropriate queue.
 */
async function addGenerationJob(queueName, jobData, options) {
    const queue = getQueue(queueName);
    const job = await queue.add('generate', jobData, {
        priority: options?.priority,
        delay: options?.delay,
        jobId: options?.jobId,
    });
    return job.id;
}
/**
 * Get counts across all queues.
 */
async function getAllQueueCounts() {
    const counts = {};
    for (const [key, name] of Object.entries(exports.QUEUE_NAMES)) {
        try {
            const queue = getQueue(name);
            counts[key] = await queue.getJobCounts();
        }
        catch {
            counts[key] = { error: 'unavailable' };
        }
    }
    return counts;
}
/**
 * Gracefully close all queues.
 */
async function closeAllQueues() {
    const closePromises = [];
    for (const queue of queues.values()) {
        closePromises.push(queue.close());
    }
    for (const events of queueEvents.values()) {
        closePromises.push(events.close());
    }
    await Promise.allSettled(closePromises);
    queues.clear();
    queueEvents.clear();
}
exports.default = {
    QUEUE_NAMES: exports.QUEUE_NAMES,
    PRIORITIES: exports.PRIORITIES,
    getQueue,
    addGenerationJob,
    getAllQueueCounts,
    closeAllQueues,
};
//# sourceMappingURL=bullmq.js.map