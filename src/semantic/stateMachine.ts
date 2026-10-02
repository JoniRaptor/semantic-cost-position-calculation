export class Doc {
  root: DocNode;
  currentState: DocState;
  private nodeTypes: Map<string, NodeType>;

  /**
   * Class to connect Node-Tree with State-Machine
   * @param root root of Node-Tree
   * @param currentState starting State of State-Machine
   * @param nodeTypes Map of instances of NodeTypes allowed in the Node-Tree
   */
  constructor(
    root: DocNode,
    currentState: DocState, // simply for checking next Transition conditions
    nodeTypes: Map<string, NodeType>,
  ) {
    this.root = root;
    this.currentState = currentState;
    this.nodeTypes = nodeTypes;
  }

  /**
   * Method to find a Node in the Node-Tree by its id
   * @param id id of the Node
   * @returns the found Node
   */
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

  /**
   * Method to handle transitions to different states of the State-Machine and executes the corresponding list of Dependency-Networks
   * @param node changed Node
   * @param field changed Field
   * @param value new Value
   * @returns Root of updated Node-Tree
   */
  private handleState(node: DocNode, field: FieldDefinition, value: number): DocNode {
    // check conditions
    for (const transition of this.currentState.transitions) {
      if (transition.condition(node, field, value)) {
        // change state
        this.currentState = transition.targetState;
        // execute registered list of dependency-Networks
        this.currentState.executeNetworks(this, node, field, value);
        return this.root;
      }
    }
    this.currentState.executeNetworks(this, node, field, value);
    return this.root;
  }

  /**
   * Method to update the Node-Tree for a changed Field with the defined bahavior in the State-Machine
   * @param tree the Doc to be updated
   * @param nodeId id of the changed Node
   * @param field changed Field
   * @param value new Value
   * @returns Root of updated Node-Tree
   */
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

  /**
   * Method to recursively attach parents to all Nodes in the Node-Tree of the Doc
   * @param node Node to attach parents to
   * @param parent parent of the Node
   * @returns Node with attached parents
   */
  attachParents(node: DocNode, parent?: DocNode) {
    node.parent = parent;
    for (const child of node.children) {
      if (node.type.canAddChild(child.type)) {
        this.attachParents(child, node);
      }
    }
    return node;
  }

  /**
   * Function to recursively convert an instance of the CostNode-Interface to a DocNode-Tree
   * @param node CostNode to be converted
   * @returns DocNode
   */
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

  /**
   * Function to recursively convert a DocNode to a CostNode-Tree
   * @param docNode DocNode to be converted
   * @returns CostNode
   */
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

  /**
   * Function to set the root of the Doc
   * @param node DocNode to be set as root
   */
  setRoot(node: DocNode) {
    this.root = node;
  }

  /**
   * Function to get a Map of instances of NodeTypes allowed in the Node-Tree
   * @returns Map of instances of NodeTypes in the Node-Tree
   */
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
  readonly id: string;
  readonly label: string;
  readonly type: NodeType;
  children: DocNode[];
  parent?: DocNode;

  /**
   * Class to represent a Node in the Node-Tree
   * @param id id of the Node (needs to be unique)
   * @param label label of the Node
   * @param type actual type-instance of the Node with the fields and Rules
   */
  constructor(id: string, label: string, type: NodeType) {
    this.id = id;
    this.label = label;
    this.type = type.clone();
    this.children = [];
  }

  /**
   * Function to add a child to the Node-Tree if the type of the child is allowed on this Node-Type
   * @param child child to be added
   */
  addchild(child: DocNode) {
    if (!this.type.canAddChild(child.type)) return;
    this.children.push(child);
    child.parent = this;
  }
}

export class DocState {
  readonly id: string;
  readonly dependencyNetworks: {
    startAt: "root" | "changedNode";
    network: StepDependencyNetwork;
  }[];
  readonly transitions: Transition[];

  /**
   * Class to represent a State in the State-Machine
   * has a list of Dependency-Networks and Transitions
   * @param id id of the State (needs to be unique)
   */
  constructor(id: string) {
    this.id = id;
    this.dependencyNetworks = [];
    this.transitions = [];
  }

  /**
   * Method to add a Dependency-Network to the State
   * @param dependencyNetwork Dependency-Network to be added + specify from what node (root or changedNode) the Dependency-Network should be executed
   */
  addNetwork(dependencyNetwork: {
    startAt: "root" | "changedNode";
    network: StepDependencyNetwork;
  }) {
    this.dependencyNetworks.push(dependencyNetwork);
  }

