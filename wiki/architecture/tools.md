---
description: Editor tools structure in the editor package
globs: packages/editor/src/components/tools/**,apps/editor/**
alwaysApply: false
---

# Tools

Tools are React components that capture user input (pointer, keyboard) and translate it into `useScene` mutations. They live in the editor layer, currently `packages/editor/src/components/tools/`. The `apps/editor` package is a Next.js host shell and should not own reusable tool implementations.

## Lifecycle

`ToolManager` reads `useEditor` (phase + mode + tool) and mounts the active tool component. When the tool changes, the old component unmounts, cleaning up transient state.

See `packages/editor/src/components/tools/tool-manager.tsx`.

## Tool Categories by Phase

**Site**
- `site-boundary-editor` - draw/edit property boundary polygon

**Structure**
- `wall-tool` - draw walls segment by segment
- `slab-tool` + `slab-boundary-editor` + `slab-hole-editor`
- `ceiling-tool` + `ceiling-boundary-editor` + `ceiling-hole-editor`
- `roof-tool`
- `door-tool` + `door-move-tool`
- `window-tool` + `window-move-tool`
- `item-tool` + `item-move-tool`
- `zone-tool` + `zone-boundary-editor`

**Furnish**
- `item-tool` - place furniture

**Shared utilities**
- `polygon-editor` - reusable boundary/hole editing logic
- `cursor-sphere` - 3D cursor visualisation

## Pattern

```tsx
// packages/editor/src/components/tools/my-tool/index.tsx
import { useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import useEditor from '../../../store/use-editor'

export function MyTool() {
  const createNode = useScene((s) => s.createNode)
  const setTool = useEditor((s) => s.setTool)
  const currentLevelId = useViewer((s) => s.selection.levelId)

  // Pointer handlers mutate the scene store for committed changes.
  // Preview geometry is local to the active tool.

  return (
    <mesh onPointerDown={handleDown} onPointerMove={handleMove}>
      {/* ghost / preview geometry only */}
    </mesh>
  )
}
```

## Rules

- **Tools mutate `useScene` for committed changes and `useLiveTransforms` for ephemeral drag state.** A tool's end-of-interaction write (click-to-commit, release-to-commit) goes to `useScene` and is captured in undo history. Per-mouse-move previews go to `useLiveTransforms` so history and subscribers are not spammed.
- **Live-drag exception for direct mesh transforms.** During an active drag a tool may apply a transform offset directly to `sceneRegistry.nodes.get(id).position`/`rotation`/`scale` when and only when the same offset is mirrored into `useLiveTransforms` for that node. This exception exists because the 3D renderers do not reconcile `useLiveTransforms` onto `mesh.position` yet. Once a `LiveTransformSystem` does that, this exception should go away. Conditions:
  - The mesh offset must mirror the `useLiveTransforms` entry, so anything reading `useLiveTransforms` sees the same preview as the 3D view.
  - The offset must be cleared on tool unmount, cancel, and commit: both `mesh.position.set(0, 0, 0)` and `useLiveTransforms.clear(id)`.
  - The tool must not generate or mutate committed scene geometry in this path. Only preview transform writes are allowed.
- **No durable business logic in tools.** Delegate domain geometry, topology, placement constraints, and collision rules to core helpers/systems such as wall footprint, stair opening sync, and spatial query utilities. Three.js `BufferGeometry` generation belongs in viewer systems when it is purely render geometry.
- **Preview geometry is local.** Transient meshes shown while a tool is active live in the tool component, not in the scene store.
- **Clean up on unmount.** Remove any pending/incomplete nodes and any live transforms/mesh offsets when the tool unmounts.
- **Viewer access is limited to public presentation APIs.** Tools may import `useViewer` from `@pascal-app/viewer` for viewer presentation state such as selection, unit, level mode, camera mode, and hover state. Tools must not import viewer renderers, viewer systems, internal viewer components, or encode editor-only state in `useViewer`.
- Each tool should handle a single, well-scoped interaction. Split complex tools (for example, "draw + move") into separate components selected by `useEditor`.

## Adding a New Tool

1. Create `packages/editor/src/components/tools/<name>/index.tsx`.
2. Register the tool in `ToolManager` under the correct phase and mode.
3. Add the tool identifier to the `useEditor` tool union type.
4. If the tool requires new node types, add schema + renderer + system first.
