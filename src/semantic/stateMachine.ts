class Doc {
  root: DocNode;
  currentState: DocState;
  nodeTypes: Map<string, NodeType>;

  constructor(
    root: DocNode,
    currentState: DocState, // simply for checking next Transition conditions
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
        this.currentState.executeNetworks(this, node, field, value);
        return this.root;
      }
    }
    this.currentState.executeNetworks(this, node, field, value);
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
  dependencyNetworks: {
    startAt: "root" | "changedNode";
    network: StepDependencyNetwork;
  }[];
  transitions: Transition[];

  constructor(id: string) {
    this.id = id;
    this.dependencyNetworks = [];
    this.transitions = [];
  }

  addNetwork(dependencyNetwork: {
    startAt: "root" | "changedNode";
    network: StepDependencyNetwork;
  }) {
    this.dependencyNetworks.push(dependencyNetwork);
  }

  addTransition(transition: Transition) {
    this.transitions.push(transition);
  }

  executeNetworks(
    doc: Doc,
    node: DocNode,
    field: FieldDefinition,
    value: number,
  ) {
    for (const entry of this.dependencyNetworks) {
      const startNode = entry.startAt === "root" ? doc.root : node;
      entry.network.run(doc, startNode, field, value); // initial entry is root or changed node, works downward from there
    }
  }
}

class NetworkStep {
  execute: (
    doc: Doc,
    node: DocNode,
    field: FieldDefinition,
    value: number,
    network?: StepDependencyNetwork,
  ) => void;

  constructor(
    execute: (
      doc: Doc,
      node: DocNode,
      field: FieldDefinition,
      value: number,
      network?: StepDependencyNetwork,
    ) => void,
  ) {
    this.execute = execute;
  }
}

type Operator = "sum" | "min" | "max" | "count";

class AggregateChildrenFieldStep extends NetworkStep {
  childSourceField: FieldDefinition;
  targetField: FieldDefinition;
  operator: Operator;
  allowedTypes: (typeof NodeType)[];
  allowedChildTypes: (typeof NodeType)[];

  constructor(
    childSourceField: FieldDefinition,
    targetField: FieldDefinition,
    operator: Operator,
    allowedTypes: (typeof NodeType)[] = [],
    allowedChildTypes: (typeof NodeType)[] = [],
  ) {
    super((doc: Doc, node: DocNode, field: FieldDefinition, value: number) => {
      if (
        allowedTypes.includes(node.type.constructor as typeof NodeType) &&
        node.type.fields.find((f) => f.id === targetField.id)
      ) {
        let aggregatedValue = 0;
        let initialized = false;
        switch (operator) {
          case "sum":
            for (const child of node.children) {
              if (
                allowedChildTypes.includes(
                  child.type.constructor as typeof NodeType,
                )
              ) {
                aggregatedValue +=
                  child.type.fields.find((f) => f.id === childSourceField.id)
                    ?.value ?? 0;
              }
            }
            break;
          case "min":
            for (const child of node.children) {
              if (
                allowedChildTypes.includes(
                  child.type.constructor as typeof NodeType,
                )
              ) {
                if (!initialized) {
                  aggregatedValue =
                    child.type.fields.find((f) => f.id === childSourceField.id)
                      ?.value ?? 0;
                  initialized = true;
                } else {
                  aggregatedValue = Math.min(
                    aggregatedValue,
                    child.type.fields.find((f) => f.id === childSourceField.id)
                      ?.value ?? aggregatedValue + 1,
                  );
                }
              }
            }
            break;
          case "max":
            for (const child of node.children) {
              if (
                allowedChildTypes.includes(
                  child.type.constructor as typeof NodeType,
                )
              ) {
                if (!initialized) {
                  aggregatedValue =
                    child.type.fields.find((f) => f.id === childSourceField.id)
                      ?.value ?? 0;
                  initialized = true;
                } else {
                  aggregatedValue = Math.max(
                    aggregatedValue,
                    child.type.fields.find((f) => f.id === childSourceField.id)
                      ?.value ?? aggregatedValue - 1,
                  );
                }
              }
            }
            break;
          case "count":
            for (const child of node.children) {
              if (
                allowedChildTypes.includes(
                  child.type.constructor as typeof NodeType,
                ) &&
                child.type.fields.find((f) => f.id === childSourceField.id)
              ) {
                aggregatedValue += 1;
              }
            }
            break;
        }
        node.type.fields
          .find((f) => f.id === targetField.id)
          ?.setValue(aggregatedValue);
      }
    });
    this.childSourceField = childSourceField;
    this.targetField = targetField;
    this.operator = operator;
    this.allowedTypes = allowedTypes;
    this.allowedChildTypes = allowedChildTypes;
  }
}

