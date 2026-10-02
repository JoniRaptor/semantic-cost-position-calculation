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
import testDoc from "./Rechnung7Document.json";

// Network states
const forwardNetworkState = new Builder.NetworkStateBuilder()
  .id("forward")
  .build();

const backwardNetworkState = new Builder.NetworkStateBuilder()
  .id("backward")
  .build();

// NodeTypen Klassen

class TotalCostNodeMwst19 extends NodeType {
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
    return [UnitCostNodeMwst19, TotalCostNodeMwst19];
  }
}

class Nettosum extends TotalCostNodeMwst19 {
  protected static override readonly defaultFields: FieldDefinition[] = [
    ...super.defaultFields,
    new Builder.FieldDefinitionBuilder().id("Mwst19").build(),
  ];

  protected static override readonly defaultRules: Rule[] = [
    new Builder.RuleBuilder()
      .id("total-forward")
      .calculationRule("childrenTotal > 0 ? childrenTotal : total")
      .targetFieldId("total")
      .forNetworkState(forwardNetworkState)
      .build(),
    new Builder.RuleBuilder()
      .id("Mwst19-forward")
      .calculationRule("total * 0.19")
      .targetFieldId("Mwst19")
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
    return [UnitCostNodeMwst19, TotalCostNodeMwst19];
  }
}

class Bruttosum extends TotalCostNodeMwst19 {
  protected static override readonly defaultFields: FieldDefinition[] = [
    ...super.defaultFields,
    new Builder.FieldDefinitionBuilder().id("brutto").build(),
  ];

  protected static override readonly defaultRules: Rule[] = [
    new Builder.RuleBuilder()
      .id("total-forward")
      .calculationRule("childrenTotal > 0 ? childrenTotal : total")
      .targetFieldId("total")
      .forNetworkState(forwardNetworkState)
      .build(),
    new Builder.RuleBuilder()
      .id("brutto-forward")
      .calculationRule("total * 1.19")
      .targetFieldId("brutto")
      .forNetworkState(forwardNetworkState)
      .build(),
    new Builder.RuleBuilder()
      .id("total-backward-onChangeOfBrutto")
      .calculationRule("brutto / 1.19")
      .targetFieldId("total")
      .forNetworkState(backwardNetworkState)
      .triggerOnChangeOfField("brutto")
      .build(),
    new Builder.RuleBuilder()
      .id("brutto-backward")
      .calculationRule("brutto")
      .targetFieldId("brutto")
      .forNetworkState(backwardNetworkState)
      .build(),
  ];

  static get allowedChildTypes(): (typeof NodeType)[] {
    return [Nettosum];
  }
}

class UnitCostNodeMwst19 extends TotalCostNodeMwst19 {
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
        "childrenTotal > 0 ? childrenTotal * count : count * unitCost",
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
        "childrenTotal > 0 ? childrenTotal * count : count * unitCost",
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
  ];

  static get allowedChildTypes(): (typeof NodeType)[] {
    return [UnitCostNodeMwst19, LaborUnitCostMwst19];
  }
}

class LaborUnitCostMwst19 extends UnitCostNodeMwst19 {
  protected static override readonly defaultFields: FieldDefinition[] = [
    ...super.defaultFields,
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
        "childrenTotal > 0 ? childrenTotal * (count/60) : (count/60) * unitCost",
      )
      .targetFieldId("total")
      .forNetworkState(forwardNetworkState)
      .build(),
    new Builder.RuleBuilder()
      .id("pricePerUnit-forward")
      .calculationRule("count > 0 ? total / (count/60) : 0")
      .targetFieldId("pricePerUnit")
      .forNetworkState(forwardNetworkState)
      .build(),
    new Builder.RuleBuilder()
      .id("total-backward")
      .calculationRule(
        "childrenTotal > 0 ? childrenTotal * (count/60) : (count/60) * unitCost",
      )
      .targetFieldId("total")
      .forNetworkState(backwardNetworkState)
      .triggerOnChangeOfField("unitCost")
      .build(),
    new Builder.RuleBuilder()
      .id("unitCost-backward")
      .calculationRule(
        "childrenTotal > 0 ? unitCost * total / oldTotal : total / (count/60)",
      )
      .targetFieldId("unitCost")
      .forNetworkState(backwardNetworkState)
      .triggerOnChangeOfField("total")
      .build(),
    new Builder.RuleBuilder()
      .id("pricePerUnit-backward")
      .calculationRule("count > 0 ? total / (count/60) : 0")
      .targetFieldId("pricePerUnit")
      .forNetworkState(backwardNetworkState)
      .build(),
  ];

  static get allowedChildTypes(): (typeof NodeType)[] {
    return [UnitCostNodeMwst19, LaborUnitCostMwst19];
  }
}