  /**
   * Method to add a Transition to the State
   * @param transition Transition to be added
   */
  addTransition(transition: Transition) {
    this.transitions.push(transition);
  }

  /**
   * Method to execute all registered Dependency-Networks of the State in the added order
   * @param doc Doc to be updated
   * @param node changed Node
   * @param field changed Field
   * @param value new Value
   */
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
  readonly execute: (
    doc: Doc,
    node: DocNode,
    field: FieldDefinition,
    value: number,
    network?: StepDependencyNetwork,
  ) => void;

  /**
   * Class to represent a custom-Step in the Dependency-Network
   * @param execute Method to be executed with 
   * signature of Method: (doc: Doc, currentNode: DocNode, changedField: FieldDefinition, value: number, network?: StepDependencyNetwork)
   */
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
  private childSourceField: FieldDefinition;
  private targetField: FieldDefinition;
  private operator: Operator;
  private allowedTypes: (typeof NodeType)[];
  private allowedChildTypes: (typeof NodeType)[];

  /**
   * Predefined NetworkStep for aggregating field of children to current Node
   * @param childSourceField Field of children to be aggregated
   * @param targetField Field to set to aggregated value
   * @param operator Operation to be used (sum, min, max, count)
   * @param allowedTypes NodeTypes the instance of this step can be executed on
   * @param allowedChildTypes NodeTypes of children that can be aggregated
   */
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
  private childSourceField: FieldDefinition;
  private parentTargetField: FieldDefinition;
  private operator: Operator;
  private allowedParentTypes: (typeof NodeType)[];
  private allowedChildTypes: (typeof NodeType)[];

  /**
   * Predefined NetworkStep for aggregating field of children of parent of current Node to parent of current Node
   * @param childSourceField Field of children to be aggregated
   * @param parentTargetField Field of parent to set to aggregated value
   * @param operator Operation to be used (sum, min, max, count)
   * @param allowedParentTypes NodeTypes of parent for wich the instance of this step can be executed
   * @param allowedChildTypes NodeTypes of children that can be aggregated (includes current Node)
   */
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
  private sourceField: FieldDefinition;
  private targetField: FieldDefinition;
  private allowedTypes: (typeof NodeType)[];

  /**
   * Predefined NetworkStep for attaching field of current Node to field of current Node
   * @param sourceField Field of current Node to be attached
   * @param targetField Field of current Node to set to source value
   * @param allowedTypes NodeTypes for which the instance of this step can be executed
   */
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
  private parentSourceField: FieldDefinition;
  private targetField: FieldDefinition;
  private allowedTypes: (typeof NodeType)[];
  private allowedParentTypes: (typeof NodeType)[];

  /**
   * Predefined NetworkStep for attaching field of parent of current Node to field of current Node
   * @param parentSourceField Field of parent of current Node to be attached
   * @param targetField Field of current Node to set to parent value
   * @param allowedTypes NodeTypes for which the instance of this step can be executed
   * @param allowedParentTypes Parent NodeTypes for which the instance of this step can be executed
   */
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
  private sourceField: FieldDefinition;
  private childrenTargetField: FieldDefinition;
  private nodeTypes: (typeof NodeType)[];
  private childTypes: (typeof NodeType)[];

  /**
   * Predefined NetworkStep for distributing field of current Node proportionaly on field of children
   * @param sourceField Field of current Node to be distributed
   * @param childrenTargetField Field of children of current Node to distribute value on (proportionaly to share of the individual child of sum on targetField of children)
   * @param nodeTypes NodeTypes for which the instance of this step can be executed
   * @param childTypes Child NodeTypes on wich to distribute the value of sourceField
   */
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
  private targetField: FieldDefinition;
  private types: (typeof NodeType)[];

  /**
   * Predefined NetworkStep for zeroing field of current Nod and children of current Node
   * @param targetField Field of to be zeroed
   * @param types NodeTypes for which the field will be zeroed
   */
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
  /**
   * Predefined NetworkStep for evaluating rules of current Node
   */
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
  /**
   * Predefined NetworkStep for evaluating rules of parent of current Node
   */
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
  /**
   * Predefined NetworkStep for setting field of current Node to the changed value
   */
  constructor() {
    super((doc: Doc, node: DocNode, field: FieldDefinition, value: number) => {
      node.type.fields.find((f) => f.id === field.id)?.setValue(value);
    });
  }
}

export class ReapeatNetworkForChildrenStep extends NetworkStep {
  private childrenTargetField: FieldDefinition;

