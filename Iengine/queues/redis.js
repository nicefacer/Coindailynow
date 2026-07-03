"use strict";
/**
 * Redis Connection Manager for Iengine
 * Shared Redis connection used by BullMQ queues and caching.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedisConnection = getRedisConnection;
exports.createRedisConnection = createRedisConnection;
exports.closeRedisConnection = closeRedisConnection;
const ioredis_1 = __importDefault(require("ioredis"));
let connection = null;
function getRedisConnection() {
    if (!connection) {
        connection = new ioredis_1.default({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD || undefined,
            db: parseInt(process.env.IENGINE_REDIS_DB || '2'),
            maxRetriesPerRequest: null,
            retryStrategy: (times) => Math.min(times * 100, 5000),
            lazyConnect: true,
        });
        connection.on('error', (err) => {
            console.error('[Iengine:Redis] Connection error:', err.message);
        });
        connection.on('connect', () => {
            console.log('[Iengine:Redis] Connected');
        });
    }
    return connection;
}
function createRedisConnection() {
    return new ioredis_1.default({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.IENGINE_REDIS_DB || '2'),
        maxRetriesPerRequest: null,
        retryStrategy: (times) => Math.min(times * 100, 5000),
    });
}
async function closeRedisConnection() {
    if (connection) {
        await connection.quit();
        connection = null;
    }
}
exports.default = getRedisConnection;
//# sourceMappingURL=redis.js.map