class Doc {
  root: DocNode;
  currentState: DocState;
  nodeTypes: Map<string, NodeType>;

  constructor(
    root: DocNode,
    currentState: DocState,
    nodeTypes: Map<string, NodeType>,
  ) {
    this.root = root;
    this.currentState = currentState;
    this.nodeTypes = nodeTypes;
  }

  findNodeById(id: string): DocNode {
    const walk = (node: DocNode): DocNode | undefined => {
      if (node.id === id) return node;
      for (const child of node.children) {
        const found = walk(child);
        if (found) return found;
      }
    };
    let result = walk(this.root);
    if (!result) throw new Error(`Node with id ${id} not found`);
    return result;
  }

  handleState(node: DocNode, field: FieldDefinition, value: number): DocNode {
    // check conditions
    for (const transition of this.currentState.transitions) {
      if (transition.condition(node, field, value)) {
        // change state
        this.currentState = transition.targetState;
        // execute commands
        this.currentState.executeCommands(this, node, field, value);
        return this.root;
      }
    }
    this.currentState.executeCommands(this, node, field, value);
    return this.root;
  }

  updateTreeForFieldChange(
    tree: Doc,
    nodeId: string,
    field: FieldDefinition,
    value: number,
  ): DocNode {
    let root = tree.root as DocNode;
    root = this.attachParents(root);
    const node = this.findNodeById(nodeId);
    const editedField = node.type.fields.find((f) => f.id === field.id);
    if (!editedField) throw new Error(`Field not found`);
    this.handleState(node, editedField, value);
    return this.root;
  }

  attachParents(node: DocNode, parent?: DocNode) {
    node.parent = parent;
    for (const child of node.children) {
      if (node.type.canAddChild(child.type)) {
        this.attachParents(child, node);
      }
    }
    return node;
  }

  convertCostNodeToDocNode(node: CostNodeView): DocNode {
    let nodeType = this.nodeTypes.get(node.typeId) as NodeType;
    if (!nodeType) throw new Error(`Node type not found`);
    nodeType = nodeType.clone();
    for (const field of nodeType.fields) {
      field.setValue(node.values[field.id]);
    }
    let docNode = new DocNode(node.id, nodeType.clone());
    for (const child of node.children) {
      docNode.addchild(this.convertCostNodeToDocNode(child));
    }
    return docNode;
  }

  convertDocNodeToCostNode(docNode: DocNode): CostNodeView {
    let costNode: CostNodeView = {
      id: docNode.id,
      typeId: docNode.type.typeId,
      label: docNode.type.label,
      values: docNode.type.fields.reduce(
        (acc, field) =>
          field.label !== "" || "" || null
            ? { ...acc, [field.id]: field.value }
            : acc,
        {},
      ),
      children: [],
    };
    for (const child of docNode.children) {
      costNode.children.push(this.convertDocNodeToCostNode(child));
    }
    return costNode;
  }

  setRoot(node: DocNode) {
    this.root = node;
  }

  getNodeTypesMap() {
    let nodeTypes = new Map<string, NodeType>();
    for (const [key, value] of this.nodeTypes) {
      let type = value.clone();
      for (const field of type.fields) {
        if (field.label === "" || "" || null) type.removeField(field.id);
      }
      nodeTypes.set(key, type);
    }
    return nodeTypes;
  }
}

export interface CostNodeView {
  id: string;
  typeId: string;
  label: string;
  values: Record<string, number>;
  children: CostNodeView[];
}

export interface CostDocument {
  root: CostNodeView;
}

class DocNode {
  id: string;
  type: NodeType;
  children: DocNode[];
  parent?: DocNode;

  constructor(id: string, type: NodeType) {
    this.id = id;
    this.type = type.clone();
    this.children = [];
  }

  addchild(child: DocNode) {
    if (!this.type.canAddChild(child.type)) return;
    this.children.push(child);
    child.parent = this;
  }
}

class DocState {
  id: string;
  commands: Command[];
  transitions: Transition[];

  constructor(id: string) {
    this.id = id;
    this.commands = [];
    this.transitions = [];
  }

  addCommand(command: Command) {
    this.commands.push(command);
  }

  addTransition(transition: Transition) {
    this.transitions.push(transition);
  }

  executeCommands(
    doc: Doc,
    node: DocNode,
    field: FieldDefinition,
    value: number,
  ) {
    for (const command of this.commands) {
      command.execute(doc, node, field, value);
    }
  }
}

class Command {
  execute: (
    doc: Doc,
    node: DocNode,
    field: FieldDefinition,
    value: number,
  ) => void;

