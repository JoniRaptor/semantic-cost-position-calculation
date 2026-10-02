import { describe, it, expect } from "vitest";
import {
  DocNode,
  FieldDefinition,
  DocState,
  Transition,
  Doc,
  NodeType,
  StepDependencyNetworkState,
  StepDependencyNetwork,
  Rule,
  NetworkStep,
  ZeroSubTreeStep,
  AggregateChildrenFieldStep,
  AggregateChildrenFieldToParentStep,
  AttachFieldStep,
  AttachParentFieldStep,
  DistributeProportionalOnChildrenStep,
  EvaluateRulesStep,
  EvaluateParentRulesStep,
  SetNewFieldValueStep,
  ReapeatNetworkForChildrenStep,
  CostNodeView,
} from "../../semantic/stateMachine";

// Example implementation

// States
const forwardState = new DocState("forward");
const backwardState = new DocState("backward");
const percentageBackwardState = new DocState("percentageBackward");

// Network states
const forwardNetworkState = new StepDependencyNetworkState("forward");
const backwardNetworkState = new StepDependencyNetworkState("backward");
const percentageNetworkState = new StepDependencyNetworkState(
  "percentageBackward",
);

// Transitions
const transitionForwardBackward = new Transition(
  backwardState,
  (node: DocNode, field: FieldDefinition, value: number) =>
    node.type.rules.some(
      (rule) =>
        rule.fieldId === field.id && rule.networkState === backwardNetworkState,
    ),
);

const transitionToPercentageBackward = new Transition(
  percentageBackwardState,
  (node: DocNode, field: FieldDefinition, value: number) =>
    node.type instanceof DiscountNode,
);

const transitionBackwardForward = new Transition(
  forwardState,
  (node: DocNode, field: FieldDefinition, value: number) =>
    !(node.type instanceof DiscountNode) &&
    (node.type.rules.every((rule) => rule.fieldId !== field.id) ||
      !node.type.rules.some(
        (rule) =>
          rule.fieldId === field.id &&
          rule.networkState === backwardNetworkState,
      )),
);

const transitionBackwardPercentage = new Transition(
  percentageBackwardState,
  (node: DocNode, field: FieldDefinition, value: number) =>
    node.type instanceof DiscountNode,
);

const transitionPercentageForward = new Transition(
  forwardState,
  (node: DocNode, field: FieldDefinition, value: number) =>
    !(node.type instanceof DiscountNode) &&
    (node.type.rules.every((rule) => rule.fieldId !== field.id) ||
      !node.type.rules.some(
        (rule) =>
          rule.fieldId === field.id &&
          rule.networkState === backwardNetworkState,
      )),
);

const transitionPercentageBackward = new Transition(
  backwardState,
  (node: DocNode, field: FieldDefinition, value: number) =>
    !(node.type instanceof DiscountNode) &&
    node.type.rules.some(
      (rule) =>
        rule.fieldId === field.id && rule.networkState === backwardNetworkState,
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
      forwardNetworkState,
    ),
    new Rule("total-backward", "total", "total", backwardNetworkState),
    new Rule(
      "total-percentage-backward",
      "childrenTotal > 0 ? childrenTotal : total",
      "total",
      percentageNetworkState,
    ),
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
      forwardNetworkState,
    ),
    new Rule(
      "total-forward",
      "childrenTotal > 0 ? variableChildrenTotal * count + singleChildrenTotal : count * unitCost",
      "total",
      forwardNetworkState,
    ),
    new Rule(
      "pricePerUnit-forward",
      "count > 0 ? total / count : 0",
      "pricePerUnit",
      forwardNetworkState,
    ),
    new Rule(
      "total-backward",
      "childrenTotal > 0 ? variableChildrenTotal * count + singleChildrenTotal : count * unitCost",
      "total",
      backwardNetworkState,
      "unitCost",
    ),
    new Rule(
      "unitCost-backward",
      "childrenTotal > 0 ? unitCost * total / oldTotal : total / count",
      "unitCost",
      backwardNetworkState,
      "total",
    ),
    new Rule(
      "pricePerUnit-backward",
      "count > 0 ? total / count : 0",
      "pricePerUnit",
      backwardNetworkState,
    ),
    new Rule(
      "total-percentage-backward",
      "childrenTotal > 0 ? variableChildrenTotal * count + singleChildrenTotal : count * unitCost",
      "total",
      percentageNetworkState,
    ),
  ];
}

class SingleUnitCostNode extends UnitCostNode {}

