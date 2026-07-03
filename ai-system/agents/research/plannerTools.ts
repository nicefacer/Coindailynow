/**
 * Planner Tools — the toolbox the Vercel AI SDK exposes to the planner loop.
 *
 *   webSearch   — DuckDuckGo HTML scrape (no API key required)
 *   fetchUrl    — fetch a URL and extract readable text via Cheerio
 *   summarize   — local Ollama call to compress a long blob
 *
 * Each tool is intentionally small and synchronous-shaped (returns plain
 * JSON-serializable data) so the planner's reasoning stays cheap. The
 * planner decides when to call which.
 */

import { tool } from 'ai';
import { z } from 'zod';
import * as cheerio from 'cheerio';

const FETCH_TIMEOUT_MS = 12_000;
const SEARCH_TIMEOUT_MS = 10_000;
const SUMMARY_TIMEOUT_MS = 30_000;
const OLLAMA_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const LLAMA_MODEL = process.env.LLAMA_MODEL || 'llama3.1:8b';

const UA = 'CoinDailyResearchBot/1.0 (+https://sygn.live)';

// ─── webSearch ──────────────────────────────────────────────────────────────

export const webSearchTool = tool({
  description:
    'Search the public web for a query and return up to 10 result links with titles and snippets. ' +
    'Use this to discover sources for a topic the static source list doesn\'t cover. Be specific in queries.',
  parameters: z.object({
    query: z.string().min(3).max(200).describe('The search query'),
    maxResults: z.number().int().min(1).max(15).default(8).optional(),
  }),
  execute: async ({ query, maxResults = 8 }) => {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
        headers: { 'User-Agent': UA, Accept: 'text/html' },
      });
      if (!res.ok) return { error: `search HTTP ${res.status}`, results: [] };
      const html = await res.text();
      const $ = cheerio.load(html);

      const results: Array<{ url: string; title: string; snippet: string }> = [];
      $('.result').slice(0, maxResults).each((_, el) => {
        const link = $(el).find('a.result__a').first();
        const href = link.attr('href') || '';
        const title = link.text().trim();
        const snippet = $(el).find('.result__snippet').text().trim();
        const cleanUrl = normalizeDuckUrl(href);
        if (cleanUrl && title) {
          results.push({ url: cleanUrl, title, snippet });
        }
      });
      return { query, results };
    } catch (err: any) {
      return { error: err.message, results: [] };
    }
  },
});

// DuckDuckGo HTML wraps links as /l/?uddg=<encoded>; unwrap.
function normalizeDuckUrl(href: string): string {
  try {
    if (href.startsWith('/l/?')) {
      const u = new URL(`https://html.duckduckgo.com${href}`);
      const real = u.searchParams.get('uddg');
      if (real) return decodeURIComponent(real);
    }
    return href.startsWith('http') ? href : '';
  } catch {
    return '';
  }
}

// ─── fetchUrl ───────────────────────────────────────────────────────────────

export const fetchUrlTool = tool({
  description:
    'Fetch a URL and return the readable text content (article body, stripped of nav/ads). ' +
    'Use this after webSearch to read the most promising results. Limit to one fetch at a time and ' +
    'avoid fetching the same URL twice.',
  parameters: z.object({
    url: z.string().url().describe('The URL to fetch'),
    maxChars: z.number().int().min(500).max(15000).default(6000).optional(),
  }),
  execute: async ({ url, maxChars = 6000 }) => {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      });
      if (!res.ok) return { error: `fetch HTTP ${res.status}`, url, content: '' };
      const html = await res.text();
      const $ = cheerio.load(html);
      $('script, style, nav, header, footer, aside, form, .ad, .ads, .advertisement').remove();

      // Prefer article-shaped containers; fall back to body
      const candidates = ['article', 'main', '[role="main"]', '.post-content', '.article-body', '.content', 'body'];
      let text = '';
      for (const sel of candidates) {
        const el = $(sel).first();
        if (el.length) {
          text = el.text();
          if (text.trim().length >= 200) break;
        }
      }
      const cleaned = text.replace(/\s+/g, ' ').trim().slice(0, maxChars);
      const title = $('title').first().text().trim();
      return { url, title, content: cleaned, truncated: text.length > maxChars };
    } catch (err: any) {
      return { error: err.message, url, content: '' };
    }
  },
});

// ─── summarize ──────────────────────────────────────────────────────────────

export const summarizeTool = tool({
  description:
    'Summarize a long text into a concise editorial-grade brief. Use this after fetchUrl when the ' +
    'article body is too long to reason over directly. Returns at most ~300 words.',
  parameters: z.object({
    text: z.string().min(50).describe('The text to summarize'),
    focus: z.string().optional().describe('Optional focus angle, e.g. "regulatory impact" or "Africa relevance"'),
  }),
  execute: async ({ text, focus }) => {
    try {
      const prompt = `Summarize the following text in 200-300 words for a cryptocurrency / AI / finance news editor. Focus on facts, numbers, named entities, dates, and policy implications.${focus ? ` Lens: ${focus}.` : ''} Plain prose only, no bullet lists.\n\nTEXT:\n${text.slice(0, 12000)}`;
      const res = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: LLAMA_MODEL,
          prompt,
          stream: false,
          options: { temperature: 0.2, num_predict: 500 },
        }),
        signal: AbortSignal.timeout(SUMMARY_TIMEOUT_MS),
      });
      if (!res.ok) return { error: `summary HTTP ${res.status}`, summary: '' };
      const data = (await res.json()) as { response?: string };
      return { summary: (data.response || '').trim() };
    } catch (err: any) {
      return { error: err.message, summary: '' };
    }
  },
});

export const plannerTools = {
  webSearch: webSearchTool,
  fetchUrl: fetchUrlTool,
  summarize: summarizeTool,
};
