# Documentation Contract Drift Protocol

Status: draft protocol, updated by the Pascal pilot scan and first docs repair
on 2026-05-12.

This document defines how this repository should keep human docs, agent
instructions, rules, skills, and real code structure aligned over time. It is a
process document, not the architecture source of truth.

## Goal

Prevent documentation contract drift:

- docs describe paths that no longer exist
- docs describe package responsibilities that moved
- agent instructions duplicate stale architecture facts
- skills preserve old rules after the codebase changes
- compatibility rule files stop pointing at the canonical rules
- setup commands or ports fall behind the real scripts

The goal is not to rewrite docs for style. The goal is to keep facts, ownership,
entry points, and implementation paths accurate.

## Source Of Truth

Every architecture-sensitive project needs one canonical source of truth.

For Pascal, the canonical architecture rules are:

- `.cursor/rules/*.mdc`

Compatibility files may expose those rules for other assistants:

- `.codex/rules/*.md`
- `.claude/rules/*.md`

Those compatibility files should point to `.cursor/rules/*.mdc`; they should
not fork or restate the full rules.

Other files may summarize the architecture, but they must not become competing
architecture sources:

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- package README files
- `.codex/skills/*/SKILL.md`
- `.agents/skills/*/SKILL.md`

If a summary conflicts with `.cursor/rules/*.mdc`, treat the summary as stale
until proven otherwise.

## Document Responsibilities

Use a narrow responsibility for each document type.

| File or folder | Responsibility | Should avoid |
| --- | --- | --- |
| `README.md` | Human-facing overview, technology stack, setup commands, major package map, common entry points. | Detailed architecture rules that can drift from `.cursor/rules`. |
| package `README.md` files | Package-local usage and package-local entry points. | Repeating old root architecture maps without verification. |
| `AGENTS.md` | Agent entrypoint: what rules to read, where truth lives, review expectations. | Long duplicated architecture descriptions. |
| `CLAUDE.md` | Claude-compatible pointer into the agent instructions. | Independent rule content. |
| `.cursor/rules/*.mdc` | Canonical architecture rules and package boundaries. | Human onboarding prose that belongs in README. |
| `.codex/rules/*.md` | Codex-compatible pointers to canonical Cursor rules. | Forked rule copies. |
| `.claude/rules/*.md` | Claude-compatible pointers to canonical Cursor rules. | Forked rule copies. |
| `.codex/skills/*` and `.agents/skills/*` | Operational workflows: how to review, scan, or execute. | Redefining architecture facts instead of loading rules. |

## Drift Types

Classify drift before fixing it.

| Type | Description | Example |
| --- | --- | --- |
| Path drift | A documented path no longer matches the repository. | `apps/editor/components/tools` when tools live in `packages/editor/src/components/tools`. |
| Layer drift | A documented package model no longer matches real package ownership. | Describing editor behavior as owned by `apps/editor` after it moved to `packages/editor`. |
| Responsibility drift | A documented responsibility moved to another layer. | Saying core systems generate Three.js geometry after viewer systems took that job. |
| Command drift | Setup, dev, build, test, or port instructions no longer match scripts. | README says `pnpm dev` or port `3000` while the repo uses Bun and the app script uses port `3002`. |
| Source-of-truth drift | A file duplicates canonical rules and falls behind. | A skill copies old layer rules instead of loading `.cursor/rules`. |
| Compatibility drift | Assistant-specific rule files stop pointing at canonical rules. | `.codex/rules/tools.md` contains a full stale rule copy instead of a pointer. |
| Scope drift | A document accumulates details outside its role. | `AGENTS.md` becomes a second README and a second architecture spec. |
| Terminology drift | The same concept is named inconsistently across docs and code. | `editor app`, `editor package`, and `host app` used interchangeably. |

## Check Workflow

Use this order for a documentation contract check.

1. Check working tree state.
   - Run `git status --short`.
   - Note unrelated changes before editing.

2. Locate contract files.
   - Root instructions: `AGENTS.md`, `CLAUDE.md`.
   - Human docs: root and package `README.md` files.
   - Canonical rules: `.cursor/rules/*.mdc`.
   - Compatibility rules: `.codex/rules/*.md`, `.claude/rules/*.md`.
   - Project skills: `.codex/skills/*/SKILL.md`, `.agents/skills/*/SKILL.md`.