class DiscountNode extends TotalCostNode {
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
      forwardNetworkState,
    ),
    new Rule(
      "percentage-backward",
      "- total * 100 / abs(parentTotal)",
      "percentage",
      percentageNetworkState,
      "total",
    ),
    new Rule(
      "total-backward",
      "- abs(parentTotal) * percentage / 100 + childrenTotal",
      "total",
      percentageNetworkState,
      "percentage",
    ),
  ];

  static get allowedChildTypes(): (typeof NodeType)[] {
    return [DiscountNode];
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
    new Rule("paint-area", "length * width", "count", forwardNetworkState),
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

const percentage = new DiscountNode(
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
  [DiscountNode],
);

const attachChildrenTotal = new AggregateChildrenFieldStep(
  new FieldDefinition("total", 0),
  new FieldDefinition("childrenTotal", 0),
  "sum",
  [UnitCostNode, TotalCostNode, DiscountNode, PaintingNode, SingleUnitCostNode],
  [SingleUnitCostNode, UnitCostNode, TotalCostNode, DiscountNode, PaintingNode],
);

const attachChildrenVariableTotal = new AggregateChildrenFieldStep(
  new FieldDefinition("total", 0),
  new FieldDefinition("variableChildrenTotal", 0),
  "sum",
  [UnitCostNode, TotalCostNode, DiscountNode, PaintingNode, SingleUnitCostNode],
  [UnitCostNode, TotalCostNode, DiscountNode, PaintingNode],
);

const attachChildrenSingleTotal = new AggregateChildrenFieldStep(
  new FieldDefinition("total", 0),
  new FieldDefinition("singleChildrenTotal", 0),
  "sum",
  [UnitCostNode, TotalCostNode, DiscountNode, PaintingNode, SingleUnitCostNode],
  [SingleUnitCostNode],
);

const attachChildrenTotalToParent = new AggregateChildrenFieldToParentStep(
  new FieldDefinition("total", 0),
  new FieldDefinition("childrenTotal", 0),
  "sum",
  [UnitCostNode, TotalCostNode, DiscountNode, PaintingNode, SingleUnitCostNode],
  [UnitCostNode, TotalCostNode, DiscountNode, PaintingNode, SingleUnitCostNode],
);

const attachChildrenVariableTotalToParent =
  new AggregateChildrenFieldToParentStep(
    new FieldDefinition("total", 0),
    new FieldDefinition("variableChildrenTotal", 0),
    "sum",
    [
      UnitCostNode,
      TotalCostNode,
      DiscountNode,
      PaintingNode,
      SingleUnitCostNode,
    ],
    [UnitCostNode, TotalCostNode, DiscountNode, PaintingNode],
  );

const attachChildrenSingleTotalToParent =
  new AggregateChildrenFieldToParentStep(
    new FieldDefinition("total", 0),
    new FieldDefinition("singleChildrenTotal", 0),
    "sum",
    [
      UnitCostNode,
      TotalCostNode,
      DiscountNode,
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
  [DiscountNode],
  [TotalCostNode, DiscountNode],
);

const attachParentPricePerUnit = new AttachParentFieldStep(
  new FieldDefinition("pricePerUnit", 0),
  new FieldDefinition("parentTotal", 0),
  [DiscountNode],
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
      DiscountNode,
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
      DiscountNode,
    ],
  );

const setValue = new SetNewFieldValueStep();

const repeatNetworkForChildren = new ReapeatNetworkForChildrenStep(
  new FieldDefinition("total", 0),
);

// networks

const forwardNetworSetValuekMap = new Map<(typeof NodeType)[], NetworkStep[]>();

forwardNetworSetValuekMap.set(
  [UnitCostNode, SingleUnitCostNode, PaintingNode, TotalCostNode, DiscountNode],
  [setValue],
);

const forwardNetworkSetValue = new StepDependencyNetwork(
  forwardNetworSetValuekMap,
  forwardNetworkState,
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
  [DiscountNode],
  [removeTotalFromDiscountNode],
);

const forwardNetworkWithoutPercentage = new StepDependencyNetwork(
  forwardNetworkWithoutPercentageMap,
  forwardNetworkState,
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
);

const forwardNetworkWithPercentage = new StepDependencyNetwork(
  forwardNetworkWithPercentageMap,
  forwardNetworkState,
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
  backwardNetworkState,
);

const percentageNetworkMap = new Map<(typeof NodeType)[], NetworkStep[]>();

percentageNetworkMap.set(
  [DiscountNode],
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
  percentageNetworkState,
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

function buildDoc(docState: DocState, startingJSON: CostNodeView): Doc {
  const doc = new Doc(new DocNode("", "", invoice), docState, nodeTypeMap);
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
    const doc = buildDoc(forwardState, startingJSONDoc);
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
    const doc = buildDoc(forwardState, startingJSONDoc);
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
    const doc = buildDoc(forwardState, startingJSONDoc);
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
    const doc = buildDoc(forwardState, startingJSONDoc);
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
    const doc = buildDoc(forwardState, startingJSONDoc);
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
    const doc = buildDoc(forwardState, startingJSONDoc);
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
    const doc = buildDoc(forwardState, startingJSONDoc);
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
    const doc = buildDoc(forwardState, startingJSONDoc);
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
    const doc = buildDoc(forwardState, startingJSONDoc);
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
    const doc = buildDoc(forwardState, startingJSONDoc);
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
    const doc = buildDoc(forwardState, startingJSONDoc);
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
    const doc = buildDoc(forwardState, startingJSONDoc);
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
    const doc = buildDoc(forwardState, startingJSONDoc);
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
    const doc = buildDoc(forwardState, startingJSONDoc);
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
    const doc = buildDoc(backwardState, startingJSONDoc);
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
    const doc = buildDoc(forwardState, startingJSONDoc);
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
    const doc = buildDoc(forwardState, startingJSONDoc);
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
    const doc = buildDoc(forwardState, startingJSONDoc);
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
