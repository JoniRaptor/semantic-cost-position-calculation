import * as Builder from "../../builder";
import {
  DocNode,
  FieldDefinition,
  NodeType,
  Rule,
} from "../../stateMachine";

// Network states
const forwardNetworkState = new Builder.NetworkStateBuilder()
  .id("forward")
  .build();

const backwardNetworkState = new Builder.NetworkStateBuilder()
  .id("backward")
  .build();

// NodeTypen Klassen

class TotalCostNode extends NodeType {
  protected static override readonly defaultFields: FieldDefinition[] = [
    new Builder.FieldDefinitionBuilder().id("total").build(),
    new Builder.FieldDefinitionBuilder().id("childrenTotal").build(),
  ];

  protected static override readonly defaultRules: Rule[] = [
    new Builder.RuleBuilder()
      .id("total-forward")
      .calculationRule("childrenTotal > 0 ? childrenTotal : total")
      .targetFieldId("total")
      .forNetworkState(forwardNetworkState)
      .build(),
    new Builder.RuleBuilder()
      .id("total-backward")
      .calculationRule("total")
      .targetFieldId("total")
      .forNetworkState(backwardNetworkState)
      .build(),
  ];

  static get allowedChildTypes(): (typeof NodeType)[] {
    return [TotalCostNode];
  }
}

// Step Instances

const attachChildrenTotal = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.AggregateChildrenField)
  .nodeTargetField("childrenTotal")
  .childField("total")
  .operator("sum")
  .allowedNodeTypes([TotalCostNode])
  .allowedChildTypes([TotalCostNode])
  .build();

const evaluateRules = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.EvaluateRules)
  .build();

const distributeTotalOnChildrenBackwards = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.DistributeProportionalOnChildren)
  .sourceField("total")
  .childrenField("total")
  .allowedNodeTypes([TotalCostNode])
  .allowedChildrenTypes([TotalCostNode])
  .build();

const setValue = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.SetNewFieldValue)
  .build();

const repeatNetworkForChildren = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.ReapeatNetworkForChildren)
  .childrenField("total")
  .build();

// Dependency Networks

const forwardNetworkSetValue = new Builder.StepDependencyNetworkBuilder()
  .addNodeTypeSteps([TotalCostNode], [setValue])
  .networkState(forwardNetworkState)
  .build();

const forwardNetwork = new Builder.StepDependencyNetworkBuilder()
  .addNodeTypeSteps(
    [TotalCostNode],
    [
      repeatNetworkForChildren,
      attachChildrenTotal,
      evaluateRules,
    ],
  )
  .networkState(forwardNetworkState)
  .build();

const backwardNetwork = new Builder.StepDependencyNetworkBuilder()
  .addNodeTypeSteps(
    [TotalCostNode],
    [
      setValue,
      evaluateRules,
      distributeTotalOnChildrenBackwards,
      repeatNetworkForChildren,
    ],
  )
  .networkState(backwardNetworkState)
  .build();

// Doc States

const states = new Builder.DocStateBuilder()
  .id("forward")
  .network("changedNode", forwardNetworkSetValue)
  .network("root", forwardNetwork)
  .transition()
  .to("backward")
  .when((node: DocNode, field: FieldDefinition, value: number) =>
    node.type.rules.some(
      (rule) =>
        rule.fieldId === field.id && rule.networkState === backwardNetworkState,
    ),
  )
  .build()
  .build()
  .id("backward")
  .network("changedNode", backwardNetwork)
  .network("root", forwardNetwork)
  .transition()
  .to("forward")
  .when(
    (node: DocNode, field: FieldDefinition, value: number) =>
      node.type.rules.every((rule) => rule.fieldId !== field.id) ||
      !node.type.rules.some(
        (rule) =>
          rule.fieldId === field.id &&
          rule.networkState === backwardNetworkState,
      ),
  )
  .build()
  .build()
  .build();

const forwardState = states.get("forward")!;
const backwardState = states.get("backward")!;

// Doc
const doc = new Builder.DocBuilder()
  .startState(forwardState)
  .nodeType(TotalCostNode)
  .typeId("title")
  .label("Titel")
  .labels([{ id: "total", label: "Summe" }])
  .build()
  .build();
