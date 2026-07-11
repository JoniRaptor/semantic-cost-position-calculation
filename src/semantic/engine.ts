export type Value = number | string | boolean | null;
export type FieldKind = "number" | "string" | "boolean" | "percent";
export type Mode = "forward" | "backward";

/**
 * definition of a field of a PositionType with extra boolean flags for specific behavior
 */
export interface FieldDefinition {
  id: string;
  label: string;
  kind: FieldKind;
  computed?: boolean;
  fixed?: boolean;
  backwardChangesTotal?: boolean;
}

/**
 * - definition of a rule to calculate a field of a PositionType
 * - rule can be of mode forward or backward
 * - if backward-Parameters are set, the rule is automatically recognized as a backward rule
 * - backward-Parameters (backwardTargetField and backwardExpression) are optional
 */
export interface RuleDefinition {
  id: string;
  targetField: string;
  expression: string;
  mode?: Mode;
  backwardTargetField?: string;
  backwardExpression?: string;
}

/**
 * definition of a PositionType with its fields and rules for those fields
 */
export interface PositionTypeDefinition {
  typeId: string;
  label: string;
  fields: FieldDefinition[];
  rules: RuleDefinition[];
  isPercentDiscount?: boolean;
}

/**
 * definition of all PositionTypes and their rules
 */
export interface RuleSetDefinition {
  positionTypes: PositionTypeDefinition[];
}

/**
 * interface of a node in the cost-tree
 * - one node is a cost-position and has a typeId for the atributed PositionType
 * - one node/cost-position can have children/subpositions
 * - used for JSON to CostNode-tree conversion
 */
export interface CostNodeView {
  id: string;
  typeId: string;
  label: string;
  values: Record<string, Value>;
  children: CostNodeView[];
}

/**
 * - definition of a node in the cost-tree
 * - one node is a cost-position and has a typeId for the atributed PositionType
 * - one node/cost-position can have children/subpositions
 * - one node/cost-position can have a parent
 */
export class CostNode implements CostNodeView {
  id: string;
  typeId: string;
  label: string;
  values: Record<string, Value>;
  children: CostNode[];
  parent?: CostNode;
  constructor(
    id: string,
    typeId: string,
    label: string,
    values: Record<string, Value>,
    children?: CostNode[],
    parent?: CostNode,
  ) {
    this.id = id;
    this.typeId = typeId;
    this.label = label;
    this.values = values;
    this.children = [];
    for (const child of children || []) {
      this.addChild(child);
    }
    this.parent = parent;
  }
  addChild(child: CostNode): void {
    child.parent = this;
    this.children.push(child);
  }
}

/**
 * definition of a document with a root node/cost-position
 */
export interface CostDocument {
  root: CostNodeView;
}

/**
 * output of an engine-calculation is the updated document
 */
export interface EngineResult {
  document: CostDocument;
}

//-------------------------------------------------------------
// helper functions
//-------------------------------------------------------------

/**
 * small helper function to check if a value is a finite number
 * @param v Value to check
 * @returns true if value is a finite number else false
 */
function isNumber(v: Value): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * convert a number to a number if possible
 * @param raw string to convert
 * @returns number or original string (if raw value is not finite number)
 */
