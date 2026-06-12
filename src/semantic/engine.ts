export type Value = number | string | boolean | null;
export type FieldKind = "number" | "string" | "boolean";
export type Mode = "forward" | "backward";

export interface FieldDefinition {
  id: string;
  label: string;
  kind: FieldKind;
  computed?: boolean;
  fixed?: boolean;
  childdependent?: boolean;
}

export interface RuleDefinition {
  id: string;
  targetField: string;
  expression: string;
  mode?: Mode;
  backwardTargetField?: string;
  backwardExpression?: string;
}

export interface PositionTypeDefinition {
  typeId: string;
  label: string;
  fields: FieldDefinition[];
  rules: RuleDefinition[];
}

export interface RuleSetDefinition {
  positionTypes: PositionTypeDefinition[];
}

export interface CostNode {
  id: string;
  typeId: string;
  label: string;
  values: Record<string, Value>;
  children: CostNode[];
}

export interface CostDocument {
  root: CostNode;
}

export interface EngineResult {
  document: CostDocument;
}

function isNumber(v: Value): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function toNumberValue(raw: string): number | string {
  if (raw.trim() === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
}

export function getNumeric(
  values: Record<string, Value>,
  key: string,
  fallback = 0,
): number {
  const v = values[key];
  return isNumber(v) ? v : fallback;
}

export function cloneNode(node: CostNode): CostNode {
  return {
    id: node.id,
    typeId: node.typeId,
    label: node.label,
    values: { ...node.values },
    children: node.children.map(cloneNode),
  };
}

export function loadRuleSet(
  def: RuleSetDefinition,
): Map<string, PositionTypeDefinition> {
  const map = new Map<string, PositionTypeDefinition>();
  for (const typeDef of def.positionTypes) map.set(typeDef.typeId, typeDef);
  return map;
}

export function evaluateExpression(
  expression: string,
  values: Record<string, Value>,
): number {
  const prepared = expression.replace(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g, (name) => {
    const v = values[name];
    return isNumber(v) ? String(v) : "0";
  });
  const result = Function(`"use strict"; return (${prepared});`)();
  return typeof result === "number" && Number.isFinite(result) ? result : 0;
}

function attachChildrenTotal(node: CostNode): CostNode {
  const next = cloneNode(node);
  next.values.childrenTotal = next.children.reduce(
    (sum, child) => sum + getNumeric(child.values, "total", 0),
    0,
  );
  return next;
}

function applyRules(
  node: CostNode,
  typeDef: PositionTypeDefinition,
  mode: Mode,
): CostNode {
  const next = cloneNode(node);

  for (const rule of typeDef.rules) {
    const ruleMode = rule.mode ?? "forward";
    if (ruleMode !== mode) continue;

    if (mode === "forward") {
      next.values[rule.targetField] = evaluateExpression(
        rule.expression,
        next.values,
      );
      continue;
    }

    if (rule.backwardExpression && rule.backwardTargetField) {
      next.values[rule.backwardTargetField] = evaluateExpression(
        rule.backwardExpression,
        next.values,
      );
    }
  }

  return next;
}

function sumChildField(children: CostNode[], field: string): number {
  return children.reduce(
    (sum, child) => sum + getNumeric(child.values, field, 0),
    0,
  );
}

export function computeForward(
  root: CostNode,
  ruleSet: Map<string, PositionTypeDefinition>,
): CostNode {
  const walk = (node: CostNode): CostNode => {
    const typeDef = ruleSet.get(node.typeId);
    if (!typeDef) throw new Error(`Unknown typeId: ${node.typeId}`);

    let current = cloneNode(node);
    current.children = current.children.map(walk);
    current = attachChildrenTotal(current);
    current = applyRules(current, typeDef, "forward");

    const totalField = typeDef.fields.find((f) => f.id === "total");
    if (
      totalField &&
      current.children.length > 0 &&
      current.values.total == null
    ) {
      current.values.total = sumChildField(current.children, "total");
    }

    return current;
  };

  return walk(root);
}

function resolveBackwardNode(
  node: CostNode,
  ruleSet: Map<string, PositionTypeDefinition>,
  targetField: string,
  targetValue?: number,
): CostNode {
  const typeDef = ruleSet.get(node.typeId);
  if (!typeDef) throw new Error(`Unknown typeId: ${node.typeId}`);

  let current = cloneNode(node);
  if (typeof targetValue === "number" && Number.isFinite(targetValue)) {
    current.values[targetField] = targetValue;
  }

  const fieldDef = typeDef.fields.find((f) => f.id === targetField);
  const canDistribute =
    current.children.length > 0 &&
    current.values[targetField] != null &&
    !fieldDef?.fixed;

  if (canDistribute) {
    if (fieldDef?.childdependent && fieldDef.id !== "total") {
      current = applyRules(current, typeDef, "backward");
    }
    const desiredTotal = getNumeric(current.values, "total", 0);
    const totalChildrenCurrent = sumChildField(current.children, "total");

    if (totalChildrenCurrent > 0) {
      current.children = current.children.map((child) => {
        const childDef = ruleSet.get(child.typeId);
        const childField = childDef?.fields.find((f) => f.id === "total");
        const currentChildTarget = getNumeric(child.values, "total", 0);

        // Fixed fields should not be distributed
        // TODO: account for fixed fields when calculating share
        if (childField?.fixed) {
          return resolveBackwardNode(
            child,
            ruleSet,
            "total",
            currentChildTarget,
          );
        }

        const share = currentChildTarget / totalChildrenCurrent;
        const nextTarget = desiredTotal * share;
        return resolveBackwardNode(child, ruleSet, "total", nextTarget);
      });
    }
  } else if (current.children.length > 0) {
    current.children = current.children.map((child) =>
      resolveBackwardNode(child, ruleSet, targetField),
    );
  }

  current = attachChildrenTotal(current);
  current = applyRules(current, typeDef, "backward");

  return current;
}

export function computeBackward(
  root: CostNode,
  ruleSet: Map<string, PositionTypeDefinition>,
  targetField: string,
  targetValue: number,
): CostNode {
  return resolveBackwardNode(root, ruleSet, targetField, targetValue);
}

export class CostEngine {
  private readonly rules: Map<string, PositionTypeDefinition>;

  constructor(def: RuleSetDefinition) {
    this.rules = loadRuleSet(def);
  }

  forward(document: CostDocument): EngineResult {
    return { document: { root: computeForward(document.root, this.rules) } };
  }

  backward(
    document: CostDocument,
    targetField: string,
    targetValue: number,
  ): EngineResult {
    return {
      document: {
        root: computeBackward(
          document.root,
          this.rules,
          targetField,
          targetValue,
        ),
      },
    };
  }

  canBackwardAdjust(typeId: string, fieldId: string): boolean {
    const typeDef = this.rules.get(typeId);
    if (!typeDef) return false;
    return typeDef.rules.some(
      (rule) =>
        rule.mode !== "forward" &&
        rule.targetField === fieldId &&
        Boolean(rule.backwardTargetField || rule.backwardExpression),
    );
  }

  fieldIsBackwardEditable(node: CostNode, field: FieldDefinition): boolean {
    if (field.kind !== "number") return false;
    if (field.id === "total") return true;
    return this.canBackwardAdjust(node.typeId, field.id);
  }

  getType(typeId: string): PositionTypeDefinition | undefined {
    return this.rules.get(typeId);
  }

  updateTreeForFieldChange(
    tree: CostDocument,
    nodeId: string,
    field: FieldDefinition,
    rawValue: string,
  ): CostDocument {
    const currentNode = findNodeById(tree.root, nodeId);
    if (!currentNode) return tree;

    const parsed = toNumberValue(rawValue);

    if (
      this.fieldIsBackwardEditable(currentNode, field) &&
      typeof parsed === "number"
    ) {
      const subtree = this.backward({ root: currentNode }, field.id, parsed)
        .document.root;
      const replaced = replaceNodeById(tree.root, nodeId, subtree);
      return this.forward({ root: replaced }).document;
    }

    const updatedNode: CostNode = {
      ...currentNode,
      values: {
        ...currentNode.values,
        [field.id]: parsed,
      },
    };

    const replaced = replaceNodeById(tree.root, nodeId, updatedNode);
    return this.forward({ root: replaced }).document;
  }
}

export function findNodeById(node: CostNode, id: string): CostNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return undefined;
}