  constructor(
    execute: (
      doc: Doc,
      node: DocNode,
      field: FieldDefinition,
      value: number,
    ) => void,
  ) {
    this.execute = execute;
  }
}

class Transition {
  targetState: DocState;
  condition: (node: DocNode, field: FieldDefinition, value: number) => boolean;

  constructor(
    targetState: DocState,
    condition: (
      node: DocNode,
      field: FieldDefinition,
      value: number,
    ) => boolean,
  ) {
    this.targetState = targetState;
    this.condition = condition;
  }
}

export abstract class NodeType {
  typeId: string;
  label: string;
  protected static readonly defaultFields: FieldDefinition[];
  fields: FieldDefinition[];
  protected static readonly defaultRules: Rule[];
  readonly rules: Rule[];
  constructor(
    typeId: string,
    label: string,
    fields: FieldDefinition[],
    labels: { id: string; label: string }[],
    rules: Rule[],
  ) {
    this.typeId = typeId;
    this.label = label;
    this.fields = [...this.getDefaultFields(), ...fields];
    this.setFieldLabels(labels);
    this.rules = [...this.getDefaultRules(), ...rules];
  }

  protected getDefaultFields(): FieldDefinition[] {
    return (this.constructor as typeof NodeType).defaultFields;
  }

  protected getDefaultRules(): Rule[] {
    return (this.constructor as typeof NodeType).defaultRules;
  }

  addField(field: FieldDefinition) {
    this.fields.push(field);
  }

  removeField(id: string) {
    this.fields = this.fields.filter((f) => f.id !== id);
  }

  static get allowedChildTypes(): (typeof NodeType)[] {
    return [];
  }

  canAddChild(nodeType: NodeType): boolean {
    return (this.constructor as typeof NodeType).allowedChildTypes.some(
      (childType) => childType === nodeType.constructor,
    )
  }

  evaluateRules(doc: Doc, field: FieldDefinition) {
    for (const rule of this.rules) {
      rule.evaluate(doc, this, field);
    }
  }

  /**
   *
   * @param labels an array of {id: string, label: string}
   */
  setFieldLabels(labels: { id: string; label: string }[]) {
    for (const label of labels) {
      const field = this.fields.find((f) => f.id === label.id);
      if (field) field.setLabel(label.label);
    }
  }

  clone(): this {
    const clone = Object.create(Object.getPrototypeOf(this));
    Object.assign(clone, this);

    clone.fields = this.fields.map(
      (f) => new FieldDefinition(f.id, f.value, f.label),
    );
    clone.rules = this.rules.map(
      (r) => new Rule(r.id, r.expression, r.fieldId, r.docState, r.triggerFieldId),
    );
    return clone;
  }
}

export class FieldDefinition {
  id: string;
  value: number;
  label: string;
  constructor(id: string, value: number, label?: string) {
    this.id = id;
    this.value = value;
    this.label = label || "";
  }

  setValue(value: number) {
    this.value = value;
  }

  setLabel(label: string) {
    this.label = label;
  }
}

class Rule {
  id: string;
  expression: string;
  fieldId: string;
  docState: DocState;
  readonly triggerFieldId: string;
  constructor(
    id: string,
    expression: string,
    fieldId: string,
    docState: DocState,
    triggerFieldId: string = "",
  ) {
    this.id = id;
    this.expression = expression;
    this.fieldId = fieldId;
    this.docState = docState;
    this.triggerFieldId = triggerFieldId;
  }

  evaluate(doc: Doc, node: NodeType, changedField: FieldDefinition) {
    if (doc.currentState !== this.docState) return;
    if (this.triggerFieldId && this.triggerFieldId !== '' && this.triggerFieldId !== "" && changedField.id !== this.triggerFieldId) return;
    const value = this.evaluateExpression(this.expression, node.fields);
    node.fields.find((f) => f.id === this.fieldId)?.setValue(value);
  }

  evaluateExpression(expression: string, fields: FieldDefinition[]): number {
    const prepared = expression.replace(
      /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g,
      (name) => {
        return String(fields.find((f) => f.id === name)?.value || 0);
      },
    );
    const result = Function(`"use strict"; return (${prepared});`)();
    return typeof result === "number" && Number.isFinite(result) ? result : 0;
  }
}

// Example implementation

// States
const forwardState = new DocState("forward");
const backwardState = new DocState("backward");
const percentageBackwardState = new DocState("percentageBackward");

// Transitions
const transitionForwardBackward = new Transition(
  backwardState,
  (node: DocNode, field: FieldDefinition, value: number) =>
    node.type.rules.some(
      (rule) => rule.fieldId === field.id && rule.docState === backwardState,
    ),
);

