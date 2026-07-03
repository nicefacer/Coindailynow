/**
 * AnchoredListItem — extends Tiptap's ListItem with an optional `id` attribute.
 *
 * Used by the Sources list in the doc converter to emit
 *   <li id="fn-1">…</li>
 * so the FootnoteExtension's <a href="#fn-1"> links scroll to the exact source.
 *
 * Tiptap's default listItem doesn't accept arbitrary HTML id attributes —
 * this is a thin wrapper that adds one.
 */

import ListItem from '@tiptap/extension-list-item';

export const AnchoredListItem = ListItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      id: {
        default: null,
        parseHTML: el => el.getAttribute('id'),
        renderHTML: attrs => (attrs.id ? { id: attrs.id } : {}),
      },
    };
  },
});
