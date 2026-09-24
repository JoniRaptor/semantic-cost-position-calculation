export class Doc {
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
    if (!nodeType) throw new Error(`Node type ${node.typeId} not found`);
    nodeType = nodeType.clone();
    for (const field of nodeType.fields) {
      field.setValue(node.values[field.id]);
    }
    let docNode = new DocNode(node.id, node.label, nodeType.clone());
    for (const child of node.children) {
      docNode.addchild(this.convertCostNodeToDocNode(child));
    }
    return docNode;
  }

  convertDocNodeToCostNode(docNode: DocNode): CostNodeView {
    let costNode: CostNodeView = {
      id: docNode.id,
      typeId: docNode.type.typeId,
      label: docNode.label,
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

export class DocNode {
  id: string;
  label: string;
  type: NodeType;
  children: DocNode[];
  parent?: DocNode;

  constructor(id: string, label: string, type: NodeType) {
    this.id = id;
    this.label = label;
    this.type = type.clone();
    this.children = [];
  }

  addchild(child: DocNode) {
    if (!this.type.canAddChild(child.type)) return;
    this.children.push(child);
    child.parent = this;
  }
}

export class DocState {
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

export class NetworkStep {
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

export type Operator = "sum" | "min" | "max" | "count";

export class AggregateChildrenFieldStep extends NetworkStep {
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

export class AggregateChildrenFieldToParentStep extends NetworkStep {
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

export class AttachFieldStep extends NetworkStep {
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

export class AttachParentFieldStep extends NetworkStep {
  parentSourceField: FieldDefinition;
  targetField: FieldDefinition;
  allowedTypes: (typeof NodeType)[];
  allowedParentTypes: (typeof NodeType)[];

  constructor(
    parentSourceField: FieldDefinition,
    targetField: FieldDefinition,
    allowedTypes: (typeof NodeType)[],
    allowedParentTypes: (typeof NodeType)[],
  ) {
    super((doc: Doc, node: DocNode, field: FieldDefinition, value: number) => {
      if (
        node.parent &&
        node.type.fields.find((f) => f.id === targetField.id) &&
        node.parent.type.fields.find((f) => f.id === parentSourceField.id) &&
        allowedTypes.includes(node.type.constructor as typeof NodeType) &&
        allowedParentTypes.includes(
          node.parent.type.constructor as typeof NodeType,
        )
      ) {
        node.type.fields
          .find((f) => f.id === targetField.id)
          ?.setValue(
            node.parent.type.fields.find((f) => f.id === parentSourceField.id)
              ?.value ?? 0,
          );
      }
    });
    this.parentSourceField = parentSourceField;
    this.targetField = targetField;
    this.allowedTypes = allowedTypes;
    this.allowedParentTypes = allowedParentTypes;
  }
}

export class DistributeProportionalOnChildrenStep extends NetworkStep {
  sourceField: FieldDefinition;
  childrenTargetField: FieldDefinition;
  nodeTypes: (typeof NodeType)[];
  childTypes: (typeof NodeType)[];

  constructor(
    sourceField: FieldDefinition,
    childrenTargetField: FieldDefinition,
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
          child.type.fields.find((f) => f.id === childrenTargetField.id)
            ?.value ?? 0;
      }

      if (childrenValue > 0) {
        node.children.map((child) => {
          if (!childTypes.includes(child.type.constructor as typeof NodeType))
            return child;
          const childValue =
            child.type.fields.find((f) => f.id === childrenTargetField.id)
              ?.value ?? 0;

          const childTargetValue = (childValue / childrenValue) * targetValue;

          child.type.fields
            .find((f) => f.id === childrenTargetField.id)
            ?.setValue(childTargetValue);
        });
      }
    });
    this.sourceField = sourceField;
    this.childrenTargetField = childrenTargetField;
    this.nodeTypes = nodeTypes;
    this.childTypes = childTypes;
  }
}

export class ZeroSubTreeStep extends NetworkStep {
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

export class EvaluateRulesStep extends NetworkStep {
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

export class EvaluateParentRulesStep extends NetworkStep {
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

export class SetNewFieldValueStep extends NetworkStep {
  constructor() {
    super((doc: Doc, node: DocNode, field: FieldDefinition, value: number) => {
      node.type.fields.find((f) => f.id === field.id)?.setValue(value);
    });
  }
}

export class ReapeatNetworkForChildrenStep extends NetworkStep {
  childrenTargetField: FieldDefinition;
  constructor(childrenTargetField: FieldDefinition) {
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
          if (child.type.fields.find((f) => f.id === childrenTargetField.id)) {
            const targetValue =
              child.type.fields.find((f) => f.id === childrenTargetField.id)
                ?.value ?? 0;
            network.run(doc, child, childrenTargetField, targetValue);
          } else {
            const targetValue =
              child.type.fields.find((f) => f.id === field.id)?.value ?? 0;
            network.run(doc, child, field, targetValue);
          }
        }
      },
    );
    this.childrenTargetField = childrenTargetField;
  }
}

export class StepDependencyNetwork {
  protected readonly nodeTypeSteps: Map<(typeof NodeType)[], NetworkStep[]>;
  readonly networkState: StepDependencyNetworkState; // used to use rules from different states

  constructor(
    nodeTypeSteps: Map<(typeof NodeType)[], NetworkStep[]>,
    networkState: StepDependencyNetworkState,
  ) {
    this.nodeTypeSteps = nodeTypeSteps;
    this.networkState = networkState;
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

export class StepDependencyNetworkState {
  id: string;

  constructor(id: string) {
    this.id = id;
  }
}

export class Transition {
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

    const fieldIds = new Set<string>(this.fields.map((f) => f.id));
    for (const rule of this.rules) {
      const referencedFields =
        rule.expression.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b(?!\s*\()/g) ?? [];
      const unknownFields = referencedFields.filter((f) => !fieldIds.has(f));
      if (unknownFields.length > 0) {
        throw new Error(
          `NodeType "${this.typeId}", Rule "${rule.id}" for field "${rule.fieldId}" has unknown declarations: [${unknownFields.join(", ")}] in expression: "${rule.expression}"`,
        );
      }
    }
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

  evaluateRules(
    networkState: StepDependencyNetworkState,
    field: FieldDefinition,
  ) {
    for (const rule of this.rules) {
      rule.evaluate(networkState, this, field);
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
        new Rule(
          r.id,
          r.expression,
          r.fieldId,
          r.networkState,
          r.triggerFieldId,
        ),
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

export class Rule {
  id: string;
  expression: string;
  fieldId: string;
  networkState: StepDependencyNetworkState;
  readonly triggerFieldId: string;
  constructor(
    id: string,
    expression: string,
    fieldId: string,
    networkState: StepDependencyNetworkState,
    triggerFieldId: string = "",
  ) {
    this.id = id;
    this.expression = expression;
    this.fieldId = fieldId;
    this.networkState = networkState;
    this.triggerFieldId = triggerFieldId;
  }

  evaluate(
    networkState: StepDependencyNetworkState,
    node: NodeType,
    changedField: FieldDefinition,
  ) {
    if (networkState !== this.networkState) return;
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