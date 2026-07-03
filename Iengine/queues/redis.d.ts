/**
 * Redis Connection Manager for Iengine
 * Shared Redis connection used by BullMQ queues and caching.
 */
import Redis from 'ioredis';
export declare function getRedisConnection(): Redis;
export declare function createRedisConnection(): Redis;
export declare function closeRedisConnection(): Promise<void>;
export default getRedisConnection;
//# sourceMappingURL=redis.d.ts.map