---
description: Node renderer pattern in packages/viewer
globs: packages/viewer/**
alwaysApply: false
---

# Renderers

Renderers live in `packages/viewer/src/components/renderers/`. Each renderer is responsible for one node type's Three.js object tree and materials. Reusable derived geometry and side effects belong in systems.

## Dispatch Chain

```
<SceneRenderer>       - iterates rootNodeIds from useScene
  <NodeRenderer>      - switches on node.type
    <WallRenderer>    - or SlabRenderer, DoorRenderer, etc.
```

See @packages/viewer/src/components/renderers/scene-renderer.tsx and @packages/viewer/src/components/renderers/node-renderer.tsx.

## Renderer Responsibilities

A renderer **should**:

- Read its node from `useScene` via the node's ID
- Register its mesh(es) with `useRegistry()` so other systems can look them up
- Subscribe to pointer events via `useNodeEvents()`
- Render geometry and apply materials based on node properties

A renderer **must not**:

- Run reusable derived geometry or domain logic in the component body
- Import anything from `@pascal-app/editor`, `packages/editor`, or `apps/editor`
- Manage selection state directly; use `useViewer` for read-only presentation state and emit events for writes
- Perform expensive per-frame calculations in the component body

## Example - Minimal Renderer

```tsx
// packages/viewer/src/components/renderers/my-node/index.tsx
import { useRegistry, useScene } from '@pascal-app/core'
import { useNodeEvents } from '../../hooks/use-node-events'

export function MyNodeRenderer({ node }: { node: MyNode }) {
  const ref = useRef<Mesh>(null!)
  useRegistry(node.id, 'my-node', ref)
  const events = useNodeEvents(node, 'my-node')

  return (
    <mesh ref={ref} {...events}>
      <boxGeometry args={[node.width, node.height, node.depth]} />
      <meshStandardMaterial color={node.color} />
    </mesh>
  )
}
```

## Adding a New Node Type

1. Create `packages/viewer/src/components/renderers/<type>/index.tsx`.
2. Add a case to `NodeRenderer` in `node-renderer.tsx`.
3. Add a pure core helper/system in `packages/core/src/systems/` if the node needs reusable domain geometry, topology, or constraints.
4. Add a viewer system in `packages/viewer/src/systems/` if the node needs Three.js `BufferGeometry`, mesh mutation, cutouts, merged meshes, or render-side side effects.
5. Export from `packages/viewer/src/index.ts` if needed externally.

## Performance Notes

- Use `useMemo` for small geometry that depends only on node properties.
- For complex cutout, boolean, merged, or frequently updated geometry, delegate to a viewer system (for example, `WallCutout`, `WallSystem`, `SlabSystem`, or `RoofSystem`).
- Register one mesh per node ID. If a renderer spawns multiple meshes, use a group ref or pick the primary node-level object for registry.
