import {
  StepDependencyNetworkState,
  NetworkStep,
  AggregateChildrenFieldStep,
  AggregateChildrenFieldToParentStep,
  AttachFieldStep,
  AttachParentFieldStep,
  DistributeProportionalOnChildrenStep,
  ZeroSubTreeStep,
  EvaluateRulesStep,
  EvaluateParentRulesStep,
  SetNewFieldValueStep,
  ReapeatNetworkForChildrenStep,
  Doc,
  DocNode,
  FieldDefinition,
  StepDependencyNetwork,
  NodeType,
  Transition,
  DocState,
  Rule,
} from "./stateMachine";
import type { Operator } from "./stateMachine";

/**
 * Builder for State of a Dependency-Network to determine which rules to use
 */
export class NetworkStateBuilder {
  private networkId: string = "";

  /**
   * Set the id of the State (required)
   * @param id id of the State
   */
  id(id: string) {
    this.networkId = id;
    return this;
  }

  build() {
    if (this.networkId === "") throw new Error("id() is required");
    return new StepDependencyNetworkState(this.networkId);
  }
}

// NodeTypen definieren

/**
 * Builder to define a Field of a Node-Type
 */
export class FieldDefinitionBuilder {
  private identifier: string = undefined!;
  private value: number = 0;
  private l: string = undefined!;

  /**
   * Set the id of the Field (required and needs to be unique in the Node-Typ)
   * @param id
   */
  id(id: string) {
    this.identifier = id;
    return this;
  }

  /**
   * Set the label of the Field
   * @param l label
   */
  label(l: string) {
    this.l = l;
    return this;
  }

  build() {
    if (this.identifier === undefined) throw new Error("id is required");
    return new FieldDefinition(this.identifier, this.value, this.l);
  }
}

/**
 * Builder to define a Rule of a Node-Type
 */
export class RuleBuilder {
  private identifier: string = undefined!;
  private expression: string = undefined!;
  private field: string = undefined!;
  private netState: StepDependencyNetworkState = undefined!;
  private triggerField: string = "";

  /**
   * Set the id of the Rule (required and needs to be unique in the Node-Typ)
   * @param id
   */
  id(id: string) {
    this.identifier = id;
    return this;
  }

  /**
   * Set id of the field to be changed to calculated value (required)
   * @param id
   */
  targetFieldId(id: string) {
    this.field = id;
    return this;
  }

  /**
   * Set the expression-string consisting of fieldnames of the current Node-Type and simple arithmetic operators and inline functions (required)
   * @param expression
   */
  calculationRule(expression: string) {
    this.expression = expression;
    return this;
  }

  /**
   * Set the NetworkState of the Dependency-Network on which the Rule should be executed (required)
   * @param netState
   */
  forNetworkState(netState: StepDependencyNetworkState) {
    this.netState = netState;
    return this;
  }

  /**
   * Set the id of the field that triggers the rule only when it is the field that was changed (optional)
   * @param id
   */
  triggerOnChangeOfField(id: string) {
    this.triggerField = id;
    return this;
  }

  build() {
    if (this.identifier === undefined) throw new Error("id is required");
    if (this.expression === undefined)
      throw new Error("expression is required");
    if (this.field === undefined) throw new Error("field is required");
    if (this.netState === undefined) throw new Error("netState is required");
    return new Rule(
      this.identifier,
      this.expression,
      this.field,
      this.netState,
      this.triggerField,
    );
  }
}

export const StepType = {
  CustomStep: NetworkStep,
  AggregateChildrenField: AggregateChildrenFieldStep,
  AggregateChildrenFieldToParent: AggregateChildrenFieldToParentStep,
  AttachField: AttachFieldStep,
  AttachParentField: AttachParentFieldStep,
  DistributeProportionalOnChildren: DistributeProportionalOnChildrenStep,
  ZeroSubTree: ZeroSubTreeStep,
  EvaluateRules: EvaluateRulesStep,
  EvaluateParentRules: EvaluateParentRulesStep,
  SetNewFieldValue: SetNewFieldValueStep,
  ReapeatNetworkForChildren: ReapeatNetworkForChildrenStep,
};

