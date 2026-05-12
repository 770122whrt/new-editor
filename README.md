# Pascal Editor

A 3D building editor built with React Three Fiber and WebGPU.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm @pascal-app/core](https://img.shields.io/npm/v/@pascal-app/core?label=%40pascal-app%2Fcore)](https://www.npmjs.com/package/@pascal-app/core)
[![npm @pascal-app/viewer](https://img.shields.io/npm/v/@pascal-app/viewer?label=%40pascal-app%2Fviewer)](https://www.npmjs.com/package/@pascal-app/viewer)
[![Discord](https://img.shields.io/badge/Discord-Join%20Server-5865F2?logo=discord&logoColor=white)](https://discord.gg/SaBRA9t2)
[![X (Twitter)](https://img.shields.io/badge/follow-%40pascal__app-black?logo=x&logoColor=white)](https://x.com/pascal_app)

## Repository Architecture

This is a Turborepo monorepo with four product layers:

```text
editor/
├── apps/
│   └── editor/          # Next.js host shell
└── packages/
    ├── core/            # Scene data, schemas, stores, pure domain helpers
    ├── viewer/          # Standalone 3D canvas, renderers, viewer systems
    └── editor/          # Reusable editing experience, tools, panels
```

| Layer | Responsibility |
| --- | --- |
| `@pascal-app/core` | Node schemas, scene state, pure domain helpers, spatial queries, event bus, and narrow scene-registry bridges. |
| `@pascal-app/viewer` | Standalone 3D canvas, React Three Fiber/WebGPU rendering, renderers, viewer systems, camera/display controls, and post-processing. |
| `@pascal-app/editor` | Reusable editor experience: tools, `useEditor`, panels, floorplan, paint mode, command palette, and editor-specific systems. |
| `apps/editor` | Next.js host shell: routes, API endpoints, persistence integration, and package composition. |

The viewer stays editor-agnostic. The editor package extends `<Viewer>` by passing props and injecting editor-specific children such as tools, selection managers, and editor systems.

Architecture-sensitive rules live in `.cursor/rules/*.mdc`. See `AGENTS.md` and `DOCUMENTATION-CONTRACT.md` before changing package boundaries or documented paths.

## Stores

| Store | Package | Responsibility |
| --- | --- | --- |
| `useScene` | `@pascal-app/core` | Scene graph data: nodes, root IDs, dirty nodes, collections, CRUD actions, read-only state, undo/redo via Zundo. |
| `useViewer` | `@pascal-app/viewer` | Viewer presentation state: selection, hover, camera mode, level mode, wall mode, theme, unit, display toggles. |
| `useEditor` | `@pascal-app/editor` | Editor-only state: phase, mode, active tool, floorplan state, paint state, panels, and editor preferences. |

```ts
const nodes = useScene((state) => state.nodes)
const levelId = useViewer((state) => state.selection.levelId)
const activeTool = useEditor((state) => state.tool)

const node = useScene.getState().nodes[id]
useViewer.getState().setSelection({ levelId: 'level_123' })
```

## Core Concepts

### Nodes

Nodes are the data primitives that describe a building scene. They are stored in a flat dictionary and linked by `parentId` and `children`.

```text
Site
└── Building
    └── Level
        ├── Wall -> Door / Window
        ├── Slab
        ├── Ceiling -> Item
        ├── Roof -> RoofSegment
        ├── Zone
        ├── Scan
        └── Guide
```

### Renderers And Systems

Renderers create node-level Three.js objects and register them with the scene registry. Systems perform derived updates after renderers mount.

- Core helpers in `packages/core/src/systems/` stay data-only and do not mutate Three.js objects.
- Viewer systems in `packages/viewer/src/systems/` own render-side geometry, materials, cutouts, transforms, and viewer presentation side effects.
- Editor systems in `packages/editor/src/components/systems/` own editor-only affordances and are injected into `<Viewer>` from the editor package.

### Data Flow

```text
User action
  -> editor tool or UI handler
  -> useScene create/update/delete
  -> node is marked dirty
  -> renderer provides registered Three.js object
  -> viewer/editor system updates derived render state
```

## Technology Stack

- React 19
- Next.js 16
- Three.js with WebGPU renderer
- React Three Fiber and Drei
- Zustand for state
- Zod for schema validation
- Zundo for undo/redo
- three-bvh-csg and three-mesh-bvh for geometry operations
- Turborepo for monorepo tasks
- Bun as the package manager

## Getting Started

Run commands from the repository root.

```bash
bun install
bun dev
```

The editor app script starts Next.js on port `3002`. If the dev output prints a different URL, use the printed URL.

Common commands:

```bash
bun run check-types
bun run check
bun run build
```

## Key Files

| Path | Description |
| --- | --- |
| `AGENTS.md` | Agent entrypoint and required architecture rules. |
| `DOCUMENTATION-CONTRACT.md` | Protocol for checking and repairing documentation drift. |
| `.cursor/rules/` | Canonical architecture rules. |
| `.codex/rules/`, `.claude/rules/` | Assistant-compatible pointers to canonical rules. |
| `packages/core/src/schema/` | Node type definitions and Zod schemas. |
| `packages/core/src/store/use-scene.ts` | Scene graph state store. |
| `packages/core/src/hooks/scene-registry/` | Scene registry bridge for live Three.js objects. |
| `packages/core/src/systems/` | Pure domain helpers and data-only systems. |
| `packages/viewer/src/components/viewer/` | Main `<Viewer>` canvas component. |
| `packages/viewer/src/components/renderers/` | Node renderers. |
| `packages/viewer/src/systems/` | Render-facing viewer systems. |
| `packages/editor/src/components/editor/` | Reusable editor composition. |
| `packages/editor/src/components/tools/` | Editor tools. |
| `packages/editor/src/components/systems/` | Editor-only systems injected into `<Viewer>`. |
| `packages/editor/src/store/use-editor.tsx` | Editor-only UI and tool state. |

## Publishing Packages

```bash
turbo build --filter=@pascal-app/core --filter=@pascal-app/viewer

npm publish --workspace=@pascal-app/core --access public
npm publish --workspace=@pascal-app/viewer --access public
```

## Contributors

<a href="https://github.com/Aymericr"><img src="https://avatars.githubusercontent.com/u/4444492?v=4" width="60" height="60" alt="Aymeric Rabot" style="border-radius:50%"></a>
<a href="https://github.com/wass08"><img src="https://avatars.githubusercontent.com/u/6551176?v=4" width="60" height="60" alt="Wassim Samad" style="border-radius:50%"></a>
