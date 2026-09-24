import * as Builder from "./builder";
import { DocNode, FieldDefinition, NodeType, Rule } from "./stateMachine";

// Network states
const forwardNetworkState = new Builder.NetworkStateBuilder()
  .id("forward")
  .build();

const backwardNetworkState = new Builder.NetworkStateBuilder()
  .id("backward")
  .build();

const percentageNetworkState = new Builder.NetworkStateBuilder()
  .id("percentageBackward")
  .build();

// NodeTypen Klassen

class TotalCostNode extends NodeType {
  protected static override readonly defaultFields: FieldDefinition[] = [
    new Builder.FieldDefinitionBuilder()
    .id("total")
    .build(),
    new Builder.FieldDefinitionBuilder()
    .id("childrenTotal")
    .build(),
    new Builder.FieldDefinitionBuilder()
    .id("variableChildrenTotal")
    .build(),
    new Builder.FieldDefinitionBuilder()
    .id("singleChildrenTotal")
    .build(),
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
    new Builder.RuleBuilder()
    .id("total-percentage-backward")
    .calculationRule("childrenTotal > 0 ? childrenTotal : total")
    .targetFieldId("total")
    .forNetworkState(percentageNetworkState)
    .build(),
  ];

  static get allowedChildTypes(): (typeof NodeType)[] {
    return [
      UnitCostNode,
      TotalCostNode,
      DiscountNode,
      SingleUnitCostNode,
      PaintingNode,
    ];
  }
}

class UnitCostNode extends TotalCostNode {
  protected static override readonly defaultFields: FieldDefinition[] = [
    ...super.defaultFields,
    new Builder.FieldDefinitionBuilder()
    .id("count")
    .build(),
    new Builder.FieldDefinitionBuilder()
    .id("unitCost")
    .build(),
    new Builder.FieldDefinitionBuilder()
    .id("oldTotal")
    .build(),
    new Builder.FieldDefinitionBuilder()
    .id("pricePerUnit")
    .build(),
  ];

  protected static override readonly defaultRules: Rule[] = [
    new Builder.RuleBuilder()
    .id("unitCost-forward")
    .calculationRule("childrenTotal > 0 ? childrenTotal : unitCost")
    .targetFieldId("unitCost")
    .forNetworkState(forwardNetworkState)
    .build(),
    new Builder.RuleBuilder()
    .id("total-forward")
    .calculationRule("childrenTotal > 0 ? variableChildrenTotal * count + singleChildrenTotal : count * unitCost")
    .targetFieldId("total")
    .forNetworkState(forwardNetworkState)
    .build(),
    new Builder.RuleBuilder()
    .id("pricePerUnit-forward")
    .calculationRule("count > 0 ? total / count : 0")
    .targetFieldId("pricePerUnit")
    .forNetworkState(forwardNetworkState)
    .build(),
    new Builder.RuleBuilder()
    .id("total-backward")
    .calculationRule("childrenTotal > 0 ? variableChildrenTotal * count + singleChildrenTotal : count * unitCost")
    .targetFieldId("total")
    .forNetworkState(backwardNetworkState)
    .triggerOnChangeOfField("unitCost")
    .build(),
    new Builder.RuleBuilder()
    .id("unitCost-backward")
    .calculationRule("childrenTotal > 0 ? unitCost * total / oldTotal : total / count")
    .targetFieldId("unitCost")
    .forNetworkState(backwardNetworkState)
    .triggerOnChangeOfField("total")
    .build(),
    new Builder.RuleBuilder()
    .id("pricePerUnit-backward")
    .calculationRule("count > 0 ? total / count : 0")
    .targetFieldId("pricePerUnit")
    .forNetworkState(backwardNetworkState)
    .build(),
    new Builder.RuleBuilder()
    .id("total-percentage-backward")
    .calculationRule("childrenTotal > 0 ? variableChildrenTotal * count + singleChildrenTotal : count * unitCost")
    .targetFieldId("total")
    .forNetworkState(percentageNetworkState)
    .build(),
  ];
}

class SingleUnitCostNode extends UnitCostNode {}

