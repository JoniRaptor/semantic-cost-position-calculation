import { describe, it, expect } from "vitest";
import * as Builder from "../../semantic/builder";
import {
  CostNodeView,
  Doc,
  DocNode,
  FieldDefinition,
  NodeType,
  Rule,
} from "../../semantic/stateMachine";

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
    new Builder.FieldDefinitionBuilder().id("total").build(),
    new Builder.FieldDefinitionBuilder().id("childrenTotal").build(),
    new Builder.FieldDefinitionBuilder().id("variableChildrenTotal").build(),
    new Builder.FieldDefinitionBuilder().id("singleChildrenTotal").build(),
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
    new Builder.FieldDefinitionBuilder().id("count").build(),
    new Builder.FieldDefinitionBuilder().id("unitCost").build(),
    new Builder.FieldDefinitionBuilder().id("oldTotal").build(),
    new Builder.FieldDefinitionBuilder().id("pricePerUnit").build(),
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
      .calculationRule(
        "childrenTotal > 0 ? variableChildrenTotal * count + singleChildrenTotal : count * unitCost",
      )
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
      .calculationRule(
        "childrenTotal > 0 ? variableChildrenTotal * count + singleChildrenTotal : count * unitCost",
      )
      .targetFieldId("total")
      .forNetworkState(backwardNetworkState)
      .triggerOnChangeOfField("unitCost")
      .build(),
    new Builder.RuleBuilder()
      .id("unitCost-backward")
      .calculationRule(
        "childrenTotal > 0 ? unitCost * total / oldTotal : total / count",
      )
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
      .calculationRule(
        "childrenTotal > 0 ? variableChildrenTotal * count + singleChildrenTotal : count * unitCost",
      )
      .targetFieldId("total")
      .forNetworkState(percentageNetworkState)
      .build(),
  ];
}

class SingleUnitCostNode extends UnitCostNode {}

