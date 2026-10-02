import { describe, expect, it } from "vitest";
import * as Builder from "../../semantic/builder";
import {
  CostNodeView,
  Doc,
  DocNode,
  FieldDefinition,
  NodeType,
  Rule,
} from "../../semantic/stateMachine";
import testDoc from "./RechnungMwstDocument.json";

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
    new Builder.FieldDefinitionBuilder().id("Mwst19ChildrenTotal").build(),
    new Builder.FieldDefinitionBuilder().id("Mwst7ChildrenTotal").build(),
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
    return [UnitCostNodeMwst19, UnitCostNodeMwst7, TotalCostNode];
  }
}

class Nettosum extends TotalCostNode {
  protected static override readonly defaultFields: FieldDefinition[] = [
    ...super.defaultFields,
    new Builder.FieldDefinitionBuilder().id("Mwst19").build(),
    new Builder.FieldDefinitionBuilder().id("Mwst7").build(),
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
      .calculationRule(
        "Mwst19ChildrenTotal > 0 ? Mwst19ChildrenTotal * 0.19 : 0",
      )
      .targetFieldId("Mwst19")
      .forNetworkState(forwardNetworkState)
      .build(),
    new Builder.RuleBuilder()
      .id("Mwst7-forward")
      .calculationRule("Mwst7ChildrenTotal > 0 ? Mwst7ChildrenTotal * 0.07 : 0")
      .targetFieldId("Mwst7")
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
    return [UnitCostNodeMwst19, UnitCostNodeMwst7, TotalCostNode, UnitCostNode];
  }
}

class Bruttosum extends TotalCostNode {
  protected static override readonly defaultFields: FieldDefinition[] = [
    ...super.defaultFields,
    new Builder.FieldDefinitionBuilder().id("brutto").build(),
    new Builder.FieldDefinitionBuilder().id("oldTotal").build(),
    new Builder.FieldDefinitionBuilder().id("oldBrutto").build(),
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
      .calculationRule("Mwst19ChildrenTotal * 1.19 + Mwst7ChildrenTotal * 1.07")
      .targetFieldId("brutto")
      .forNetworkState(forwardNetworkState)
      .build(),
    new Builder.RuleBuilder()
      .id("total-backward-onChangeOfBrutto")
      .calculationRule("oldBrutto != 0 ? (total/oldBrutto) * brutto : total")
      .targetFieldId("total")
      .forNetworkState(backwardNetworkState)
      .triggerOnChangeOfField("brutto")
      .build(),
    new Builder.RuleBuilder()
      .id("zero-oldBrutto-backward")
      .calculationRule("0")
      .targetFieldId("oldBrutto")
      .forNetworkState(backwardNetworkState)
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

class UnitCostNode extends TotalCostNode {
  protected static override readonly defaultFields: FieldDefinition[] = [
    ...super.defaultFields,
    new Builder.FieldDefinitionBuilder().id("count").build(),
    new Builder.FieldDefinitionBuilder().id("unitCost").build(),
    new Builder.FieldDefinitionBuilder().id("oldTotal").build(),
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
      .id("Mwst19ChildrenTotal-forward")
      .calculationRule(
        "Mwst19ChildrenTotal > 0 ? Mwst19ChildrenTotal * count : 0",
      )
      .targetFieldId("Mwst19ChildrenTotal")
      .forNetworkState(forwardNetworkState)
      .build(),
    new Builder.RuleBuilder()
      .id("Mwst7ChildrenTotal-forward")
      .calculationRule(
        "Mwst7ChildrenTotal > 0 ? Mwst7ChildrenTotal * count : 0",
      )
      .targetFieldId("Mwst7ChildrenTotal")
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
        "childrenTotal > 0 && oldTotal != 0 ? unitCost * total / oldTotal : count > 0 ? total / count : 0",
      )
      .targetFieldId("unitCost")
      .forNetworkState(backwardNetworkState)
      .triggerOnChangeOfField("total")
      .build(),
  ];

  static get allowedChildTypes(): (typeof NodeType)[] {
    return [TotalCostNode, UnitCostNode, UnitCostNodeMwst19, UnitCostNodeMwst7];
  }
}

class UnitCostNodeMwst19 extends NodeType {
  protected static override readonly defaultFields: FieldDefinition[] = [
    new Builder.FieldDefinitionBuilder().id("total").build(),
    new Builder.FieldDefinitionBuilder().id("childrenTotal").build(),
    new Builder.FieldDefinitionBuilder().id("Mwst19ChildrenTotal").build(),
    new Builder.FieldDefinitionBuilder().id("count").build(),
    new Builder.FieldDefinitionBuilder().id("unitCost").build(),
    new Builder.FieldDefinitionBuilder().id("oldTotal").build(),
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
      .id("Mwst19ChildrenTotal-forward")
      .calculationRule(
        "childrenTotal > 0 ? childrenTotal * count : count * unitCost",
      )
      .targetFieldId("Mwst19ChildrenTotal")
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
        "childrenTotal > 0 && oldTotal != 0 ? unitCost * total / oldTotal : count > 0 ? total / count : 0",
      )
      .targetFieldId("unitCost")
      .forNetworkState(backwardNetworkState)
      .triggerOnChangeOfField("total")
      .build(),
  ];