type StepTypes = (typeof StepType)[keyof typeof StepType];

/**
 * Builder to create a Step of a Dependency-Network
 */
export class StepInstanceBuilder {
  /**
   * Create a predefined Step for aggregating field of children to current Node
   * @param stepType AggregateChildrenFieldStep
   */
  type(
    stepType: typeof AggregateChildrenFieldStep,
  ): AggregateChildrenFieldStepBuilder;
  /**
   * Create a predefined Step for aggregating field of children of parent of current Node to parent of current Node
   * @param stepType AggregateChildrenFieldToParentStep
   */
  type(
    stepType: typeof AggregateChildrenFieldToParentStep,
  ): AggregateChildrenFieldToParentStepBuilder;
  /**
   * Create a predefined Step for attaching field of current Node to field of current Node
   * @param stepType AttachFieldStep
   */
  type(stepType: typeof AttachFieldStep): AttachFieldStepBuilder;
  /**
   * Create a predefined Step for attaching field of parent of current Node to field of current Node
   * @param stepType AttachParentFieldStep
   */
  type(stepType: typeof AttachParentFieldStep): AttachParentFieldStepBuilder;
  /**
   * Create a predefined Step for distributing field of current Node to field of children
   * @param stepType DistributeProportionalOnChildrenStep
   */
  type(
    stepType: typeof DistributeProportionalOnChildrenStep,
  ): DistributeProportionalOnChildrenStepBuilder;
  /**
   * Create a predefined Step for zeroing field of current Nod and children of current Node
   * @param stepType ZeroSubTreeStep
   */
  type(stepType: typeof ZeroSubTreeStep): ZeroSubTreeStepBuilder;
  /**
   * Create a predefined Step for evaluating rules of current Node
   * @param stepType EvaluateRulesStep
   */
  type(stepType: typeof EvaluateRulesStep): EvaluateRulesStepBuilder;
  /**
   * Create a predefined Step for evaluating rules of parent of current Node
   * @param stepType EvaluateParentRulesStep
   */
  type(
    stepType: typeof EvaluateParentRulesStep,
  ): EvaluateParentRulesStepBuilder;
  /**
   * Create a predefined Step for setting field of current Node to the changed value
   * @param stepType SetNewFieldValueStep
   */
  type(stepType: typeof SetNewFieldValueStep): SetNewFieldValueStepBuilder;
  /**
   * Create a predefined Step for running current Dependency-Network for children of current Node
   * @param stepType ReapeatNetworkForChildrenStep
   */
  type(
    stepType: typeof ReapeatNetworkForChildrenStep,
  ): ReapeatNetworkForChildrenStepBuilder;
  /**
   * Create a custom TypeScript Step in the Dependency-Network
   * @param stepType NetworkStep
   */
  type(stepType: typeof NetworkStep): NetworkStepBuiler;

  type(stepType: StepTypes): unknown {
    switch (stepType) {
      case AggregateChildrenFieldStep:
        return new AggregateChildrenFieldStepBuilder();
      case AggregateChildrenFieldToParentStep:
        return new AggregateChildrenFieldToParentStepBuilder();
      case AttachFieldStep:
        return new AttachFieldStepBuilder();
      case AttachParentFieldStep:
        return new AttachParentFieldStepBuilder();
      case DistributeProportionalOnChildrenStep:
        return new DistributeProportionalOnChildrenStepBuilder();
      case ZeroSubTreeStep:
        return new ZeroSubTreeStepBuilder();
      case EvaluateRulesStep:
        return new EvaluateRulesStepBuilder();
      case EvaluateParentRulesStep:
        return new EvaluateParentRulesStepBuilder();
      case SetNewFieldValueStep:
        return new SetNewFieldValueStepBuilder();
      case ReapeatNetworkForChildrenStep:
        return new ReapeatNetworkForChildrenStepBuilder();
      case NetworkStep:
        return new NetworkStepBuiler();
      default:
        throw new Error(`Unknown step type: ${stepType}`);
    }
  }
}