class DiscountNode extends TotalCostNode {
  protected static override readonly defaultFields: FieldDefinition[] = [
    ...super.defaultFields,
    new Builder.FieldDefinitionBuilder()
    .id("percentage")
    .build(),
    new Builder.FieldDefinitionBuilder()
    .id("parentTotal")
    .build(),
  ];

  protected static override readonly defaultRules: Rule[] = [
    new Builder.RuleBuilder()
    .id("total-forward")
    .calculationRule("- abs(parentTotal) * percentage / 100 + childrenTotal")
    .targetFieldId("total")
    .forNetworkState(forwardNetworkState)
    .build(),
    new Builder.RuleBuilder()
    .id("percentage-backward")
    .calculationRule("- total * 100 / abs(parentTotal)")
    .targetFieldId("percentage")
    .forNetworkState(percentageNetworkState)
    .triggerOnChangeOfField("total")
    .build(),
    new Builder.RuleBuilder()
    .id("total-backward")
    .calculationRule("- abs(parentTotal) * percentage / 100 + childrenTotal")
    .targetFieldId("total")
    .forNetworkState(percentageNetworkState)
    .triggerOnChangeOfField("percentage")
    .build(),
  ];

  static get allowedChildTypes(): (typeof NodeType)[] {
    return [DiscountNode];
  }
}

class PaintingNode extends UnitCostNode {
  protected static override readonly defaultFields: FieldDefinition[] = [
    ...super.defaultFields,
    new Builder.FieldDefinitionBuilder()
    .id("width")
    .build(),
    new Builder.FieldDefinitionBuilder()
    .id("length")
    .build(),
  ];

  protected static override readonly defaultRules: Rule[] = [
    ...super.defaultRules,
    new Builder.RuleBuilder()
    .id("paint-area")
    .calculationRule("length * width")
    .targetFieldId("count")
    .forNetworkState(forwardNetworkState)
    .build(),
  ];
}

// Step Instances

const removeTotalFromDiscountNode = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.ZeroSubTree)
  .zeroField("total")
  .allowedNodeTypes([DiscountNode])
  .build();

const attachChildrenTotal = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.AggregateChildrenField)
  .nodeTargetField("childrenTotal")
  .childField("total")
  .operator("sum")
  .allowedNodeTypes([
    UnitCostNode,
    TotalCostNode,
    DiscountNode,
    PaintingNode,
    SingleUnitCostNode,
  ])
  .allowedChildTypes([
    SingleUnitCostNode,
    UnitCostNode,
    TotalCostNode,
    DiscountNode,
    PaintingNode,
  ])
  .build();

const attachChildrenVariableTotal = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.AggregateChildrenField)
  .nodeTargetField("variableChildrenTotal")
  .childField("total")
  .operator("sum")
  .allowedNodeTypes([
    UnitCostNode,
    TotalCostNode,
    DiscountNode,
    PaintingNode,
    SingleUnitCostNode,
  ])
  .allowedChildTypes([UnitCostNode, TotalCostNode, DiscountNode, PaintingNode])
  .build();

const attachChildrenSingleTotal = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.AggregateChildrenField)
  .nodeTargetField("singleChildrenTotal")
  .childField("total")
  .operator("sum")
  .allowedNodeTypes([
    UnitCostNode,
    TotalCostNode,
    DiscountNode,
    PaintingNode,
    SingleUnitCostNode,
  ])
  .allowedChildTypes([SingleUnitCostNode])
  .build();

const attachChildrenTotalToParent = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.AggregateChildrenFieldToParent)
  .parentField("childrenTotal")
  .childField("total")
  .operator("sum")
  .allowedParentTypes([
    UnitCostNode,
    TotalCostNode,
    DiscountNode,
    PaintingNode,
    SingleUnitCostNode,
  ])
  .allowedChildTypes([
    SingleUnitCostNode,
    UnitCostNode,
    TotalCostNode,
    DiscountNode,
    PaintingNode,
  ])
  .build();

const attachChildrenVariableTotalToParent = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.AggregateChildrenFieldToParent)
  .parentField("variableChildrenTotal")
  .childField("total")
  .operator("sum")
  .allowedParentTypes([
    UnitCostNode,
    TotalCostNode,
    DiscountNode,
    PaintingNode,
    SingleUnitCostNode,
  ])
  .allowedChildTypes([UnitCostNode, TotalCostNode, DiscountNode, PaintingNode])
  .build();