const transitionToPercentageBackward = new Transition(
  percentageBackwardState,
  (node: DocNode, field: FieldDefinition, value: number) =>
    node.type instanceof PercentageNode,
);

forwardState.addTransition(transitionForwardBackward);
forwardState.addTransition(transitionToPercentageBackward);

// Node-Types
class TotalCostNode extends NodeType {
  protected static override readonly defaultFields: FieldDefinition[] = [
    new FieldDefinition("total", 0),
    new FieldDefinition("childrenTotal", 0),
    new FieldDefinition("variableChildrenTotal", 0),
    new FieldDefinition("fixedChildrenTotal", 0),
  ];

  protected static override readonly defaultRules: Rule[] = [
    new Rule(
      "total-forward",
      "childrenTotal > 0 ? childrenTotal : total",
      "total",
      forwardState,
    ),
    new Rule(
      "total-backward",
      "childrenTotal > 0 ? childrenTotal : total",
      "total",
      backwardState,
    ),
    new Rule(
      "total-percentage-backward",
      "childrenTotal > 0 ? childrenTotal : total",
      "total",
      percentageBackwardState,
    )
  ];

  static get allowedChildTypes(): (typeof NodeType)[] {
    return [UnitCostNode, TotalCostNode, PercentageNode, FixedUnitCostNode, PaintingNode];
  }
}

class UnitCostNode extends TotalCostNode {
  protected static override readonly defaultFields: FieldDefinition[] = [
    ...super.defaultFields,
    new FieldDefinition("count", 0),
    new FieldDefinition("unitCost", 0),
    new FieldDefinition("oldTotal", 0),
  ];

  protected static override readonly defaultRules: Rule[] = [
    new Rule(
      "unitCost-forward",
      "childrenTotal > 0 ? childrenTotal : unitCost",
      "unitCost",
      forwardState,
    ),
    new Rule(
      "total-forward",
      "childrenTotal > 0 ? variableChildrenTotal * count + fixedChildrenTotal : count * unitCost",
      "total",
      forwardState,
    ),
    new Rule(
      "total-backward",
      "childrenTotal > 0 ? variableChildrenTotal * count + fixedChildrenTotal : count * unitCost",
      "total",
      backwardState,
      "unitCost",
    ),
    new Rule(
      "unitCost-backward",
      "childrenTotal > 0 ? unitCost * total / oldTotal : total / count",
      "unitCost",
      backwardState,
      "total",
    ),
    new Rule(
      "total-percentage-backward",
      "childrenTotal > 0 ? variableChildrenTotal * count + fixedChildrenTotal : count * unitCost",
      "total",
      percentageBackwardState,
    )
  ];
}

class FixedUnitCostNode extends UnitCostNode {}

class PercentageNode extends TotalCostNode {
  protected static override readonly defaultFields: FieldDefinition[] = [
    ...super.defaultFields,
    new FieldDefinition("percentage", 0),
    new FieldDefinition("parentTotal", 0),
  ];

  protected static override readonly defaultRules: Rule[] = [
    new Rule(
      "total-forward",
      "- parentTotal * percentage / 100 + childrenTotal",
      "total",
      forwardState,
    ),
    new Rule(
      "percentage-backward",
      "- total * 100 / parentTotal",
      "percentage",
      percentageBackwardState,
      "total",
    ),
    new Rule(
      "total-backward",
      "- parentTotal * percentage / 100 + childrenTotal",
      "total",
      percentageBackwardState,
      "percentage",
    ),
  ];

  static get allowedChildTypes(): (typeof NodeType)[] {
    return [PercentageNode];
  }
}

class PaintingNode extends UnitCostNode {
  protected static override readonly defaultFields: FieldDefinition[] = [
    ...super.defaultFields,
    new FieldDefinition("width", 0),
    new FieldDefinition("length", 0),
  ];

  protected static override readonly defaultRules: Rule[] = [
    ...super.defaultRules,
    new Rule("paint-area", "length * width", "count", forwardState),
  ];
}

// NodeTypes
const invoice = new TotalCostNode(
  "invoice",
  "Auftrag",
  [],
  [{ id: "total", label: "Endpreis" }],
  [],
);

const labor = new UnitCostNode(
  "labor",
  "Arbeitszeit",
  [],
  [
    { id: "total", label: "Gesamtpreis" },
    { id: "count", label: "Stunden" },
    { id: "unitCost", label: "Stundensatz" },
  ],
  [],
);