// Step Instances

const attachChildrenTotal = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.AggregateChildrenField)
  .nodeTargetField("childrenTotal")
  .childField("total")
  .operator("sum")
  .allowedNodeTypes([
    TotalCostNodeMwst19,
    UnitCostNodeMwst19,
    LaborUnitCostMwst19,
    Nettosum,
    Bruttosum,
  ])
  .allowedChildTypes([
    TotalCostNodeMwst19,
    UnitCostNodeMwst19,
    LaborUnitCostMwst19,
    Nettosum,
  ])
  .build();

const evaluateRules = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.EvaluateRules)
  .build();

const attachOldTotal = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.AttachField)
  .targetField("oldTotal")
  .sourceField("total")
  .allowedNodeTypes([UnitCostNodeMwst19, LaborUnitCostMwst19])
  .build();

const distributeTotalOnChildrenBackwards = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.DistributeProportionalOnChildren)
  .sourceField("total")
  .childrenField("total")
  .allowedNodeTypes([TotalCostNodeMwst19, Nettosum, Bruttosum])
  .allowedChildrenTypes([
    TotalCostNodeMwst19,
    Nettosum,
    UnitCostNodeMwst19,
    LaborUnitCostMwst19,
  ])
  .build();

const distributeUnitCostOnChildrenBackwards = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.DistributeProportionalOnChildren)
  .sourceField("unitCost")
  .childrenField("total")
  .allowedNodeTypes([UnitCostNodeMwst19, LaborUnitCostMwst19])
  .allowedChildrenTypes([
    TotalCostNodeMwst19,
    UnitCostNodeMwst19,
    LaborUnitCostMwst19,
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
      UnitCostNodeMwst19,
      LaborUnitCostMwst19,
      TotalCostNodeMwst19,
      Nettosum,
      Bruttosum,
    ],
    [setValue],
  )
  .networkState(forwardNetworkState)
  .build();

const forwardNetwork = new Builder.StepDependencyNetworkBuilder()
  .addNodeTypeSteps(
    [
      UnitCostNodeMwst19,
      LaborUnitCostMwst19,
      TotalCostNodeMwst19,
      Nettosum,
      Bruttosum,
    ],
    [
      repeatNetworkForChildren,
      attachChildrenTotal,
      evaluateRules,
      attachOldTotal,
    ],
  )
  .networkState(forwardNetworkState)
  .build();

