# Pascal Agent Instructions

This repository uses shared architecture rules for AI assistants. Treat the
rule files as the source of truth for architecture-sensitive work.

## Required Rule Sources

The canonical architecture rules live in `.cursor/rules/*.mdc`.

Claude-compatible paths are exposed in `.claude/rules/*.md`.
Codex-compatible paths are exposed in `.codex/rules/*.md`.

The Claude and Codex rule files should point to the same Cursor rule sources so
all assistants review the exact same rules.

## Architecture Rules

Read the relevant rules before making or reviewing changes in these areas:

- `.codex/rules/systems.md` - core helpers vs viewer systems vs editor systems
- `.codex/rules/renderers.md` - renderer responsibilities and prohibitions
- `.codex/rules/tools.md` - editor tools live in `packages/editor/src/components/tools/`
- `.codex/rules/viewer-isolation.md` - viewer must stay editor-agnostic
- `.codex/rules/layers.md`
- `.codex/rules/selection-managers.md`
- `.codex/rules/scene-registry.md`
- `.codex/rules/spatial-queries.md`
- `.codex/rules/node-schemas.md`
- `.codex/rules/events.md`

For architecture reviews, the first four are always required. Read the
remaining rules when the diff touches their subject area. If a `.codex/rules`
or `.claude/rules` file is a pointer, follow it to the referenced
`.cursor/rules/*.mdc` file before making a judgment.

## Layer Boundaries

Pascal currently uses four layers:

`packages/core` owns domain data, schemas, scene state, pure domain helpers,
spatial queries, and narrow event/registry bridges. Core must not import
viewer, editor, app shell, rendering UI, tools, phases, floorplan, or paint
concepts. Three/R3F types are allowed only in the bridge exceptions documented
by the rule files.

`packages/viewer` owns the standalone 3D canvas, renderers, viewer systems,
viewer presentation state, camera/display controls, and render-facing
materials/geometry helpers. It must not know about `useEditor`, editor tools,
phases, modes, paint mode, floorplan state, editor panels, or editor-only
presentation vocabulary.

`packages/editor` owns the reusable editing experience: tools, `useEditor`,
panels, floorplan, paint mode, editor selection manager, editor systems,
command palette, action menus, keyboard shortcuts, cursor badges, and
editor-specific overlays. Editor features are injected into `<Viewer>` via
props and children.

`apps/editor` is the Next.js host shell. It owns routes, API endpoints,
app-level persistence/integration, and package composition. Reusable editor
behavior should live in `packages/editor`, not in the host app.

## Documentation Contract Drift

When changing architecture, moving files, changing package ownership, or
changing setup commands, check that docs and agent instructions still match the
code.

Use `DOCUMENTATION-CONTRACT.md` for the drift-check protocol. In short:

1. Treat `.cursor/rules/*.mdc` as the architecture source of truth.
2. Check root and package README files, `AGENTS.md`, `.codex/.claude` rule
   pointers, and project skills.
3. Fix confirmed factual drift with the smallest docs-only change.
4. Do not create competing architecture sources by copying full rules into
   README, AGENTS, or skills.

## Review Expectations

When reviewing architecture changes:

1. Classify every new file, type, store field, and exported helper as core,
   viewer, editor package, or host app before writing findings.
2. Lead with layer-boundary blockers.
3. Check hook hygiene for `useEditor`, `useScene`, and `useViewer`.
4. Check selector performance for broad subscriptions and selectors that
   allocate fresh references.
5. Skip formatting and import ordering unless they hide a real behavior or
   architecture issue.

Use `.codex/skills/review-architecture/SKILL.md` when the user asks Codex to
review a PR, audit a branch, or check architecture compliance.