class AggregateChildrenFieldToParentStep extends NetworkStep {
  childSourceField: FieldDefinition;
  parentTargetField: FieldDefinition;
  operator: Operator;
  allowedParentTypes: (typeof NodeType)[];
  allowedChildTypes: (typeof NodeType)[];

  constructor(
    childSourceField: FieldDefinition,
    parentTargetField: FieldDefinition,
    operator: Operator,
    allowedParentTypes: (typeof NodeType)[] = [],
    allowedChildTypes: (typeof NodeType)[] = [],
  ) {
    super((doc: Doc, node: DocNode, field: FieldDefinition, value: number) => {
      if (
        node.parent &&
        allowedParentTypes.includes(
          node.parent.type.constructor as typeof NodeType,
        ) &&
        node.parent.type.fields.find((f) => f.id === parentTargetField.id)
      ) {
        let aggregatedValue = 0;
        let initialized = false;
        switch (operator) {
          case "sum":
            for (const child of node.parent.children) {
              if (
                allowedChildTypes.includes(
                  child.type.constructor as typeof NodeType,
                ) &&
                child.type.fields.find((f) => f.id === childSourceField.id)
              ) {
                aggregatedValue +=
                  child.type.fields.find((f) => f.id === childSourceField.id)
                    ?.value ?? 0;
              }
            }
            break;
          case "min":
            for (const child of node.parent.children) {
              if (
                allowedChildTypes.includes(
                  child.type.constructor as typeof NodeType,
                ) &&
                child.type.fields.find((f) => f.id === childSourceField.id)
              ) {
                if (!initialized) {
                  aggregatedValue =
                    child.type.fields.find((f) => f.id === childSourceField.id)
                      ?.value ?? 0;
                  initialized = true;
                } else {
                  aggregatedValue = Math.min(
                    aggregatedValue,
                    child.type.fields.find((f) => f.id === childSourceField.id)
                      ?.value ?? aggregatedValue + 1,
                  );
                }
              }
            }
            break;
          case "max":
            for (const child of node.parent.children) {
              if (
                allowedChildTypes.includes(
                  child.type.constructor as typeof NodeType,
                ) &&
                child.type.fields.find((f) => f.id === childSourceField.id)
              ) {
                if (!initialized) {
                  aggregatedValue =
                    child.type.fields.find((f) => f.id === childSourceField.id)
                      ?.value ?? 0;
                  initialized = true;
                } else {
                  aggregatedValue = Math.max(
                    aggregatedValue,
                    child.type.fields.find((f) => f.id === childSourceField.id)
                      ?.value ?? aggregatedValue - 1,
                  );
                }
              }
            }
            break;
          case "count":
            for (const child of node.parent.children) {
              if (
                allowedChildTypes.includes(
                  child.type.constructor as typeof NodeType,
                ) &&
                child.type.fields.find((f) => f.id === childSourceField.id)
                  ?.value
              ) {
                aggregatedValue += 1;
              }
            }
            break;
        }
        node.parent.type.fields
          .find((f) => f.id === parentTargetField.id)
          ?.setValue(aggregatedValue);
      }
    });
    this.childSourceField = childSourceField;
    this.parentTargetField = parentTargetField;
    this.operator = operator;
    this.allowedParentTypes = allowedParentTypes;
    this.allowedChildTypes = allowedChildTypes;
  }
}

class AttachFieldStep extends NetworkStep {
  sourceField: FieldDefinition;
  targetField: FieldDefinition;
  allowedTypes: (typeof NodeType)[];

  constructor(
    sourceField: FieldDefinition,
    targetField: FieldDefinition,
    allowedTypes: (typeof NodeType)[],
  ) {
    super((doc: Doc, node: DocNode, field: FieldDefinition, value: number) => {
      if (
        node.type.fields.find((f) => f.id === sourceField.id) &&
        node.type.fields.find((f) => f.id === targetField.id) &&
        allowedTypes.includes(node.type.constructor as typeof NodeType)
      ) {
        node.type.fields
          .find((f) => f.id === targetField.id)
          ?.setValue(
            node.type.fields.find((f) => f.id === sourceField.id)?.value ?? 0,
          );
      }
    });

    this.sourceField = sourceField;
    this.targetField = targetField;
    this.allowedTypes = allowedTypes;
  }
}

