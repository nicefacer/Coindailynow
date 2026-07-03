"use strict";
/**
 * CDN / Object Storage Manager
 * Handles image upload, optimization, and CDN distribution.
 * Integrates with existing Backblaze B2 / Cloudflare R2 infrastructure.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CDNManager = void 0;
class CDNManager {
    config;
    backendUrl;
    serviceToken;
    constructor(config) {
        this.config = {
            provider: process.env.CDN_PROVIDER || 'backblaze-b2',
            bucket: process.env.CDN_BUCKET || 'coindaily-media',
            region: process.env.CDN_REGION || 'us-west-001',
            endpoint: process.env.CDN_ENDPOINT,
            publicUrl: process.env.CDN_URL || process.env.CFIS_PUBLIC_MEDIA_BASE || 'https://cdn.sygn.live',
            ...config,
        };
        this.backendUrl = process.env.BACKEND_API_URL || 'http://localhost:4000';
        this.serviceToken = process.env.IENGINE_SERVICE_TOKEN || process.env.AI_PIPELINE_SERVICE_TOKEN || '';
    }
    /**
     * Upload an image buffer through the backend media API.
     */
    async upload(imageBuffer, filename, contentType = 'image/png') {
        try {
            const base64 = imageBuffer.toString('base64');
            const dataUrl = `data:${contentType};base64,${base64}`;
            const response = await fetch(`${this.backendUrl}/api/media/upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.serviceToken ? { Authorization: `Bearer ${this.serviceToken}` } : {}),
                },
                body: JSON.stringify({
                    image: dataUrl,
                    prefix: 'iengine',
                    filename,
                }),
                signal: AbortSignal.timeout(60000),
            });
            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            const url = this.normalizeUrl(data.url || '');
            return { original_url: url };
        }
        catch (error) {
            console.error('[CDNManager] Upload failed:', error.message);
            return { original_url: '' };
        }
    }
    /**
     * Upload with full optimization: WebP, AVIF, thumbnail, placeholder.
     */
    async uploadWithOptimization(imageBuffer, filename) {
        const baseResult = await this.upload(imageBuffer, filename);
        try {
            const sharp = require('sharp');
            const webpBuffer = await sharp(imageBuffer)
                .webp({ quality: 85 })
                .toBuffer();
            const avifBuffer = await sharp(imageBuffer)
                .avif({ quality: 80 })
                .toBuffer();
            const thumbBuffer = await sharp(imageBuffer)
                .resize(400, 300, { fit: 'cover' })
                .jpeg({ quality: 75 })
                .toBuffer();
            const placeholderBuffer = await sharp(imageBuffer)
                .resize(20, 15, { fit: 'cover' })
                .blur(10)
                .jpeg({ quality: 50 })
                .toBuffer();
            const baseName = filename.replace(/\.[^.]+$/, '');
            const [webpResult, avifResult, thumbResult] = await Promise.allSettled([
                this.upload(webpBuffer, `${baseName}.webp`, 'image/webp'),
                this.upload(avifBuffer, `${baseName}.avif`, 'image/avif'),
                this.upload(thumbBuffer, `${baseName}_thumb.jpg`, 'image/jpeg'),
            ]);
            return {
                original_url: baseResult.original_url,
                webp_url: webpResult.status === 'fulfilled' ? webpResult.value.original_url : undefined,
                avif_url: avifResult.status === 'fulfilled' ? avifResult.value.original_url : undefined,
                thumbnail_url: thumbResult.status === 'fulfilled' ? thumbResult.value.original_url : undefined,
                placeholder_base64: `data:image/jpeg;base64,${placeholderBuffer.toString('base64')}`,
            };
        }
        catch {
            return baseResult;
        }
    }
    /**
     * Generate all platform variants from a source image.
     */
    async generateVariants(imageBuffer, baseFilename, sizes) {
        const variants = [];
        try {
            const sharp = require('sharp');
            for (const size of sizes) {
                const resized = await sharp(imageBuffer)
                    .resize(size.width, size.height, { fit: 'cover', position: 'attention' })
                    .jpeg({ quality: 85, progressive: true })
                    .toBuffer();
                const result = await this.upload(resized, `${baseFilename}_${size.name}.jpg`, 'image/jpeg');
                variants.push({
                    format: 'jpeg',
                    width: size.width,
                    height: size.height,
                    url: result.original_url,
                    size_bytes: resized.length,
                });
            }
        }
        catch (error) {
            console.error('[CDNManager] Variant generation failed:', error.message);
        }
        return variants;
    }
    normalizeUrl(url) {
        if (!url)
            return '';
        const publicBase = this.config.publicUrl.replace(/\/$/, '');
        try {
            const pathOnly = new URL(url).pathname;
            return `${publicBase}${pathOnly}`;
        }
        catch {
            return url;
        }
    }
}
exports.CDNManager = CDNManager;
exports.default = CDNManager;
//# sourceMappingURL=cdnManager.js.map