const material = new UnitCostNode(
  "material",
  "Material",
  [],
  [
    { id: "total", label: "Gesamtpreis" },
    { id: "count", label: "Menge" },
    { id: "unitCost", label: "Stückpreis" },
  ],
  [],
);

const travel = new FixedUnitCostNode(
  "travel",
  "Reise",
  [],
  [
    { id: "total", label: "Gesamtpreis" },
    { id: "count", label: "Kilometer" },
    { id: "unitCost", label: "Preis pro km" },
  ],
  [],
);

const percentage = new PercentageNode(
  "discount",
  "Rabatt",
  [],
  [
    { id: "total", label: "Gesamtpreis" },
    { id: "percentage", label: "Prozent" },
  ],
  [],
);

const painting_room = new PaintingNode(
  "painting_room",
  "Zimmer streichen",
  [],
  [
    { id: "total", label: "Gesamtpreis" },
    { id: "unitCost", label: "Preis pro m²" },
    { id: "count", label: "Fläche" },
    { id: "width", label: "Breite" },
    { id: "length", label: "Lange" },
  ],
  [],
);

// Commands
const forwardCommand = new Command((doc, node, field, value) => {
  const walk = (node: DocNode): DocNode => {
    if (node.type instanceof PercentageNode) {
      // set total for discount nodes to 0
      node = removeTotalFromDiscountNode(node);
      return node;
    }
    // always apply rules to children first because parent-nodes depend on children
    node.children = node.children.map(walk);
    node = attachChildrenTotal(node);
    node.type.evaluateRules(doc, field);
    return node;
  };

  const walkWithDiscount = (node: DocNode): DocNode => {
    if (node.type instanceof PercentageNode && node.parent) {
      // recalculate parent total to include previous discount
      node.parent = attachChildrenTotal(node.parent);
      node.parent.type.evaluateRules(doc, field);

      // recalculate discount-node without children to get correct value
      node = attachParentTotal(node);
      node = attachChildrenTotal(node);
      node.type.evaluateRules(doc, field);
    }
    // always apply rules to children first because parent-nodes depend on children
    node.children = node.children.map(walkWithDiscount);
    node = attachChildrenTotal(node);
    node.type.evaluateRules(doc, field);
    return node;
  };

  if (node.type instanceof TotalCostNode) {
    field.setValue(value);
    walk(doc.root);
    walkWithDiscount(doc.root);
  } else {
    throw new Error(`Unknown node type: ${node.type}`);
  }
});

const backwardCommand = new Command((doc, node, field, value) => {
  const walk = (
    doc: Doc,
    node: DocNode,
    field: FieldDefinition,
    value: number,
  ): DocNode => {
    if (node.type instanceof TotalCostNode) {
      node = attachOldTotal(node);
      field.setValue(value);

      const canDistribute =
        node.children.length > 0 &&
        node.type.fields.find((f) => f.id === field.id)?.value !== null &&
        !(node.type instanceof PercentageNode);
      if (canDistribute) {
        // unitCost is the standard fieldId for the price per unit,
        // if a node has a price per unit then distribution on children is not handeled over the total fild on backward calculation
        let desiredPrice = 0;
        if (node.type instanceof UnitCostNode) {
          node.type.evaluateRules(doc, field);
          desiredPrice =
            node.type.fields.find((f) => f.id === "unitCost")?.value ?? 0;
        } else {
          desiredPrice =
            node.type.fields.find((f) => f.id === "total")?.value ?? 0;
        }
        const childrenTotal = sumChildField(node, "total");

        if (childrenTotal > 0) {
          // apply rules to children backward and evenly distribute new total or unitCost of parent-node
          node.children = node.children.map((child) => {
            // don't distribute total or unitCost on percentage-discount-nodes
            // remove total from discount-nodes for proper backward-computation
            // reason: dicsount-nodes containing discount-nodes can't be easily computed backward
            if (child.type instanceof PercentageNode) {
              return removeTotalFromDiscountNode(child);
            }
            const childTotalField = child.type.fields.find(
              (f) => f.id === "total",
            );
            if (!childTotalField)
              throw new Error("childNode has no total field");
            const currentChildTarget = childTotalField.value ?? 0;
            const share = currentChildTarget / childrenTotal;
            const nextChildTarget = desiredPrice * share;
            return walk(doc, child, childTotalField, nextChildTarget);
          });
        }
      }

      // after distributing total or unitCost on children, apply backward-rules to current node
      if (node.parent) node = attachParentTotal(node);
      node = attachChildrenTotal(node);
      node.type.evaluateRules(doc, field);

      return node;
    } else {
      throw new Error(`Unknown node type: ${node.type}`);
    }
  };

  return walk(doc, node, field, value);
});

