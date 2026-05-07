---
description: Scene registry pattern - mapping node IDs to live THREE.Object3D instances
globs: packages/core/src/hooks/scene-registry/**,packages/viewer/**,packages/editor/**
alwaysApply: false
---

# Scene Registry

The scene registry is a global, mutable map that links node IDs to their live `THREE.Object3D` instances. It avoids tree traversal and lets viewer systems, selection managers, export logic, and narrow editor live-drag paths do O(1) lookups.

**Source**: @packages/core/src/hooks/scene-registry/scene-registry.ts

The registry is a narrow core interaction bridge. It is allowed to reference `THREE.Object3D` because it binds scene graph data to live render objects, but core systems and schema logic must not use it.

## Structure

```ts
export const sceneRegistry = {
  nodes: new Map<string, THREE.Object3D>(),
  byType: {
    wall: new Set<string>(),
    slab: new Set<string>(),
    item: new Set<string>(),
    // one Set per node type
  },
}
```

`nodes` is the primary lookup. `byType` lets systems iterate all objects of one type without scanning the whole map.

## Registering in a Renderer

Every renderer must call `useRegistry` with a `ref` to its root mesh or group. Registration is synchronous (`useLayoutEffect`) so it is available before the first paint.

```tsx
import { useRegistry } from '@pascal-app/core'

export function WallRenderer({ node }: { node: WallNode }) {
  const ref = useRef<Mesh>(null!)
  useRegistry(node.id, 'wall', ref)

  return <mesh ref={ref} />
}
```

The hook handles both registration on mount and cleanup on unmount automatically.

## Looking Up Objects

Read the registry at the time you need the object:

```ts
const obj = sceneRegistry.nodes.get(nodeId)
if (obj) {
  // use live Object3D
}
```

## Rules

- **One registration per node ID.** If a renderer spawns multiple meshes, register the outermost group that represents the node.
- **Never hold a stale reference.** Always read from `sceneRegistry.nodes.get(id)` at the time you need it; do not cache the result across frames.
- **Do not mutate the registry manually.** Only `useRegistry` should add/remove entries.
- **Core systems must not use the registry.** They work with plain node data. Viewer systems, selection managers, export logic, and editor live-drag tools may read it.
- **Editor tools may directly transform registered objects only under the live-drag exception in `tools.mdc`.** The same preview transform must be mirrored into `useLiveTransforms` and cleared on cancel/commit/unmount.

## Outliner Sync

The `outliner` in `useViewer` holds live `Object3D[]` arrays used by the post-processing outline pass. Selection managers sync them imperatively for performance by mutating arrays in place:

```ts
outliner.selectedObjects.length = 0
for (const id of selection.selectedIds) {
  const obj = sceneRegistry.nodes.get(id)
  if (obj) outliner.selectedObjects.push(obj)
}
```

See @packages/viewer/src/components/viewer/selection-manager.tsx and @packages/editor/src/components/editor/selection-manager.tsx for the full sync pattern.