export function replaceNodeById(
  node: CostNode,
  id: string,
  replacement: CostNode,
): CostNode {
  if (node.id === id) {
    return cloneNode(replacement);
  }

  return {
    ...node,
    values: { ...node.values },
    children: node.children.map((child) =>
      replaceNodeById(child, id, replacement),
    ),
  };
}

export const exampleRuleSet: RuleSetDefinition = {
  positionTypes: [
    {
      typeId: "invoice",
      label: "Auftrag",
      fields: [
        {
          id: "total",
          label: "Endpreis",
          kind: "number",
          computed: true,
          childdependent: true,
        },
      ],
      rules: [
        {
          id: "invoice-total",
          targetField: "total",
          expression: "childrenTotal",
        },
      ],
    },
    {
      typeId: "painting_room",
      label: "Zimmer streichen",
      fields: [
        { id: "length", label: "Länge", kind: "number" },
        { id: "width", label: "Breite", kind: "number" },
        { id: "area", label: "Fläche", kind: "number", computed: true },
        {
          id: "pricePerSqm",
          label: "Preis pro m²",
          kind: "number",
          computed: true,
          childdependent: true,
        },
        {
          id: "total",
          label: "Gesamtpreis",
          kind: "number",
          computed: true,
          childdependent: true,
        },
      ],
      rules: [
        { id: "paint-area", targetField: "area", expression: "length * width" },
        {
          id: "paint-total",
          targetField: "total",
          expression: "childrenTotal",
        },
        {
          id: "price-per-sqm",
          targetField: "pricePerSqm",
          expression: "childrenTotal / area",
        },
        {
          id: "paint-backward-price-per-sqm",
          mode: "backward",
          targetField: "pricePerSqm",
          expression: "childrenTotal / area",
          backwardTargetField: "total",
          backwardExpression: "pricePerSqm * area",
        },
        {
          id: "paint-backward-price",
          mode: "backward",
          targetField: "total",
          expression: "area * pricePerSqm",
          backwardTargetField: "pricePerSqm",
          backwardExpression: "area > 0 ? total / area : 0",
        },
      ],
    },
    {
      typeId: "material",
      label: "Material",
      fields: [
        { id: "liters", label: "Liter", kind: "number", fixed: true },
        { id: "pricePerLiter", label: "Preis pro Liter", kind: "number" },
        { id: "total", label: "Gesamtpreis", kind: "number", computed: true },
      ],
      rules: [
        {
          id: "material-total",
          targetField: "total",
          expression: "liters * pricePerLiter",
        },
        {
          id: "material-backward-price",
          mode: "backward",
          targetField: "total",
          expression: "liters * pricePerLiter",
          backwardTargetField: "pricePerLiter",
          backwardExpression: "liters > 0 ? total / liters : 0",
        },
      ],
    },
    {
      typeId: "labor",
      label: "Arbeitszeit",
      fields: [
        { id: "hours", label: "Stunden", kind: "number", fixed: true },
        { id: "rate", label: "Stundensatz", kind: "number" },
        { id: "total", label: "Gesamtpreis", kind: "number", computed: true },
      ],
      rules: [
        { id: "labor-total", targetField: "total", expression: "hours * rate" },
        {
          id: "labor-backward-rate",
          mode: "backward",
          targetField: "total",
          expression: "hours * rate",
          backwardTargetField: "rate",
          backwardExpression: "hours > 0 ? total / hours : 0",
        },
      ],
    },
    {
      typeId: "discount",
      label: "Rabatt",
      fields: [
        { id: "amount", label: "Betrag", kind: "number" },
        { id: "total", label: "Gesamtpreis", kind: "number", computed: true },
      ],
      rules: [
        { id: "discount-total", targetField: "total", expression: "-amount" },
      ],
    },
  ],
};

export const exampleDocument: CostDocument = {
  root: {
    id: "root",
    typeId: "invoice",
    label: "Auftrag",
    values: {},
    children: [
      {
        id: "p1",
        typeId: "painting_room",
        label: "Wohnzimmer",
        values: { length: 5, width: 4, pricePerSqm: 12 },
        children: [
          {
            id: "p1-m1",
            typeId: "material",
            label: "Farbe",
            values: { liters: 6, pricePerLiter: 18 },
            children: [],
          },
          {
            id: "p1-l1",
            typeId: "labor",
            label: "Arbeit",
            values: { hours: 8, rate: 35 },
            children: [],
          },
        ],
      },
      {
        id: "p2",
        typeId: "discount",
        label: "Rabatt",
        values: { amount: 15 },
        children: [],
      },
    ],
  },
};