const handlePercentageCommand = new Command(
  (doc: Doc, node: DocNode, field: FieldDefinition, value: number) => {
    if (node.type instanceof PercentageNode && node.parent) {
      node = removeTotalFromDiscountNode(node);
      field.setValue(value);
      node = attachChildrenTotal(node);
      node.type.evaluateRules(doc, field);
    } else {
      if (!node.parent) throw new Error(`node has no parent: ${node.id}`);
      throw new Error(`Unknown node type: ${node.type}`);
    }
  },
);

const changeStateToForwardCommand = new Command((doc: Doc, node: DocNode, field: FieldDefinition, value: number) => {
  doc.currentState = forwardState;
  doc.currentState.executeCommands(doc, node, field, value);
});

// add Commands to states
forwardState.addCommand(forwardCommand);

backwardState.addCommand(backwardCommand);
backwardState.addCommand(changeStateToForwardCommand);

percentageBackwardState.addCommand(handlePercentageCommand);
percentageBackwardState.addCommand(changeStateToForwardCommand);

// Doc
const nodeTypeMap = new Map<string, NodeType>();
nodeTypeMap.set(invoice.typeId, invoice);
nodeTypeMap.set(percentage.typeId, percentage);
nodeTypeMap.set(labor.typeId, labor);
nodeTypeMap.set(travel.typeId, travel);
nodeTypeMap.set(material.typeId, material);
nodeTypeMap.set(painting_room.typeId, painting_room);

export const exampleDoc = new Doc(
  new DocNode("root", invoice),
  forwardState,
  nodeTypeMap,
);

// Helper functions
function attachChildrenTotal(node: DocNode): DocNode {
  if (node.type instanceof TotalCostNode) {
    let childrenTotal = 0;
    let variableChildrenTotal = 0;
    let fixedChildrenTotal = 0;
    for (const child of node.children) {
      childrenTotal +=
        child.type.fields.find((f) => f.id === "total")?.value ?? 0;
      if (child.type instanceof FixedUnitCostNode) {
        fixedChildrenTotal +=
          child.type.fields.find((f) => f.id === "total")?.value ?? 0;
      } else {
        variableChildrenTotal +=
          child.type.fields.find((f) => f.id === "total")?.value ?? 0;
      }
    }
    node.type.fields
      .find((f) => f.id === "childrenTotal")
      ?.setValue(childrenTotal);
    node.type.fields
      .find((f) => f.id === "variableChildrenTotal")
      ?.setValue(variableChildrenTotal);
    node.type.fields
      .find((f) => f.id === "fixedChildrenTotal")
      ?.setValue(fixedChildrenTotal);
  }
  return node;
}

function attachOldTotal(node: DocNode): DocNode {
  if (node.type instanceof UnitCostNode) {
    node.type.fields
      .find((f) => f.id === "oldTotal")
      ?.setValue(node.type.fields.find((f) => f.id === "total")?.value ?? 0);
  }
  return node;
}

function attachParentTotal(node: DocNode): DocNode {
  if (node.type instanceof PercentageNode && node.parent) {
    let parentTotal = 0;

    // if parent has unitCost then percentage needs to be calculated to unitCost of parent instead of total
    // because percentage gets applied to total instead of unitCost (total = count * variableChildrenTotal + fixedChildrenTotal; unitCost = childrenTotal)
    if (node.parent.type instanceof UnitCostNode) {
      let count =
        node.parent.type.fields.find((f) => f.id === "count")?.value ?? 0;
      let total =
        node.parent.type.fields.find((f) => f.id === "total")?.value ?? 0;
      parentTotal = Math.abs(total / count);
    } else {
      parentTotal =
        Math.abs(node.parent.type.fields.find((f) => f.id === "total")?.value ?? 0);
    }
    node.type.fields.find((f) => f.id === "parentTotal")?.setValue(parentTotal);
  }
  return node;
}

function removeTotalFromDiscountNode(node: DocNode): DocNode {
  if (node.type instanceof PercentageNode) {
    node.type.fields.find((f) => f.id === "total")?.setValue(0);
    node.children = node.children.map(removeTotalFromDiscountNode);
    return node;
  }
  return new DocNode("", new TotalCostNode("", "", [], [], []));
}

function sumChildField(node: DocNode, fieldId: string): number {
  let sum = 0;
  for (const child of node.children) {
    sum += child.type.fields.find((f) => f.id === fieldId)?.value ?? 0;
  }
  return sum;
}
