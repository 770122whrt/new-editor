---
description: Selection managers - viewer and editor selection architecture
globs: packages/viewer/src/components/viewer/selection-manager.tsx,packages/editor/src/components/editor/selection-manager.tsx
alwaysApply: false
---

# Selection Managers

There are two selection managers. They are separate components, not the same component configured differently.

| Component | Location | Knows about |
|---|---|---|
| `SelectionManager` | `packages/viewer/src/components/viewer/selection-manager.tsx` | Viewer state only |
| `SelectionManager` (editor) | `packages/editor/src/components/editor/selection-manager.tsx` | Phase, mode, tool state, paint mode, editor selection policy |

The viewer's manager is the default. The editor mounts its own manager as a child of `<Viewer>` and passes `selectionManager="custom"` so the default viewer manager is not mounted.

## How Selection Works

**Event flow:**

```
useNodeEvents(node, type) on a renderer mesh
  -> emitter.emit('wall:click', NodeEvent)
  -> SelectionManager listens via emitter.on(...)
  -> calls useViewer.setSelection(...)
  -> outliner sync updates Three.js outline objects
```

`useNodeEvents` returns R3F pointer handlers. Spread them onto the mesh:

```tsx
const events = useNodeEvents(node, 'wall')
return <mesh ref={ref} {...events} />
```

Events are suppressed during camera drag (`useViewer.getState().cameraDragging`).

## Viewer Selection Manager

The viewer manager implements viewer-only hierarchy:

```
Building -> Level -> Zone -> Elements
```

At each level, only the next tier is selectable. Clicking outside deselects. The path is stored in `useViewer`:

```ts
type SelectionPath = {
  buildingId: string | null
  levelId: string | null
  zoneId: string | null
  selectedIds: string[]
}
```

`setSelection` has a hierarchy guard: setting `levelId` without `buildingId` resets children. Use `resetSelection()` to clear everything.

Multi-select: `Ctrl/Meta + click` toggles an ID in `selectedIds`. Regular click replaces it.

## Editor Selection Manager

The editor manager extends selection with phase awareness from `useEditor`. The viewer's `SelectionManager` is not mounted in normal editor mode; the editor one takes its place.

```
phase: 'site'      -> selectable: buildings
phase: 'structure' -> selectable: walls, zones, slabs, ceilings, roofs, stairs, doors, windows
  structureLayer: 'zones'    -> only zones
  structureLayer: 'elements' -> all structure types
phase: 'furnish'   -> selectable: furniture items only
```

Clicking a node of a different phase may auto-switch the phase. Double-click can drill into a context level. Material paint, delete mode, and editor hover previews belong only in the editor manager or editor systems.

## Rules

- **Never add selection logic to renderers.** Renderers spread `useNodeEvents` events and stop there. All selection decisions live in a selection manager.
- **Never add editor phase logic to the viewer's SelectionManager.** Phase, mode, tool awareness, paint mode, and editor hover policy belong exclusively in the editor's selection manager.
- **`useViewer` is the single source of truth for selection state.** Both managers read and write through `setSelection` / `resetSelection`. Nothing else should mutate `selection` directly.
- **Outliner arrays are mutated in place** for performance. Do not assign new arrays to `outliner.selectedObjects` or `outliner.hoveredObjects`.
- **Hover is a separate scalar** (`hoveredId: string | null`), not part of `selectedIds`. Update it via `setHoveredId` or `useViewer.setState` when doing imperative sync.

## Adding Selectability to a New Node Type

1. Add the type to `SelectableNodeType` in whichever selection manager needs it.
2. Make sure its renderer calls `useNodeEvents(node, type)` and spreads the handlers.
3. Add a case to the viewer hierarchy strategy, editor phase strategy, or both.
4. Ensure `useRegistry` is called in the renderer so the outliner can highlight it.
