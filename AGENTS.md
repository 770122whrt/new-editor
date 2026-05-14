# Agent Instructions - `pascalorg/editor`

Public, open-source home of `@pascal-app/{core,viewer,editor,mcp}` and the standalone editor app. Consumed both as npm packages and, in `pascalorg/private-editor`, as a git submodule.

## Repo Shape

| Path | Purpose |
| --- | --- |
| `packages/core` | Scene graph, node schemas, stores, event bus, core systems, and pure domain logic. |
| `packages/viewer` | Standalone 3D canvas: renderers, viewer systems, presentation state, and render-facing geometry/material helpers. |
| `packages/editor` | Reusable editing experience: tools, `useEditor`, panels, floorplan, paint mode, command palette, and editor-only systems. |
| `packages/mcp` | MCP server, scene operations, scene storage adapters, and agent-facing resources/tools. |
| `apps/editor` | Standalone Next.js host shell: routes, API endpoints, persistence integration, and package composition. |

## Where To Look

- **Architecture rules** - `wiki/architecture/` is the canonical rule source. Start with `wiki/architecture/README.md`.
- **Skills** - `.agents/skills/<name>/SKILL.md`. Compatibility paths for Claude, Cursor, and Codex point back to `.agents/skills/`.
- **Repo orientation for humans** - `README.md`, `SETUP.md`, `CONTRIBUTING.md`.
- **Documentation drift protocol** - `DOCUMENTATION-CONTRACT.md`.

`CLAUDE.md`, `GEMINI.md`, and `.github/copilot-instructions.md` point to this file. Codex reads this file directly.

## Layer Boundaries

`packages/core` owns domain data, schemas, scene state, pure domain helpers, spatial queries, and narrow event/registry bridges. Core must not import viewer, editor, app shell, rendering UI, tools, phases, floorplan, or paint concepts. Three/R3F types are allowed only in the narrow bridge exceptions documented by the rule files.

`packages/viewer` owns the standalone 3D canvas, renderers, viewer systems, viewer presentation state, camera/display controls, and render-facing materials/geometry helpers. It must not know about `useEditor`, editor tools, phases, modes, paint mode, floorplan state, editor panels, or editor-only presentation vocabulary.

`packages/editor` owns the reusable editing experience: tools, `useEditor`, panels, floorplan, paint mode, editor selection manager, editor systems, command palette, action menus, keyboard shortcuts, cursor badges, and editor-specific overlays. Editor features are injected into `<Viewer>` via props and children.

`apps/editor` is the Next.js host shell. It owns routes, API endpoints, app-level persistence/integration, and package composition. Reusable editor behavior should live in `packages/editor`, not in the host app.

Details, examples, and rationale live in `wiki/architecture/layers.md`, `wiki/architecture/viewer-isolation.md`, `wiki/architecture/systems.md`, `wiki/architecture/renderers.md`, and `wiki/architecture/tools.md`.

## When Making Architecture-Sensitive Changes

Read the relevant page in `wiki/architecture/` before writing code. The page list lives in `wiki/architecture/README.md`. As a minimum:

- Adding a node type: `node-schemas.md`, `renderers.md`, `systems.md`.
- Adding a tool: `tools.md`, `spatial-queries.md`, `events.md`.
- Adding a system: `systems.md`, `scene-registry.md`.
- Anything in `packages/viewer`: `viewer-isolation.md`, `layers.md`.
- Anything touching selection: `selection-managers.md`, `scene-registry.md`, `events.md`.

## Documentation Contract Drift

When changing architecture, moving files, changing package ownership, or changing setup commands, check that docs and agent instructions still match the code.

Use `DOCUMENTATION-CONTRACT.md` for the drift-check protocol. In short:

1. Treat `wiki/architecture/` as the architecture source of truth.
2. Check root and package README files, `AGENTS.md`, compatibility skill paths, and project skills.
3. Fix confirmed factual drift with the smallest docs-only change.
4. Do not create competing architecture sources by copying full rules into README, AGENTS, or skills.

## When Reviewing A PR

Invoke the `review-architecture` skill (`.agents/skills/review-architecture/SKILL.md`). It loads the required architecture pages, fetches the diff, classifies each new file by layer, and reports findings grouped by severity.

## Operating Rules

- Read the full file before editing. Plan all changes, then make one complete edit.
- When the user corrects you, stop and re-read their message.
- After two consecutive tool failures, stop and change approach.
- Do not introduce backwards-compatibility shims, dead code, or speculative abstractions.
- Do not write new comments unless they explain a non-obvious why.
