import { useEffect, useMemo, useRef, useState } from "react";
import { EditorState, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  exampleDocument,
  exampleRuleSet,
  CostEngine,
  CostDocument,
  CostNode,
} from "./semantic/engine";
import { costSchema } from "./pm/schema";
import { CostItemView } from "./pm/costNodeView";
import { Node } from "prosemirror-model";

function buildPmDocFromCostNode(node: CostNode): Node {
  return costSchema.node("doc", null, [buildCostItemNode(node)]);
}

function buildCostItemNode(node: CostNode): Node {
  return costSchema.node(
    "cost_item",
    {
      id: node.id,
      typeId: node.typeId,
      label: node.label,
      values: node.values,
    },
    node.children.map(buildCostItemNode),
  );
}

function pmDocToSemanticTree(doc: EditorState["doc"]): CostDocument {
  const root = doc.firstChild;
  if (!root) return exampleDocument;

  const walk = (pmNode: any): CostNode => ({
    id: pmNode.attrs.id,
    typeId: pmNode.attrs.typeId,
    label: pmNode.attrs.label,
    values: { ...(pmNode.attrs.values ?? {}) },
    children: pmNode.content.content.map(walk),
  });

  return { root: walk(root) };
}

export default function App() {
  const engine = useMemo(() => new CostEngine(exampleRuleSet), []);
  const fieldDefsByType = useMemo(
    () => new Map(exampleRuleSet.positionTypes.map((t) => [t.typeId, t])),
    [],
  );
  const editorRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const applyingRef = useRef(false);
  const [summary, setSummary] = useState<CostDocument>(
    () => engine.forward(exampleDocument).document,
  );

  const renderDocument = (document: CostDocument) => {
    setSummary(document);
    const view = viewRef.current;
    if (!view) return;

    applyingRef.current = true;
    try {
      const nextState = EditorState.create({
        schema: costSchema,
        doc: buildPmDocFromCostNode(document.root),
        plugins: view.state.plugins,
      });
      view.updateState(nextState);
    } finally {
      applyingRef.current = false;
    }
  };

  useEffect(() => {
    if (!editorRef.current) return;

    const startDocument = engine.forward(exampleDocument).document;
    const state = EditorState.create({
      schema: costSchema,
      doc: buildPmDocFromCostNode(startDocument.root),
      plugins: [
        new Plugin({
          props: {
            nodeViews: {
              cost_item(node, view, getPos) {
                return new CostItemView(
                  node,
                  view,
                  getPos as () => number,
                  fieldDefsByType,
                  (nodeId, field, raw) => {
                    const currentView = viewRef.current;
                    if (!currentView) return;

                    const semantic = pmDocToSemanticTree(currentView.state.doc);
                    const nextDocument = engine.updateTreeForFieldChange(
                      semantic,
                      nodeId,
                      field,
                      raw,
                    );
                    renderDocument(nextDocument);
                  },
                );
              },
            },
          },
        }),
      ],
    });

    const view = new EditorView(editorRef.current, {
      state,
      dispatchTransaction(tr) {
        const current = view.state.apply(tr);
        view.updateState(current);
      },
    });

    viewRef.current = view;
    setSummary(startDocument);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [engine, fieldDefsByType]);

  const rerunForward = () => {
    const view = viewRef.current;
    if (!view) return;
    const semantic = pmDocToSemanticTree(view.state.doc);
    renderDocument(engine.forward(semantic).document);
  };

  const runBackwardOnRoot = () => {
    const view = viewRef.current;
    if (!view) return;
    const semantic = pmDocToSemanticTree(view.state.doc);
    const next = engine.backward(semantic, "total", 200).document;
    renderDocument(next);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>Semantischer Kosteneditor</h1>
        <p>
          ProseMirror zeigt nur den Baum an. Die Berechnung läuft in einer
          separaten TypeScript-Engine.
        </p>

        <div className="button-row">
          <button onClick={rerunForward}>Vorwärts neu berechnen</button>
          <button onClick={runBackwardOnRoot}>Rückwärts: Root = 200</button>
        </div>

        <h2>Aktuelles Dokument</h2>
        <pre>{JSON.stringify(summary, null, 2)}</pre>
      </aside>

      <main className="editor-panel">
        <div className="toolbar">Editor</div>
        <div ref={editorRef} className="editor-host" />
      </main>
    </div>
  );
}