  /**
   * Predefined NetworkStep for running current Dependency-Network for children of current Node
   * @param childrenTargetField Field of children on which to run the Dependency-Network
   */
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

  /**
   * Class for one Dependency-Network of NodeTypes (product) and the coresponding steps
   * @param nodeTypeSteps Map of NodeType-classes (product) and the coresponding steps
   * @param networkState NetworkState of the Dependency-Network (important for which rules to use)
   */
  constructor(
    nodeTypeSteps: Map<(typeof NodeType)[], NetworkStep[]>,
    networkState: StepDependencyNetworkState,
  ) {
    this.nodeTypeSteps = nodeTypeSteps;
    this.networkState = networkState;
  }

  /**
   * Method to run the steps of the Dependency-Network for the current NodeType
   * @param doc current Doc
   * @param node Node on which to run the Dependency-Network
   * @param field changed Field
   * @param value new Value
   */
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
  private id: string;

  /**
   * Class for State of a Dependency-Network to determine which rules to use
   * @param id id of the State
   */
  constructor(id: string) {
    this.id = id;
  }
}

export class Transition {
  readonly targetState: DocState;
  readonly condition: (node: DocNode, field: FieldDefinition, value: number) => boolean;

  /**
   * Class for Transition between two States of the State-Machine
   * @param targetState State to which the Transition leads if the condition is true
   * @param condition Function to check if the Transition should be executed
   * signature of Function: (currentNode: DocNode, changedField: FieldDefinition, value: number) => boolean
   */
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
  readonly typeId: string;
  readonly label: string;
  protected static readonly defaultFields: FieldDefinition[];
  fields: FieldDefinition[];
  protected static readonly defaultRules: Rule[];
  readonly rules: Rule[];

  /**
   * Class for Node-Type in the Node-Tree
   * @param typeId needs to be unique
   * @param label label of the Node-Type
   * @param fields fields of the Node-Type
   * @param labels labels of the fields {fieldId: string, label: string}
   * @param rules rules of the Node-Type
   * @throws Error if a Rule uses a field that is not part of the Node-Type
   */
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

  /**
   * Method to add a field to the Node-Type
   * @param field the field to be added
   */
  addField(field: FieldDefinition) {
    this.fields.push(field);
  }

  /**
   * Method to remove a field from the Node-Type
   * @param id id of the field to be removed
   */
  removeField(id: string) {
    this.fields = this.fields.filter((f) => f.id !== id);
  }

  static get allowedChildTypes(): (typeof NodeType)[] {
    return [];
  }

  /**
   * Method to check if a Node-Type can be added as a child of the current Node-Type
   * @param nodeType instance of Node-Type to be added
   */
  canAddChild(nodeType: NodeType): boolean {
    return (this.constructor as typeof NodeType).allowedChildTypes.some(
      (childType) => childType === nodeType.constructor,
    );
  }

  /**
   * Method to evaluate all rules of the Node-Type and make changes to the fields
   * @param networkState the NetworkState of the current Dependency-Network
   * @param field the Field that was changed
   */
  evaluateRules(
    networkState: StepDependencyNetworkState,
    field: FieldDefinition,
  ) {
    for (const rule of this.rules) {
      rule.evaluate(networkState, this, field);
    }
  }

  /**
   * Method to set the labels of the fields
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
  readonly id: string;
  value: number;
  label: string;

  /**
   * Class to define a Field of a Node-Type
   * @param id needs to be unique in the Node-Type
   * @param value initial value
   * @param label label for display
   */
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
  readonly id: string;
  readonly expression: string;
  readonly fieldId: string;
  readonly networkState: StepDependencyNetworkState;
  readonly triggerFieldId: string;

  /**
   * Class to define a Rule of a Node-Type
   * @param id needs to be unique in the Node-Type
   * @param expression expression-string of fieldnames of current Node-Type and simple arithmetic operators and inline functions
   * @param fieldId id of the field to be changed to calculated value
   * @param networkState NetworkState of the Dependency-Network on which the Rule should be executed
   * @param triggerFieldId optional id of the field that triggers the rule only when it is the field that was changed
   */
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

  /**
   * Method to evaluate a Rule
   * @param networkState the NetworkState of the current Dependency-Network
   * @param node the Node-Type of the current Node
   * @param changedField the Field that was changed
   */
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

  /**
   * Function that replaces fieldnames with their values and then evaluates the expression
   * @param expression expression-string to be evaluated
   * @param fields fields of current Node-Type
   * @returns calculated value
   * @throws if expression contains unknown fieldnames
   */
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