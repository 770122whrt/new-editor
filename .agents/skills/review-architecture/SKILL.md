---
name: review-architecture
description: "Review a PR, branch, or local diff against the Pascal architectural rules: core/viewer/editor package boundaries, systems/renderers/tools separation, viewer isolation, event/registry bridge exceptions, hook hygiene, and selector performance. Use when the user asks to review a PR, audit a branch, or check architecture compliance."
allowed-tools: Bash(git *) Bash(gh *) Read Grep Glob
---

# Pascal Architecture Review

Use this skill for architecture-sensitive Pascal reviews. The user may provide a PR URL, branch name, or ask to review the current branch.

## 1. Load the Rules

Read the canonical rules before reviewing any diff. They are the source of truth, not model memory:

- `.codex/rules/systems.md`
- `.codex/rules/renderers.md`
- `.codex/rules/tools.md`
- `.codex/rules/viewer-isolation.md`
- `.codex/rules/layers.md`
- `.codex/rules/selection-managers.md`
- `.codex/rules/scene-registry.md`
- `.codex/rules/spatial-queries.md`
- `.codex/rules/node-schemas.md`
- `.codex/rules/events.md`

The first four are required on every architecture review. Read the remaining rules when the diff touches their subject area.

Compatibility files in `.codex/rules/*.md` may contain only a relative path such as `../../.cursor/rules/systems.mdc`. If so, continue reading that referenced `.cursor/rules/*.mdc` file before reviewing.

## 2. Fetch the Diff

```bash
# If the user gave a PR URL or number:
gh pr diff <pr-number-or-url>

# If reviewing the current branch:
git diff main...HEAD
```

Also list changed files so you can map each to the relevant rule:

```bash
gh pr view <pr> --json files --jq '.files[].path'
# or
git diff --name-only main...HEAD
```

If there is no branch diff and the user asks for a project audit, use targeted scans against the rule globs instead of treating the whole repository as one giant diff.

## 3. Classify New Surfaces First

Before writing findings, classify every new file, type, store field, exported helper, system, renderer, and tool introduced by the diff:

- **Core**: `packages/core`
- **Viewer**: `packages/viewer`
- **Editor**: `packages/editor`
- **Host app**: `apps/editor`

If a surface belongs to one layer but lives in another, flag it before downstream symptoms. Layer-boundary blockers lead the review.

### Current Layer Model

**`packages/core` - domain data, pure logic, and narrow bridges.**

Owns schemas, scene store, live transforms store, pure geometry/topology helpers, placement/collision logic, material/domain helpers, event bus, and scene registry.

Must not import `packages/viewer`, `packages/editor`, or `apps/editor`. Core systems/helpers must not depend on Three.js or R3F. The explicit exceptions are narrow interaction bridges documented by rules:

- `packages/core/src/events/**` may type interaction payloads with R3F/Three types.
- `packages/core/src/hooks/scene-registry/**` may type live `THREE.Object3D` registry entries.

Those exceptions do not permit domain logic to depend on live Three objects.

**`packages/viewer` - standalone 3D canvas and presentation state.**

Owns `<Viewer>`, renderers, viewer systems, viewer store (`useViewer`), post-processing, camera controls, and render-facing materials/geometry helpers. It must stay usable without the editor package.

Must not import `@pascal-app/editor`, `packages/editor`, `apps/editor`, `useEditor`, tools, phases, floorplan state, paint mode, editor panels, or editor UI vocabulary.

**`packages/editor` - reusable editing experience.**

Owns tools, `useEditor`, panels, floorplan, paint mode, editor selection manager, editor systems, command palette, action menus, cursor badges, keyboard shortcuts, and editor-specific overlays.

May consume public APIs from `@pascal-app/core` and `@pascal-app/viewer`, including `Viewer`, `useViewer`, viewer material helpers, and viewer control props. Editor features are injected into `<Viewer>` via props and children.

**`apps/editor` - Next.js host shell.**

Owns routes, API endpoints, app-level persistence/integration, and package composition. Reusable editor behavior should live in `packages/editor`, not in the app shell.

### Triggers That Mean "Probably Editor"

1. Would a read-only viewer or embed need this? If no, it belongs in `packages/editor`.
2. Does the name contain editor-specific vocabulary: `Floorplan`, `Paint`, `Draft`, `Marquee`, `CursorBadge`, `Tool`, `Moving`, `Curving`, `Phase`, or `StructureLayer`?
3. Does the type or field reference tool/mode/phase vocabulary: `'delete'`, `'paint-ready'`, `'material-paint'`, `'site'`, `'structure'`, `'furnish'`, `'build'`, or `'edit'`?
4. Does the helper compute something only a 2D editor view needs, such as floorplan transforms, measurement offsets, SVG path builders, or marquee bounds?
5. Does a new `useViewer` field have meaning only in the editor? If yes, it belongs in `useEditor`.

## 4. Review Checklist

### A. Layer Boundaries

- `packages/viewer/**` does not import editor package/app code and does not reference editor-only concepts.
- `packages/core/**` does not import viewer/editor/app code.
- Core bridges (`events`, `scene-registry`) stay narrow and do not pull business logic into live Three objects.
- `packages/editor/**` owns editor behavior and injects it into `<Viewer>` via props/children.
- `apps/editor/**` stays a host shell and does not become the home for reusable tools/systems.

### B. Systems, Renderers, Tools

- Renderers register objects, emit node events, and render node-level objects. Reusable derived geometry or expensive side effects belong in systems.
- Core helpers/systems own reusable domain logic that can be expressed without Three.js.
- Viewer systems own Three.js `BufferGeometry`, mesh/material mutation, cutouts, merged meshes, and render-side side effects.
- Editor systems own editor-only feedback, edit affordances, labels, paint previews, and tool-related behavior.
- Tools mutate `useScene` for committed state and `useLiveTransforms` for previews. Direct mesh transforms are allowed only under the live-drag exception in `.codex/rules/tools.md`.
- Tools may read public `useViewer` presentation state, but must not import viewer internals or place editor-only state in `useViewer`.

### C. Hook Hygiene

- Stores hold state plus setters only. Avoid business logic, side effects, async work, and expensive derived computations inside store definitions.
- Derived values belong in selectors, systems, or helpers.
- Avoid cross-store coupling inside store actions. It is usually better to coordinate from a component/system.
- New `useViewer` state must be presentation-only. Editor-only state belongs in `useEditor`.

### D. Selector Performance

- Top-level components should not subscribe to large or frequently changing slices such as `useScene((s) => s.nodes)` unless the component is intentionally a renderer/sync boundary.
- Selectors that return fresh objects or arrays each call need shallow/custom equality or a different shape.
- Prefer subscribing by ID deep in the tree over subscribing to full collections high up.
- Outliner arrays should be mutated in place, not replaced.

## 5. Output Format

Group findings by severity:

- **Blocker**: violates a rule or breaks a layer boundary. Must be fixed before merge.
- **Suggestion**: likely problem or maintainability risk worth discussing.
- **Nit**: minor and optional.

For each finding, include:

1. File and line: `path/to/file.ts:42`
2. The offending snippet, short enough to orient the author
3. The rule it violates, linked to the rule file
4. A concrete proposed fix

Skip formatting, import ordering, and anything CI already covers unless it hides a real behavior or architecture issue.

If the PR complies, say so explicitly. Do not invent nits to appear thorough.

## 6. Final Summary

End with:

- Blocker count, suggestion count, nit count
- One-sentence verdict: ready to merge / needs changes / needs discussion
- If blockers exist, list the files the author should open first