const backwardNetwork = new Builder.StepDependencyNetworkBuilder()
  .addNodeTypeSteps(
    [TotalCostNodeMwst19, Nettosum, Bruttosum],
    [
      setValue,
      evaluateRules,
      distributeTotalOnChildrenBackwards,
      repeatNetworkForChildren,
    ],
  )
  .addNodeTypeSteps(
    [UnitCostNodeMwst19, LaborUnitCostMwst19],
    [
      setValue,
      evaluateRules,
      distributeUnitCostOnChildrenBackwards,
      repeatNetworkForChildren,
      attachOldTotal,
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
function buildDoc(startingJSON: CostNodeView) {
  const doc = new Builder.DocBuilder()
    .startState(forwardState)
    .nodeType(Bruttosum)
    .typeId("brutto")
    .label("Auftrag")
    .labels([{ id: "brutto", label: "Endpreis" }])
    .build()
    .nodeType(Nettosum)
    .typeId("netto")
    .label("Netto")
    .labels([
      { id: "total", label: "Netto" },
      { id: "Mwst19", label: "19% MwSt" },
    ])
    .build()
    .nodeType(UnitCostNodeMwst19)
    .typeId("material")
    .label("Material")
    .labels([
      { id: "total", label: "Gesamtpreis" },
      { id: "count", label: "Menge" },
      { id: "unitCost", label: "Stückpreis" },
    ])
    .build()
    .nodeType(LaborUnitCostMwst19)
    .typeId("labor")
    .label("Lohn")
    .labels([
      { id: "total", label: "Gesamtpreis" },
      { id: "count", label: "Minuten" },
      { id: "unitCost", label: "Stundensatz" },
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

const startingJSONDoc: CostNodeView = testDoc.root;

describe("Test calculation in all States", () => {
  it("Test if TestDoc is created correctly", () => {
    const doc = buildDoc(startingJSONDoc);
    expect(doc.currentState).toBe(forwardState);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      651.62,
    );
    expect(parseFloat(getFieldValue(doc, "root", "brutto").toFixed(4))).toBe(
      775.4278,
    );

    expect(parseFloat(getFieldValue(doc, "p1", "total").toFixed(2))).toBe(
      651.62,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst19").toFixed(4))).toBe(
      123.8078,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1-1", "unitCost").toFixed(2))).toBe(
      651.62,
    );
    expect(parseFloat(getFieldValue(doc, "p1-1", "total").toFixed(2))).toBe(
      651.62,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-1", "unitCost").toFixed(2)),
    ).toBe(210.82);
    expect(parseFloat(getFieldValue(doc, "p1-1-1", "total").toFixed(2))).toBe(
      210.82,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2", "unitCost").toFixed(2)),
    ).toBe(44.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2", "total").toFixed(2))).toBe(
      44.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2-1", "count").toFixed(2))).toBe(
      1.5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2-1", "unitCost").toFixed(2)),
    ).toBe(10);
    expect(parseFloat(getFieldValue(doc, "p1-1-2-1", "total").toFixed(2))).toBe(
      15,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2-2", "count").toFixed(2))).toBe(
      30.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2-2", "unitCost").toFixed(2)),
    ).toBe(58.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2-2", "total").toFixed(2))).toBe(
      29.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-3", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-3", "unitCost").toFixed(2)),
    ).toBe(334.8);
    expect(parseFloat(getFieldValue(doc, "p1-1-3", "total").toFixed(2))).toBe(
      334.8,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-4", "count").toFixed(2))).toBe(
      60.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-4", "unitCost").toFixed(2)),
    ).toBe(62.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-4", "total").toFixed(2))).toBe(
      62.0,
    );
  });
  it("Test forward calculationn", () => {
    const doc = buildDoc(startingJSONDoc);
    const node = doc.findNodeById("p1-1-2");
    const field = node.type.fields.find((f) => f.id === "count")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 2);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      695.62,
    );
    expect(parseFloat(getFieldValue(doc, "root", "brutto").toFixed(4))).toBe(
      827.7878,
    );

    expect(parseFloat(getFieldValue(doc, "p1", "total").toFixed(2))).toBe(
      695.62,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst19").toFixed(4))).toBe(
      132.1678,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1-1", "unitCost").toFixed(2))).toBe(
      695.62,
    );
    expect(parseFloat(getFieldValue(doc, "p1-1", "total").toFixed(2))).toBe(
      695.62,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-1", "unitCost").toFixed(2)),
    ).toBe(210.82);
    expect(parseFloat(getFieldValue(doc, "p1-1-1", "total").toFixed(2))).toBe(
      210.82,
    );

    // changed node: p1-1-2
    expect(parseFloat(getFieldValue(doc, "p1-1-2", "count").toFixed(2))).toBe(
      2.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2", "unitCost").toFixed(2)),
    ).toBe(44.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2", "total").toFixed(2))).toBe(
      88.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2-1", "count").toFixed(2))).toBe(
      1.5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2-1", "unitCost").toFixed(2)),
    ).toBe(10);
    expect(parseFloat(getFieldValue(doc, "p1-1-2-1", "total").toFixed(2))).toBe(
      15,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2-2", "count").toFixed(2))).toBe(
      30.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2-2", "unitCost").toFixed(2)),
    ).toBe(58.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2-2", "total").toFixed(2))).toBe(
      29.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-3", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-3", "unitCost").toFixed(2)),
    ).toBe(334.8);
    expect(parseFloat(getFieldValue(doc, "p1-1-3", "total").toFixed(2))).toBe(
      334.8,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-4", "count").toFixed(2))).toBe(
      60.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-4", "unitCost").toFixed(2)),
    ).toBe(62.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-4", "total").toFixed(2))).toBe(
      62.0,
    );
  });
  it("Test for no change on Mwst", () => {
    const doc = buildDoc(startingJSONDoc);
    const node = doc.findNodeById("p1");
    const field = node.type.fields.find((f) => f.id === "Mwst19")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 2);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      651.62,
    );
    expect(parseFloat(getFieldValue(doc, "root", "brutto").toFixed(4))).toBe(
      775.4278,
    );

    expect(parseFloat(getFieldValue(doc, "p1", "total").toFixed(2))).toBe(
      651.62,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst19").toFixed(4))).toBe(
      123.8078,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1-1", "unitCost").toFixed(2))).toBe(
      651.62,
    );
    expect(parseFloat(getFieldValue(doc, "p1-1", "total").toFixed(2))).toBe(
      651.62,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-1", "unitCost").toFixed(2)),
    ).toBe(210.82);
    expect(parseFloat(getFieldValue(doc, "p1-1-1", "total").toFixed(2))).toBe(
      210.82,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2", "unitCost").toFixed(2)),
    ).toBe(44.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2", "total").toFixed(2))).toBe(
      44.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2-1", "count").toFixed(2))).toBe(
      1.5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2-1", "unitCost").toFixed(2)),
    ).toBe(10);
    expect(parseFloat(getFieldValue(doc, "p1-1-2-1", "total").toFixed(2))).toBe(
      15,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2-2", "count").toFixed(2))).toBe(
      30.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2-2", "unitCost").toFixed(2)),
    ).toBe(58.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2-2", "total").toFixed(2))).toBe(
      29.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-3", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-3", "unitCost").toFixed(2)),
    ).toBe(334.8);
    expect(parseFloat(getFieldValue(doc, "p1-1-3", "total").toFixed(2))).toBe(
      334.8,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-4", "count").toFixed(2))).toBe(
      60.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-4", "unitCost").toFixed(2)),
    ).toBe(62.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-4", "total").toFixed(2))).toBe(
      62.0,
    );
  });
  it("Test backward calculation on child total", () => {
    const doc = buildDoc(startingJSONDoc);
    const node = doc.findNodeById("p1-1-2-1");
    const field = node.type.fields.find((f) => f.id === "total")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 30);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      666.62,
    );
    expect(parseFloat(getFieldValue(doc, "root", "brutto").toFixed(4))).toBe(
      793.2778,
    );

    expect(parseFloat(getFieldValue(doc, "p1", "total").toFixed(2))).toBe(
      666.62,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst19").toFixed(4))).toBe(
      126.6578,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1-1", "unitCost").toFixed(2))).toBe(
      666.62,
    );
    expect(parseFloat(getFieldValue(doc, "p1-1", "total").toFixed(2))).toBe(
      666.62,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-1", "unitCost").toFixed(2)),
    ).toBe(210.82);
    expect(parseFloat(getFieldValue(doc, "p1-1-1", "total").toFixed(2))).toBe(
      210.82,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2", "unitCost").toFixed(2)),
    ).toBe(59.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2", "total").toFixed(2))).toBe(
      59.0,
    );

    // changed node: p1-1-2-1
    expect(parseFloat(getFieldValue(doc, "p1-1-2-1", "count").toFixed(2))).toBe(
      1.5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2-1", "unitCost").toFixed(2)),
    ).toBe(20.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2-1", "total").toFixed(2))).toBe(
      30.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2-2", "count").toFixed(2))).toBe(
      30.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2-2", "unitCost").toFixed(2)),
    ).toBe(58.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2-2", "total").toFixed(2))).toBe(
      29.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-3", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-3", "unitCost").toFixed(2)),
    ).toBe(334.8);
    expect(parseFloat(getFieldValue(doc, "p1-1-3", "total").toFixed(2))).toBe(
      334.8,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-4", "count").toFixed(2))).toBe(
      60.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-4", "unitCost").toFixed(2)),
    ).toBe(62.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-4", "total").toFixed(2))).toBe(
      62.0,
    );
  });
  it("Test backward calculation on child unitCost", () => {
    const doc = buildDoc(startingJSONDoc);
    const node = doc.findNodeById("p1-1-2-1");
    const field = node.type.fields.find((f) => f.id === "unitCost")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 20);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      666.62,
    );
    expect(parseFloat(getFieldValue(doc, "root", "brutto").toFixed(4))).toBe(
      793.2778,
    );

    expect(parseFloat(getFieldValue(doc, "p1", "total").toFixed(2))).toBe(
      666.62,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst19").toFixed(4))).toBe(
      126.6578,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1-1", "unitCost").toFixed(2))).toBe(
      666.62,
    );
    expect(parseFloat(getFieldValue(doc, "p1-1", "total").toFixed(2))).toBe(
      666.62,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-1", "unitCost").toFixed(2)),
    ).toBe(210.82);
    expect(parseFloat(getFieldValue(doc, "p1-1-1", "total").toFixed(2))).toBe(
      210.82,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2", "unitCost").toFixed(2)),
    ).toBe(59.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2", "total").toFixed(2))).toBe(
      59.0,
    );

    // changed node: p1-1-2-1
    expect(parseFloat(getFieldValue(doc, "p1-1-2-1", "count").toFixed(2))).toBe(
      1.5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2-1", "unitCost").toFixed(2)),
    ).toBe(20.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2-1", "total").toFixed(2))).toBe(
      30.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2-2", "count").toFixed(2))).toBe(
      30.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2-2", "unitCost").toFixed(2)),
    ).toBe(58.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2-2", "total").toFixed(2))).toBe(
      29.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-3", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-3", "unitCost").toFixed(2)),
    ).toBe(334.8);
    expect(parseFloat(getFieldValue(doc, "p1-1-3", "total").toFixed(2))).toBe(
      334.8,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-4", "count").toFixed(2))).toBe(
      60.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-4", "unitCost").toFixed(2)),
    ).toBe(62.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-4", "total").toFixed(2))).toBe(
      62.0,
    );
  });
  it("Test backward calculation on parent total", () => {
    const doc = buildDoc(startingJSONDoc);
    const node = doc.findNodeById("p1-1");
    const field = node.type.fields.find((f) => f.id === "total")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 1303.24);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      1303.24,
    );
    expect(parseFloat(getFieldValue(doc, "root", "brutto").toFixed(4))).toBe(
      1550.8556,
    );

    expect(parseFloat(getFieldValue(doc, "p1", "total").toFixed(2))).toBe(
      1303.24,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst19").toFixed(4))).toBe(
      247.6156,
    );

    // changed node: p1-1
    expect(parseFloat(getFieldValue(doc, "p1-1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1-1", "unitCost").toFixed(2))).toBe(
      1303.24,
    );
    expect(parseFloat(getFieldValue(doc, "p1-1", "total").toFixed(2))).toBe(
      1303.24,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-1", "unitCost").toFixed(2)),
    ).toBe(421.64);
    expect(parseFloat(getFieldValue(doc, "p1-1-1", "total").toFixed(2))).toBe(
      421.64,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2", "unitCost").toFixed(2)),
    ).toBe(88.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2", "total").toFixed(2))).toBe(
      88.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2-1", "count").toFixed(2))).toBe(
      1.5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2-1", "unitCost").toFixed(2)),
    ).toBe(20.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2-1", "total").toFixed(2))).toBe(
      30.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2-2", "count").toFixed(2))).toBe(
      30.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2-2", "unitCost").toFixed(2)),
    ).toBe(116.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2-2", "total").toFixed(2))).toBe(
      58.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-3", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-3", "unitCost").toFixed(2)),
    ).toBe(669.6);
    expect(parseFloat(getFieldValue(doc, "p1-1-3", "total").toFixed(2))).toBe(
      669.6,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-4", "count").toFixed(2))).toBe(
      60.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-4", "unitCost").toFixed(2)),
    ).toBe(124.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-4", "total").toFixed(2))).toBe(
      124.0,
    );
  });
  it("Test backward calculation on parent unitCost", () => {
    const doc = buildDoc(startingJSONDoc);
    const node = doc.findNodeById("p1-1");
    const field = node.type.fields.find((f) => f.id === "unitCost")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 1303.24);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      1303.24,
    );
    expect(parseFloat(getFieldValue(doc, "root", "brutto").toFixed(4))).toBe(
      1550.8556,
    );

    expect(parseFloat(getFieldValue(doc, "p1", "total").toFixed(2))).toBe(
      1303.24,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst19").toFixed(4))).toBe(
      247.6156,
    );

    // changed node: p1-1
    expect(parseFloat(getFieldValue(doc, "p1-1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1-1", "unitCost").toFixed(2))).toBe(
      1303.24,
    );
    expect(parseFloat(getFieldValue(doc, "p1-1", "total").toFixed(2))).toBe(
      1303.24,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-1", "unitCost").toFixed(2)),
    ).toBe(421.64);
    expect(parseFloat(getFieldValue(doc, "p1-1-1", "total").toFixed(2))).toBe(
      421.64,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2", "unitCost").toFixed(2)),
    ).toBe(88.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2", "total").toFixed(2))).toBe(
      88.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2-1", "count").toFixed(2))).toBe(
      1.5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2-1", "unitCost").toFixed(2)),
    ).toBe(20.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2-1", "total").toFixed(2))).toBe(
      30.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2-2", "count").toFixed(2))).toBe(
      30.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2-2", "unitCost").toFixed(2)),
    ).toBe(116.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2-2", "total").toFixed(2))).toBe(
      58.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-3", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-3", "unitCost").toFixed(2)),
    ).toBe(669.6);
    expect(parseFloat(getFieldValue(doc, "p1-1-3", "total").toFixed(2))).toBe(
      669.6,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-4", "count").toFixed(2))).toBe(
      60.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-4", "unitCost").toFixed(2)),
    ).toBe(124.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-4", "total").toFixed(2))).toBe(
      124.0,
    );
  });
  it("Test backward calculation on netto total", () => {
    const doc = buildDoc(startingJSONDoc);
    const node = doc.findNodeById("p1");
    const field = node.type.fields.find((f) => f.id === "total")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 1303.24);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      1303.24,
    );
    expect(parseFloat(getFieldValue(doc, "root", "brutto").toFixed(4))).toBe(
      1550.8556,
    );

    // changed node: p1
    expect(parseFloat(getFieldValue(doc, "p1", "total").toFixed(2))).toBe(
      1303.24,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst19").toFixed(4))).toBe(
      247.6156,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1-1", "unitCost").toFixed(2))).toBe(
      1303.24,
    );
    expect(parseFloat(getFieldValue(doc, "p1-1", "total").toFixed(2))).toBe(
      1303.24,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-1", "unitCost").toFixed(2)),
    ).toBe(421.64);
    expect(parseFloat(getFieldValue(doc, "p1-1-1", "total").toFixed(2))).toBe(
      421.64,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2", "unitCost").toFixed(2)),
    ).toBe(88.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2", "total").toFixed(2))).toBe(
      88.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2-1", "count").toFixed(2))).toBe(
      1.5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2-1", "unitCost").toFixed(2)),
    ).toBe(20.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2-1", "total").toFixed(2))).toBe(
      30.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2-2", "count").toFixed(2))).toBe(
      30.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2-2", "unitCost").toFixed(2)),
    ).toBe(116.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2-2", "total").toFixed(2))).toBe(
      58.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-3", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-3", "unitCost").toFixed(2)),
    ).toBe(669.6);
    expect(parseFloat(getFieldValue(doc, "p1-1-3", "total").toFixed(2))).toBe(
      669.6,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-4", "count").toFixed(2))).toBe(
      60.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-4", "unitCost").toFixed(2)),
    ).toBe(124.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-4", "total").toFixed(2))).toBe(
      124.0,
    );
  });
  it("Test backward calculation on brutto", () => {
    const doc = buildDoc(startingJSONDoc);
    doc.currentState.executeNetworks(
      doc,
      doc.root,
      doc.root.type.fields[0],
      doc.root.type.fields[0].value,
    );
    const node = doc.findNodeById("root");
    const field = node.type.fields.find((f) => f.id === "brutto")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 1550.8556);

    // changed node: root
    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      1303.24,
    );
    expect(parseFloat(getFieldValue(doc, "root", "brutto").toFixed(4))).toBe(
      1550.8556,
    );

    expect(parseFloat(getFieldValue(doc, "p1", "total").toFixed(2))).toBe(
      1303.24,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst19").toFixed(4))).toBe(
      247.6156,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1-1", "unitCost").toFixed(2))).toBe(
      1303.24,
    );
    expect(parseFloat(getFieldValue(doc, "p1-1", "total").toFixed(2))).toBe(
      1303.24,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-1", "unitCost").toFixed(2)),
    ).toBe(421.64);
    expect(parseFloat(getFieldValue(doc, "p1-1-1", "total").toFixed(2))).toBe(
      421.64,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2", "unitCost").toFixed(2)),
    ).toBe(88.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2", "total").toFixed(2))).toBe(
      88.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2-1", "count").toFixed(2))).toBe(
      1.5,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2-1", "unitCost").toFixed(2)),
    ).toBe(20.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2-1", "total").toFixed(2))).toBe(
      30.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-2-2", "count").toFixed(2))).toBe(
      30.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-2-2", "unitCost").toFixed(2)),
    ).toBe(116.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-2-2", "total").toFixed(2))).toBe(
      58.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-3", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-3", "unitCost").toFixed(2)),
    ).toBe(669.6);
    expect(parseFloat(getFieldValue(doc, "p1-1-3", "total").toFixed(2))).toBe(
      669.6,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-4", "count").toFixed(2))).toBe(
      60.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-4", "unitCost").toFixed(2)),
    ).toBe(124.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-4", "total").toFixed(2))).toBe(
      124.0,
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
    const node = doc.findNodeById("p1-1-1");
    const field = node.type.fields.find((f) => f.id === "unitCost")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 100);
    expect(doc.currentState).toBe(backwardState);
  });
  it("Test transition Backward-Forward", () => {
    const doc = buildDoc(startingJSONDoc);
    doc.currentState.executeNetworks(
      doc,
      doc.root,
      doc.root.type.fields[0],
      doc.root.type.fields[0].value,
    );
    let node = doc.findNodeById("p1-1-1");
    let field = node.type.fields.find((f) => f.id === "unitCost")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 100);
    expect(doc.currentState).toBe(backwardState);
    node = doc.findNodeById("p1-1-1");
    field = node.type.fields.find((f) => f.id === "count")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 20);
    expect(doc.currentState).toBe(forwardState);
  });
});