class DiscountNode extends TotalCostNode {
  protected static override readonly defaultFields: FieldDefinition[] = [
    ...super.defaultFields,
    new Builder.FieldDefinitionBuilder().id("percentage").build(),
    new Builder.FieldDefinitionBuilder().id("parentTotal").build(),
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
    new Builder.FieldDefinitionBuilder().id("width").build(),
    new Builder.FieldDefinitionBuilder().id("length").build(),
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
const states = new Builder.DocStateBuilder()
  .id("forward")
  .network("changedNode", forwardNetworkSetValue)
  .network("root", forwardNetworkWithoutPercentage)
  .network("root", forwardNetworkWithPercentage)
  .transition()
  .to("backward")
  .when((node: DocNode, field: FieldDefinition, value: number) =>
    node.type.rules.some(
      (rule) =>
        rule.fieldId === field.id && rule.networkState === backwardNetworkState,
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
function buildDoc(startingJSON: CostNodeView): Doc {
  const doc = new Builder.DocBuilder()
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

  doc.setRoot(doc.convertCostNodeToDocNode(startingJSON));
  return doc;
}

function getFieldValue(doc: Doc, nodeId: string, fieldId: string) {
  return (
    doc.findNodeById(nodeId).type.fields.find((f) => f.id === fieldId)?.value ??
    NaN
  );
}

const startingJSONDoc: CostNodeView = {
  id: "root",
  typeId: "invoice",
  label: "Auftrag",
  values: { total: 2587.75 },
  children: [
    {
      id: "p2",
      typeId: "painting_room",
      label: "Wohnzimmer",
      values: {
        length: 5,
        width: 2,
        count: 10,
        unitCost: 287.775,
        total: 1977.75,
      },
      children: [
        {
          id: "p2-m1",
          typeId: "material",
          label: "Farbe",
          values: { count: 10, unitCost: 12, total: 120 },
          children: [],
        },
        {
          id: "p2-l1",
          typeId: "labor",
          label: "Arbeit",
          values: { count: 10, unitCost: 12, total: 120 },
          children: [],
        },
        {
          id: "p2-t2",
          typeId: "travel",
          label: "Reisekosten",
          values: { count: 10, unitCost: 10, total: 100 },
          children: [],
        },
        {
          id: "p2-d1",
          typeId: "discount",
          label: "Rabatt",
          values: { percentage: 10, total: -30.25 },
          children: [
            {
              id: "p2-d1-d1",
              typeId: "discount",
              label: "Rabatt-rabbatt",
              values: { percentage: 10, total: -2.5 },
              children: [],
            },
            {
              id: "p2-d1-d2",
              typeId: "discount",
              label: "Rabatt-rabbatt",
              values: { percentage: 10, total: -2.75 },
              children: [],
            },
          ],
        },
        {
          id: "p2-d2",
          typeId: "discount",
          label: "Rabatt",
          values: { percentage: 10, total: -21.975 },
          children: [],
        },
      ],
    },
    {
      id: "p3",
      typeId: "painting_room",
      label: "Bad",
      values: { length: 1, width: 2, count: 2, unitCost: 330, total: 610 },
      children: [
        {
          id: "p3-m1",
          typeId: "material",
          label: "Farbe",
          values: { count: 6, unitCost: 20, total: 120 },
          children: [],
        },
        {
          id: "p3-l1",
          typeId: "labor",
          label: "Arbeit",
          values: { count: 8, unitCost: 20, total: 160 },
          children: [],
        },
        {
          id: "p3-t2",
          typeId: "travel",
          label: "Reisekosten",
          values: { count: 10, unitCost: 5, total: 50 },
          children: [],
        },
      ],
    },
  ],
};

describe("Test calculation in all States", () => {
  it("Test if TestDoc is created correctly", () => {
    const doc = buildDoc(startingJSONDoc);
    expect(doc.currentState).toBe(forwardState);
    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      2587.75,
    );

    expect(parseFloat(getFieldValue(doc, "p2", "total").toFixed(2))).toBe(
      1977.75,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "unitCost").toFixed(4))).toBe(
      287.775,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "count").toFixed(2))).toBe(10);
    expect(parseFloat(getFieldValue(doc, "p2", "length").toFixed(2))).toBe(5);
    expect(parseFloat(getFieldValue(doc, "p2", "width").toFixed(2))).toBe(2);

    expect(parseFloat(getFieldValue(doc, "p2-m1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "unitCost").toFixed(2))).toBe(
      12,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-l1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "unitCost").toFixed(2))).toBe(
      12,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-t2", "total").toFixed(2))).toBe(
      100,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "unitCost").toFixed(2))).toBe(
      10,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-d1", "total").toFixed(2))).toBe(
      -30.25,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d1", "total").toFixed(2))).toBe(
      -2.5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d1", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d2", "total").toFixed(2))).toBe(
      -2.75,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d2", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d2", "total").toFixed(3))).toBe(
      -21.975,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d2", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p3", "total").toFixed(2))).toBe(610);
    expect(parseFloat(getFieldValue(doc, "p3", "unitCost").toFixed(2))).toBe(
      330,
    );
    expect(parseFloat(getFieldValue(doc, "p3", "count").toFixed(2))).toBe(2);
    expect(parseFloat(getFieldValue(doc, "p3", "length").toFixed(2))).toBe(1);
    expect(parseFloat(getFieldValue(doc, "p3", "width").toFixed(2))).toBe(2);

    expect(parseFloat(getFieldValue(doc, "p3-m1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "unitCost").toFixed(2))).toBe(
      20,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "count").toFixed(2))).toBe(6);

    expect(parseFloat(getFieldValue(doc, "p3-l1", "total").toFixed(2))).toBe(
      160,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "unitCost").toFixed(2))).toBe(
      20,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "count").toFixed(2))).toBe(8);

    expect(parseFloat(getFieldValue(doc, "p3-t2", "total").toFixed(2))).toBe(
      50,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "unitCost").toFixed(2))).toBe(
      5,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "count").toFixed(2))).toBe(
      10,
    );
  });
  it("Test forward calculation without percentage", () => {
    const doc = buildDoc(startingJSONDoc);
    const node = doc.findNodeById("p3-m1");
    const field = node.type.fields.find((f) => f.id === "count")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 10);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      2747.75,
    );

    expect(parseFloat(getFieldValue(doc, "p2", "total").toFixed(2))).toBe(
      1977.75,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "unitCost").toFixed(3))).toBe(
      287.775,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "count").toFixed(2))).toBe(10);
    expect(parseFloat(getFieldValue(doc, "p2", "length").toFixed(2))).toBe(5);
    expect(parseFloat(getFieldValue(doc, "p2", "width").toFixed(2))).toBe(2);

    expect(parseFloat(getFieldValue(doc, "p2-m1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "unitCost").toFixed(2))).toBe(
      12,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-l1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "unitCost").toFixed(2))).toBe(
      12,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-t2", "total").toFixed(2))).toBe(
      100,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "unitCost").toFixed(2))).toBe(
      10,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-d1", "total").toFixed(2))).toBe(
      -30.25,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d1", "total").toFixed(2))).toBe(
      -2.5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d1", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d2", "total").toFixed(2))).toBe(
      -2.75,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d2", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d2", "total").toFixed(3))).toBe(
      -21.975,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d2", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p3", "total").toFixed(2))).toBe(770);
    expect(parseFloat(getFieldValue(doc, "p3", "unitCost").toFixed(2))).toBe(
      410,
    );
    expect(parseFloat(getFieldValue(doc, "p3", "count").toFixed(2))).toBe(2);
    expect(parseFloat(getFieldValue(doc, "p3", "length").toFixed(2))).toBe(1);
    expect(parseFloat(getFieldValue(doc, "p3", "width").toFixed(2))).toBe(2);

    // changed node: p3-m1
    expect(parseFloat(getFieldValue(doc, "p3-m1", "count").toFixed(2))).toBe(
      10,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "unitCost").toFixed(2))).toBe(
      20,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "total").toFixed(2))).toBe(
      200,
    );

    expect(parseFloat(getFieldValue(doc, "p3-l1", "total").toFixed(2))).toBe(
      160,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "unitCost").toFixed(2))).toBe(
      20,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "count").toFixed(2))).toBe(8);

    expect(parseFloat(getFieldValue(doc, "p3-t2", "total").toFixed(2))).toBe(
      50,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "unitCost").toFixed(2))).toBe(
      5,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "count").toFixed(2))).toBe(
      10,
    );
  });
  it("Test forward calculation with percentage", () => {
    const doc = buildDoc(startingJSONDoc);
    const node = doc.findNodeById("p2-m1");
    const field = node.type.fields.find((f) => f.id === "count")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 20);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      3537.07,
    );

    expect(parseFloat(getFieldValue(doc, "p2", "total").toFixed(2))).toBe(
      2927.07,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "unitCost").toFixed(3))).toBe(
      382.707,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "count").toFixed(2))).toBe(10);
    expect(parseFloat(getFieldValue(doc, "p2", "length").toFixed(2))).toBe(5);
    expect(parseFloat(getFieldValue(doc, "p2", "width").toFixed(2))).toBe(2);

    // changed node: p2-m1
    expect(parseFloat(getFieldValue(doc, "p2-m1", "total").toFixed(2))).toBe(
      240,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "unitCost").toFixed(2))).toBe(
      12,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "count").toFixed(2))).toBe(
      20,
    );

    expect(parseFloat(getFieldValue(doc, "p2-l1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "unitCost").toFixed(2))).toBe(
      12,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-t2", "total").toFixed(2))).toBe(
      100,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "unitCost").toFixed(2))).toBe(
      10,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-d1", "total").toFixed(2))).toBe(
      -44.77,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d1", "total").toFixed(2))).toBe(
      -3.7,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d1", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d2", "total").toFixed(2))).toBe(
      -4.07,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d2", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d2", "total").toFixed(3))).toBe(
      -32.523,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d2", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p3", "total").toFixed(2))).toBe(610);
    expect(parseFloat(getFieldValue(doc, "p3", "unitCost").toFixed(2))).toBe(
      330,
    );
    expect(parseFloat(getFieldValue(doc, "p3", "count").toFixed(2))).toBe(2);
    expect(parseFloat(getFieldValue(doc, "p3", "length").toFixed(2))).toBe(1);
    expect(parseFloat(getFieldValue(doc, "p3", "width").toFixed(2))).toBe(2);

    expect(parseFloat(getFieldValue(doc, "p3-m1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "unitCost").toFixed(2))).toBe(
      20,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "count").toFixed(2))).toBe(6);

    expect(parseFloat(getFieldValue(doc, "p3-l1", "total").toFixed(2))).toBe(
      160,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "unitCost").toFixed(2))).toBe(
      20,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "count").toFixed(2))).toBe(8);

    expect(parseFloat(getFieldValue(doc, "p3-t2", "total").toFixed(2))).toBe(
      50,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "unitCost").toFixed(2))).toBe(
      5,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "count").toFixed(2))).toBe(
      10,
    );
  });
  it("Test backward calculation on child total", () => {
    const doc = buildDoc(startingJSONDoc);
    const node = doc.findNodeById("p3-l1");
    const field = node.type.fields.find((f) => f.id === "total")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 80);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      2427.75,
    );

    expect(parseFloat(getFieldValue(doc, "p2", "total").toFixed(2))).toBe(
      1977.75,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "unitCost").toFixed(4))).toBe(
      287.775,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "count").toFixed(2))).toBe(10);
    expect(parseFloat(getFieldValue(doc, "p2", "length").toFixed(2))).toBe(5);
    expect(parseFloat(getFieldValue(doc, "p2", "width").toFixed(2))).toBe(2);

    expect(parseFloat(getFieldValue(doc, "p2-m1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "unitCost").toFixed(2))).toBe(
      12,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-l1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "unitCost").toFixed(2))).toBe(
      12,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-t2", "total").toFixed(2))).toBe(
      100,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "unitCost").toFixed(2))).toBe(
      10,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-d1", "total").toFixed(2))).toBe(
      -30.25,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d1", "total").toFixed(2))).toBe(
      -2.5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d1", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d2", "total").toFixed(2))).toBe(
      -2.75,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d2", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d2", "total").toFixed(3))).toBe(
      -21.975,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d2", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p3", "total").toFixed(2))).toBe(450);
    expect(parseFloat(getFieldValue(doc, "p3", "unitCost").toFixed(2))).toBe(
      250,
    );
    expect(parseFloat(getFieldValue(doc, "p3", "count").toFixed(2))).toBe(2);
    expect(parseFloat(getFieldValue(doc, "p3", "length").toFixed(2))).toBe(1);
    expect(parseFloat(getFieldValue(doc, "p3", "width").toFixed(2))).toBe(2);

    expect(parseFloat(getFieldValue(doc, "p3-m1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "unitCost").toFixed(2))).toBe(
      20,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "count").toFixed(2))).toBe(6);

    // changed node: p3-l1
    expect(parseFloat(getFieldValue(doc, "p3-l1", "total").toFixed(2))).toBe(
      80,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "unitCost").toFixed(2))).toBe(
      10,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "count").toFixed(2))).toBe(8);

    expect(parseFloat(getFieldValue(doc, "p3-t2", "total").toFixed(2))).toBe(
      50,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "unitCost").toFixed(2))).toBe(
      5,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "count").toFixed(2))).toBe(
      10,
    );
  });
  it("Test backward calculation on child unitCost", () => {
    const doc = buildDoc(startingJSONDoc);
    doc.currentState.executeNetworks(
      doc,
      doc.root,
      doc.root.type.fields[0],
      doc.root.type.fields[0].value,
    );
    const node = doc.findNodeById("p3-t2");
    const field = node.type.fields.find((f) => f.id === "unitCost")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 10);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      2637.75,
    );

    expect(parseFloat(getFieldValue(doc, "p2", "total").toFixed(2))).toBe(
      1977.75,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "unitCost").toFixed(4))).toBe(
      287.775,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "count").toFixed(2))).toBe(10);
    expect(parseFloat(getFieldValue(doc, "p2", "length").toFixed(2))).toBe(5);
    expect(parseFloat(getFieldValue(doc, "p2", "width").toFixed(2))).toBe(2);

    expect(parseFloat(getFieldValue(doc, "p2-m1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "unitCost").toFixed(2))).toBe(
      12,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-l1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "unitCost").toFixed(2))).toBe(
      12,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-t2", "total").toFixed(2))).toBe(
      100,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "unitCost").toFixed(2))).toBe(
      10,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-d1", "total").toFixed(2))).toBe(
      -30.25,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d1", "total").toFixed(2))).toBe(
      -2.5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d1", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d2", "total").toFixed(2))).toBe(
      -2.75,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d2", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d2", "total").toFixed(3))).toBe(
      -21.975,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d2", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p3", "total").toFixed(2))).toBe(660);
    expect(parseFloat(getFieldValue(doc, "p3", "unitCost").toFixed(2))).toBe(
      380,
    );
    expect(parseFloat(getFieldValue(doc, "p3", "count").toFixed(2))).toBe(2);
    expect(parseFloat(getFieldValue(doc, "p3", "length").toFixed(2))).toBe(1);
    expect(parseFloat(getFieldValue(doc, "p3", "width").toFixed(2))).toBe(2);

    expect(parseFloat(getFieldValue(doc, "p3-m1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "unitCost").toFixed(2))).toBe(
      20,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "count").toFixed(2))).toBe(6);

    expect(parseFloat(getFieldValue(doc, "p3-l1", "total").toFixed(2))).toBe(
      160,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "unitCost").toFixed(2))).toBe(
      20,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "count").toFixed(2))).toBe(8);

    // changed node: p3-t2
    expect(parseFloat(getFieldValue(doc, "p3-t2", "total").toFixed(2))).toBe(
      100,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "unitCost").toFixed(2))).toBe(
      10,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "count").toFixed(2))).toBe(
      10,
    );
  });
  it("Test backward calculation on parent total", () => {
    const doc = buildDoc(startingJSONDoc);
    doc.currentState.executeNetworks(
      doc,
      doc.root,
      doc.root.type.fields[0],
      doc.root.type.fields[0].value,
    );
    const node = doc.findNodeById("p3");
    const field = node.type.fields.find((f) => f.id === "total")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 305);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      2282.75,
    );

    expect(parseFloat(getFieldValue(doc, "p2", "total").toFixed(2))).toBe(
      1977.75,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "unitCost").toFixed(4))).toBe(
      287.775,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "count").toFixed(2))).toBe(10);
    expect(parseFloat(getFieldValue(doc, "p2", "length").toFixed(2))).toBe(5);
    expect(parseFloat(getFieldValue(doc, "p2", "width").toFixed(2))).toBe(2);

    expect(parseFloat(getFieldValue(doc, "p2-m1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "unitCost").toFixed(2))).toBe(
      12,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-l1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "unitCost").toFixed(2))).toBe(
      12,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-t2", "total").toFixed(2))).toBe(
      100,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "unitCost").toFixed(2))).toBe(
      10,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-d1", "total").toFixed(2))).toBe(
      -30.25,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d1", "total").toFixed(2))).toBe(
      -2.5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d1", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d2", "total").toFixed(2))).toBe(
      -2.75,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d2", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d2", "total").toFixed(3))).toBe(
      -21.975,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d2", "percentage").toFixed(2)),
    ).toBe(10);

    // changed node: p3
    expect(parseFloat(getFieldValue(doc, "p3", "total").toFixed(2))).toBe(305);
    expect(parseFloat(getFieldValue(doc, "p3", "unitCost").toFixed(2))).toBe(
      165,
    );
    expect(parseFloat(getFieldValue(doc, "p3", "count").toFixed(2))).toBe(2);
    expect(parseFloat(getFieldValue(doc, "p3", "length").toFixed(2))).toBe(1);
    expect(parseFloat(getFieldValue(doc, "p3", "width").toFixed(2))).toBe(2);

    expect(parseFloat(getFieldValue(doc, "p3-m1", "total").toFixed(2))).toBe(
      60,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "unitCost").toFixed(2))).toBe(
      10,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "count").toFixed(2))).toBe(6);

    expect(parseFloat(getFieldValue(doc, "p3-l1", "total").toFixed(2))).toBe(
      80,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "unitCost").toFixed(2))).toBe(
      10,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "count").toFixed(2))).toBe(8);

    expect(parseFloat(getFieldValue(doc, "p3-t2", "total").toFixed(2))).toBe(
      25,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "unitCost").toFixed(2))).toBe(
      2.5,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "count").toFixed(2))).toBe(
      10,
    );
  });
  it("Test backward calculation on parent unitCost", () => {
    const doc = buildDoc(startingJSONDoc);
    doc.currentState.executeNetworks(
      doc,
      doc.root,
      doc.root.type.fields[0],
      doc.root.type.fields[0].value,
    );
    const node = doc.findNodeById("p3");
    const field = node.type.fields.find((f) => f.id === "unitCost")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 165);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      2282.75,
    );

    expect(parseFloat(getFieldValue(doc, "p2", "total").toFixed(2))).toBe(
      1977.75,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "unitCost").toFixed(4))).toBe(
      287.775,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "count").toFixed(2))).toBe(10);
    expect(parseFloat(getFieldValue(doc, "p2", "length").toFixed(2))).toBe(5);
    expect(parseFloat(getFieldValue(doc, "p2", "width").toFixed(2))).toBe(2);

    expect(parseFloat(getFieldValue(doc, "p2-m1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "unitCost").toFixed(2))).toBe(
      12,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-l1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "unitCost").toFixed(2))).toBe(
      12,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-t2", "total").toFixed(2))).toBe(
      100,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "unitCost").toFixed(2))).toBe(
      10,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-d1", "total").toFixed(2))).toBe(
      -30.25,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d1", "total").toFixed(2))).toBe(
      -2.5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d1", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d2", "total").toFixed(2))).toBe(
      -2.75,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d2", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d2", "total").toFixed(3))).toBe(
      -21.975,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d2", "percentage").toFixed(2)),
    ).toBe(10);

    // changed node: p3
    expect(parseFloat(getFieldValue(doc, "p3", "total").toFixed(2))).toBe(305);
    expect(parseFloat(getFieldValue(doc, "p3", "unitCost").toFixed(2))).toBe(
      165,
    );
    expect(parseFloat(getFieldValue(doc, "p3", "count").toFixed(2))).toBe(2);
    expect(parseFloat(getFieldValue(doc, "p3", "length").toFixed(2))).toBe(1);
    expect(parseFloat(getFieldValue(doc, "p3", "width").toFixed(2))).toBe(2);

    expect(parseFloat(getFieldValue(doc, "p3-m1", "total").toFixed(2))).toBe(
      60,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "unitCost").toFixed(2))).toBe(
      10,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "count").toFixed(2))).toBe(6);

    expect(parseFloat(getFieldValue(doc, "p3-l1", "total").toFixed(2))).toBe(
      80,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "unitCost").toFixed(2))).toBe(
      10,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "count").toFixed(2))).toBe(8);

    expect(parseFloat(getFieldValue(doc, "p3-t2", "total").toFixed(2))).toBe(
      25,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "unitCost").toFixed(2))).toBe(
      2.5,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "count").toFixed(2))).toBe(
      10,
    );
  });
  it("Test discount calculate on child total", () => {
    const doc = buildDoc(startingJSONDoc);
    doc.currentState.executeNetworks(
      doc,
      doc.root,
      doc.root.type.fields[0],
      doc.root.type.fields[0].value,
    );
    const node = doc.findNodeById("p2-d1-d1");
    const field = node.type.fields.find((f) => f.id === "total")!;
    doc.updateTreeForFieldChange(doc, node.id, field, -2);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      2592.7,
    );

    expect(parseFloat(getFieldValue(doc, "p2", "total").toFixed(2))).toBe(
      1982.7,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "unitCost").toFixed(4))).toBe(
      288.27,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "count").toFixed(2))).toBe(10);
    expect(parseFloat(getFieldValue(doc, "p2", "length").toFixed(2))).toBe(5);
    expect(parseFloat(getFieldValue(doc, "p2", "width").toFixed(2))).toBe(2);

    expect(parseFloat(getFieldValue(doc, "p2-m1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "unitCost").toFixed(2))).toBe(
      12,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-l1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "unitCost").toFixed(2))).toBe(
      12,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-t2", "total").toFixed(2))).toBe(
      100,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "unitCost").toFixed(2))).toBe(
      10,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-d1", "total").toFixed(2))).toBe(
      -29.7,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d1", "total").toFixed(2))).toBe(
      -2,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d1", "percentage").toFixed(2)),
    ).toBe(8);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d2", "total").toFixed(2))).toBe(
      -2.7,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d2", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d2", "total").toFixed(3))).toBe(
      -22.03,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d2", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p3", "total").toFixed(2))).toBe(610);
    expect(parseFloat(getFieldValue(doc, "p3", "unitCost").toFixed(2))).toBe(
      330,
    );
    expect(parseFloat(getFieldValue(doc, "p3", "count").toFixed(2))).toBe(2);
    expect(parseFloat(getFieldValue(doc, "p3", "length").toFixed(2))).toBe(1);
    expect(parseFloat(getFieldValue(doc, "p3", "width").toFixed(2))).toBe(2);

    expect(parseFloat(getFieldValue(doc, "p3-m1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "unitCost").toFixed(2))).toBe(
      20,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "count").toFixed(2))).toBe(6);

    expect(parseFloat(getFieldValue(doc, "p3-l1", "total").toFixed(2))).toBe(
      160,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "unitCost").toFixed(2))).toBe(
      20,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "count").toFixed(2))).toBe(8);

    expect(parseFloat(getFieldValue(doc, "p3-t2", "total").toFixed(2))).toBe(
      50,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "unitCost").toFixed(2))).toBe(
      5,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "count").toFixed(2))).toBe(
      10,
    );
  });
  it("Test discount calculate on child percentage", () => {
    const doc = buildDoc(startingJSONDoc);
    doc.currentState.executeNetworks(
      doc,
      doc.root,
      doc.root.type.fields[0],
      doc.root.type.fields[0].value,
    );
    const node = doc.findNodeById("p2-d1-d1");
    const field = node.type.fields.find((f) => f.id === "percentage")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 8);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      2592.7,
    );

    expect(parseFloat(getFieldValue(doc, "p2", "total").toFixed(2))).toBe(
      1982.7,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "unitCost").toFixed(4))).toBe(
      288.27,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "count").toFixed(2))).toBe(10);
    expect(parseFloat(getFieldValue(doc, "p2", "length").toFixed(2))).toBe(5);
    expect(parseFloat(getFieldValue(doc, "p2", "width").toFixed(2))).toBe(2);

    expect(parseFloat(getFieldValue(doc, "p2-m1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "unitCost").toFixed(2))).toBe(
      12,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-l1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "unitCost").toFixed(2))).toBe(
      12,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-t2", "total").toFixed(2))).toBe(
      100,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "unitCost").toFixed(2))).toBe(
      10,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-d1", "total").toFixed(2))).toBe(
      -29.7,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1", "percentage").toFixed(2)),
    ).toBe(10);

    // changed node: p2-d1-d1
    expect(parseFloat(getFieldValue(doc, "p2-d1-d1", "total").toFixed(2))).toBe(
      -2,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d1", "percentage").toFixed(2)),
    ).toBe(8);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d2", "total").toFixed(2))).toBe(
      -2.7,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d2", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d2", "total").toFixed(3))).toBe(
      -22.03,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d2", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p3", "total").toFixed(2))).toBe(610);
    expect(parseFloat(getFieldValue(doc, "p3", "unitCost").toFixed(2))).toBe(
      330,
    );
    expect(parseFloat(getFieldValue(doc, "p3", "count").toFixed(2))).toBe(2);
    expect(parseFloat(getFieldValue(doc, "p3", "length").toFixed(2))).toBe(1);
    expect(parseFloat(getFieldValue(doc, "p3", "width").toFixed(2))).toBe(2);

    expect(parseFloat(getFieldValue(doc, "p3-m1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "unitCost").toFixed(2))).toBe(
      20,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "count").toFixed(2))).toBe(6);

    expect(parseFloat(getFieldValue(doc, "p3-l1", "total").toFixed(2))).toBe(
      160,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "unitCost").toFixed(2))).toBe(
      20,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "count").toFixed(2))).toBe(8);

    expect(parseFloat(getFieldValue(doc, "p3-t2", "total").toFixed(2))).toBe(
      50,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "unitCost").toFixed(2))).toBe(
      5,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "count").toFixed(2))).toBe(
      10,
    );
  });
  it("Test discount calculate on parent total", () => {
    const doc = buildDoc(startingJSONDoc);
    doc.currentState.executeNetworks(
      doc,
      doc.root,
      doc.root.type.fields[0],
      doc.root.type.fields[0].value,
    );
    const node = doc.findNodeById("p2-d1");
    const field = node.type.fields.find((f) => f.id === "total")!;
    doc.updateTreeForFieldChange(doc, node.id, field, -50);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      2315.5,
    );

    expect(parseFloat(getFieldValue(doc, "p2", "total").toFixed(2))).toBe(
      1705.5,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "unitCost").toFixed(4))).toBe(
      260.55,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "count").toFixed(2))).toBe(10);
    expect(parseFloat(getFieldValue(doc, "p2", "length").toFixed(2))).toBe(5);
    expect(parseFloat(getFieldValue(doc, "p2", "width").toFixed(2))).toBe(2);

    expect(parseFloat(getFieldValue(doc, "p2-m1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "unitCost").toFixed(2))).toBe(
      12,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-l1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "unitCost").toFixed(2))).toBe(
      12,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-t2", "total").toFixed(2))).toBe(
      100,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "unitCost").toFixed(2))).toBe(
      10,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "count").toFixed(2))).toBe(
      10,
    );

    // changed node: p2-d1
    expect(parseFloat(getFieldValue(doc, "p2-d1", "total").toFixed(2))).toBe(
      -60.5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1", "percentage").toFixed(2)),
    ).toBe(20);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d1", "total").toFixed(2))).toBe(
      -5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d1", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d2", "total").toFixed(2))).toBe(
      -5.5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d2", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d2", "total").toFixed(3))).toBe(
      -18.95,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d2", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p3", "total").toFixed(2))).toBe(610);
    expect(parseFloat(getFieldValue(doc, "p3", "unitCost").toFixed(2))).toBe(
      330,
    );
    expect(parseFloat(getFieldValue(doc, "p3", "count").toFixed(2))).toBe(2);
    expect(parseFloat(getFieldValue(doc, "p3", "length").toFixed(2))).toBe(1);
    expect(parseFloat(getFieldValue(doc, "p3", "width").toFixed(2))).toBe(2);

    expect(parseFloat(getFieldValue(doc, "p3-m1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "unitCost").toFixed(2))).toBe(
      20,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "count").toFixed(2))).toBe(6);

    expect(parseFloat(getFieldValue(doc, "p3-l1", "total").toFixed(2))).toBe(
      160,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "unitCost").toFixed(2))).toBe(
      20,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "count").toFixed(2))).toBe(8);

    expect(parseFloat(getFieldValue(doc, "p3-t2", "total").toFixed(2))).toBe(
      50,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "unitCost").toFixed(2))).toBe(
      5,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "count").toFixed(2))).toBe(
      10,
    );
  });
  it("Test discount calculate on parent percentage", () => {
    const doc = buildDoc(startingJSONDoc);
    doc.currentState.executeNetworks(
      doc,
      doc.root,
      doc.root.type.fields[0],
      doc.root.type.fields[0].value,
    );
    const node = doc.findNodeById("p2-d1");
    const field = node.type.fields.find((f) => f.id === "percentage")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 20);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      2315.5,
    );

    expect(parseFloat(getFieldValue(doc, "p2", "total").toFixed(2))).toBe(
      1705.5,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "unitCost").toFixed(4))).toBe(
      260.55,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "count").toFixed(2))).toBe(10);
    expect(parseFloat(getFieldValue(doc, "p2", "length").toFixed(2))).toBe(5);
    expect(parseFloat(getFieldValue(doc, "p2", "width").toFixed(2))).toBe(2);

    expect(parseFloat(getFieldValue(doc, "p2-m1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "unitCost").toFixed(2))).toBe(
      12,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-l1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "unitCost").toFixed(2))).toBe(
      12,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-t2", "total").toFixed(2))).toBe(
      100,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "unitCost").toFixed(2))).toBe(
      10,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "count").toFixed(2))).toBe(
      10,
    );

    // changed node: p2-d1
    expect(parseFloat(getFieldValue(doc, "p2-d1", "total").toFixed(2))).toBe(
      -60.5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1", "percentage").toFixed(2)),
    ).toBe(20);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d1", "total").toFixed(2))).toBe(
      -5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d1", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d2", "total").toFixed(2))).toBe(
      -5.5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d2", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d2", "total").toFixed(3))).toBe(
      -18.95,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d2", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p3", "total").toFixed(2))).toBe(610);
    expect(parseFloat(getFieldValue(doc, "p3", "unitCost").toFixed(2))).toBe(
      330,
    );
    expect(parseFloat(getFieldValue(doc, "p3", "count").toFixed(2))).toBe(2);
    expect(parseFloat(getFieldValue(doc, "p3", "length").toFixed(2))).toBe(1);
    expect(parseFloat(getFieldValue(doc, "p3", "width").toFixed(2))).toBe(2);

    expect(parseFloat(getFieldValue(doc, "p3-m1", "total").toFixed(2))).toBe(
      120,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "unitCost").toFixed(2))).toBe(
      20,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "count").toFixed(2))).toBe(6);

    expect(parseFloat(getFieldValue(doc, "p3-l1", "total").toFixed(2))).toBe(
      160,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "unitCost").toFixed(2))).toBe(
      20,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "count").toFixed(2))).toBe(8);

    expect(parseFloat(getFieldValue(doc, "p3-t2", "total").toFixed(2))).toBe(
      50,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "unitCost").toFixed(2))).toBe(
      5,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "count").toFixed(2))).toBe(
      10,
    );
  });
  it("Test backward calculate root total", () => {
    const doc = buildDoc(startingJSONDoc);
    doc.currentState.executeNetworks(
      doc,
      doc.root,
      doc.root.type.fields[0],
      doc.root.type.fields[0].value,
    );
    const node = doc.root;
    const field = doc.root.type.fields.find((f) => f.id === "total")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 5175.5);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      5175.5,
    );

    expect(parseFloat(getFieldValue(doc, "p2", "total").toFixed(2))).toBe(
      3955.5,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "unitCost").toFixed(4))).toBe(
      575.55,
    );
    expect(parseFloat(getFieldValue(doc, "p2", "count").toFixed(2))).toBe(10);
    expect(parseFloat(getFieldValue(doc, "p2", "length").toFixed(2))).toBe(5);
    expect(parseFloat(getFieldValue(doc, "p2", "width").toFixed(2))).toBe(2);

    expect(parseFloat(getFieldValue(doc, "p2-m1", "total").toFixed(2))).toBe(
      240,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "unitCost").toFixed(2))).toBe(
      24,
    );
    expect(parseFloat(getFieldValue(doc, "p2-m1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-l1", "total").toFixed(2))).toBe(
      240,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "unitCost").toFixed(2))).toBe(
      24,
    );
    expect(parseFloat(getFieldValue(doc, "p2-l1", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-t2", "total").toFixed(2))).toBe(
      200,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "unitCost").toFixed(2))).toBe(
      20,
    );
    expect(parseFloat(getFieldValue(doc, "p2-t2", "count").toFixed(2))).toBe(
      10,
    );

    expect(parseFloat(getFieldValue(doc, "p2-d1", "total").toFixed(2))).toBe(
      -60.5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d1", "total").toFixed(2))).toBe(
      -5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d1", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d1-d2", "total").toFixed(2))).toBe(
      -5.5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d1-d2", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p2-d2", "total").toFixed(3))).toBe(
      -43.95,
    );
    expect(
      parseFloat(getFieldValue(doc, "p2-d2", "percentage").toFixed(2)),
    ).toBe(10);

    expect(parseFloat(getFieldValue(doc, "p3", "total").toFixed(2))).toBe(1220);
    expect(parseFloat(getFieldValue(doc, "p3", "unitCost").toFixed(2))).toBe(
      660,
    );
    expect(parseFloat(getFieldValue(doc, "p3", "count").toFixed(2))).toBe(2);
    expect(parseFloat(getFieldValue(doc, "p3", "length").toFixed(2))).toBe(1);
    expect(parseFloat(getFieldValue(doc, "p3", "width").toFixed(2))).toBe(2);

    expect(parseFloat(getFieldValue(doc, "p3-m1", "total").toFixed(2))).toBe(
      240,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "unitCost").toFixed(2))).toBe(
      40,
    );
    expect(parseFloat(getFieldValue(doc, "p3-m1", "count").toFixed(2))).toBe(6);

    expect(parseFloat(getFieldValue(doc, "p3-l1", "total").toFixed(2))).toBe(
      320,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "unitCost").toFixed(2))).toBe(
      40,
    );
    expect(parseFloat(getFieldValue(doc, "p3-l1", "count").toFixed(2))).toBe(8);

    expect(parseFloat(getFieldValue(doc, "p3-t2", "total").toFixed(2))).toBe(
      100,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "unitCost").toFixed(2))).toBe(
      10,
    );
    expect(parseFloat(getFieldValue(doc, "p3-t2", "count").toFixed(2))).toBe(
      10,
    );
  });
});

