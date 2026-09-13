import { useEffect, useMemo, useRef, useState } from "react";
import { EditorState, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { costSchema } from "./pm/schema";
import { CostItemView } from "./pm/costNodeView";
import { Node } from "prosemirror-model";
import exampleDocument from "./exampleJSON/exampleDocument.json";
import {
  CostNodeView,
  CostDocument,
  exampleDoc,
} from "./semantic/stateMachine";

function buildPmDocFromCostNode(node: CostNodeView): Node {
  return costSchema.node("doc", null, [buildCostItemNode(node)]);
}

function buildCostItemNode(node: CostNodeView): Node {
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
  const document = exampleDocument as unknown as CostDocument;
  if (!root) return document;

  const walk = (pmNode: any): CostNodeView => ({
    id: pmNode.attrs.id,
    typeId: pmNode.attrs.typeId,
    label: pmNode.attrs.label,
    values: { ...(pmNode.attrs.values ?? {}) },
    children: pmNode.content.content.map(walk),
  });

  return { root: walk(root) };
}

const document = exampleDocument as unknown as CostDocument;
const doc = exampleDoc;
doc.setRoot(doc.convertCostNodeToDocNode(document.root));
doc.attachParents(doc.root);
export default function App() {
  const NodeTypes = useMemo(() => doc.getNodeTypesMap(), []);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const applyingRef = useRef(false);

  // Forward calculation to make sure the document adheres to rules
  const [summary, setSummary] = useState<CostDocument>(
    () => { 
      doc.currentState.executeCommands(doc, doc.root, doc.root.type.fields[0], doc.root.type.fields[0].value)
      return { root: doc.convertDocNodeToCostNode(doc.root) } 
    },
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

    // const document = exampleDocument as unknown as CostDocument;
    doc.currentState.executeCommands(doc, doc.root, doc.root.type.fields[0], doc.root.type.fields[0].value);
    const startRoot = doc.convertDocNodeToCostNode(doc.root);
    const startDocument = { root: startRoot };
    const state = EditorState.create({
      schema: costSchema,
      doc: buildPmDocFromCostNode(startRoot),
      plugins: [
        new Plugin({
          props: {
            nodeViews: {
              cost_item(node, view, getPos) {
                return new CostItemView(
                  node,
                  view,
                  getPos as () => number,
                  NodeTypes,
                  (nodeId, field, raw) => {
                    const currentView = viewRef.current;
                    if (!currentView) return;

                    // const semantic = pmDocToSemanticTree(currentView.state.doc);
                    const nextRoot = doc.convertDocNodeToCostNode(doc.updateTreeForFieldChange(
                      doc,
                      nodeId,
                      field,
                      parseFloat(raw),
                    ));
                    const nextDocument = { root: nextRoot };
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
  }, [doc, NodeTypes]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>Semantischer Kosteneditor</h1>
        <p>
          ProseMirror zeigt nur den Baum an. Die Berechnung läuft in einer
          separaten TypeScript-Engine.
        </p>

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