  static get allowedChildTypes(): (typeof NodeType)[] {
    return [UnitCostNodeMwst19];
  }
}

class UnitCostNodeMwst7 extends NodeType {
  protected static override readonly defaultFields: FieldDefinition[] = [
    new Builder.FieldDefinitionBuilder().id("total").build(),
    new Builder.FieldDefinitionBuilder().id("childrenTotal").build(),
    new Builder.FieldDefinitionBuilder().id("Mwst7ChildrenTotal").build(),
    new Builder.FieldDefinitionBuilder().id("count").build(),
    new Builder.FieldDefinitionBuilder().id("unitCost").build(),
    new Builder.FieldDefinitionBuilder().id("oldTotal").build(),
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
      .id("Mwst7ChildrenTotal-forward")
      .calculationRule(
        "childrenTotal > 0 ? childrenTotal * count : count * unitCost",
      )
      .targetFieldId("Mwst7ChildrenTotal")
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
        "childrenTotal > 0 && oldTotal != 0 ? unitCost * total / oldTotal : count > 0 ? total / count : 0",
      )
      .targetFieldId("unitCost")
      .forNetworkState(backwardNetworkState)
      .triggerOnChangeOfField("total")
      .build(),
  ];

  static get allowedChildTypes(): (typeof NodeType)[] {
    return [UnitCostNodeMwst7];
  }
}

// Step Instances

const attachMwst19ChildrenTotal = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.AggregateChildrenField)
  .nodeTargetField("Mwst19ChildrenTotal")
  .childField("Mwst19ChildrenTotal")
  .operator("sum")
  .allowedNodeTypes([
    TotalCostNode,
    UnitCostNode,
    UnitCostNodeMwst19,
    Nettosum,
    Bruttosum,
  ])
  .allowedChildTypes([
    TotalCostNode,
    UnitCostNode,
    UnitCostNodeMwst19,
    Nettosum,
  ])
  .build();

const attachMwst7ChildrenTotal = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.AggregateChildrenField)
  .nodeTargetField("Mwst7ChildrenTotal")
  .childField("Mwst7ChildrenTotal")
  .operator("sum")
  .allowedNodeTypes([
    TotalCostNode,
    UnitCostNode,
    UnitCostNodeMwst7,
    Nettosum,
    Bruttosum,
  ])
  .allowedChildTypes([TotalCostNode, UnitCostNode, UnitCostNodeMwst7, Nettosum])
  .build();

const attachChildrenTotal = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.AggregateChildrenField)
  .nodeTargetField("childrenTotal")
  .childField("total")
  .operator("sum")
  .allowedNodeTypes([
    TotalCostNode,
    UnitCostNode,
    UnitCostNodeMwst19,
    UnitCostNodeMwst7,
    Nettosum,
    Bruttosum,
  ])
  .allowedChildTypes([
    TotalCostNode,
    UnitCostNode,
    UnitCostNodeMwst19,
    UnitCostNodeMwst7,
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
  .allowedNodeTypes([
    UnitCostNode,
    UnitCostNodeMwst19,
    UnitCostNodeMwst7,
    Bruttosum,
  ])
  .build();

const attachOldBrutto = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.AttachField)
  .targetField("oldBrutto")
  .sourceField("brutto")
  .allowedNodeTypes([Bruttosum])
  .build();

const distributeTotalOnChildrenBackwards = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.DistributeProportionalOnChildren)
  .sourceField("total")
  .childrenField("total")
  .allowedNodeTypes([TotalCostNode, Nettosum, Bruttosum])
  .allowedChildrenTypes([
    TotalCostNode,
    Nettosum,
    UnitCostNode,
    UnitCostNodeMwst19,
    UnitCostNodeMwst7,
  ])
  .build();

