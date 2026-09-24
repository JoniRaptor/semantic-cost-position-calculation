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

export class NetworkStateBuilder {
  private networkId: string = "";

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
export class FieldDefinitionBuilder {
  private identifier: string = undefined!;
  private value: number = 0;
  private l: string = undefined!;

  id(id: string) {
    this.identifier = id;
    return this;
  }

  label(l: string) {
    this.l = l;
    return this;
  }

  build() {
    if (this.identifier === undefined) throw new Error("id is required");
    return new FieldDefinition(this.identifier, this.value, this.l);
  }
}

export class RuleBuilder {
  private identifier: string = undefined!;
  private expression: string = undefined!;
  private field: string = undefined!;
  private netState: StepDependencyNetworkState = undefined!;
  private triggerField: string = "";

  id(id: string) {
    this.identifier = id;
    return this;
  }

  targetFieldId(id: string) {
    this.field = id;
    return this;
  }

  calculationRule(expression: string) {
    this.expression = expression;
    return this;
  }

  forNetworkState(netState: StepDependencyNetworkState) {
    this.netState = netState;
    return this;
  }

  triggerOnChangeOfField(id: string) {
    this.triggerField = id;
    return this;
  }

  build() {
    if (this.identifier === undefined) throw new Error("id is required");
    if (this.expression === undefined) throw new Error("expression is required");
    if (this.field === undefined) throw new Error("field is required");
    if (this.netState === undefined) throw new Error("netState is required");
    return new Rule(this.identifier, this.expression, this.field, this.netState, this.triggerField);
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

export class StepInstanceBuilder {
  type(
    stepType: typeof AggregateChildrenFieldStep,
  ): AggregateChildrenFieldStepBuilder;
  type(
    stepType: typeof AggregateChildrenFieldToParentStep,
  ): AggregateChildrenFieldToParentStepBuilder;
  type(stepType: typeof AttachFieldStep): AttachFieldStepBuilder;
  type(stepType: typeof AttachParentFieldStep): AttachParentFieldStepBuilder;
  type(
    stepType: typeof DistributeProportionalOnChildrenStep,
  ): DistributeProportionalOnChildrenStepBuilder;
  type(stepType: typeof ZeroSubTreeStep): ZeroSubTreeStepBuilder;
  type(stepType: typeof EvaluateRulesStep): EvaluateRulesStepBuilder;
  type(
    stepType: typeof EvaluateParentRulesStep,
  ): EvaluateParentRulesStepBuilder;
  type(stepType: typeof SetNewFieldValueStep): SetNewFieldValueStepBuilder;
  type(
    stepType: typeof ReapeatNetworkForChildrenStep,
  ): ReapeatNetworkForChildrenStepBuilder;
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

  childField(childSourceField: string) {
    this.childSourceField = new FieldDefinition(childSourceField, 0);
    return this;
  }

  nodeTargetField(targetField: string) {
    this.targetField = new FieldDefinition(targetField, 0);
    return this;
  }

  operator(operator: Operator) {
    this.op = operator;
    return this;
  }

  allowedNodeTypes(allowedTypes: (typeof NodeType)[]) {
    this.allowedTypes = allowedTypes;
    return this;
  }

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

  childField(childSourceField: string) {
    this.childSourceField = new FieldDefinition(childSourceField, 0);
    return this;
  }

  parentField(parentTargetField: string) {
    this.parentTargetField = new FieldDefinition(parentTargetField, 0);
    return this;
  }

  operator(operator: Operator) {
    this.op = operator;
    return this;
  }

  allowedParentTypes(allowedParentsTypes: (typeof NodeType)[]) {
    this.allowedParentsTypes = allowedParentsTypes;
    return this;
  }

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

  sourceField(sField: string) {
    this.sField = new FieldDefinition(sField, 0);
    return this;
  }

  targetField(tField: string) {
    this.tField = new FieldDefinition(tField, 0);
    return this;
  }

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

  parentSourceField(sField: string) {
    this.sourceField = new FieldDefinition(sField, 0);
    return this;
  }

  targetField(tField: string) {
    this.tField = new FieldDefinition(tField, 0);
    return this;
  }

  allowedNodeTypes(allTypes: (typeof NodeType)[]) {
    this.allTypes = allTypes;
    return this;
  }

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

  sourceField(sField: string) {
    this.sField = new FieldDefinition(sField, 0);
    return this;
  }

  childrenField(tChildrenField: string) {
    this.tChildrenField = new FieldDefinition(tChildrenField, 0);
    return this;
  }

  allowedNodeTypes(allTypes: (typeof NodeType)[]) {
    this.allTypes = allTypes;
    return this;
  }

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

  zeroField(targetField: string) {
    this.tField = new FieldDefinition(targetField, 0);
    return this;
  }

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

  addNodeTypeSteps(nodeTypes: (typeof NodeType)[], steps: NetworkStep[]) {
    this.nodeTypeSteps.set(nodeTypes, steps);
    return this;
  }

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

  network(startAt: "root" | "changedNode", network: StepDependencyNetwork) {
    this.neworks.push({ startAt, network });
    return this;
  }

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

  to(tStateId: string) {
    if (!this.StateTable.has(tStateId)) {
      this.StateTable.set(tStateId, new DocState(tStateId));
    }
    this.tStateId = tStateId;
    return this;
  }

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

  startState(state: DocState) {
    this.currrentState = state;
    return this;
  }

  nodeType<T extends NodeType>(nodeType: NodeTypeClass<T>): NodeTypeInstanceBuilder<T> {
    return new NodeTypeInstanceBuilder(this, nodeType, (type: NodeType) => {
      this.nodeTypes.set(type.typeId, type);
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

  typeId(tId: string) {
    this.tId = tId;
    return this;
  }

  label(l: string) {
    this.l = l;
    return this;
  }

  fields(f: FieldDefinition[]) {
    this.f = f;
    return this;
  }

  labels(ls: { id: string; label: string }[]) {
    this.ls = ls;
    return this;
  }

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
    this.addNodeType(new this.nodeType(this.tId, this.l, this.f, this.ls, this.rs));
    return this.parent;
  }
}
