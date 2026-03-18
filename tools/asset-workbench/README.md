# Glenmoor Asset Workbench

Standalone desktop-first inspection tool for Glenmoor art assets.

## Purpose

- Inspect sprite sheets, portraits, terrain tiles, overlays, and VFX sheets.
- Compare generated and purchased assets against the Glenmoor runtime contract.
- Persist review state, notes, checklist completion, and reference mappings into `.asset-workbench/workspace.json` inside the opened workspace.

## Usage

From the repository root:

```bash
npm install
npm run asset-workbench:dev
```

Build the tool:

```bash
npm run asset-workbench:build
```

Preview the production build:

```bash
npm run asset-workbench:preview
```

## Notes

- The app is desktop-first and expects a Chromium browser with File System Access API support.
- Workspace scanning ignores `.git`, `node_modules`, `dist`, `.asset-workbench`, and `output/web-game`.
- The validation contract is defined in `src/contracts/glenmoor.ts` and mirrors the current project asset spec.