class AttachParentFieldStep extends NetworkStep {
  sourceField: FieldDefinition;
  targetField: FieldDefinition;
  allowedTypes: (typeof NodeType)[];
  allowedParentTypes: (typeof NodeType)[];

  constructor(
    sourceField: FieldDefinition,
    targetField: FieldDefinition,
    allowedTypes: (typeof NodeType)[],
    allowedParentTypes: (typeof NodeType)[],
  ) {
    super((doc: Doc, node: DocNode, field: FieldDefinition, value: number) => {
      if (
        node.parent &&
        node.type.fields.find((f) => f.id === targetField.id) &&
        node.parent.type.fields.find((f) => f.id === sourceField.id) &&
        allowedTypes.includes(node.type.constructor as typeof NodeType) &&
        allowedParentTypes.includes(
          node.parent.type.constructor as typeof NodeType,
        )
      ) {
        node.type.fields
          .find((f) => f.id === targetField.id)
          ?.setValue(
            node.parent.type.fields.find((f) => f.id === sourceField.id)
              ?.value ?? 0,
          );
      }
    });
    this.sourceField = sourceField;
    this.targetField = targetField;
    this.allowedTypes = allowedTypes;
    this.allowedParentTypes = allowedParentTypes;
  }
}

class DistributeProportionalOnChildrenStep extends NetworkStep {
  sourceField: FieldDefinition;
  targetField: FieldDefinition;
  nodeTypes: (typeof NodeType)[];
  childTypes: (typeof NodeType)[];

  constructor(
    sourceField: FieldDefinition,
    targetField: FieldDefinition,
    nodeTypes: (typeof NodeType)[],
    childTypes: (typeof NodeType)[],
  ) {
    super((doc: Doc, node: DocNode, field: FieldDefinition, value: number) => {
      if (!nodeTypes.includes(node.type.constructor as typeof NodeType)) return;

      const targetValue =
        node.type.fields.find((f) => f.id === sourceField.id)?.value ?? 0;

      let childrenValue = 0;
      for (const child of node.children) {
        if (!childTypes.includes(child.type.constructor as typeof NodeType))
          continue;
        childrenValue +=
          child.type.fields.find((f) => f.id === targetField.id)?.value ?? 0;
      }

      if (childrenValue > 0) {
        node.children.map((child) => {
          if (!childTypes.includes(child.type.constructor as typeof NodeType))
            return child;
          const childValue =
            child.type.fields.find((f) => f.id === targetField.id)?.value ?? 0;

          const childTargetValue = (childValue / childrenValue) * targetValue;

          child.type.fields
            .find((f) => f.id === targetField.id)
            ?.setValue(childTargetValue);
        });
      }
    });
    this.sourceField = sourceField;
    this.targetField = targetField;
    this.nodeTypes = nodeTypes;
    this.childTypes = childTypes;
  }
}

class ZeroSubTreeStep extends NetworkStep {
  targetField: FieldDefinition;
  types: (typeof NodeType)[];

  constructor(targetField: FieldDefinition, types: (typeof NodeType)[]) {
    super((doc: Doc, node: DocNode, field: FieldDefinition, value: number) => {
      if (types.includes(node.type.constructor as typeof NodeType)) {
        node.type.fields.find((f) => f.id === targetField.id)?.setValue(0);
        node.children.map((child) => {
          this.execute(doc, child, field, value);
        });
      }
    });
    this.targetField = targetField;
    this.types = types;
  }
}

class EvaluateRulesStep extends NetworkStep {
  constructor() {
    super(
      (
        doc: Doc,
        node: DocNode,
        field: FieldDefinition,
        value: number,
        network?: StepDependencyNetwork,
      ) => {
        if (!network) throw new Error("Network is not defined");
        node.type.evaluateRules(network.networkState, field);
      },
    );
  }
}

class EvaluateParentRulesStep extends NetworkStep {
  constructor() {
    super(
      (
        doc: Doc,
        node: DocNode,
        field: FieldDefinition,
        value: number,
        network?: StepDependencyNetwork,
      ) => {
        if (!network) throw new Error("Network is not defined");
        node.parent?.type.evaluateRules(network.networkState, field);
      },
    );
  }
}

