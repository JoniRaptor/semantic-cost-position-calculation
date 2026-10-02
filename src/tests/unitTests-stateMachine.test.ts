import { describe, expect, it } from "vitest";
import {
  AggregateChildrenFieldStep,
  AggregateChildrenFieldToParentStep,
  AttachFieldStep,
  AttachParentFieldStep,
  DistributeProportionalOnChildrenStep,
  Doc,
  DocNode,
  FieldDefinition,
  NetworkStep,
  NodeType,
  ReapeatNetworkForChildrenStep,
  Rule,
  SetNewFieldValueStep,
  StepDependencyNetwork,
  StepDependencyNetworkState,
  ZeroSubTreeStep,
} from "../semantic/stateMachine";

describe("Test predefined NodeStepTypes", () => {
  function makeNode(id: string, type: NodeType) {
    return new DocNode(id, "", type);
  }

  // placeholder because doc is not used in predefined NodeStepTypes
  const fakeDoc = {} as Doc;

  // defining TestNodeTypes
  class TotalCostNode extends NodeType {
    protected static override readonly defaultFields: FieldDefinition[] = [
      new FieldDefinition("total", 0),
      new FieldDefinition("childrenTotal", 0),
      new FieldDefinition("parentTotal", 0),
    ];

    protected static override readonly defaultRules: Rule[] = [];

    static get allowedChildTypes(): (typeof NodeType)[] {
      return [TotalCostNode, ExcludeNode];
    }
  }

  class ExcludeNode extends TotalCostNode {}

  const totalNodeType = new TotalCostNode(
    "total",
    "TotalCostNode",
    [],
    [{ id: "total", label: "total" }],
    [],
  );

  const excludeNodeType = new ExcludeNode(
    "exclude",
    "ExcludeNode",
    [],
    [{ id: "total", label: "total" }],
    [],
  );

  it("Test AggregateChildrenFieldStep", () => {
    const totalField = totalNodeType.fields.find((f) => f.id === "total")!;
    const totalChildrenField = totalNodeType.fields.find(
      (f) => f.id === "childrenTotal",
    )!;

    const sumStep = new AggregateChildrenFieldStep(
      totalField,
      totalChildrenField,
      "sum",
      [TotalCostNode],
      [TotalCostNode],
    );
    const minStep = new AggregateChildrenFieldStep(
      totalField,
      totalChildrenField,
      "min",
      [TotalCostNode],
      [TotalCostNode],
    );
    const maxStep = new AggregateChildrenFieldStep(
      totalField,
      totalChildrenField,
      "max",
      [TotalCostNode],
      [TotalCostNode],
    );
    const countStep = new AggregateChildrenFieldStep(
      totalField,
      totalChildrenField,
      "count",
      [TotalCostNode],
      [TotalCostNode],
    );

    // create testTree
    const root = makeNode("root", totalNodeType);
    [2, 3, 4].forEach((value, i) => {
      const child = makeNode(`child${i}`, totalNodeType);
      child.type.fields.find((f) => f.id === "total")!.value = value;
      root.addchild(child);
    });
    // add exclude nodes
    [2, 3, 4].forEach((value, i) => {
      const child = makeNode(`exChild${i}`, excludeNodeType);
      child.type.fields.find((f) => f.id === "total")!.value = value;
      root.addchild(child);
    });

    // run and testSteps
    sumStep.execute(fakeDoc, root, totalField, 0);
    expect(root.type.fields.find((f) => f.id === "childrenTotal")!.value).toBe(
      9,
    );
    minStep.execute(fakeDoc, root, totalField, 0);
    expect(root.type.fields.find((f) => f.id === "childrenTotal")!.value).toBe(
      2,
    );
    maxStep.execute(fakeDoc, root, totalField, 0);
    expect(root.type.fields.find((f) => f.id === "childrenTotal")!.value).toBe(
      4,
    );
    countStep.execute(fakeDoc, root, totalField, 0);
    expect(root.type.fields.find((f) => f.id === "childrenTotal")!.value).toBe(
      3,
    );
  });
  it("Test AggregateChildrenFieldToParentStep", () => {
    const totalField = totalNodeType.fields.find((f) => f.id === "total")!;
    const totalChildrenField = totalNodeType.fields.find(
      (f) => f.id === "childrenTotal",
    )!;

    const sumStep = new AggregateChildrenFieldToParentStep(
      totalField,
      totalChildrenField,
      "sum",
      [TotalCostNode],
      [TotalCostNode],
    );
    const minStep = new AggregateChildrenFieldToParentStep(
      totalField,
      totalChildrenField,
      "min",
      [TotalCostNode],
      [TotalCostNode],
    );
    const maxStep = new AggregateChildrenFieldToParentStep(
      totalField,
      totalChildrenField,
      "max",
      [TotalCostNode],
      [TotalCostNode],
    );
    const countStep = new AggregateChildrenFieldToParentStep(
      totalField,
      totalChildrenField,
      "count",
      [TotalCostNode],
      [TotalCostNode],
    );

    // create testTree
    const root = makeNode("root", totalNodeType);
    const parent = makeNode("parent", totalNodeType);
    const exParent = makeNode("exParent", excludeNodeType);
    root.addchild(parent);
    root.addchild(exParent);

    // add children to parent
    [2, 3, 4].forEach((value, i) => {
      const child = makeNode(`child${i}`, totalNodeType);
      child.type.fields.find((f) => f.id === "total")!.value = value;
      parent.addchild(child);
    });
    // add exclude nodes
    [2, 3, 4].forEach((value, i) => {
      const child = makeNode(`exChild${i}`, excludeNodeType);
      child.type.fields.find((f) => f.id === "total")!.value = value;
      parent.addchild(child);
    });

    // add children to exParent
    [2, 3, 4].forEach((value, i) => {
      const child = makeNode(`child${i}`, totalNodeType);
      child.type.fields.find((f) => f.id === "total")!.value = value;
      exParent.addchild(child);
    });
    // add exclude nodes
    [2, 3, 4].forEach((value, i) => {
      const child = makeNode(`exChild${i}`, excludeNodeType);
      child.type.fields.find((f) => f.id === "total")!.value = value;
      exParent.addchild(child);
    });

    // run and testSteps
    sumStep.execute(fakeDoc, parent.children[0], totalField, 0);
    expect(
      parent.type.fields.find((f) => f.id === "childrenTotal")!.value,
    ).toBe(9);
    minStep.execute(fakeDoc, parent.children[0], totalField, 0);
    expect(
      parent.type.fields.find((f) => f.id === "childrenTotal")!.value,
    ).toBe(2);
    maxStep.execute(fakeDoc, parent.children[0], totalField, 0);
    expect(
      parent.type.fields.find((f) => f.id === "childrenTotal")!.value,
    ).toBe(4);
    countStep.execute(fakeDoc, parent.children[0], totalField, 0);
    expect(
      parent.type.fields.find((f) => f.id === "childrenTotal")!.value,
    ).toBe(3);

    sumStep.execute(fakeDoc, exParent.children[0], totalField, 0);
    expect(
      exParent.type.fields.find((f) => f.id === "childrenTotal")!.value,
    ).toBe(0);
    minStep.execute(fakeDoc, exParent.children[0], totalField, 0);
    expect(
      exParent.type.fields.find((f) => f.id === "childrenTotal")!.value,
    ).toBe(0);
    maxStep.execute(fakeDoc, exParent.children[0], totalField, 0);
    expect(
      exParent.type.fields.find((f) => f.id === "childrenTotal")!.value,
    ).toBe(0);
    countStep.execute(fakeDoc, exParent.children[0], totalField, 0);
    expect(
      exParent.type.fields.find((f) => f.id === "childrenTotal")!.value,
    ).toBe(0);
  });
  it("Test AttachFieldStep", () => {
    const totalField = totalNodeType.fields.find((f) => f.id === "total")!;
    const totalChildrenField = totalNodeType.fields.find(
      (f) => f.id === "childrenTotal",
    )!;

    const step = new AttachFieldStep(totalChildrenField, totalField, [
      TotalCostNode,
    ]);

    // create testTree
    const root = makeNode("root", totalNodeType);
    root.type.fields.find((f) => f.id === "total")!.value = 0;
    root.type.fields.find((f) => f.id === "childrenTotal")!.value = 5;

    // run and testSteps
    step.execute(fakeDoc, root, totalChildrenField, 0);
    expect(root.type.fields.find((f) => f.id === "total")!.value).toBe(5);
  });
  it("Test AttachParentFieldStep", () => {
    const totalField = totalNodeType.fields.find((f) => f.id === "total")!;
    const parentTotalField = totalNodeType.fields.find(
      (f) => f.id === "parentTotal",
    )!;

    const step = new AttachParentFieldStep(
      totalField,
      parentTotalField,
      [TotalCostNode],
      [TotalCostNode],
    );

    // create testTree
    const root = makeNode("root", totalNodeType);
    root.type.fields.find((f) => f.id === "total")!.value = 5;
    const child = makeNode("child", totalNodeType);
    root.addchild(child);

    // run and testSteps
    step.execute(fakeDoc, child, totalField, 0);
    expect(child.type.fields.find((f) => f.id === "parentTotal")!.value).toBe(
      5,
    );
  });
  it("Test simple StepdependencyNetwork and ReapeatNetworkForChildrenStep", () => {
    const totalField = totalNodeType.fields.find((f) => f.id === "total")!;
    const visited: string[] = [];

    const recordVisit = new NetworkStep(
      (doc: Doc, node: DocNode, field: FieldDefinition, value: number) => {
        visited.push(node.id);
      },
    );

    const step = new ReapeatNetworkForChildrenStep(totalField);

    const steps = new Map<(typeof NodeType)[], NetworkStep[]>();
    steps.set([TotalCostNode], [recordVisit, step]);
    const network = new StepDependencyNetwork(
      steps,
      new StepDependencyNetworkState(""),
    );

    // create testTree
    const root = makeNode("root", totalNodeType);
    const child0 = makeNode("child0", totalNodeType);
    const child1 = makeNode("child1", totalNodeType);
    root.addchild(child0);
    root.addchild(child1);

    // run and testSteps
    network.run(fakeDoc, root, totalField, 10);
    expect(visited).toEqual(["root", "child0", "child1"]);
  });
  it("Test DistributeProportionalOnChildrenStep", () => {
    const totalField = totalNodeType.fields.find((f) => f.id === "total")!;

    const setvalueStep = new SetNewFieldValueStep();

    const step = new DistributeProportionalOnChildrenStep(
      totalField,
      totalField,
      [TotalCostNode],
      [TotalCostNode],
    );

    const steps = new Map<(typeof NodeType)[], NetworkStep[]>();
    steps.set([TotalCostNode], [setvalueStep, step]);
    const network = new StepDependencyNetwork(
      steps,
      new StepDependencyNetworkState(""),
    );

    // create testTree
    const root = makeNode("root", totalNodeType);
    root.type.fields.find((f) => f.id === "total")!.value = 5;
    const child0 = makeNode("child0", totalNodeType);
    child0.type.fields.find((f) => f.id === "total")!.value = 2;
    const child1 = makeNode("child1", totalNodeType);
    child1.type.fields.find((f) => f.id === "total")!.value = 3;
    root.addchild(child0);
    root.addchild(child1);

    // run and testSteps
    network.run(fakeDoc, root, totalField, 10);
    expect(root.type.fields.find((f) => f.id === "total")!.value).toBe(10);
    expect(child0.type.fields.find((f) => f.id === "total")!.value).toBe(4);
    expect(child1.type.fields.find((f) => f.id === "total")!.value).toBe(6);
  });
  it("Test ZeroSubTreeStep", () => {
    const totalField = totalNodeType.fields.find((f) => f.id === "total")!;

    const step = new ZeroSubTreeStep(totalField, [TotalCostNode]);

    // create testTree
    const root = makeNode("root", totalNodeType);
    root.type.fields.find((f) => f.id === "total")!.value = 5;
    const child0 = makeNode("child0", totalNodeType);
    child0.type.fields.find((f) => f.id === "total")!.value = 2;
    const child1 = makeNode("child1", excludeNodeType);
    child1.type.fields.find((f) => f.id === "total")!.value = 3;
    root.addchild(child0);
    root.addchild(child1);

    // run and testSteps
    step.execute(fakeDoc, root, totalField, 10);
    expect(root.type.fields.find((f) => f.id === "total")!.value).toBe(0);
    expect(child0.type.fields.find((f) => f.id === "total")!.value).toBe(0);
    expect(child1.type.fields.find((f) => f.id === "total")!.value).toBe(3);
  });
});