const distributeUnitCostOnChildrenBackwards = new Builder.StepInstanceBuilder()
  .type(Builder.StepType.DistributeProportionalOnChildren)
  .sourceField("unitCost")
  .childrenField("total")
  .allowedNodeTypes([UnitCostNode, UnitCostNodeMwst19, UnitCostNodeMwst7])
  .allowedChildrenTypes([
    TotalCostNode,
    UnitCostNode,
    UnitCostNodeMwst19,
    UnitCostNodeMwst7,
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
      UnitCostNodeMwst7,
      TotalCostNode,
      UnitCostNode,
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
      UnitCostNodeMwst7,
      TotalCostNode,
      UnitCostNode,
      Nettosum,
      Bruttosum,
    ],
    [
      repeatNetworkForChildren,
      attachChildrenTotal,
      attachMwst19ChildrenTotal,
      attachMwst7ChildrenTotal,
      evaluateRules,
      attachOldTotal,
      attachOldBrutto,
    ],
  )
  .networkState(forwardNetworkState)
  .build();

const backwardNetwork = new Builder.StepDependencyNetworkBuilder()
  .addNodeTypeSteps(
    [TotalCostNode, Nettosum, Bruttosum],
    [
      setValue,
      evaluateRules,
      distributeTotalOnChildrenBackwards,
      repeatNetworkForChildren,
      attachOldTotal,
      attachOldBrutto,
    ],
  )
  .addNodeTypeSteps(
    [UnitCostNodeMwst19, UnitCostNodeMwst7, UnitCostNode],
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
      { id: "Mwst7", label: "7% MwSt" },
    ])
    .build()
    .nodeType(TotalCostNode)
    .typeId("title")
    .label("Titel")
    .labels([{ id: "total", label: "Summe" }])
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
    .nodeType(UnitCostNode)
    .typeId("labor")
    .label("Lohn")
    .labels([
      { id: "total", label: "Gesamtpreis" },
      { id: "count", label: "Minuten" },
      { id: "unitCost", label: "Stundensatz" },
    ])
    .build()
    .nodeType(UnitCostNodeMwst19)
    .typeId("material19Mwst")
    .label("Material")
    .labels([
      { id: "total", label: "Gesamtpreis" },
      { id: "count", label: "Menge" },
      { id: "unitCost", label: "Stückpreis" },
    ])
    .build()
    .nodeType(UnitCostNodeMwst19)
    .typeId("labor19Mwst")
    .label("Lohn")
    .labels([
      { id: "total", label: "Gesamtpreis" },
      { id: "count", label: "Stunden" },
      { id: "unitCost", label: "Stundensatz" },
    ])
    .build()
    .nodeType(UnitCostNodeMwst7)
    .typeId("material7Mwst")
    .label("Material")
    .labels([
      { id: "total", label: "Gesamtpreis" },
      { id: "count", label: "Menge" },
      { id: "unitCost", label: "Stückpreis" },
    ])
    .build()
    .nodeType(UnitCostNodeMwst7)
    .typeId("labor7Mwst")
    .label("Lohn")
    .labels([
      { id: "total", label: "Gesamtpreis" },
      { id: "count", label: "Stunden" },
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
      2300.0,
    );
    expect(parseFloat(getFieldValue(doc, "root", "brutto").toFixed(2))).toBe(
      2605.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1", "total").toFixed(2))).toBe(
      2300.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst19").toFixed(2))).toBe(
      228.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst7").toFixed(2))).toBe(77.0);

    expect(parseFloat(getFieldValue(doc, "p1-1", "total").toFixed(2))).toBe(
      2000.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-m1", "count").toFixed(2))).toBe(
      10.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-m1", "unitCost").toFixed(2)),
    ).toBe(100.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-m1", "total").toFixed(2))).toBe(
      1000.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-m2", "count").toFixed(2))).toBe(
      10.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-m2", "unitCost").toFixed(2)),
    ).toBe(100.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-m2", "total").toFixed(2))).toBe(
      1000.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2", "total").toFixed(2))).toBe(
      300.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2-l1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-2-l1", "unitCost").toFixed(2)),
    ).toBe(200.0);
    expect(parseFloat(getFieldValue(doc, "p1-2-l1", "total").toFixed(2))).toBe(
      200.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2-l2", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-2-l2", "unitCost").toFixed(2)),
    ).toBe(100.0);
    expect(parseFloat(getFieldValue(doc, "p1-2-l2", "total").toFixed(2))).toBe(
      100.0,
    );
  });
  it("Test forward calculationn", () => {
    const doc = buildDoc(startingJSONDoc);
    const node = doc.findNodeById("p1-1-m1");
    const field = node.type.fields.find((f) => f.id === "count")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 20);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      3300.0,
    );
    expect(parseFloat(getFieldValue(doc, "root", "brutto").toFixed(2))).toBe(
      3795.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1", "total").toFixed(2))).toBe(
      3300.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst19").toFixed(2))).toBe(
      418.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst7").toFixed(2))).toBe(77.0);

    expect(parseFloat(getFieldValue(doc, "p1-1", "total").toFixed(2))).toBe(
      3000.0,
    );

    //changed node: p1-1-m1
    expect(parseFloat(getFieldValue(doc, "p1-1-m1", "count").toFixed(2))).toBe(
      20.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-m1", "unitCost").toFixed(2)),
    ).toBe(100.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-m1", "total").toFixed(2))).toBe(
      2000.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-m2", "count").toFixed(2))).toBe(
      10.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-m2", "unitCost").toFixed(2)),
    ).toBe(100.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-m2", "total").toFixed(2))).toBe(
      1000.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2", "total").toFixed(2))).toBe(
      300.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2-l1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-2-l1", "unitCost").toFixed(2)),
    ).toBe(200.0);
    expect(parseFloat(getFieldValue(doc, "p1-2-l1", "total").toFixed(2))).toBe(
      200.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2-l2", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-2-l2", "unitCost").toFixed(2)),
    ).toBe(100.0);
    expect(parseFloat(getFieldValue(doc, "p1-2-l2", "total").toFixed(2))).toBe(
      100.0,
    );
  });
  it("Test for no change on Mwst", () => {
    const doc = buildDoc(startingJSONDoc);
    const node = doc.findNodeById("p1");
    const field = node.type.fields.find((f) => f.id === "Mwst19")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 20);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      2300.0,
    );
    expect(parseFloat(getFieldValue(doc, "root", "brutto").toFixed(2))).toBe(
      2605.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1", "total").toFixed(2))).toBe(
      2300.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst19").toFixed(2))).toBe(
      228.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst7").toFixed(2))).toBe(77.0);

    expect(parseFloat(getFieldValue(doc, "p1-1", "total").toFixed(2))).toBe(
      2000.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-m1", "count").toFixed(2))).toBe(
      10.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-m1", "unitCost").toFixed(2)),
    ).toBe(100.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-m1", "total").toFixed(2))).toBe(
      1000.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-m2", "count").toFixed(2))).toBe(
      10.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-m2", "unitCost").toFixed(2)),
    ).toBe(100.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-m2", "total").toFixed(2))).toBe(
      1000.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2", "total").toFixed(2))).toBe(
      300.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2-l1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-2-l1", "unitCost").toFixed(2)),
    ).toBe(200.0);
    expect(parseFloat(getFieldValue(doc, "p1-2-l1", "total").toFixed(2))).toBe(
      200.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2-l2", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-2-l2", "unitCost").toFixed(2)),
    ).toBe(100.0);
    expect(parseFloat(getFieldValue(doc, "p1-2-l2", "total").toFixed(2))).toBe(
      100.0,
    );
  });
  it("Test backward calculation on child total", () => {
    const doc = buildDoc(startingJSONDoc);
    const node = doc.findNodeById("p1-1-m1");
    const field = node.type.fields.find((f) => f.id === "total")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 2000);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      3300.0,
    );
    expect(parseFloat(getFieldValue(doc, "root", "brutto").toFixed(2))).toBe(
      3795.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1", "total").toFixed(2))).toBe(
      3300.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst19").toFixed(2))).toBe(
      418.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst7").toFixed(2))).toBe(77.0);

    expect(parseFloat(getFieldValue(doc, "p1-1", "total").toFixed(2))).toBe(
      3000.0,
    );

    //changed node: p1-1-m1
    expect(parseFloat(getFieldValue(doc, "p1-1-m1", "count").toFixed(2))).toBe(
      10.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-m1", "unitCost").toFixed(2)),
    ).toBe(200.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-m1", "total").toFixed(2))).toBe(
      2000.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-m2", "count").toFixed(2))).toBe(
      10.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-m2", "unitCost").toFixed(2)),
    ).toBe(100.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-m2", "total").toFixed(2))).toBe(
      1000.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2", "total").toFixed(2))).toBe(
      300.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2-l1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-2-l1", "unitCost").toFixed(2)),
    ).toBe(200.0);
    expect(parseFloat(getFieldValue(doc, "p1-2-l1", "total").toFixed(2))).toBe(
      200.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2-l2", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-2-l2", "unitCost").toFixed(2)),
    ).toBe(100.0);
    expect(parseFloat(getFieldValue(doc, "p1-2-l2", "total").toFixed(2))).toBe(
      100.0,
    );
  });
  it("Test backward calculation on child unitCost", () => {
    const doc = buildDoc(startingJSONDoc);
    const node = doc.findNodeById("p1-1-m1");
    const field = node.type.fields.find((f) => f.id === "unitCost")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 200);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      3300.0,
    );
    expect(parseFloat(getFieldValue(doc, "root", "brutto").toFixed(2))).toBe(
      3795.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1", "total").toFixed(2))).toBe(
      3300.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst19").toFixed(2))).toBe(
      418.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst7").toFixed(2))).toBe(77.0);

    expect(parseFloat(getFieldValue(doc, "p1-1", "total").toFixed(2))).toBe(
      3000.0,
    );

    //changed node: p1-1-m1
    expect(parseFloat(getFieldValue(doc, "p1-1-m1", "count").toFixed(2))).toBe(
      10.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-m1", "unitCost").toFixed(2)),
    ).toBe(200.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-m1", "total").toFixed(2))).toBe(
      2000.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-m2", "count").toFixed(2))).toBe(
      10.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-m2", "unitCost").toFixed(2)),
    ).toBe(100.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-m2", "total").toFixed(2))).toBe(
      1000.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2", "total").toFixed(2))).toBe(
      300.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2-l1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-2-l1", "unitCost").toFixed(2)),
    ).toBe(200.0);
    expect(parseFloat(getFieldValue(doc, "p1-2-l1", "total").toFixed(2))).toBe(
      200.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2-l2", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-2-l2", "unitCost").toFixed(2)),
    ).toBe(100.0);
    expect(parseFloat(getFieldValue(doc, "p1-2-l2", "total").toFixed(2))).toBe(
      100.0,
    );
  });
  it("Test backward calculation on parent total", () => {
    const doc = buildDoc(startingJSONDoc);
    const node = doc.findNodeById("p1-1");
    const field = node.type.fields.find((f) => f.id === "total")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 1000);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      1300.0,
    );
    expect(parseFloat(getFieldValue(doc, "root", "brutto").toFixed(2))).toBe(
      1475.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1", "total").toFixed(2))).toBe(
      1300.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst19").toFixed(2))).toBe(
      133.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst7").toFixed(2))).toBe(42.0);

    //changed node: p1-1
    expect(parseFloat(getFieldValue(doc, "p1-1", "total").toFixed(2))).toBe(
      1000.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-m1", "count").toFixed(2))).toBe(
      10.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-m1", "unitCost").toFixed(2)),
    ).toBe(50.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-m1", "total").toFixed(2))).toBe(
      500.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-m2", "count").toFixed(2))).toBe(
      10.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-m2", "unitCost").toFixed(2)),
    ).toBe(50.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-m2", "total").toFixed(2))).toBe(
      500.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2", "total").toFixed(2))).toBe(
      300.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2-l1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-2-l1", "unitCost").toFixed(2)),
    ).toBe(200.0);
    expect(parseFloat(getFieldValue(doc, "p1-2-l1", "total").toFixed(2))).toBe(
      200.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2-l2", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-2-l2", "unitCost").toFixed(2)),
    ).toBe(100.0);
    expect(parseFloat(getFieldValue(doc, "p1-2-l2", "total").toFixed(2))).toBe(
      100.0,
    );
  });
  it("Test backward calculation on netto total", () => {
    const doc = buildDoc(startingJSONDoc);
    const node = doc.findNodeById("p1");
    const field = node.type.fields.find((f) => f.id === "total")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 4600);

    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      4600.0,
    );
    expect(parseFloat(getFieldValue(doc, "root", "brutto").toFixed(2))).toBe(
      5210.0,
    );

    //changed node: p1
    expect(parseFloat(getFieldValue(doc, "p1", "total").toFixed(2))).toBe(
      4600.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst19").toFixed(2))).toBe(
      456.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst7").toFixed(2))).toBe(
      154.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1", "total").toFixed(2))).toBe(
      4000.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-m1", "count").toFixed(2))).toBe(
      10.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-m1", "unitCost").toFixed(2)),
    ).toBe(200.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-m1", "total").toFixed(2))).toBe(
      2000.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-m2", "count").toFixed(2))).toBe(
      10.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-m2", "unitCost").toFixed(2)),
    ).toBe(200.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-m2", "total").toFixed(2))).toBe(
      2000.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2", "total").toFixed(2))).toBe(
      600.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2-l1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-2-l1", "unitCost").toFixed(2)),
    ).toBe(400.0);
    expect(parseFloat(getFieldValue(doc, "p1-2-l1", "total").toFixed(2))).toBe(
      400.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2-l2", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-2-l2", "unitCost").toFixed(2)),
    ).toBe(200.0);
    expect(parseFloat(getFieldValue(doc, "p1-2-l2", "total").toFixed(2))).toBe(
      200.0,
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
    doc.updateTreeForFieldChange(doc, node.id, field, 5210);

    //changed node: root
    expect(parseFloat(getFieldValue(doc, "root", "total").toFixed(2))).toBe(
      4600.0,
    );
    expect(parseFloat(getFieldValue(doc, "root", "brutto").toFixed(2))).toBe(
      5210.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1", "total").toFixed(2))).toBe(
      4600.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst19").toFixed(2))).toBe(
      456.0,
    );
    expect(parseFloat(getFieldValue(doc, "p1", "Mwst7").toFixed(2))).toBe(
      154.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1", "total").toFixed(2))).toBe(
      4000.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-m1", "count").toFixed(2))).toBe(
      10.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-m1", "unitCost").toFixed(2)),
    ).toBe(200.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-m1", "total").toFixed(2))).toBe(
      2000.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-1-m2", "count").toFixed(2))).toBe(
      10.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-1-m2", "unitCost").toFixed(2)),
    ).toBe(200.0);
    expect(parseFloat(getFieldValue(doc, "p1-1-m2", "total").toFixed(2))).toBe(
      2000.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2", "total").toFixed(2))).toBe(
      600.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2-l1", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-2-l1", "unitCost").toFixed(2)),
    ).toBe(400.0);
    expect(parseFloat(getFieldValue(doc, "p1-2-l1", "total").toFixed(2))).toBe(
      400.0,
    );

    expect(parseFloat(getFieldValue(doc, "p1-2-l2", "count").toFixed(2))).toBe(
      1.0,
    );
    expect(
      parseFloat(getFieldValue(doc, "p1-2-l2", "unitCost").toFixed(2)),
    ).toBe(200.0);
    expect(parseFloat(getFieldValue(doc, "p1-2-l2", "total").toFixed(2))).toBe(
      200.0,
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
    const node = doc.findNodeById("p1-2-l2");
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
    let node = doc.findNodeById("p1-2-l2");
    let field = node.type.fields.find((f) => f.id === "unitCost")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 100);
    expect(doc.currentState).toBe(backwardState);
    node = doc.findNodeById("p1-2-l2");
    field = node.type.fields.find((f) => f.id === "count")!;
    doc.updateTreeForFieldChange(doc, node.id, field, 20);
    expect(doc.currentState).toBe(forwardState);
  });
});
