/**
 * CDN / Object Storage Manager
 * Handles image upload, optimization, and CDN distribution.
 * Integrates with existing Backblaze B2 / Cloudflare R2 infrastructure.
 */
import { ImageVariant } from '../types';
export interface CDNUploadResult {
    original_url: string;
    optimized_url?: string;
    webp_url?: string;
    avif_url?: string;
    thumbnail_url?: string;
    placeholder_base64?: string;
}
export interface CDNConfig {
    provider: 'backblaze-b2' | 'cloudflare-r2' | 's3' | 'local';
    bucket: string;
    region?: string;
    endpoint?: string;
    publicUrl: string;
    accessKeyId?: string;
    secretAccessKey?: string;
}
export declare class CDNManager {
    private config;
    private backendUrl;
    private serviceToken;
    constructor(config?: Partial<CDNConfig>);
    /**
     * Upload an image buffer through the backend media API.
     */
    upload(imageBuffer: Buffer, filename: string, contentType?: string): Promise<CDNUploadResult>;
    /**
     * Upload with full optimization: WebP, AVIF, thumbnail, placeholder.
     */
    uploadWithOptimization(imageBuffer: Buffer, filename: string): Promise<CDNUploadResult>;
    /**
     * Generate all platform variants from a source image.
     */
    generateVariants(imageBuffer: Buffer, baseFilename: string, sizes: Array<{
        name: string;
        width: number;
        height: number;
    }>): Promise<ImageVariant[]>;
    private normalizeUrl;
}
export default CDNManager;
//# sourceMappingURL=cdnManager.d.ts.map