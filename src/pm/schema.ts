import { Schema } from 'prosemirror-model';

export const costSchema = new Schema({
  nodes: {
    doc: {
      content: 'cost_item+',
    },
    text: {
      group: 'inline',
    },
    cost_item: {
      group: 'block',
      content: 'cost_item*',
      isolating: true,
      attrs: {
        id: { default: '' },
        typeId: { default: '' },
        label: { default: '' },
        values: { default: {} },
      },
      parseDOM: [{ tag: 'section[data-cost-item]' }],
      toDOM() {
        return ['section', { 'data-cost-item': 'true' }, 0];
      },
    },
  },
  marks: {},
});

export type CostEditorJSON = ReturnType<typeof costSchema['topNodeType']['createAndFill']>;
