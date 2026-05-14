---
description: Core, viewer, and editor systems architecture
globs: packages/core/src/systems/**,packages/viewer/src/systems/**,packages/editor/src/components/systems/**
alwaysApply: false
---

# Systems

Systems coordinate derived data, rendering side effects, and editor-only scene feedback. They are never user-facing UI panels. The project has three scopes: core helpers/systems, viewer systems, and editor-injected systems.

## Three Kinds of Systems

### Core Systems and Helpers - `packages/core/src/systems/`

Pure domain logic: no rendering, no Three.js objects, and no editor/viewer imports. Core owns topology, constraints, schema-level derivations, and data-only geometry helpers.

Examples:

| Module | Responsibility |
|---|---|
| `wall/wall-footprint` | Wall footprint and thickness math |
| `wall/wall-curve` | Curved wall sampling and clamping math |
| `wall/wall-mitering` | Wall mitering and corner joints |
| `stair/stair-opening-sync` | Stair slab/ceiling opening synchronization |

Core code may produce plain arrays, polygons, transforms, or patch data. It must not produce or mutate `THREE.Object3D` instances.

### Viewer Systems - `packages/viewer/src/systems/`

Viewer systems run inside `<Viewer>`, can access Three.js objects through `sceneRegistry`, and manage render-facing side effects. They may generate Three.js `BufferGeometry`, materials, cutouts, merged meshes, object transforms, and render-only presentation artifacts.

Examples:

| System | Responsibility |
|---|---|
| `LevelSystem` | Stacked / exploded / solo / manual level positions |
| `WallSystem` | Wall mesh geometry and render material updates |
| `SlabSystem` / `CeilingSystem` | Three.js slab/ceiling geometry updates |
| `RoofSystem` | Three.js roof segment and merged roof geometry |
| `WallCutout` | Cuts door/window holes in wall geometry |
| `ZoneSystem` | Zone display and label placement |
| `InteractiveSystem` | Item toggles and sliders in the scene |
| `GuideSystem` / `ScanSystem` | Temporary helper geometry and point clouds |

Viewer systems must not know about editor phases, tools, paint mode, floorplan state, or `useEditor`.

### Editor Systems - `packages/editor/src/components/systems/`

Editor systems are editor-specific behavior injected as children of `<Viewer>` from the editor package. They can use `useEditor`, `useViewer`, `useScene`, and editor helpers.

Examples include selection affordances, edit handles, label editing, paint preview support, and tool feedback that is absent from the read-only viewer route.

## Pattern

Viewer and editor systems are React components that render nothing (`return null`) or render only local helper objects. They often use `useFrame` for per-frame work.

```tsx
// packages/viewer/src/systems/my-system.tsx
import { useFrame } from '@react-three/fiber'
import { sceneRegistry, useScene } from '@pascal-app/core'

export function MySystem() {
  useFrame(() => {
    const nodes = useScene.getState().nodes
    const obj = sceneRegistry.nodes.get('some-id')
    // update render-side objects from scene data
  })

  return null
}
```

Core helpers are ordinary TypeScript functions and should be testable without React, Three.js, or R3F.

Core and viewer systems are mounted inside `<Viewer>` alongside renderers. See @packages/viewer/src/components/viewer/index.tsx for the mount order.

**Systems are a customization point.** Consumers of `<Viewer>` can inject their own systems as children. The editor uses this to add editor-specific behavior without modifying `@pascal-app/viewer`.

## Rules

- **Core systems/helpers must not import Three.js, R3F, viewer, or editor.** They work with plain scene data and pure data structures.
- **Viewer systems must not contain editor-only logic.** Phase, mode, active tool, paint mode, floorplan state, and editor UI vocabulary belong in `packages/editor`.
- **Domain rules should live in core when they can be expressed without Three.js.** Keep reusable topology, placement constraints, schema derivations, and collision rules in core. Let viewer systems convert those results into Three.js geometry or material changes.
- **Renderer components should not duplicate system logic.** If derived render geometry or side effects are reused or expensive, compute/update them in a system and have renderers read the result.
- Systems should be **idempotent**: given the same scene data and registry state, they produce the same visible result.
- Mark nodes as `dirty` in the scene store to signal that a system should re-run. Avoid running expensive logic every frame without a dirty check.

## Adding a New System

1. Decide the scope:
   - **Pure domain logic or data-only derived helpers** -> `packages/core/src/systems/`
   - **Viewer render side effect or Three.js geometry/material updates** -> `packages/viewer/src/systems/`, mounted in `packages/viewer/src/components/viewer/index.tsx`
   - **Editor-specific or integration-specific behavior** -> `packages/editor/src/components/systems/`, injected as a child of `<Viewer>`

2. Create `<name>-system.tsx` for React systems, or a focused `.ts` helper module for pure core logic.

3. Mount it in the right place:
   - Viewer-internal systems go in `packages/viewer/src/components/viewer/index.tsx`
   - Editor-specific systems are injected from the editor package:
     ```tsx
     // packages/editor - editor injects systems without modifying viewer internals
     <Viewer selectionManager="custom">
       <MyEditorSystem />
       <ToolManager />
     </Viewer>
     ```

4. **Mount order matters.** Most viewer systems run after renderers in the JSX tree because they consume `sceneRegistry` data that renderers populate on mount. Only place a system before renderers if it explicitly does not read the registry.