class NetworkStepBuiler {
  private execute: (
    doc: Doc,
    node: DocNode,
    field: FieldDefinition,
    value: number,
    network?: StepDependencyNetwork,
  ) => void = () => {};

  /**
   * Set a TypeScript-method as a custom Step
   * @param execute the method of the signature (required): (doc: Doc, node: DocNode, field: FieldDefinition, value: number, network?: StepDependencyNetwork)
   */
  setTypeScriptStep(
    execute: (
      doc: Doc,
      node: DocNode,
      field: FieldDefinition,
      value: number,
      network?: StepDependencyNetwork,
    ) => void,
  ) {
    this.execute = execute;
    return this;
  }

  build() {
    if (!this.execute) throw new Error("setTypeScriptStep is required");
    return new NetworkStep(this.execute);
  }
}

class AggregateChildrenFieldStepBuilder {
  private childSourceField: FieldDefinition = undefined!;
  private targetField: FieldDefinition = undefined!;
  private op: Operator = undefined!;
  private allowedTypes: (typeof NodeType)[] = undefined!;
  private allowedChildrenTypes: (typeof NodeType)[] = undefined!;

  /**
   * Set the field of the children to be aggregated (the source of the aggregation) (required)
   * @param childSourceField fieldId of field of children to be aggregated
   */
  childField(childSourceField: string) {
    this.childSourceField = new FieldDefinition(childSourceField, 0);
    return this;
  }

  /**
   * Set the field of the current Node to set to aggregated value to (required)
   * @param targetField fieldId of field of current node
   */
  nodeTargetField(targetField: string) {
    this.targetField = new FieldDefinition(targetField, 0);
    return this;
  }

  /**
   * Set the operator to use for aggregation (required)
   * @param operator operator to use for aggregation (sum, min, max, count)
   */
  operator(operator: Operator) {
    this.op = operator;
    return this;
  }

  /**
   * Set the allowed Node-Types for aggregation (required)
   * @param allowedTypes allowed Node-Types for aggregation
   */
  allowedNodeTypes(allowedTypes: (typeof NodeType)[]) {
    this.allowedTypes = allowedTypes;
    return this;
  }

  /**
   * Set the allowed Node-Types of children of current Node for aggregation (required)
   * @param allowedChildTypes allowed Node-Types of children for aggregation
   */
  allowedChildTypes(allowedChildTypes: (typeof NodeType)[]) {
    this.allowedChildrenTypes = allowedChildTypes;
    return this;
  }

  build() {
    if (!this.childSourceField) throw new Error("childField is required");
    if (!this.targetField) throw new Error("nodeTargetField is required");
    if (!this.op) throw new Error("operator is required");
    if (!this.allowedTypes) throw new Error("allowedNodeTypes is required");
    if (!this.allowedChildrenTypes)
      throw new Error("allowedChildTypes is required");
    return new AggregateChildrenFieldStep(
      this.childSourceField,
      this.targetField,
      this.op,
      this.allowedTypes,
      this.allowedChildrenTypes,
    );
  }
}

class AggregateChildrenFieldToParentStepBuilder {
  private childSourceField: FieldDefinition = undefined!;
  private parentTargetField: FieldDefinition = undefined!;
  private op: Operator = undefined!;
  private allowedParentsTypes: (typeof NodeType)[] = undefined!;
  private allowedChildrenTypes: (typeof NodeType)[] = undefined!;

  /**
   * Set the field of the children to be aggregated (the source of the aggregation) (required)
   * @param childSourceField fieldId of field of children to be aggregated
   */
  childField(childSourceField: string) {
    this.childSourceField = new FieldDefinition(childSourceField, 0);
    return this;
  }

  /**
   * Set the field of the parent Node to set to aggregated value to (required)
   * @param parentTargetField fieldId of field of parent node
   */
  parentField(parentTargetField: string) {
    this.parentTargetField = new FieldDefinition(parentTargetField, 0);
    return this;
  }

