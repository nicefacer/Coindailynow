/**
 * Image Agent — routes through the Iengine Visual Intelligence pipeline.
 *
 * Iengine handles: narrative analysis, scene planning, prompt composition,
 * workflow routing, generation (ComfyUI / pluggable provider), quality scoring,
 * thumbnail generation, and CDN delivery. It returns a permanent CDN URL —
 * no base64 / data URLs leak into Redis or the DB.
 *
 * NOTE on imports: Iengine is a sibling workspace, not under ai-system's
 * `rootDir`. We can't `import` from it without `tsc` trying to compile
 * those files into our `dist/`. Instead we lazy-load via `require()` and
 * mirror the shape of `ArticleContext` / `BridgeImageResult` locally.
 */

import { Logger } from 'winston';
import { ImageOutcome, ArticleOutcome } from '../../types/admin-types';

// Local mirror of Iengine/api/imageAgentBridge ArticleContext. Kept in sync
// with that file by convention; if Iengine's shape diverges, fix here too.
interface ArticleContext {
  id?: string;
  title: string;
  excerpt?: string;
  category?: string;
  tags?: string[];
  region?: string;
}

interface BridgeImageResult {
  id: string;
  url: string;
  alt_text: string;
  theme_match_score: number;
  quality_score: number;
  scene_plan?: any;
  metadata?: any;
}

interface IBridge {
  generate(article: ArticleContext): Promise<BridgeImageResult>;
}

/** Lazy bridge loader — keeps tsc from pulling Iengine into ai-system's compile graph. */
function loadBridge(): IBridge {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../../Iengine/api/imageAgentBridge');
    const Ctor = mod.ImageAgentBridge || mod.default;
    return new Ctor();
  } catch (err: any) {
    throw new Error(`[ImageAgent] Iengine bridge unavailable: ${err.message}`);
  }
}

export class ImageAgent {
  private _bridge: IBridge | null = null;

  constructor(private readonly logger: Logger) {}

  private get bridge(): IBridge {
    if (!this._bridge) this._bridge = loadBridge();
    return this._bridge;
  }

  /**
   * Generate an image through the Iengine pipeline.
   * The `imoPrompt` argument is treated as supplemental context for the
   * narrative engine — Iengine builds its own structured prompt from the
   * article metadata, but we forward Imo's prompt as a creative hint.
   */
  async generateWithPrompt(
    imoPrompt: string,
    article: ArticleOutcome,
  ): Promise<ImageOutcome> {
    this.logger.info('[ImageAgent] Generating image via Iengine');

    const startTime = Date.now();

    const context: ArticleContext = {
      id: article.id,
      title: article.title,
      excerpt: typeof article.content === 'string' ? article.content.slice(0, 300) : undefined,
      category: (article as any).category,
      tags: article.keywords,
      region: (article as any).region,
    };

    try {
      const result = await this.bridge.generate(context);

      const image: ImageOutcome = {
        id: result.id,
        url: result.url,
        alt_text: result.alt_text,
        theme_match_score: result.theme_match_score,
        quality_score: result.quality_score,
      };

      const processingTime = Date.now() - startTime;
      this.logger.info('[ImageAgent] Image generated', {
        theme_match: image.theme_match_score,
        quality: image.quality_score,
        processing_time_ms: processingTime,
        url_kind: image.url.startsWith('data:') ? 'data-url' : 'cdn-url',
      });

      return image;
    } catch (error: any) {
      this.logger.error('[ImageAgent] Generation failed:', error);
      throw new Error(`Image Agent failed: ${error.message}`);
    }
  }

  /**
   * Regenerate image based on admin feedback.
   */
  async regenerateImage(
    originalImage: ImageOutcome,
    instructions: string,
    article: ArticleOutcome,
  ): Promise<ImageOutcome> {
    this.logger.info('[ImageAgent] Regenerating image with instructions:', instructions);

    const annotatedArticle: ArticleOutcome = {
      ...article,
      title: `${article.title} — REVISE: ${instructions}`,
    };

    return await this.generateWithPrompt(instructions, annotatedArticle);
  }
}

export default ImageAgent;
