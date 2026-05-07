---
description: Placement validation for tools - canPlaceOnFloor, canPlaceOnWall, canPlaceOnCeiling
globs: packages/editor/src/components/tools/**
alwaysApply: false
---

# Spatial Queries

`useSpatialQuery()` validates whether an item can be placed at a given position without overlapping existing items. Every placement tool must call it before committing a node to the scene.

**Source**: @packages/core/src/hooks/spatial-grid/use-spatial-query.ts

## Hook

```ts
const { canPlaceOnFloor, canPlaceOnWall, canPlaceOnCeiling } = useSpatialQuery()
```

All three methods return `{ valid: boolean; conflictIds: string[] }`.
`canPlaceOnWall` additionally returns `adjustedY: number` (snapped height).

## canPlaceOnFloor

```ts
canPlaceOnFloor(
  levelId: string,
  position: [number, number, number],
  dimensions: [number, number, number],
  rotation: [number, number, number],
  ignoreIds?: string[],
): { valid: boolean; conflictIds: string[] }
```

**Usage in a tool:**

```ts
const pos: [number, number, number] = [x, 0, z]
const { valid } = canPlaceOnFloor(levelId, pos, getScaledDimensions(item), item.rotation, [item.id])
if (valid) createNode(item, levelId)
```

## canPlaceOnWall

```ts
canPlaceOnWall(
  levelId: string,
  wallId: string,
  localX: number,
  localY: number,
  dimensions: [number, number, number],
  attachType: 'wall' | 'wall-side',
  side?: 'front' | 'back',
  ignoreIds?: string[],
): { valid: boolean; conflictIds: string[]; adjustedY: number }
```

`adjustedY` contains the snapped Y so items sit flush on the slab. Always use it instead of the raw `localY`:

```ts
const { valid, adjustedY } = canPlaceOnWall(levelId, wallId, x, y, dims, 'wall', undefined, [item.id])
if (valid) updateNode(item.id, { wallT: x, wallY: adjustedY })
```

## canPlaceOnCeiling

```ts
canPlaceOnCeiling(
  ceilingId: string,
  position: [number, number, number],
  dimensions: [number, number, number],
  rotation: [number, number, number],
  ignoreIds?: string[],
): { valid: boolean; conflictIds: string[] }
```

## Slab Elevation

When items rest on a slab rather than flat ground, use these to get the correct Y:

```ts
import { spatialGridManager } from '@pascal-app/core'

const y = spatialGridManager.getSlabElevationAt(levelId, x, z)
const yForFootprint = spatialGridManager.getSlabElevationForItem(levelId, position, dimensions, rotation)
```

## Rules

- **Always pass `[item.id]` in `ignoreIds`** when validating a draft item that already exists in the scene; otherwise it collides with itself.
- **Use `adjustedY` from `canPlaceOnWall`** instead of the raw cursor Y for wall-mounted items.
- **Use `getScaledDimensions(item)`** (@packages/core/src/schema/nodes/item.ts) to account for item scale, not raw `asset.dimensions`.
- Validate on every pointer move for live feedback. Only `createNode` / `updateNode` on pointer up or click.

See @packages/editor/src/components/tools/item/use-placement-coordinator.tsx for a full implementation.