function toNumberValue(raw: string): number | string {
  if (raw.trim() === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
}

/**
 * gets a numeric value from a record
 * @param values the record
 * @param key the key-string of the desired value
 * @param fallback fallback value
 * @returns a number
 */
export function getNumeric(
  values: Record<string, Value>,
  key: string,
  fallback = 0,
): number {
  const v = values[key];
  return isNumber(v) ? v : fallback;
}

/**
 * clone a node/cost-position
 * @param node the node to clone
 * @returns cloned note/cost-position
 */
export function cloneNode(node: CostNode): CostNode {
  return new CostNode(
    node.id,
    node.typeId,
    node.label,
    node.values,
    node.children.map(cloneNode),
    node.parent,
  );
}

/**
 * convert a RuleSetDefinition to a Map of PositionTypeDefinition
 * @param def the RuleSetDefinition
 * @returns Map of TypeId -> PositionTypeDefinition
 */
export function loadRuleSet(
  def: RuleSetDefinition,
): Map<string, PositionTypeDefinition> {
  const map = new Map<string, PositionTypeDefinition>();
  for (const typeDef of def.positionTypes) map.set(typeDef.typeId, typeDef);
  return map;
}

//-------------------------------------------------------------
// engine functions for updating the cost-tree
//-------------------------------------------------------------

/**
 * evaluate an expression with the given Record of Values from the node/cost-position
 * @param expression the expression to evaluate
 * @param values the Record of Values to use for the evaluation
 * @returns result of the evaluation of the expression with the given values as number
 */
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

/**
 * attach the total-value of the "total"-fields of all children to the node/cost-position
 * @param node the parent-node to attach the total to
 * @returns the parent-node with the new children-total attached
 */
function attachChildrenTotal(node: CostNode): CostNode {
  node.values.childrenTotal = node.children.reduce(
    (sum, child) => sum + getNumeric(child.values, "total", 0),
    0,
  );
  return node;
}

/**
 * attach the total-value of the "total"-field of the parent-node to the node/cost-position
 * @param node the node to attach the parent-total to
 * @returns the node with the new parent-total attached if it has a parent otherwise node remains unchanged
 */
function attachParentTotal(node: CostNode): CostNode {
  if (node.parent) {
    node.values.parentTotal = Math.abs(
      getNumeric(node.parent.values, "total", 0),
    );
  }
  return node;
}

/**
 * apply all rules to the node/cost-position for it's given PositionType
 * @param node the node to apply the rules to
 * @param typeDef the PositionTypeDefinition of the node
 * @param mode mode for calculating forward or backward
 * @returns the node with the new values
 */
function applyRules(
  node: CostNode,
  typeDef: PositionTypeDefinition,
  mode: Mode,
): CostNode {
  for (const rule of typeDef.rules) {
    const ruleMode = rule.mode ?? "forward";
    if (ruleMode !== mode) continue;

    if (mode === "forward") {
      node.values[rule.targetField] = evaluateExpression(
        rule.expression,
        node.values,
      );
      continue;
    }

    if (rule.backwardExpression && rule.backwardTargetField) {
      node.values[rule.backwardTargetField] = evaluateExpression(
        rule.backwardExpression,
        node.values,
      );
    }
  }

  return node;
}

/**
 * sum of a given field over a set of given CostNodes (children)
 * @param children the children-nodes to sum
 * @param field the field to sum
 * @returns sum of all children for the given field
 */
function sumChildField(children: CostNode[], field: string): number {
  return children.reduce(
    (sum, child) => sum + getNumeric(child.values, field, 0),
    0,
  );
}

/**
 * remove the total from a discount-node and it's discount-node-children and every non-discount-node
 * @param node the node from which to start the removal
 * @param ruleSet the Map of PositionTypeDefinition from the ruleSet
 * @returns the node-tree with the discount-totals removed
 */
function removeTotalFromDiscountNode(
  node: CostNode,
  ruleSet: Map<string, PositionTypeDefinition>,
): CostNode {
  const typeDef = ruleSet.get(node.typeId);
  if (typeDef?.isPercentDiscount) {
    node.values.total = 0;
    // remove the total from the children too
    node.children = node.children.map((child) =>
      removeTotalFromDiscountNode(child, ruleSet),
    );
    return node;
  }
  return new CostNode("", "", "", {});
}

/**
 * remove the parent-nodes from the cost-tree for conversion to JSON
 * @param root the root-node of the cost-tree
 * @returns the cost-tree without registered parent-nodes
 */
function removeParentsForJSON(root: CostNode): CostNode {
  if (root.parent) {
    root.parent = undefined;
  }

  root.children = root.children.map(removeParentsForJSON);
  return root;
}

/**
 * attach the parent-nodes to the cost-tree
 * @param node the current node in the cost-tree
 * @param parent the parent-node to attach to the current node
 * @returns the cost-tree with registered parent-nodes
 */
function attachParents(node: CostNode, parent?: CostNode): CostNode {
  if (parent) node.parent = parent;
  node.children = node.children.map((child) => attachParents(child, node));
  return node;
}

/**
 * compute document forward from the root
 * @param root the root-node of the cost-tree
 * @param ruleSet the Map of PositionTypeDefinition from the ruleSet
 * @returns new cost-tree after forward computation
 */
export function computeForward(
  root: CostNode,
  ruleSet: Map<string, PositionTypeDefinition>,
): CostNode {
  const walk = (node: CostNode): CostNode => {
    const typeDef = ruleSet.get(node.typeId);
    if (!typeDef) throw new Error(`Unknown typeId: ${node.typeId}`);

    // remove total and children from percentage-discount node -> shouldn't have children and total is only calculated at the end of computation
    // on first walk do nothing with percentage-discount
    if (typeDef.isPercentDiscount) {
      node = removeTotalFromDiscountNode(node, ruleSet);
      return node;
    }
    // always apply rules to children first because parent-nodes depend on children
    node.children = node.children.map(walk);
    node = attachChildrenTotal(node);
    node = applyRules(node, typeDef, "forward");

    // every node must have a total-field
    const totalField = typeDef.fields.find((f) => f.id === "total");
    if (totalField && node.children.length > 0 && node.values.total == null) {
      node.values.total = sumChildField(node.children, "total");
    }

    return node;
  };

  const walkWithDiscount = (node: CostNode): CostNode => {
    const typeDef = ruleSet.get(node.typeId);
    if (!typeDef) throw new Error(`Unknown typeId: ${node.typeId}`);

    if (typeDef.isPercentDiscount && node.parent && node.parent.typeId) {
      const parentTypeDef = ruleSet.get(node.parent!.typeId);
      if (!parentTypeDef)
        throw new Error(`Unknown typeId: ${node.parent!.typeId}`);
      // recalculate parent total to include previous discount
      node.parent = attachChildrenTotal(node.parent!);
      node.parent = applyRules(node.parent, parentTypeDef, "forward");

      // recalculate discount-node without children to get correct value
      node = attachParentTotal(node);
      node = attachChildrenTotal(node);
      node = applyRules(node, typeDef, "forward");
    }

    // apply rules to discount-children and recalculate node
    node.children = node.children.map(walkWithDiscount);
    node = attachChildrenTotal(node);
    node = applyRules(node, typeDef, "forward");

    return node;
  };

  root = attachParents(root); // attach parents after replacing part  of the tree
  root = walk(root);
  root = walkWithDiscount(root);
  root = removeParentsForJSON(root);

  return root;
}

/**
 * compute document backward from root
 * @param node the root of the cost-tree which to compute backward
 * @param ruleSet the Map of PositionTypeDefinition from the ruleSet
 * @param targetField the changed field that triggered the backward-computation
 * @param targetValue the value of the changed field
 * @returns new cost-tree after backward computation
 */
function resolveBackwardNode(
  node: CostNode,
  ruleSet: Map<string, PositionTypeDefinition>,
  targetField: string,
  targetValue?: number,
): CostNode {
  const typeDef = ruleSet.get(node.typeId);
  if (!typeDef) throw new Error(`Unknown typeId: ${node.typeId}`);

  const parentTypeDef = ruleSet.get(node.parent!.typeId);
  if (typeDef.isPercentDiscount && node.parent && node.parent.typeId) {
    if (!parentTypeDef)
      throw new Error(`Unknown typeId: ${node.parent!.typeId}`);
    for (let i = node.parent.children.length - 1; i >= 0; i--) {
      // if parent is percentage-discount remove total of child from parent
      if (parentTypeDef.isPercentDiscount) {
        node.parent.values.total =
          getNumeric(node.parent.values, "total", 0) -
          getNumeric(node.parent.children[i].values, "total", 0);
      }
      node.parent.children[i] = removeTotalFromDiscountNode(
        node.parent.children[i],
        ruleSet,
      );
      // remove total from same layer discount-nodes from bottom to top until current node
      if (node.parent.children[i].id === node.id) {
        break;
      }
    }

    // don't recalculate parent total if parent is percentage-discount -> would be wrong because parent of parent hasn't been adjusted yet
    // parent of parent will only be correctly adjusted in forward-calculation
    if (!parentTypeDef.isPercentDiscount) {
      if (node.parent.parent) {
        node.parent = attachParentTotal(node.parent);
      }
      node.parent = attachChildrenTotal(node.parent);
      node.parent = applyRules(node.parent, parentTypeDef, "forward");
    }
  }

  if (typeof targetValue === "number" && Number.isFinite(targetValue)) {
    node.values[targetField] = targetValue;
  }

  const fieldDef = typeDef.fields.find((f) => f.id === targetField);
  const canDistribute =
    node.children.length > 0 &&
    node.values[targetField] != null &&
    !fieldDef?.fixed;

  if (canDistribute) {
    // if value of field directly changes total of node on backward calculation (e.g. Unit price), apply rules before distributing total on children
    // is necessary to correctly change total for current node and then distribute correct total on children
    if (fieldDef?.backwardChangesTotal && fieldDef.id !== "total") {
      node = applyRules(node, typeDef, "backward");
    }
    const desiredTotal = getNumeric(node.values, "total", 0);
    const totalChildrenCurrent = sumChildField(node.children, "total");

    if (totalChildrenCurrent > 0) {
      // apply rules to children backward and evenly distribute new total of parent-node
      node.children = node.children.map((child) => {
        const childDef = ruleSet.get(child.typeId);
        if (!childDef) throw new Error(`Unknown typeId: ${child.typeId}`);
        // don't distribute total on percentage-discount-nodes
        // remove total from discount-nodes for proper backward-computation
        // reason: dicsount-nodes containing discount-nodes can't be easily computed backward
        if (childDef.isPercentDiscount) {
          child.values.total = 0;
          return child;
        }
        const currentChildTarget = getNumeric(child.values, "total", 0);

        // TODO: account for fixed cost-nodes when calculating share

        const share = currentChildTarget / totalChildrenCurrent;
        const nextTarget = desiredTotal * share;
        return resolveBackwardNode(child, ruleSet, "total", nextTarget);
      });
    }
  }

  // after distributing total on children, apply backward-rules to current node
  if (node.parent) node = attachParentTotal(node);
  node = attachChildrenTotal(node);
  node = applyRules(node, typeDef, "backward");

  return node;
}

/**
 * compute document backward from the root
 * @param root the root-node of the cost-tree
 * @param ruleSet the Map of PositionTypeDefinition from the ruleSet
 * @param targetField the changed field that triggered the backward-computation
 * @param targetValue the value of the changed field
 * @returns new cost-tree after backward computation
 */
export function computeBackward(
  root: CostNode,
  ruleSet: Map<string, PositionTypeDefinition>,
  targetField: string,
  targetValue: number,
): CostNode {
  return resolveBackwardNode(root, ruleSet, targetField, targetValue);
}

/**
 * CostEngine:
 * Object to compute forward and backward a given dosument cost-tree.
 * Has a set of rules to compute forward and backward.
 */
export class CostEngine {
  private readonly rules: Map<string, PositionTypeDefinition>;

  constructor(def: RuleSetDefinition) {
    this.rules = loadRuleSet(def);
  }

  /**
   * compute document forward from the root
   * @param document the document to compute forward
   * @returns new cost-tree after forward computation
   */
  forward(document: CostDocument): EngineResult {
    return {
      document: { root: computeForward(document.root as CostNode, this.rules) },
    };
  }

  /**
   * compute document backward from the root
   * @param document the document to compute backward
   * @param targetField the changed field that triggered the backward-computation
   * @param targetValue the value of the changed field
   * @returns new cost-tree after backward computation
   */
  backward(
    document: CostDocument,
    targetField: string,
    targetValue: number,
  ): EngineResult {
    return {
      document: {
        root: computeBackward(
          document.root as CostNode,
          this.rules,
          targetField,
          targetValue,
        ),
      },
    };
  }

  /**
   * check if engine has a rule that allows a field can be changed backward
   * @param typeId the id of the PositionType
   * @param fieldId the id of the field
   * @returns true if there is a rule that allows the field can be changed backward
   */
  private canBackwardAdjust(typeId: string, fieldId: string): boolean {
    const typeDef = this.rules.get(typeId);
    if (!typeDef) return false;
    return typeDef.rules.some(
      (rule) =>
        rule.mode !== "forward" &&
        rule.targetField === fieldId &&
        Boolean(rule.backwardTargetField || rule.backwardExpression),
    );
  }

  /**
   * check if a field can be changed backward
   * @param node the node to check
   * @param field the field to check
   * @returns true if the field can be changed backward
   */
  private fieldIsBackwardEditable(
    node: CostNode,
    field: FieldDefinition,
  ): boolean {
    if (field.kind !== "number") return false;
    if (field.id === "total") return true;
    return this.canBackwardAdjust(node.typeId, field.id);
  }

  /**
   * get a PositionTypeDefinition by id-string
   * @param typeId the id-string of the PositionType
   * @returns the PositionTypeDefinition or undefined if not found
   */
  public getType(typeId: string): PositionTypeDefinition | undefined {
    return this.rules.get(typeId);
  }

  /**
   * update the cost-tree upon a field change
   * @param tree the cost-tree to update
   * @param nodeId the id of the node to update
   * @param field the field that was changed
   * @param rawValue the new value of the field
   * @returns the updated cost-tree
   */
  public updateTreeForFieldChange(
    tree: CostDocument,
    nodeId: string,
    field: FieldDefinition,
    rawValue: string,
  ): CostDocument {
    // register parent-nodes for backward-computation
    let root = tree.root as CostNode;
    root = attachParents(root);
    const currentNode = findNodeById(root, nodeId);
    if (!currentNode) return tree;

    const parsed = toNumberValue(rawValue);

    // first compute backward if possible
    if (
      this.fieldIsBackwardEditable(currentNode, field) &&
      typeof parsed === "number"
    ) {
      const subtree = this.backward({ root: currentNode }, field.id, parsed)
        .document.root;
      const replaced = replaceNodeById(
        tree.root as CostNode,
        nodeId,
        subtree as CostNode,
      );
      return this.forward({ root: replaced }).document;
    }

    // compute forward
    const updatedNode = currentNode;
    updatedNode.values[field.id] = parsed;

    const replaced = replaceNodeById(
      tree.root as CostNode,
      nodeId,
      updatedNode,
    );
    return this.forward({ root: replaced }).document;
  }
}

/**
 * find a node in the cost-tree by id
 * @param node the root-node of the cost-tree
 * @param id the id of the node to find
 * @returns the first matching node or undefined if not found
 */
export function findNodeById(node: CostNode, id: string): CostNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return undefined;
}

