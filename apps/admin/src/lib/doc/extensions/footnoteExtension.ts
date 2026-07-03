/**
 * Footnote Tiptap extension — inline reference markers.
 *
 * Renders an inline `[n]` marker that links to the corresponding item in
 * the Sources orderedList at the end of the doc (W4 writer agent emits
 * these markers inline; the Sources list is the footnote target).
 *
 * Markup:
 *   <sup data-footnote="3" class="footnote-ref"><a href="#fn-3">[3]</a></sup>
 *
 * Editor command:
 *   editor.commands.insertFootnote(3)
 */

import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: {
      insertFootnote: (n: number) => ReturnType;
    };
  }
}

export const FootnoteExtension = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      n: {
        default: 1,
        parseHTML: el => Number(el.getAttribute('data-footnote') ?? 1),
        renderHTML: attrs => ({ 'data-footnote': String(attrs.n) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'sup[data-footnote]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const n = (node.attrs as any).n;
    return [
      'sup',
      mergeAttributes(HTMLAttributes, { class: 'footnote-ref' }),
      ['a', { href: `#fn-${n}` }, `[${n}]`],
    ];
  },

  addCommands() {
    return {
      insertFootnote:
        (n: number) =>
        ({ commands }) =>
          commands.insertContent({ type: 'footnote', attrs: { n } }),
    };
  },
});
