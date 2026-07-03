/**
 * articleDoc — converts a PipelineRun (research + writer + image + translations)
 * into the initial Tiptap JSON document the editor loads.
 *
 * Used only for the FIRST load. After that, Y.Doc state in the backend is the
 * source of truth and Hocuspocus syncs incremental changes.
 *
 * Shape:
 *   doc
 *     ├ heading (h1, article title)
 *     ├ paragraph (excerpt, italic)
 *     ├ image (Iengine-generated)
 *     ├ ...body blocks (parsed from writer markdown)
 *     ├ heading (h2, "Sources")
 *     └ orderedList (citations, each item linking back to source URL)
 *
 * Translations are not embedded — they live as separate accordions in the page UI.
 */

import { marked } from 'marked';

interface TiptapNode {
  type: string;
  attrs?: Record<string, any>;
  content?: TiptapNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, any> }>;
}

interface PipelineRunForDoc {
  id: string;
  topic: string;
  steps: Array<{
    stepName: string;
    output: any;
  }>;
}

export function pipelineRunToTiptapDoc(run: PipelineRunForDoc): TiptapNode {
  const writer = pickStep(run, 'writer');
  const image = pickStep(run, 'image');
  const embed = pickStep(run, 'embedImage');
  const research = pickStep(run, 'research');

  const title: string = writer?.title || run.topic || 'Untitled';
  const excerpt: string = (writer?.content || '').split('\n').find((l: string) => l.trim()) || '';
  // embed step output already prepends the image markdown, so prefer it
  const markdownBody: string = embed?.content || writer?.content || '';
  const sources: Array<{ url: string; title?: string; domain?: string }> = research?.sources || [];

  const body = parseMarkdownToTiptap(markdownBody);

  const doc: TiptapNode = {
    type: 'doc',
    content: [
      heading(1, title),
      excerpt ? paragraph(excerpt, [{ type: 'italic' }]) : null,
      image?.url ? imageNode(image.url, image.alt_text || title) : null,
      ...body,
      sources.length ? heading(2, 'Sources') : null,
      sources.length ? sourcesList(sources) : null,
    ].filter(Boolean) as TiptapNode[],
  };

  return doc;
}

function pickStep(run: PipelineRunForDoc, stepName: string): any {
  return run.steps.find(s => s.stepName === stepName)?.output;
}

function heading(level: number, text: string): TiptapNode {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] };
}

function paragraph(text: string, marks?: TiptapNode['marks']): TiptapNode {
  return { type: 'paragraph', content: [{ type: 'text', text, marks }] };
}

function imageNode(src: string, alt: string): TiptapNode {
  return { type: 'image', attrs: { src, alt } };
}

function sourcesList(
  sources: Array<{ url: string; title?: string; domain?: string }>,
): TiptapNode {
  return {
    type: 'orderedList',
    content: sources.map((s, i) => ({
      type: 'listItem',
      attrs: { id: `fn-${i + 1}` },
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: s.title || s.domain || s.url,
              marks: [{ type: 'link', attrs: { href: s.url, target: '_blank', rel: 'noopener noreferrer' } }],
            },
          ],
        },
      ],
    })),
  };
}

/**
 * Lightweight markdown → Tiptap converter via marked's tokenizer.
 * Handles the subset the writer agent produces today:
 *   headings, paragraphs, bold/italic, links, images, lists, blockquote, code.
 * Anything exotic falls back to a paragraph with the raw text.
 *
 * Exported as `markdownToTiptapNodes` for use by "Apply to doc" reruns
 * that replace the writer body section.
 */
export function markdownToTiptapNodes(md: string): TiptapNode[] {
  return parseMarkdownToTiptap(md);
}

function parseMarkdownToTiptap(md: string): TiptapNode[] {
  if (!md.trim()) return [];

  const tokens = marked.lexer(md);
  const nodes: TiptapNode[] = [];

  for (const token of tokens) {
    const node = tokenToNode(token);
    if (node) nodes.push(node);
  }
  return nodes;
}

function tokenToNode(token: any): TiptapNode | null {
  switch (token.type) {
    case 'heading':
      return { type: 'heading', attrs: { level: token.depth }, content: inlineTokens(token.tokens) };
    case 'paragraph':
      return { type: 'paragraph', content: inlineTokens(token.tokens) };
    case 'blockquote':
      return { type: 'blockquote', content: (token.tokens || []).map(tokenToNode).filter(Boolean) };
    case 'code':
      return {
        type: 'codeBlock',
        attrs: { language: token.lang || null },
        content: [{ type: 'text', text: token.text }],
      };
    case 'list':
      return {
        type: token.ordered ? 'orderedList' : 'bulletList',
        content: token.items.map((item: any) => ({
          type: 'listItem',
          content: (item.tokens || []).map(tokenToNode).filter(Boolean),
        })),
      };
    case 'hr':
      return { type: 'horizontalRule' };
    case 'space':
      return null;
    case 'image':
      return { type: 'image', attrs: { src: token.href, alt: token.text || '' } };
    default:
      if (token.text) return { type: 'paragraph', content: [{ type: 'text', text: token.text }] };
      return null;
  }
}

function inlineTokens(tokens: any[]): TiptapNode[] {
  if (!tokens) return [];
  const nodes: TiptapNode[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'text':
        nodes.push(...splitFootnotes(t.text));
        break;
      case 'strong':
        nodes.push(...splitFootnotes(t.text, [{ type: 'bold' }]));
        break;
      case 'em':
        nodes.push(...splitFootnotes(t.text, [{ type: 'italic' }]));
        break;
      case 'codespan':
        nodes.push({ type: 'text', text: t.text, marks: [{ type: 'code' }] });
        break;
      case 'link':
        nodes.push({
          type: 'text',
          text: t.text,
          marks: [{ type: 'link', attrs: { href: t.href, target: '_blank', rel: 'noopener noreferrer' } }],
        });
        break;
      case 'image':
        nodes.push({ type: 'image', attrs: { src: t.href, alt: t.text || '' } } as any);
        break;
      default:
        if (t.text) nodes.push(...splitFootnotes(t.text));
    }
  }
  return nodes;
}

/**
 * Splits a string on [n] markers (numeric only, 1-3 digits) and replaces each
 * occurrence with a `footnote` inline node. Text fragments around the markers
 * keep their original marks.
 */
function splitFootnotes(text: string, marks?: TiptapNode['marks']): TiptapNode[] {
  if (!text) return [];
  const re = /\[(\d{1,3})\]/g;
  const out: TiptapNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      const slice = text.slice(lastIndex, m.index);
      out.push({ type: 'text', text: slice, marks });
    }
    out.push({ type: 'footnote', attrs: { n: Number(m[1]) } });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    out.push({ type: 'text', text: text.slice(lastIndex), marks });
  }
  return out;
}
