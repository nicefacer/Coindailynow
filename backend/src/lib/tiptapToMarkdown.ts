/**
 * Tiptap JSON → markdown serializer.
 *
 * Inverse of the markdownToTiptapNodes converter in the admin app. Handles
 * the node/mark set we use:
 *   heading, paragraph, image, link, bold, italic, code, codeBlock,
 *   bulletList, orderedList, listItem, blockquote, horizontalRule,
 *   footnote (renders as `[n]`).
 *
 * Used by the approve route to convert the editor's final Y.Doc snapshot
 * (PipelineRun.docJson) into the markdown stored on Article.content.
 */

interface TiptapNode {
  type: string;
  attrs?: Record<string, any>;
  content?: TiptapNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, any> }>;
}

export function tiptapToMarkdown(doc: TiptapNode | null | undefined): string {
  if (!doc || doc.type !== 'doc' || !doc.content) return '';
  return doc.content.map(nodeToMd).join('\n\n').trim() + '\n';
}

function nodeToMd(node: TiptapNode, depth = 0): string {
  switch (node.type) {
    case 'paragraph':
      return inlineContent(node.content);
    case 'heading': {
      const level = Math.min(6, Math.max(1, node.attrs?.level || 1));
      return `${'#'.repeat(level)} ${inlineContent(node.content)}`;
    }
    case 'image': {
      const alt = (node.attrs?.alt || '').replace(/[\[\]]/g, '');
      const src = node.attrs?.src || '';
      return `![${alt}](${src})`;
    }
    case 'horizontalRule':
      return '---';
    case 'blockquote':
      return (node.content || [])
        .map(c => nodeToMd(c, depth))
        .join('\n\n')
        .split('\n')
        .map(l => `> ${l}`)
        .join('\n');
    case 'codeBlock': {
      const lang = node.attrs?.language || '';
      const text = (node.content || []).map(c => c.text ?? '').join('');
      return '```' + lang + '\n' + text + '\n```';
    }
    case 'bulletList':
      return (node.content || [])
        .map(item => listItemMd(item, '-', depth))
        .join('\n');
    case 'orderedList':
      return (node.content || [])
        .map((item, i) => listItemMd(item, `${i + 1}.`, depth))
        .join('\n');
    case 'listItem':
      // Should always be reached via listItemMd; bare listItem = fallback
      return inlineContent(node.content);
    default:
      // Unknown block: collapse to its inline content if possible
      return inlineContent(node.content);
  }
}

function listItemMd(item: TiptapNode, marker: string, depth: number): string {
  const indent = '  '.repeat(depth);
  const children = (item.content || []).map(c => nodeToMd(c, depth + 1)).join('\n\n');
  // Preserve the listItem's id attr as an HTML anchor inline at the start
  // so the rendered article still supports footnote jump links.
  const anchor = item.attrs?.id ? `<a id="${item.attrs.id}"></a>` : '';
  const [first, ...rest] = children.split('\n');
  const out = [`${indent}${marker} ${anchor}${first ?? ''}`];
  for (const line of rest) {
    out.push(line ? `${indent}  ${line}` : '');
  }
  return out.join('\n');
}

function inlineContent(nodes: TiptapNode[] | undefined): string {
  if (!nodes) return '';
  return nodes.map(inlineNode).join('');
}

function inlineNode(node: TiptapNode): string {
  if (node.type === 'text') {
    let out = node.text ?? '';
    if (node.marks) {
      // Apply marks innermost-out. Order: code, link, bold, italic.
      const order = ['code', 'link', 'bold', 'italic'];
      const sorted = [...node.marks].sort(
        (a, b) => order.indexOf(a.type) - order.indexOf(b.type),
      );
      for (const m of sorted) {
        out = wrapMark(out, m);
      }
    }
    return out;
  }
  if (node.type === 'image') {
    return `![${node.attrs?.alt || ''}](${node.attrs?.src || ''})`;
  }
  if (node.type === 'footnote') {
    return `[${node.attrs?.n ?? '?'}]`;
  }
  if (node.type === 'hardBreak') return '  \n';
  // Recurse into inline children for unknown wrappers
  return inlineContent(node.content);
}

function wrapMark(text: string, mark: { type: string; attrs?: Record<string, any> }): string {
  switch (mark.type) {
    case 'bold':
      return `**${text}**`;
    case 'italic':
      return `*${text}*`;
    case 'code':
      return '`' + text + '`';
    case 'link': {
      const href = mark.attrs?.href || '';
      return `[${text}](${href})`;
    }
    default:
      return text;
  }
}
