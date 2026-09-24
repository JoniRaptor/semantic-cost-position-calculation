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
} from "./stateMachine";

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

export const exampleDoc = new Doc(
  new DocNode("", "", invoice),
  forwardState,
  nodeTypeMap,
);