const attachChildrenSingleTotalToParent = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.AggregateChildrenFieldToParent)
  .parentField("singleChildrenTotal")
  .childField("total")
  .operator("sum")
  .allowedParentTypes([
    UnitCostNode,
    TotalCostNode,
    DiscountNode,
    PaintingNode,
    SingleUnitCostNode,
  ])
  .allowedChildTypes([SingleUnitCostNode])
  .build();

const evaluateRules = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.EvaluateRules)
  .build();

const evaluateParentRules = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.EvaluateParentRules)
  .build();

const attachOldTotal = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.AttachField)
  .targetField("oldTotal")
  .sourceField("total")
  .allowedNodeTypes([UnitCostNode, SingleUnitCostNode, PaintingNode])
  .build();

const attachParentTotal = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.AttachParentField)
  .targetField("parentTotal")
  .parentSourceField("total")
  .allowedNodeTypes([DiscountNode])
  .allowedParentTypes([TotalCostNode, DiscountNode])
  .build();

const attachParentPricePerUnit = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.AttachParentField)
  .targetField("parentTotal")
  .parentSourceField("pricePerUnit")
  .allowedNodeTypes([DiscountNode])
  .allowedParentTypes([UnitCostNode, SingleUnitCostNode, PaintingNode])
  .build();

const distributeTotalOnChildrenBackwards = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.DistributeProportionalOnChildren)
  .sourceField("total")
  .childrenField("total")
  .allowedNodeTypes([TotalCostNode])
  .allowedChildrenTypes([
    TotalCostNode,
    UnitCostNode,
    SingleUnitCostNode,
    PaintingNode,
    DiscountNode,
  ])
  .build();

const distributeUnitCostOnChildrenBackwards = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.DistributeProportionalOnChildren)
  .sourceField("unitCost")
  .childrenField("total")
  .allowedNodeTypes([UnitCostNode, SingleUnitCostNode, PaintingNode])
  .allowedChildrenTypes([
    TotalCostNode,
    UnitCostNode,
    SingleUnitCostNode,
    PaintingNode,
    DiscountNode,
  ])
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
  .addNodeTypeSteps(
    [
      UnitCostNode,
      SingleUnitCostNode,
      PaintingNode,
      TotalCostNode,
      DiscountNode,
    ],
    [setValue],
  )
  .networkState(forwardNetworkState)
  .build();

const forwardNetworkWithoutPercentage =
  new Builder.StepDependencyNetworkBuilder()
    .addNodeTypeSteps(
      [UnitCostNode, SingleUnitCostNode, PaintingNode, TotalCostNode],
      [
        repeatNetworkForChildren,
        attachChildrenTotal,
        attachChildrenVariableTotal,
        attachChildrenSingleTotal,
        evaluateRules,
      ],
    )
    .addNodeTypeSteps([DiscountNode], [removeTotalFromDiscountNode])
    .networkState(forwardNetworkState)
    .build();

const forwardNetworkWithPercentage = new Builder.StepDependencyNetworkBuilder()
  .addNodeTypeSteps(
    [UnitCostNode, SingleUnitCostNode, PaintingNode, TotalCostNode],
    [
      repeatNetworkForChildren,
      attachChildrenTotal,
      attachChildrenVariableTotal,
      attachChildrenSingleTotal,
      evaluateRules,
      attachOldTotal,
    ],
  )
  .addNodeTypeSteps(
    [DiscountNode],
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
      attachChildrenTotal,
      attachChildrenVariableTotal,
      attachChildrenSingleTotal,
      evaluateRules,
    ],
  )
  .addNodeTypeSteps(
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
  )
  .networkState(backwardNetworkState)
  .build();

const percentageNetwork = new Builder.StepDependencyNetworkBuilder()
  .addNodeTypeSteps(
    [DiscountNode],
    [
      removeTotalFromDiscountNode,
      setValue,
      attachChildrenTotal,
      attachChildrenVariableTotal,
      attachChildrenSingleTotal,
      evaluateRules,
    ],
  )
  .networkState(percentageNetworkState)
  .build();

