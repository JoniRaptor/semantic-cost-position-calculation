# Semantic Cost Editor Demo

Kleiner Prototyp mit React + ProseMirror + ausgelagerter Berechnungslogik.

## Start

```bash
npm install
npm run dev
```

## Verhalten

- Jeder Kostenknoten ist eine Position mit Feldern und Kindern.
- `total` ist editierbar und triggert Rückwärtsrechnung, falls eine Umkehrregel definiert ist.
- Fixfelder bleiben in der Rückwärtsrechnung unverändert.
- Das Dokument besitzt eine Oberposition (`invoice`), darunter können weitere Positionen und Unterpositionen liegen. Das ist also die Wurzel des Dokuments.

## Enthalten

- `src/semantic/engine.ts` — fachliche Logik, Regeln, Vorwärts- und Rückwärtsrechnung
- `src/pm/schema.ts` — ProseMirror-Schema
- `src/pm/costNodeView.ts` — NodeView für Kostenpositionen
- `src/App.tsx` — React-Integration