describe("Transition tests", () => {
  it("Test transition Forward-Backward", () => {
    const doc = buildDoc(startingJSONDoc);
    doc.currentState.executeNetworks(
      doc,
      doc.root,
      doc.root.type.fields[0],
      doc.root.type.fields[0].value,
    );
    const node = doc.findNodeById("p3-t2");
    const field = node.type.fields.find((f) => f.id === "unitCost")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 10);
    expect(doc.currentState).toBe(backwardState);
  });
  it("Test transition Forward-Percentage", () => {
    const doc = buildDoc(startingJSONDoc);
    doc.currentState.executeNetworks(
      doc,
      doc.root,
      doc.root.type.fields[0],
      doc.root.type.fields[0].value,
    );
    const node = doc.findNodeById("p2-d2");
    const field = node.type.fields.find((f) => f.id === "total")!;
    doc.updateTreeForFieldChange(doc, node.id, field, -20);
    expect(doc.currentState).toBe(percentageBackwardState);
  });
  it("Test transition Backward-Forward", () => {
    const doc = buildDoc(startingJSONDoc);
    doc.currentState.executeNetworks(
      doc,
      doc.root,
      doc.root.type.fields[0],
      doc.root.type.fields[0].value,
    );
    let node = doc.findNodeById("p3-t2");
    let field = node.type.fields.find((f) => f.id === "unitCost")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 10);
    expect(doc.currentState).toBe(backwardState);
    node = doc.findNodeById("p3-t2");
    field = node.type.fields.find((f) => f.id === "count")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 20);
    expect(doc.currentState).toBe(forwardState);
  });
  it("Test transition Backward-Percentage", () => {
    const doc = buildDoc(startingJSONDoc);
    doc.currentState.executeNetworks(
      doc,
      doc.root,
      doc.root.type.fields[0],
      doc.root.type.fields[0].value,
    );
    let node = doc.findNodeById("p3-t2");
    let field = node.type.fields.find((f) => f.id === "unitCost")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 10);
    expect(doc.currentState).toBe(backwardState);
    node = doc.findNodeById("p2-d2");
    field = node.type.fields.find((f) => f.id === "total")!;
    doc.updateTreeForFieldChange(doc, node.id, field, -20);
    expect(doc.currentState).toBe(percentageBackwardState);
  });
  it("Test transition Percentage-Forwward", () => {
    const doc = buildDoc(startingJSONDoc);
    doc.currentState.executeNetworks(
      doc,
      doc.root,
      doc.root.type.fields[0],
      doc.root.type.fields[0].value,
    );
    let node = doc.findNodeById("p2-d2");
    let field = node.type.fields.find((f) => f.id === "total")!;
    doc.updateTreeForFieldChange(doc, node.id, field, -20);
    expect(doc.currentState).toBe(percentageBackwardState);
    node = doc.findNodeById("p3-t2");
    field = node.type.fields.find((f) => f.id === "count")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 20);
    expect(doc.currentState).toBe(forwardState);
  });
  it("Test transition Percentage-Backward", () => {
    const doc = buildDoc(startingJSONDoc);
    doc.currentState.executeNetworks(
      doc,
      doc.root,
      doc.root.type.fields[0],
      doc.root.type.fields[0].value,
    );
    let node = doc.findNodeById("p2-d2");
    let field = node.type.fields.find((f) => f.id === "total")!;
    doc.updateTreeForFieldChange(doc, node.id, field, -20);
    expect(doc.currentState).toBe(percentageBackwardState);
    node = doc.findNodeById("p3-t2");
    field = node.type.fields.find((f) => f.id === "unitCost")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 10);
    expect(doc.currentState).toBe(backwardState);
  });
});
