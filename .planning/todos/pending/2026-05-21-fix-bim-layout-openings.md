---
created: 2026-05-21T00:00:00+08:00
title: Fix BIM layout and openings
area: tooling
files:
  - packages/mcp/src/bim-generation/generate-bim-spec.ts:96
  - packages/mcp/src/bim-generation/scenegraph-converter.ts:180
  - packages/mcp/src/tools/room-tools.ts:497
  - packages/mcp/src/tools/geometry.ts:15
  - packages/core/src/schema/nodes/window.ts:20
---

## Problem

The current batch BIM v1 generator successfully produces JSON, OBJ, and IFC, but the generated plans are visually too uniform. Room layout is produced by `layoutRooms()` as a one-dimensional strip layout: every room spans the full building depth and only varies along X. This makes compact and medium samples differ in area and room count, but still look like repeated horizontal or vertical bands.

The current BIM SceneGraph converter also creates door and window nodes with wall relationships (`parentId`, `wallId`, and wall `children`) but stores their `position` as world coordinates. Existing Pascal wall-attached door/window tools use wall-local coordinates: `[localX, centerY, 0]`. Because the batch converter mixes wall parentage with world-space positions, windows can appear misaligned or detached, especially on east/west walls.

## Solution

Phase v1 repair should keep the stable batch workflow intact and fix correctness first:

- Reuse the MCP `add_window` and `add_door` coordinate convention in the BIM converter.
- For each opening, compute `localX = wallLocalXFromT(wall, t, width)` and store `position: [localX, centerY, 0]`.
- Keep `parentId = wall.id`, `wallId = wall.id`, and append the child id to `wall.children`.
- Add tests that fail on world-space window positions and pass only when windows are wall-local and within wall bounds.

Next quality phase should replace the one-dimensional strip layout with a deterministic two-dimensional layout planner:

- Keep JSONL input and BIM Spec as the source of truth.
- Generate room rectangles in two zones or rows rather than full-depth strips.
- Add constraints for adjacency, minimum room width/depth, circulation, wall alignment, and exterior opening placement.
- Treat stairs, roof geometry, and alignment as separate follow-up tasks after the window/door coordinate repair is green.