class SetNewFieldValueStep extends NetworkStep {
  constructor() {
    super((doc: Doc, node: DocNode, field: FieldDefinition, value: number) => {
      node.type.fields.find((f) => f.id === field.id)?.setValue(value);
    });
  }
}

class ReapeatNetworkForChildrenStep extends NetworkStep {
  targetField: FieldDefinition;
  constructor(targetField: FieldDefinition) {
    super(
      (
        doc: Doc,
        node: DocNode,
        field: FieldDefinition,
        value: number,
        network?: StepDependencyNetwork,
      ) => {
        if (!network) throw new Error("Network is not defined");
        for (const child of node.children) {
          if (child.type.fields.find((f) => f.id === targetField.id)) {
            const targetValue =
              child.type.fields.find((f) => f.id === targetField.id)?.value ??
              0;
            network.run(doc, child, targetField, targetValue);
          } else {
            const targetValue =
              child.type.fields.find((f) => f.id === field.id)?.value ?? 0;
            network.run(doc, child, field, targetValue);
          }
        }
      },
    );
    this.targetField = targetField;
  }
}

class StepDependencyNetwork {
  protected readonly nodeTypeSteps: Map<(typeof NodeType)[], NetworkStep[]>;
  readonly networkState: DocState; // used to use rules from different DocStates without changing current DocState

  constructor(
    nodeTypeSteps: Map<(typeof NodeType)[], NetworkStep[]>,
    docState: DocState,
  ) {
    this.nodeTypeSteps = nodeTypeSteps;
    this.networkState = docState;
  }