describe("Test Fieldvalidation for Rule-expressions in NodeType constructor", () => {
  it("Test correct NodeType creation", () => {
    const state = new StepDependencyNetworkState("test");

    class TestNodeType extends NodeType {
      protected static override readonly defaultFields: FieldDefinition[] = [
        new FieldDefinition("total", 0),
        new FieldDefinition("childrenTotal", 0),
      ];

      protected static override readonly defaultRules: Rule[] = [
        new Rule(
          "total-forward",
          "childrenTotal > 0 ? childrenTotal : total",
          "total",
          state,
        ),
        new Rule("total-backward", "total", "total", state),
      ];
    }

    expect(() => new TestNodeType("", "", [], [], [])).not.toThrow();
  });
  it("Test error on incorrect NodeType creation", () => {
      const state = new StepDependencyNetworkState("test");

    class TestNodeType extends NodeType {
      protected static override readonly defaultFields: FieldDefinition[] = [
        new FieldDefinition("total", 0),
        new FieldDefinition("childrenTotal", 0),
      ];

      protected static override readonly defaultRules: Rule[] = [
        new Rule(
          "total-forward",
          "childrenTotal > 0 ? childrenTotal : total",
          "total",
          state,
        ),
        new Rule("wrong", "total + parentTotal", "total", state),
      ];
    }

    expect(() => new TestNodeType("", "", [], [], [])).toThrow(`NodeType "", Rule "wrong" for field "total" has unknown declarations: [parentTotal] in expression: "total + parentTotal"`);
  });
});