  /**
   * Set the operator to use for aggregation (required)
   * @param operator operator to use for aggregation (sum, min, max, count)
   */
  operator(operator: Operator) {
    this.op = operator;
    return this;
  }

  /**
   * Set the allowed Node-Types of parent for aggregation (required)
   * @param allowedParentsTypes allowed Node-Types of parent for aggregation
   */
  allowedParentTypes(allowedParentsTypes: (typeof NodeType)[]) {
    this.allowedParentsTypes = allowedParentsTypes;
    return this;
  }

  /**
   * Set the allowed Node-Types of children of parent for aggregation (required)
   * @param allowedChildrenTypes allowed Node-Types of children for aggregation
   */
  allowedChildTypes(allowedChildrenTypes: (typeof NodeType)[]) {
    this.allowedChildrenTypes = allowedChildrenTypes;
    return this;
  }

  build() {
    if (!this.childSourceField) throw new Error("childField is required");
    if (!this.parentTargetField) throw new Error("parentField is required");
    if (!this.op) throw new Error("operator is required");
    if (!this.allowedParentsTypes)
      throw new Error("allowedParentTypes is required");
    if (!this.allowedChildrenTypes)
      throw new Error("allowedChildTypes is required");
    return new AggregateChildrenFieldToParentStep(
      this.childSourceField,
      this.parentTargetField,
      this.op,
      this.allowedParentsTypes,
      this.allowedChildrenTypes,
    );
  }
}

class AttachFieldStepBuilder {
  private sField: FieldDefinition = undefined!;
  private tField: FieldDefinition = undefined!;
  private allTypes: (typeof NodeType)[] = undefined!;

  /**
   * Set field of current Node to be attached (required)
   * @param sField fieldId of field to be attached
   */
  sourceField(sField: string) {
    this.sField = new FieldDefinition(sField, 0);
    return this;
  }

  /**
   * Set field of current Node to set to source value (required)
   * @param tField fieldId of field to set to value
   */
  targetField(tField: string) {
    this.tField = new FieldDefinition(tField, 0);
    return this;
  }

  /**
   * Set the allowed Node-Types for attachment (required)
   * @param allTypes allowed Node-Types for attachment
   */
  allowedNodeTypes(allTypes: (typeof NodeType)[]) {
    this.allTypes = allTypes;
    return this;
  }

  build() {
    if (!this.sField) throw new Error("sourceField is required");
    if (!this.tField) throw new Error("targetField is required");
    if (!this.allTypes) throw new Error("allowedNodeTypes is required");
    return new AttachFieldStep(this.sField, this.tField, this.allTypes);
  }
}

class AttachParentFieldStepBuilder {
  private sourceField: FieldDefinition = undefined!;
  private tField: FieldDefinition = undefined!;
  private allTypes: (typeof NodeType)[] = undefined!;
  private allParentTypes: (typeof NodeType)[] = undefined!;

  /**
   * Set the field of parent of the current Node to be attached (required)
   * @param sField fieldId of field of parent to be attached
   */
  parentSourceField(sField: string) {
    this.sourceField = new FieldDefinition(sField, 0);
    return this;
  }

  /**
   * Set field of current Node to set to source value (required)
   * @param tField fieldId of field to set to value
   */
  targetField(tField: string) {
    this.tField = new FieldDefinition(tField, 0);
    return this;
  }

  /**
   * Set the allowed Node-Types for attachment (required)
   * @param allTypes allowed Node-Types for attachment
   */
  allowedNodeTypes(allTypes: (typeof NodeType)[]) {
    this.allTypes = allTypes;
    return this;
  }

  /**
   * Set the allowed Node-Types of parent for attachment (required)
   * @param allParentTypes allowed Node-Types of parent for attachment
   */
  allowedParentTypes(allParentTypes: (typeof NodeType)[]) {
    this.allParentTypes = allParentTypes;
    return this;
  }

  build() {
    if (!this.sourceField) throw new Error("sourceField is required");
    if (!this.tField) throw new Error("targetField is required");
    if (!this.allTypes) throw new Error("allowedNodeTypes is required");
    if (!this.allParentTypes) throw new Error("allowedParentTypes is required");
    return new AttachParentFieldStep(
      this.sourceField,
      this.tField,
      this.allTypes,
      this.allParentTypes,
    );
  }
}