3. Identify the canonical source of truth.
   - For Pascal, use `.cursor/rules/*.mdc`.
   - Follow pointer files before trusting their content.

4. Build the real code map.
   - Read root workspace config and package manifests.
   - List `apps/*` and `packages/*`.
   - Read public exports and main entry points.
   - Sample real implementation paths for tools, stores, systems, and renderers.

5. Compare docs against code.
   - Paths.
   - Package ownership.
   - Commands and ports.
   - Runtime and framework versions.
   - Layer boundaries and import direction.
   - Skill and rule references.

6. Classify findings.
   - Must fix: factual contradiction with real code or canonical rules.
   - Should fix: wording likely to mislead future work.
   - Leave alone: style, tone, or harmless simplification.

7. Repair with minimum edits.
   - Fix confirmed facts first.
   - Prefer references to canonical rules over duplicated rule text.
   - Do not rewrite unrelated prose.
   - Do not change business code during a docs-contract repair unless the drift
     proves the code is wrong.

8. Feed the learning back.
   - Stable judgment workflow -> skill.
   - Deterministic path or pointer checks -> script or hook.
   - Pascal-specific architecture rule -> `.cursor/rules`.
   - Human onboarding correction -> README.
   - Agent entry correction -> `AGENTS.md`.

## Repair Rules

Follow these constraints during a repair:

- Keep the change set narrow.
- Fix facts, not style preferences.
- Do not create another source of truth.
- Replace duplicated architecture rules with links or pointers when possible.
- If a document needs a summary, mark which canonical source it summarizes.
- Keep project-specific findings in the project; only promote reusable workflow
  rules to a user-level skill.
- Separate repo documentation changes from user-level skill changes unless the
  user asks to combine them.

## Pascal Pilot Scan

This section records what the first scan of this repository taught the
protocol. It should be updated after each pilot pass until the process is
stable.

### Scan Inputs

Read during the pilot:

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `apps/editor/README.md`
- root `package.json`
- `turbo.json`
- `apps/editor/package.json`
- `packages/editor/package.json`
- `.cursor/rules/tools.mdc`
- `.cursor/rules/systems.mdc`
- `.cursor/rules/viewer-isolation.mdc`
- `.codex/rules/tools.md`
- `.claude/rules/tools.md`
- `.codex/skills/review-architecture/SKILL.md`
- `.claude/skills/review-architecture/SKILL.md`

Sampled implementation paths:

- `apps/editor/app/page.tsx`
- `packages/editor/src/components/editor/index.tsx`
- `packages/editor/src/components/tools/tool-manager.tsx`
- `packages/viewer/src/components/viewer/index.tsx`
- `packages/core/src/store/use-scene.ts`
- `packages/viewer/src/store/use-viewer.ts`
- `packages/editor/src/store/use-editor.tsx`

### Current Truth Model

The current Pascal architecture is a four-layer model:

| Layer | Owner | Primary role |
| --- | --- | --- |
| Core | `packages/core` | Scene schema, scene store, pure domain helpers, spatial queries, narrow event/registry bridges. |
| Viewer | `packages/viewer` | Standalone 3D canvas, renderers, viewer systems, viewer presentation state. |
| Editor package | `packages/editor` | Reusable editor experience: tools, panels, editor systems, `useEditor`, floorplan, paint mode. |
| Host app | `apps/editor` | Next.js routes, API endpoints, persistence integration, package composition. |

The most reliable current source for this model is `.cursor/rules/*.mdc`,
especially:

- `.cursor/rules/tools.mdc`
- `.cursor/rules/systems.mdc`
- `.cursor/rules/viewer-isolation.mdc`

### Confirmed Drift

Must-fix drift found in this pilot:

1. `AGENTS.md` still says editor tools live in
   `apps/editor/components/tools/`.
   - Current truth: `packages/editor/src/components/tools/`.
   - Source: `.cursor/rules/tools.mdc` and real files.

