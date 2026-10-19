# Islet

Islet is a small floating panel for the top of the Windows desktop. It keeps
the things you want close at hand without opening a full-size application:
music, calendar context, and quick tasks live in one calm, compact surface.

The current preview focuses on the visual shell:

- **Nook** shows a now-playing card and a compact week strip.
- **Tray** shows task cards and a capture action.
- The panel expands and collapses with a soft spring motion.
- `Esc` collapses the panel.
- `Ctrl+Alt+Space` toggles the panel.
- The settings control is present as the entry point for the settings view.

The media, calendar, and task content currently uses safe placeholder data so
the layout can be reviewed before the system integrations are connected.

## Start Islet

From the project folder:

```powershell
npm install
npm run dev
```

The preview opens as a floating panel at the top-center of the primary
display. Close the Electron window or stop the terminal process when you are
finished reviewing it.

To create a production build locally:

```powershell
npm run build
npm start
```

## Interaction

- Select **Nook** or **Tray** to switch views.
- Move the pointer away from the panel to collapse it.
- Press `Esc` to collapse it immediately.
- Press `Ctrl+Alt+Space` to toggle the expanded state.
- Select the circular capture button in **Tray** to add a placeholder captured
  item.

## Project shape

- `electron/` contains the desktop window, preload bridge, and shared message
  contract.
- `src/` contains the panel UI and visual styling.
- `assets/artwork/` contains artwork served through the local `islet-art://`
  scheme.

## Repository hygiene

Local dependencies, build output, editor state, logs, and environment files are
ignored. Do not commit credentials or private configuration. If a local
configuration file is needed, add a safe `.env.example` containing names only
and keep the real `.env` file untracked.

## Current status

The visual foundation is complete and committed. The next work will replace
the placeholders with Windows media, calendar, timer, clipboard, and task
integrations while preserving the same panel behavior.