class DistributeProportionalOnChildrenStepBuilder {
  private sField: FieldDefinition = undefined!;
  private tChildrenField: FieldDefinition = undefined!;
  private allTypes: (typeof NodeType)[] = undefined!;
  private allChildrenTypes: (typeof NodeType)[] = undefined!;

  /**
   * Set the field of the current Node to distribute propotionaly by share on children (required)
   * @param sField fieldId of field to distribute
   */
  sourceField(sField: string) {
    this.sField = new FieldDefinition(sField, 0);
    return this;
  }

  /**
   * Set the field of children of current Node to distribute value on (required)
   * @param tChildrenField fieldId of field to distribute value on
   */
  childrenField(tChildrenField: string) {
    this.tChildrenField = new FieldDefinition(tChildrenField, 0);
    return this;
  }

  /**
   * Set the allowed Node-Types for proportional distribution on children (required)
   * @param allTypes allowed Node-Types for distribution
   */
  allowedNodeTypes(allTypes: (typeof NodeType)[]) {
    this.allTypes = allTypes;
    return this;
  }

  /**
   * Set the allowed Node-Types of children on wich to distribute the value (required)
   * @param allChildrenTypes allowed Node-Types of children for distribution
   */
  allowedChildrenTypes(allChildrenTypes: (typeof NodeType)[]) {
    this.allChildrenTypes = allChildrenTypes;
    return this;
  }

  build() {
    if (!this.sField) throw new Error("sourceField is required");
    if (!this.tChildrenField) throw new Error("childrenField is required");
    if (!this.allTypes) throw new Error("allowedNodeTypes is required");
    if (!this.allChildrenTypes)
      throw new Error("allowedChildrenTypes is required");
    return new DistributeProportionalOnChildrenStep(
      this.sField,
      this.tChildrenField,
      this.allTypes,
      this.allChildrenTypes,
    );
  }
}

class ZeroSubTreeStepBuilder {
  private tField: FieldDefinition = undefined!;
  private types: (typeof NodeType)[] = undefined!;

  /**
   * Set field of current Node and children to set to zero (required)
   * @param targetField fieldId of field to set to zero
   */
  zeroField(targetField: string) {
    this.tField = new FieldDefinition(targetField, 0);
    return this;
  }

  /**
   * Set the allowed Node-Types for zeroing (required)
   * @param types allowed Node-Types for zeroing
   */
  allowedNodeTypes(types: (typeof NodeType)[]) {
    this.types = types;
    return this;
  }

  build() {
    if (!this.tField) throw new Error("zeroField is required");
    if (!this.types) throw new Error("allowedNodeTypes is required");
    return new ZeroSubTreeStep(this.tField, this.types);
  }
}

class EvaluateRulesStepBuilder {
  build() {
    return new EvaluateRulesStep();
  }
}

class EvaluateParentRulesStepBuilder {
  build() {
    return new EvaluateParentRulesStep();
  }
}

class SetNewFieldValueStepBuilder {
  build() {
    return new SetNewFieldValueStep();
  }
}

class ReapeatNetworkForChildrenStepBuilder {
  private tChildrenField: FieldDefinition = undefined!;

  /**
   * Set the field of children of current Node to repeat network on (required)
   * @param tChildrenField fieldId of field to repeat network on
   */
  childrenField(tChildrenField: string) {
    this.tChildrenField = new FieldDefinition(tChildrenField, 0);
    return this;
  }

  build() {
    if (!this.tChildrenField) throw new Error("childrenField is required");
    return new ReapeatNetworkForChildrenStep(this.tChildrenField);
  }
}

export class StepDependencyNetworkBuilder {
  private nodeTypeSteps: Map<(typeof NodeType)[], NetworkStep[]> = new Map();
  private state: StepDependencyNetworkState = undefined!;