2. `AGENTS.md` still describes `apps/editor` as owning reusable editing
   behavior such as tools, `useEditor`, floorplan helpers, paint mode, and
   overlays.
   - Current truth: reusable editor behavior lives in `packages/editor`;
     `apps/editor` is the host shell.

3. Root `README.md` describes only three main packages and omits
   `@pascal-app/editor`.
   - Current truth: the main product model is core, viewer, editor package,
     and host app.

4. Root `README.md` says `apps/editor` owns tools and editor-specific systems.
   - Current truth: tools and editor-specific systems live in
     `packages/editor/src`.

5. Root `README.md` says core systems generate geometry.
   - Current truth: core owns pure domain helpers; viewer systems own
     Three.js `BufferGeometry`, mesh/material mutation, cutouts, and render
     side effects.

6. Root `README.md` key files include stale paths:
   - `apps/editor/components/tools/`
   - `apps/editor/store/`
   - `packages/core/src/hooks/use-scene.ts`

7. `apps/editor/README.md` is more stale than root `README.md`.
   - It says React 19 + Next.js 15 while `apps/editor/package.json` uses
     Next.js 16.2.1.
   - It says `pnpm install` / `pnpm dev` while the root package manager is
     Bun.
   - It repeats old `apps/editor` ownership and stale key paths.

8. Root `README.md` says to open `http://localhost:3000`, while
   `apps/editor/package.json` starts Next on port `3002`.
   - The correct user-facing port should be verified by running `bun dev`
     before editing the README, because Turbo/dev composition may affect the
     final visible URL.

9. `.claude/skills/review-architecture/SKILL.md` preserved the old
   `apps/editor/components/tools/` path and the old three-layer review model.
   - Current truth: Claude and Codex review skills should both classify the
     four layers and follow pointer rules to `.cursor/rules/*.mdc`.

Healthy contract points found:

1. `.codex/rules/tools.md` points to `../../.cursor/rules/tools.mdc`.
2. `.claude/rules/tools.md` points to `../../.cursor/rules/tools.mdc`.
3. `CLAUDE.md` points to `AGENTS.md`.
4. `.codex/skills/review-architecture/SKILL.md` uses the current four-layer
   model and teaches Codex to follow pointer rule files.

### Protocol Updates From The Pilot

The pilot changed the protocol in these ways:

1. Always include package README files in a contract scan, not only root
   README files.
2. Treat setup commands and dev ports as contract facts, not incidental docs.
3. Check package manifests before trusting technology stack claims.
4. Check skills for architecture facts, but prefer skills that load canonical
   rules over skills that duplicate them.
5. Track "host app vs reusable package" drift as a first-class layer drift
   category.

### First Repair Scope Applied

The first repair was a narrow docs-only change:

- `AGENTS.md`
- `README.md`
- `apps/editor/README.md`
- `.claude/skills/review-architecture/SKILL.md`

It aligned agent instructions and human docs with the current four-layer model:

- `packages/core`
- `packages/viewer`
- `packages/editor`
- `apps/editor`

It also replaced stale paths such as `apps/editor/components/tools` and
`apps/editor/store` with their current `packages/editor/src/...` locations.
The Claude architecture review skill was aligned with the current four-layer
review model.

Business code was not changed.

Do not change `.cursor/rules/*.mdc` unless a future scan finds the canonical
rules themselves are stale.

Do not change user-level skills in the same commit unless explicitly requested.

### Candidate Automation

These checks are deterministic enough to become a script or hook later:

- Flag `apps/editor/components/tools`.
- Flag `apps/editor/store`.
- Flag `packages/core/src/hooks/use-scene.ts`.
- Flag `pnpm install` or `pnpm dev` in Pascal docs unless intentionally
  supported again.
- Verify `.codex/rules/*.md` and `.claude/rules/*.md` contain pointers to
  `.cursor/rules/*.mdc`.
- Verify package README files are included in drift scans.

These checks should stay in a skill or review checklist for now:

- Whether a summary duplicates too much of a canonical rule.
- Whether layer wording is misleading but not strictly false.
- Whether a responsibility belongs in core, viewer, editor package, or host app.