// Doc States
const states =
  new Builder.DocStateBuilder()
    .id("forward")
    .network("changedNode", forwardNetworkSetValue)
    .network("root", forwardNetworkWithoutPercentage)
    .network("root", forwardNetworkWithPercentage)
    .transition()
    .to("backward")
    .when((node: DocNode, field: FieldDefinition, value: number) =>
      node.type.rules.some(
        (rule) =>
          rule.fieldId === field.id &&
          rule.networkState === backwardNetworkState,
      ),
    )
    .build()
    .transition()
    .to("percentageBackward")
    .when(
      (node: DocNode, field: FieldDefinition, value: number) =>
        node.type instanceof DiscountNode,
    )
    .build()
    .build()
    .id("backward")
    .network("changedNode", backwardNetwork)
    .network("root", forwardNetworkWithoutPercentage)
    .network("root", forwardNetworkWithPercentage)
    .transition()
    .to("forward")
    .when(
      (node: DocNode, field: FieldDefinition, value: number) =>
        !(node.type instanceof DiscountNode) &&
        (node.type.rules.every((rule) => rule.fieldId !== field.id) ||
          !node.type.rules.some(
            (rule) =>
              rule.fieldId === field.id &&
              rule.networkState === backwardNetworkState,
          )),
    )
    .build()
    .transition()
    .to("percentageBackward")
    .when(
      (node: DocNode, field: FieldDefinition, value: number) =>
        node.type instanceof DiscountNode,
    )
    .build()
    .build()
    .id("percentageBackward")
    .network("changedNode", percentageNetwork)
    .network("root", forwardNetworkWithoutPercentage)
    .network("root", forwardNetworkWithPercentage)
    .transition()
    .to("forward")
    .when(
      (node: DocNode, field: FieldDefinition, value: number) =>
        !(node.type instanceof DiscountNode) &&
        (node.type.rules.every((rule) => rule.fieldId !== field.id) ||
          !node.type.rules.some(
            (rule) =>
              rule.fieldId === field.id &&
              rule.networkState === backwardNetworkState,
          )),
    )
    .build()
    .transition()
    .to("backward")
    .when(
      (node: DocNode, field: FieldDefinition, value: number) =>
        !(node.type instanceof DiscountNode) &&
        node.type.rules.some(
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
const percentageBackwardState = states.get("percentageBackward")!;

// Doc
export const exampleDoc = new Builder.DocBuilder()
  .startState(forwardState)
  .nodeType(TotalCostNode)
  .typeId("invoice")
  .label("Auftrag")
  .labels([{ id: "total", label: "Endpreis" }])
  .build()
  .nodeType(UnitCostNode)
  .typeId("labor")
  .label("Arbeitszeit")
  .labels([
    { id: "total", label: "Gesamtpreis" },
    { id: "count", label: "Stunden" },
    { id: "unitCost", label: "Stundensatz" },
  ])
  .build()
  .nodeType(UnitCostNode)
  .typeId("material")
  .label("Material")
  .labels([
    { id: "total", label: "Gesamtpreis" },
    { id: "count", label: "Menge" },
    { id: "unitCost", label: "Stückpreis" },
  ])
  .build()
  .nodeType(SingleUnitCostNode)
  .typeId("travel")
  .label("Reise")
  .labels([
    { id: "total", label: "Gesamtpreis" },
    { id: "count", label: "Kilometer" },
    { id: "unitCost", label: "Preis pro km" },
  ])
  .build()
  .nodeType(DiscountNode)
  .typeId("discount")
  .label("Rabatt")
  .labels([
    { id: "total", label: "Gesamtpreis" },
    { id: "percentage", label: "Prozent" },
  ])
  .build()
  .nodeType(PaintingNode)
  .typeId("painting_room")
  .label("Zimmer streichen")
  .labels([
    { id: "total", label: "Gesamtpreis" },
    { id: "unitCost", label: "Preis pro m²" },
    { id: "count", label: "Fläche" },
    { id: "width", label: "Breite" },
    { id: "length", label: "Lange" },
  ])
  .build()
  .build();