  /**
   * Add NodeType-classes (product) and the coresponding steps to the Dependency-Network (required)
   * @param nodeTypes NodeType-classes (product) for wich to execute the steps
   * @param steps instances of NetworkSteps to execute
   */
  addNodeTypeSteps(nodeTypes: (typeof NodeType)[], steps: NetworkStep[]) {
    this.nodeTypeSteps.set(nodeTypes, steps);
    return this;
  }

  /**
   * Set NetworkState of the Dependency-Network (important for which rules to use) (required)
   * @param state NetworkState of the Dependency-Network
   */
  networkState(state: StepDependencyNetworkState) {
    this.state = state;
    return this;
  }

  build() {
    if (!this.state) throw new Error("networkState is required");
    if (this.nodeTypeSteps.size === 0)
      throw new Error("addNodeTypeSteps is required at least once");
    return new StepDependencyNetwork(this.nodeTypeSteps, this.state);
  }
}

export class DocStateBuilder {
  private stateId: string = undefined!;
  private StateTable: Map<string, DocState> = new Map();

  /**
   * Set the id of the State (needs to be unique) (required)
   * @param stateId id of the State
   */
  id(stateId: string) {
    this.stateId = stateId;
    if (!this.StateTable.has(stateId))
      this.StateTable.set(stateId, new DocState(stateId));
    return new DocStateBuilderConfigurer(
      this,
      this.StateTable.get(stateId)!,
      this.StateTable,
    );
  }

  build(): Map<string, DocState> {
    if (!this.StateTable || this.StateTable.size === 0)
      throw new Error("id is required");
    return this.StateTable;
  }
}

class DocStateBuilderConfigurer {
  private state: DocState = undefined!;
  private neworks: {
    startAt: "root" | "changedNode";
    network: StepDependencyNetwork;
  }[] = [];
  private transitions: Transition[] = [];
  private StateTable: Map<string, DocState> = undefined!;
  private parent: DocStateBuilder = undefined!;

  constructor(
    parent: DocStateBuilder,
    state: DocState,
    StateTable: Map<string, DocState>,
  ) {
    this.parent = parent;
    this.state = state;
    this.StateTable = StateTable;
  }

  /**
   * Add a Dependency-Network to the State
   * @param startAt determines from what node the Dependency-Network should be executed (root or changedNode) (required)
   * @param network 
   */
  network(startAt: "root" | "changedNode", network: StepDependencyNetwork) {
    this.neworks.push({ startAt, network });
    return this;
  }

  /**
   * Add a new transition to the State
   */
  transition() {
    return new DocStateTransitionBuilder(
      this,
      this.StateTable,
      (transition: Transition) => {
        this.transitions.push(transition);
      },
    );
  }

  build() {
    if (!this.state) throw new Error("state is required");
    if (!this.StateTable.has(this.state.id))
      throw new Error("state is not registered");
    if (!this.neworks || this.neworks.length === 0)
      throw new Error("networks is required at least once");
    if (!this.transitions || this.transitions.length === 0)
      throw new Error("transitions is required at least once");
    this.neworks.forEach((n) => this.state.addNetwork(n));
    this.transitions.forEach((t) => this.state.addTransition(t));
    return this.parent;
  }
}

class DocStateTransitionBuilder {
  private tStateId: string = undefined!;
  private condition: (
    node: DocNode,
    field: FieldDefinition,
    value: number,
  ) => boolean = undefined!;
  private parent: DocStateBuilderConfigurer;
  private StateTable: Map<string, DocState>;
  private addTransition: (transition: Transition) => void;

  constructor(
    parent: DocStateBuilderConfigurer,
    StateTable: Map<string, DocState>,
    addTransition: (transition: Transition) => void,
  ) {
    this.parent = parent;
    this.StateTable = StateTable;
    this.addTransition = addTransition;
  }

  /**
   * Set State to which the Transition leads (required)
   * @param tStateId id of the State
   */
  to(tStateId: string) {
    if (!this.StateTable.has(tStateId)) {
      this.StateTable.set(tStateId, new DocState(tStateId));
    }
    this.tStateId = tStateId;
    return this;
  }

