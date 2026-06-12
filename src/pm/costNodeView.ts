import { Node as PMNode } from "prosemirror-model";
import { EditorView, NodeView } from "prosemirror-view";
import { FieldDefinition, PositionTypeDefinition } from "../semantic/engine";

type UpdateValue = (
  nodeId: string,
  field: FieldDefinition,
  rawValue: string,
) => void;

function getFieldDefs(
  node: PMNode,
  types: Map<string, PositionTypeDefinition>,
): FieldDefinition[] {
  const typeDef = types.get(node.attrs.typeId as string);
  return typeDef?.fields ?? [];
}

function renderValue(value: unknown): string {
  return value == null ? "" : String(value);
}

export class CostItemView implements NodeView {
  dom: HTMLElement;

  contentDOM: HTMLElement;

  node: PMNode;

  view: EditorView;

  getPos: () => number;

  private readonly types: Map<string, PositionTypeDefinition>;

  private readonly onFieldChange: UpdateValue;

  constructor(
    node: PMNode,
    view: EditorView,
    getPos: () => number,
    types: Map<string, PositionTypeDefinition>,
    onFieldChange: UpdateValue,
  ) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.types = types;
    this.onFieldChange = onFieldChange;

    this.dom = document.createElement("section");
    this.dom.className = "cost-item";
    this.contentDOM = document.createElement("div");
    this.contentDOM.className = "cost-item-children";
    this.render();
  }

  private buildField(field: FieldDefinition): HTMLElement {
    const wrapper = document.createElement("label");
    wrapper.className = "field";

    const label = document.createElement("span");
    label.textContent =
      field.label +
      (field.fixed ? " (fix)" : field.computed ? " (berechnet)" : "");
    wrapper.appendChild(label);

    const input = document.createElement("input");
    input.type = field.kind === "number" ? "number" : "text";
    input.step = field.kind === "number" ? "0.01" : "any";
    input.value = renderValue(
      (this.node.attrs.values as Record<string, unknown>)[field.id],
    );

    if (field.computed) {
      input.classList.add("computed-field");
    }
    if (field.fixed) {
      input.classList.add("fixed-field");
    }

    const commit = () => {
      this.onFieldChange(this.node.attrs.id as string, field, input.value);
      input.value = renderValue(
        (this.node.attrs.values as Record<string, unknown>)[field.id],
      );
    };

    input.addEventListener("blur", commit);

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur(); // löst commit über blur aus
      }
    });

    wrapper.appendChild(input);
    return wrapper;
  }

  render(): void {
    this.dom.innerHTML = "";

    // console.log('render', this.node);

    const header = document.createElement("div");
    header.className = "cost-item-header";

    const title = document.createElement("div");
    title.className = "cost-item-title";
    title.textContent = `${this.node.attrs.label as string} (${this.node.attrs.typeId as string})`;
    header.appendChild(title);

    const fields = document.createElement("div");
    fields.className = "cost-item-fields";

    for (const field of getFieldDefs(this.node, this.types)) {
      fields.appendChild(this.buildField(field));
    }

    const meta = document.createElement("div");
    meta.className = "cost-item-meta";
    meta.textContent = `ID: ${String(this.node.attrs.id)}`;

    this.dom.appendChild(header);
    this.dom.appendChild(fields);
    this.dom.appendChild(meta);
    this.dom.appendChild(this.contentDOM);
  }

  update(node: PMNode): boolean {
    // console.log('update', node);
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  ignoreMutation(): boolean {
    return true;
  }

  stopEvent(event: Event): boolean {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;

    return target.closest("input, label") !== null;
  }
}