/**
 * replace a node in the cost-tree by id
 * @param node the root-node of the cost-tree
 * @param id the id of the node to replace
 * @param replacement the replacement-node
 * @returns the new cost-tree
 */
export function replaceNodeById(
  node: CostNode,
  id: string,
  replacement: CostNode,
): CostNode {
  if (node.id === id) {
    return cloneNode(replacement);
  }

  node.children = node.children.map((child) =>
    replaceNodeById(child, id, replacement),
  );
  return node;
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
        },
      ],
      rules: [
        {
          id: "invoice-total",
          targetField: "total",
          expression: "childrenTotal",
        },
        {
          id: "invoice-total",
          mode: "backward",
          targetField: "total",
          expression: "childrenTotal",
          backwardTargetField: "total",
          backwardExpression: "childrenTotal",
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
          backwardChangesTotal: true,
        },
        {
          id: "total",
          label: "Gesamtpreis",
          kind: "number",
          computed: true,
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
        {
          id: "percentage",
          label: "Prozent",
          kind: "percent",
          backwardChangesTotal: true,
        },
        { id: "total", label: "Gesamtrabatt", kind: "number", computed: true },
      ],
      rules: [
        {
          id: "discount-total",
          targetField: "total",
          expression: "- parentTotal * percentage / 100 + childrenTotal",
        },
        {
          id: "discount-backward-total",
          mode: "backward",
          targetField: "total",
          expression: "- parentTotal * percentage / 100",
          backwardTargetField: "percentage",
          backwardExpression:
            "parentTotal > 0 ? - total / parentTotal * 100 + childrenTotal : 0",
        },
      ],
      isPercentDiscount: true,
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
        typeId: "painting_room",
        label: "Wohnzimmer",
        values: { length: 5, width: 4, pricePerSqm: 12 },
        children: [
          {
            id: "p2-m1",
            typeId: "material",
            label: "Farbe",
            values: { liters: 6, pricePerLiter: 18 },
            children: [],
          },
          {
            id: "p2-l1",
            typeId: "labor",
            label: "Arbeit",
            values: { hours: 8, rate: 35 },
            children: [],
          },
          {
            id: "p2-d1",
            typeId: "discount",
            label: "Rabatt",
            values: { percentage: 15 },
            children: [
              {
                id: "p2-d1-d1",
                typeId: "discount",
                label: "Rabatt-rabbatt",
                values: { percentage: 15 },
                children: [],
              },
            ],
          },
          {
            id: "p2-d2",
            typeId: "discount",
            label: "Rabatt",
            values: { percentage: 15 },
            children: [],
          },
        ],
      },
      {
        id: "p3",
        typeId: "discount",
        label: "Rabatt",
        values: { percentage: 15 },
        children: [
          {
            id: "p3-d1",
            typeId: "discount",
            label: "Rabatt-rabbatt",
            values: { percentage: 15 },
            children: [],
          },
        ],
      },
    ],
  },
};