  /**
   * Set Condition to check if the Transition should be executed (required)
   * @param condition Function to check if the Transition should be executed signature: (currentNode: DocNode, changedField: FieldDefinition, value: number) => boolean
   */
  when(
    condition: (
      node: DocNode,
      field: FieldDefinition,
      value: number,
    ) => boolean,
  ) {
    this.condition = condition;
    return this;
  }

  build(): DocStateBuilderConfigurer {
    if (!this.tStateId) throw new Error("to is required");
    if (!this.StateTable.has(this.tStateId))
      throw new Error("to state is not registered");
    if (!this.condition) throw new Error("when is required");
    this.addTransition(
      new Transition(this.StateTable.get(this.tStateId)!, this.condition),
    );
    return this.parent;
  }
}

class EmptyNode extends NodeType {
  protected static override readonly defaultFields: FieldDefinition[] = [];
  protected static override readonly defaultRules: Rule[] = [];
}

type NodeTypeClass<T extends NodeType> = new (...args: any[]) => T;

export class DocBuilder {
  private currrentState: DocState = undefined!;
  private nodeTypes: Map<string, NodeType> = new Map();

  /**
   * Set starting State of State-Machine (required)
   * @param state starting State of State-Machine
   */
  startState(state: DocState) {
    this.currrentState = state;
    return this;
  }

  /**
   * Add a NodeType allowed in the Node-Tree (required)
   * @param nodeType NodeType-class
   */
  nodeType<T extends NodeType>(
    nodeType: NodeTypeClass<T>,
  ): NodeTypeInstanceBuilder<T> {
    return new NodeTypeInstanceBuilder(this, nodeType, (type: NodeType) => {
      this.nodeTypes.set(type.typeId, type.clone());
    });
  }

  build() {
    if (!this.currrentState) throw new Error("startState is required");
    if (this.nodeTypes.size === 0)
      throw new Error("addNodeType is required at least once");
    return new Doc(
      new DocNode("", "", new EmptyNode("", "", [], [], [])),
      this.currrentState,
      this.nodeTypes,
    );
  }
}

class NodeTypeInstanceBuilder<T extends NodeType> {
  private readonly nodeType: NodeTypeClass<T>;
  private tId: string = undefined!;
  private l: string = undefined!;
  private f: FieldDefinition[] = [];
  private ls: {
    id: string;
    label: string;
  }[] = [];
  private rs: Rule[] = [];
  private parent: DocBuilder = undefined!;
  private addNodeType: (type: NodeType) => void = undefined!;

  constructor(
    parent: DocBuilder,
    nodeType: NodeTypeClass<T>,
    addNodeType: (type: NodeType) => void,
  ) {
    this.parent = parent;
    this.nodeType = nodeType;
    this.addNodeType = addNodeType;
  }

  /**
   * Set id of the NodeType (needed to be unique) (required)
   * @param tId id of the NodeType-instance
   */
  typeId(tId: string) {
    this.tId = tId;
    return this;
  }

  /**
   * Set label of the NodeType (required)
   * @param l label of the NodeType-instance
   */
  label(l: string) {
    this.l = l;
    return this;
  }
 
  /**
   * Change the fields of the NodeType
   * @param f new fields
   */
  fields(f: FieldDefinition[]) {
    this.f = f;
    return this;
  }

  /**
   * Change the labels of the NodeType
   * @param ls new labels
   */
  labels(ls: { id: string; label: string }[]) {
    this.ls = ls;
    return this;
  }

  /**
   * Change the rules of the NodeType
   * @param rs new rules
   */
  rules(rs: Rule[]) {
    this.rs = rs;
    return this;
  }

  build(): DocBuilder {
    if (!this.tId) throw new Error("typeId is required");
    if (!this.l) throw new Error("label is required");
    if (!this.f) throw new Error("fields is undefined");
    if (!this.ls) throw new Error("labels is undefined");
    if (!this.rs) throw new Error("rules is undefined");
    this.addNodeType(
      new this.nodeType(this.tId, this.l, this.f, this.ls, this.rs),
    );
    return this.parent;
  }
}
