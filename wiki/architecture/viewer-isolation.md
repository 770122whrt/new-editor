---
description: Viewer must be editor-agnostic and controlled from outside via props and children
globs: packages/viewer/**
alwaysApply: false
---

# Viewer Isolation

`@pascal-app/viewer` is a standalone 3D canvas library. It must never know about editor-specific features, UI state, tools, phases, floorplan state, or paint mode. This keeps it usable in read-only viewer contexts and future embeds.

## The Rule

> The viewer is controlled from outside. It exposes control points (props, callbacks, public hooks, and children). It never reaches into `@pascal-app/editor` or the `apps/editor` host shell.

## Package Roles

- `packages/viewer` owns the standalone canvas, renderers, viewer systems, viewer store, and render-facing presentation state.
- `packages/editor` owns reusable editor features: tools, `useEditor`, panels, floorplan, paint mode, editor systems, command palette, and editor-specific overlays.
- `apps/editor` is the Next.js host shell. It wires routes, persistence endpoints, and app-level integration around the reusable packages.

The editor package may consume `@pascal-app/viewer` public APIs. The viewer package must not import the editor package or the app shell.

## Forbidden in `packages/viewer`

```ts
// Never import from the editor package or host app.
import { useEditor } from '@pascal-app/editor'
import { ToolManager } from '@pascal-app/editor/internal'
import { useEditor as useAppEditor } from '@/store/use-editor'

// Never reference editor-specific concepts.
if (phase === 'structure' || mode === 'material-paint') {
  // wrong layer
}
```

## Correct Pattern - Pass Control from Outside

The editor mounts the viewer and passes what it needs:

```tsx
// packages/editor/src/components/editor/index.tsx
import { Viewer } from '@pascal-app/viewer'
import { ToolManager } from '../tools/tool-manager'
import { SelectionManager } from './selection-manager'

export function EditorCanvas() {
  return (
    <Viewer selectionManager="custom">
      <SelectionManager />
      <ToolManager />
    </Viewer>
  )
}
```

The viewer accepts `children` and renders them inside the R3F canvas. This is the extension point for editor tools, overlays, and editor-specific systems.

## Viewer's Own State (`useViewer`)

The viewer store contains **presentation state only**:

- `selection` and `previewSelectedIds` - which nodes are highlighted or preview-highlighted
- `hoveredId` and `hoverHighlightMode` - render-facing hover state
- `cameraMode` - perspective / orthographic
- `levelMode` - stacked / exploded / solo / manual
- `wallMode` - up / cutaway / down
- `theme` and `unit`
- Display toggles: `showScans`, `showGuides`, `showGrid`
- Viewer lifecycle/preferences such as `projectId`, `projectPreferences`, `exportScene`, `debugColors`, `walkthroughMode`, and `cameraDragging`

If a piece of state is only meaningful inside the editor, it belongs in `useEditor`, not `useViewer`. Examples: active tool, phase, edit mode, structure layer, paint material, selected paint target, floorplan pane state, command palette state, and editor panels.

## Nested Viewer for Editor-Specific Features

When an editor feature needs to live inside the canvas but must not pollute the viewer package, inject it as a child:

```tsx
<Viewer selectionManager="custom">
  <SelectionManager />      {/* editor-specific selection */}
  <SelectionBoxOverlay />   {/* editor only */}
  <SnapIndicator />         {/* editor only */}
  <ToolManager />           {/* editor only */}
</Viewer>
```

This pattern lets the viewer stay ignorant of these components while they still have access to the R3F context.

## Checklist Before Adding Code to `packages/viewer`

- [ ] Does this feature make sense in a read-only viewer/embed?
- [ ] Does it reference `useEditor`, tool state, phase/mode, paint mode, floorplan state, or editor UI vocabulary?
- [ ] Could it be passed in as a prop, callback, public hook usage from the editor, or child instead?

If any answer is editor-specific, keep it in `packages/editor` and inject it via children or props.
