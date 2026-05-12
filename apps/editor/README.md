# Pascal Editor Host App

This package is the Next.js host shell for the Pascal editor. It composes the reusable packages into an application and owns routes, API endpoints, persistence integration, and app-level wiring.

Reusable editor behavior does not belong here. Tools, panels, `useEditor`, floorplan, paint mode, command palette, and editor-specific systems live in `packages/editor`.

## Role In The Monorepo

| Layer | Path | Responsibility |
| --- | --- | --- |
| Core | `packages/core` | Scene data, schemas, stores, pure domain helpers, spatial queries. |
| Viewer | `packages/viewer` | Standalone 3D canvas, renderers, viewer systems, viewer presentation state. |
| Editor package | `packages/editor` | Reusable editing experience: tools, panels, editor systems, `useEditor`. |
| Host app | `apps/editor` | Next.js routes, API endpoints, persistence integration, package composition. |

Architecture-sensitive rules live in `.cursor/rules/*.mdc`. See `AGENTS.md` and `DOCUMENTATION-CONTRACT.md` before changing package boundaries or documented paths.

## App Entry Points

| Path | Responsibility |
| --- | --- |
| `app/page.tsx` | Local editor route that mounts `<Editor />` from `@pascal-app/editor`. |
| `app/scene/[id]/page.tsx` | Scene-specific route that loads a saved scene and passes it into the editor loader. |
| `app/scenes/page.tsx` | Scene browser route. |
| `app/api/scenes/**` | Scene persistence API routes. |
| `components/scene-loader.tsx` | Host-side bridge for loading scene data into the editor package. |
| `components/save-button.tsx` | Host-side save action UI. |

## Development

Run development from the repository root so Turbo builds and watches the packages used by the host app:

```bash
bun install
bun dev
```

The app package script starts Next.js with:

```bash
next dev --port 3002
```

If the dev output prints a different URL, use the printed URL.

## Local Commands

From this package:

```bash
bun run dev
bun run build
bun run check-types
```

From the repository root:

```bash
bun run check-types
bun run check
bun run build
```

## What Not To Put Here

Keep reusable editor code out of `apps/editor`.

- New editor tools go in `packages/editor/src/components/tools/`.
- New editor systems go in `packages/editor/src/components/systems/`.
- New editor state goes in `packages/editor/src/store/use-editor.tsx`.
- New viewer render behavior goes in `packages/viewer`.
- New pure scene/domain logic goes in `packages/core`.