  run(doc: Doc, node: DocNode, field: FieldDefinition, value: number) {
    for (const entry of this.nodeTypeSteps) {
      if (entry[0].includes(node.type.constructor as typeof NodeType)) {
        for (const step of entry[1]) {
          step.execute(doc, node, field, value, this);
        }
      }
    }
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
    );
  }

  evaluateRules(docState: DocState, field: FieldDefinition) {
    for (const rule of this.rules) {
      rule.evaluate(docState, this, field);
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
      (r) =>
        new Rule(r.id, r.expression, r.fieldId, r.docState, r.triggerFieldId),
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

  evaluate(docState: DocState, node: NodeType, changedField: FieldDefinition) {
    if (docState !== this.docState) return;
    if (
      this.triggerFieldId &&
      this.triggerFieldId !== "" &&
      changedField.id !== this.triggerFieldId
    )
      return;
    const value = this.evaluateExpression(this.expression, node.fields);
    node.fields.find((f) => f.id === this.fieldId)?.setValue(value);
  }

  evaluateExpression(expression: string, fields: FieldDefinition[]): number {
    const missing = new Set<String>();
    const prepared = expression.replace(
      /\b[a-zA-Z_][a-zA-Z0-9_]*\b(?!\s*\()/g,
      (name) => {
        const field = fields.find((f) => f.id === name);
        if (!field) missing.add(name);
        return String(field?.value || 0);
      },
    );
    if (missing.size > 0)
      throw new Error(
        `Rule "${this.id}" for field "${this.fieldId}" has unknown declarations: [${[...missing].join(", ")}] in expression "${expression}"`,
      );
    const result = Function(
      "abs",
      `"use strict"; return (${prepared});`,
    )(Math.abs);
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

const transitionBackwardForward = new Transition(
  forwardState,
  (node: DocNode, field: FieldDefinition, value: number) =>
    !(node.type instanceof PercentageNode) &&
    (node.type.rules.every((rule) => rule.fieldId !== field.id) ||
      !node.type.rules.some(
        (rule) => rule.fieldId === field.id && rule.docState === backwardState,
      )),
);

const transitionBackwardPercentage = new Transition(
  percentageBackwardState,
  (node: DocNode, field: FieldDefinition, value: number) =>
    node.type instanceof PercentageNode,
);

const transitionPercentageForward = new Transition(
  forwardState,
  (node: DocNode, field: FieldDefinition, value: number) =>
    !(node.type instanceof PercentageNode) &&
    (node.type.rules.every((rule) => rule.fieldId !== field.id) ||
      !node.type.rules.some(
        (rule) => rule.fieldId === field.id && rule.docState === backwardState,
      )),
);

const transitionPercentageBackward = new Transition(
  backwardState,
  (node: DocNode, field: FieldDefinition, value: number) =>
    !(node.type instanceof PercentageNode) &&
    node.type.rules.some(
      (rule) => rule.fieldId === field.id && rule.docState === backwardState,
    ),
);

forwardState.addTransition(transitionForwardBackward);
forwardState.addTransition(transitionToPercentageBackward);

backwardState.addTransition(transitionBackwardForward);
backwardState.addTransition(transitionBackwardPercentage);

percentageBackwardState.addTransition(transitionPercentageForward);
percentageBackwardState.addTransition(transitionPercentageBackward);

// Node-Types
class TotalCostNode extends NodeType {
  protected static override readonly defaultFields: FieldDefinition[] = [
    new FieldDefinition("total", 0),
    new FieldDefinition("childrenTotal", 0),
    new FieldDefinition("variableChildrenTotal", 0),
    new FieldDefinition("singleChildrenTotal", 0),
  ];

  protected static override readonly defaultRules: Rule[] = [
    new Rule(
      "total-forward",
      "childrenTotal > 0 ? childrenTotal : total",
      "total",
      forwardState,
    ),
    new Rule("total-backward", "total", "total", backwardState),
    new Rule(
      "total-percentage-backward",
      "childrenTotal > 0 ? childrenTotal : total",
      "total",
      percentageBackwardState,
    ),
  ];

  static get allowedChildTypes(): (typeof NodeType)[] {
    return [
      UnitCostNode,
      TotalCostNode,
      PercentageNode,
      SingleUnitCostNode,
      PaintingNode,
    ];
  }
}

class UnitCostNode extends TotalCostNode {
  protected static override readonly defaultFields: FieldDefinition[] = [
    ...super.defaultFields,
    new FieldDefinition("count", 0),
    new FieldDefinition("unitCost", 0),
    new FieldDefinition("oldTotal", 0),
    new FieldDefinition("pricePerUnit", 0),
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
      "childrenTotal > 0 ? variableChildrenTotal * count + singleChildrenTotal : count * unitCost",
      "total",
      forwardState,
    ),
    new Rule(
      "pricePerUnit-forward",
      "count > 0 ? total / count : 0",
      "pricePerUnit",
      forwardState,
    ),
    new Rule(
      "total-backward",
      "childrenTotal > 0 ? variableChildrenTotal * count + singleChildrenTotal : count * unitCost",
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
      "pricePerUnit-backward",
      "count > 0 ? total / count : 0",
      "pricePerUnit",
      backwardState,
    ),
    new Rule(
      "total-percentage-backward",
      "childrenTotal > 0 ? variableChildrenTotal * count + singleChildrenTotal : count * unitCost",
      "total",
      percentageBackwardState,
    ),
  ];
}

class SingleUnitCostNode extends UnitCostNode {}

class PercentageNode extends TotalCostNode {
  protected static override readonly defaultFields: FieldDefinition[] = [
    ...super.defaultFields,
    new FieldDefinition("percentage", 0),
    new FieldDefinition("parentTotal", 0),
  ];

  protected static override readonly defaultRules: Rule[] = [
    new Rule(
      "total-forward",
      "- abs(parentTotal) * percentage / 100 + childrenTotal",
      "total",
      forwardState,
    ),
    new Rule(
      "percentage-backward",
      "- total * 100 / abs(parentTotal)",
      "percentage",
      percentageBackwardState,
      "total",
    ),
    new Rule(
      "total-backward",
      "- abs(parentTotal) * percentage / 100 + childrenTotal",
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

const travel = new SingleUnitCostNode(
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

// dependencyNetworks

// steps

const removeTotalFromDiscountNode = new ZeroSubTreeStep(
  new FieldDefinition("total", 0),
  [PercentageNode],
);

const attachChildrenTotal = new AggregateChildrenFieldStep(
  new FieldDefinition("total", 0),
  new FieldDefinition("childrenTotal", 0),
  "sum",
  [
    UnitCostNode,
    TotalCostNode,
    PercentageNode,
    PaintingNode,
    SingleUnitCostNode,
  ],
  [
    SingleUnitCostNode,
    UnitCostNode,
    TotalCostNode,
    PercentageNode,
    PaintingNode,
  ],
);

const attachChildrenVariableTotal = new AggregateChildrenFieldStep(
  new FieldDefinition("total", 0),
  new FieldDefinition("variableChildrenTotal", 0),
  "sum",
  [
    UnitCostNode,
    TotalCostNode,
    PercentageNode,
    PaintingNode,
    SingleUnitCostNode,
  ],
  [UnitCostNode, TotalCostNode, PercentageNode, PaintingNode],
);

const attachChildrenSingleTotal = new AggregateChildrenFieldStep(
  new FieldDefinition("total", 0),
  new FieldDefinition("singleChildrenTotal", 0),
  "sum",
  [
    UnitCostNode,
    TotalCostNode,
    PercentageNode,
    PaintingNode,
    SingleUnitCostNode,
  ],
  [SingleUnitCostNode],
);

const attachChildrenTotalToParent = new AggregateChildrenFieldToParentStep(
  new FieldDefinition("total", 0),
  new FieldDefinition("childrenTotal", 0),
  "sum",
  [
    UnitCostNode,
    TotalCostNode,
    PercentageNode,
    PaintingNode,
    SingleUnitCostNode,
  ],
  [
    UnitCostNode,
    TotalCostNode,
    PercentageNode,
    PaintingNode,
    SingleUnitCostNode,
  ],
);

const attachChildrenVariableTotalToParent =
  new AggregateChildrenFieldToParentStep(
    new FieldDefinition("total", 0),
    new FieldDefinition("variableChildrenTotal", 0),
    "sum",
    [
      UnitCostNode,
      TotalCostNode,
      PercentageNode,
      PaintingNode,
      SingleUnitCostNode,
    ],
    [UnitCostNode, TotalCostNode, PercentageNode, PaintingNode],
  );

const attachChildrenSingleTotalToParent =
  new AggregateChildrenFieldToParentStep(
    new FieldDefinition("total", 0),
    new FieldDefinition("singleChildrenTotal", 0),
    "sum",
    [
      UnitCostNode,
      TotalCostNode,
      PercentageNode,
      PaintingNode,
      SingleUnitCostNode,
    ],
    [SingleUnitCostNode],
  );

const evaluateRules = new EvaluateRulesStep();

const evaluateParentRules = new EvaluateParentRulesStep();

const attachOldTotal = new AttachFieldStep(
  new FieldDefinition("total", 0),
  new FieldDefinition("oldTotal", 0),
  [UnitCostNode, SingleUnitCostNode, PaintingNode],
);

const attachParentTotal = new AttachParentFieldStep(
  new FieldDefinition("total", 0),
  new FieldDefinition("parentTotal", 0),
  [PercentageNode],
  [TotalCostNode, PercentageNode],
);

const attachParentPricePerUnit = new AttachParentFieldStep(
  new FieldDefinition("pricePerUnit", 0),
  new FieldDefinition("parentTotal", 0),
  [PercentageNode],
  [UnitCostNode, SingleUnitCostNode, PaintingNode],
);

const distributeTotalOnChildrenBackwards =
  new DistributeProportionalOnChildrenStep(
    new FieldDefinition("total", 0),
    new FieldDefinition("total", 0),
    [TotalCostNode],
    [
      TotalCostNode,
      UnitCostNode,
      SingleUnitCostNode,
      PaintingNode,
      PercentageNode,
    ],
  );

const distributeUnitCostOnChildrenBackwards =
  new DistributeProportionalOnChildrenStep(
    new FieldDefinition("unitCost", 0),
    new FieldDefinition("total", 0),
    [UnitCostNode, SingleUnitCostNode, PaintingNode],
    [
      TotalCostNode,
      UnitCostNode,
      SingleUnitCostNode,
      PaintingNode,
      PercentageNode,
    ],
  );

const setValue = new SetNewFieldValueStep();

const repeatNetworkForChildren = new ReapeatNetworkForChildrenStep(
  new FieldDefinition("total", 0),
);

// networks

const forwardNetworSetValuekMap = new Map<(typeof NodeType)[], NetworkStep[]>();

forwardNetworSetValuekMap.set(
  [
    UnitCostNode,
    SingleUnitCostNode,
    PaintingNode,
    TotalCostNode,
    PercentageNode,
  ],
  [setValue],
);

const forwardNetworkSetValue = new StepDependencyNetwork(
  forwardNetworSetValuekMap,
  forwardState,
);

const forwardNetworkWithoutPercentageMap = new Map<
  (typeof NodeType)[],
  NetworkStep[]
>();

forwardNetworkWithoutPercentageMap.set(
  [UnitCostNode, SingleUnitCostNode, PaintingNode, TotalCostNode],
  [
    repeatNetworkForChildren,
    attachChildrenTotal,
    attachChildrenVariableTotal,
    attachChildrenSingleTotal,
    evaluateRules,
  ],
);
forwardNetworkWithoutPercentageMap.set(
  [PercentageNode],
  [removeTotalFromDiscountNode],
);

const forwardNetworkWithoutPercentage = new StepDependencyNetwork(
  forwardNetworkWithoutPercentageMap,
  forwardState,
);

const forwardNetworkWithPercentageMap = new Map<
  (typeof NodeType)[],
  NetworkStep[]
>();

forwardNetworkWithPercentageMap.set(
  [UnitCostNode, SingleUnitCostNode, PaintingNode, TotalCostNode],
  [
    repeatNetworkForChildren,
    attachChildrenTotal,
    attachChildrenVariableTotal,
    attachChildrenSingleTotal,
    evaluateRules,
    attachOldTotal,
  ],
);
forwardNetworkWithPercentageMap.set(
  [PercentageNode],
  [
    attachChildrenTotalToParent,
    attachChildrenVariableTotalToParent,
    attachChildrenSingleTotalToParent,
    evaluateParentRules,
    attachParentTotal,
    attachParentPricePerUnit,
    attachChildrenTotal,
    attachChildrenVariableTotal,
    attachChildrenSingleTotal,
    evaluateRules,
    repeatNetworkForChildren,
    attachChildrenTotal,
    attachChildrenVariableTotal,
    attachChildrenSingleTotal,
    evaluateRules,
  ],
);

const forwardNetworkWithPercentage = new StepDependencyNetwork(
  forwardNetworkWithPercentageMap,
  forwardState,
);

const backwardNetworkMap = new Map<(typeof NodeType)[], NetworkStep[]>();

backwardNetworkMap.set(
  [TotalCostNode],
  [
    setValue,
    evaluateRules,
    distributeTotalOnChildrenBackwards,
    repeatNetworkForChildren,
    attachChildrenTotal,
    attachChildrenVariableTotal,
    attachChildrenSingleTotal,
    evaluateRules,
  ],
);

backwardNetworkMap.set(
  [UnitCostNode, SingleUnitCostNode, PaintingNode],
  [
    setValue,
    evaluateRules,
    distributeUnitCostOnChildrenBackwards,
    repeatNetworkForChildren,
    attachChildrenTotal,
    attachChildrenVariableTotal,
    attachChildrenSingleTotal,
    evaluateRules,
    attachOldTotal,
  ],
);

const backwardNetwork = new StepDependencyNetwork(
  backwardNetworkMap,
  backwardState,
);

const percentageNetworkMap = new Map<(typeof NodeType)[], NetworkStep[]>();

percentageNetworkMap.set(
  [PercentageNode],
  [
    removeTotalFromDiscountNode,
    setValue,
    attachChildrenTotal,
    attachChildrenVariableTotal,
    attachChildrenSingleTotal,
    evaluateRules,
  ],
);

const percentageNetwork = new StepDependencyNetwork(
  percentageNetworkMap,
  percentageBackwardState,
);

// Add Networks to state
forwardState.addNetwork({
  startAt: "changedNode",
  network: forwardNetworkSetValue,
});
forwardState.addNetwork({
  startAt: "root",
  network: forwardNetworkWithoutPercentage,
});
forwardState.addNetwork({
  startAt: "root",
  network: forwardNetworkWithPercentage,
});
backwardState.addNetwork({
  startAt: "changedNode",
  network: backwardNetwork,
});
backwardState.addNetwork({
  startAt: "root",
  network: forwardNetworkWithoutPercentage,
});
backwardState.addNetwork({
  startAt: "root",
  network: forwardNetworkWithPercentage,
});
percentageBackwardState.addNetwork({
  startAt: "changedNode",
  network: percentageNetwork,
});
percentageBackwardState.addNetwork({
  startAt: "root",
  network: forwardNetworkWithoutPercentage,
});
percentageBackwardState.addNetwork({
  startAt: "root",
  network: forwardNetworkWithPercentage,
});

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
