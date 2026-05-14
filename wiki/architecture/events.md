---
description: Typed event bus for node and grid interaction events
globs: packages/core/src/events/**,packages/viewer/**,packages/editor/**,apps/editor/**
alwaysApply: false
---

# Events

The event bus (`emitter`) is a global `mitt` instance typed with interaction events. It decouples renderers (which emit) from selection managers, tools, and systems (which listen).

**Source**: @packages/core/src/events/bus.ts

The event bus is a narrow core interaction bridge. It is allowed to type payloads with R3F/Three interaction types such as `ThreeEvent` and `Object3D`, but it must not import `@pascal-app/viewer`, `@pascal-app/editor`, or app code. Core schema, stores, and core systems remain pure unless another rule explicitly grants an exception.

## Event Key Format

```
<nodeType>:<suffix>
```

Example keys: `wall:click`, `item:enter`, `door:double-click`, `grid:pointerdown`

### Node Types

`site` `building` `level` `wall` `fence` `item` `zone` `slab` `spawn` `ceiling` `column` `roof` `roof-segment` `stair` `stair-segment` `window` `door`

### Suffixes

```ts
'click' | 'move' | 'enter' | 'leave' | 'pointerdown' | 'pointerup' | 'context-menu' | 'double-click'
```

The `grid:*` events fire when the user interacts with empty space (no node hit). They are not emitted by a mesh. `useGridEvents(gridY)` manually raycasts against a ground plane and calls `emitter.emit('grid:click', ...)`. Mount it in any tool or editor component that needs empty-space interactions.

## NodeEvent Shape

```ts
interface NodeEvent<T extends AnyNode = AnyNode> {
  node: T
  position: [number, number, number]
  localPosition: [number, number, number]
  normal?: [number, number, number]
  faceIndex?: number
  object: Object3D
  stopPropagation: () => void
  nativeEvent: ThreeEvent<PointerEvent>
}
```

Grid events carry `position`, `localPosition`, and `nativeEvent`; they do not carry a node.

## Emitting

Renderers emit via `useNodeEvents`; never call `emitter.emit` directly in a renderer:

```tsx
// packages/viewer/src/hooks/use-node-events.ts
const events = useNodeEvents(node, 'wall')
return <mesh ref={ref} {...events} />
```

`useNodeEvents` converts R3F `ThreeEvent` into a `NodeEvent` and emits `wall:click`, `wall:enter`, etc. It suppresses events while the camera is dragging.

## Listening

Listen in a `useEffect`. Always clean up with `emitter.off` using the same function reference:

```ts
useEffect(() => {
  const handler = (e: WallEvent) => { /* ... */ }
  emitter.on('wall:click', handler)
  return () => emitter.off('wall:click', handler)
}, [])
```

See @packages/editor/src/components/editor/selection-manager.tsx and @packages/viewer/src/components/viewer/selection-manager.tsx for multi-type listener examples.

## Rules

- **Renderers only emit, never listen.** Listening belongs in selection managers, tools, or systems.
- **Always clean up.** Forgetting `emitter.off` causes duplicate handlers and memory leaks.
- **Use the same function reference** for `on` and `off`. Anonymous functions inside `useEffect` are fine as long as the reference is captured in the same scope.
- **Do not use emitter for state.** It is for one-shot interaction events. Persistent state goes in `useScene`, `useViewer`, or `useEditor`.
- **`stopPropagation`** prevents the event from being handled by overlapping listeners, such as a door on a wall. Call it when a handler should be the final consumer.
