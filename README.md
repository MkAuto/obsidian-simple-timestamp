# Simple Timestamp

A lightweight plugin that keeps a "last modified" timestamp in the frontmatter of your Markdown notes. Every time a note changes, Simple Timestamp writes the current date and time to a property of your choice - no commands, no hotkeys, no manual work.

## What it does

- Watches Markdown files for modifications and stamps a frontmatter property with the current date/time.
- The property name, date format, and scope are all configurable.
- Designed to stay out of the way: it never opens dialogs during editing, never moves your cursor, and never triggers itself in a loop.

## Features

- **Configurable property**: Pick any frontmatter key (default: `updated`).
- **Configurable date format**: Any [moment.js format string](https://momentjs.com/docs/#/displaying/format/). A live preview is shown in settings.
- **Opt-in property creation**: By default the plugin only updates files that already have the property, so it doesn't add frontmatter to notes that don't want it. Enable "Create property if missing" to stamp every note.
- **Folder exclusions**: Exclude entire folders (and their subfolders) from stamping, with an autocomplete picker that suggests existing folders.
- **Template autofill**: One click reads the configuration of the core Templates plugin and the Templater community plugin (if installed) and adds their template folders to the exclusion list, so your templates aren't stamped when you edit them.
- **Cooldown**: Optional minimum interval between stamps for the same file (default: 1 minute, adjustable 0–60). Useful for noisy editors or sync-heavy vaults.
- **Excalidraw-aware**: Files produced by the Excalidraw plugin are detected (by filename or `excalidraw-plugin` frontmatter key) and skipped automatically; their bodies are JSON, not prose, and shouldn't be timestamped on every stroke.
- **Loop-safe**: The plugin tracks the modification time of its own writes and ignores the resulting `modify` event, so it never restamps itself.
- **Lifecycle-aware**: Internal bookkeeping is updated when files are renamed or deleted, so state doesn't leak across the vault's lifetime.

## Settings

| Setting | Default | Description |
|---|---|---|
| Property name | `updated` | The frontmatter key that will be written on every save. Reserved JavaScript names (`__proto__`, `constructor`, `prototype`) are rejected. |
| Date format | `YYYY/MM/DD HH:mm` | Any moment.js format string. A live preview updates as you type. |
| Create property if missing | Off | When off, only notes that already contain the property are stamped. When on, the property is added to every Markdown file on save. |
| Excluded folders | (empty) | Files inside these folders (and their subfolders) are never stamped. |
| Autofill from template plugins | - | Reads `templates.json` (core Templates) and Templater's `data.json` and merges their template folders into the exclusion list. |
| Minimum minutes between stamps | `1` | Cooldown per file. `0` disables the cooldown. |

## How it works

The plugin listens for the vault's `modify` event. When a Markdown file changes:

1. It checks whether the file is empty, inside an excluded folder, or an Excalidraw drawing - if so, it stops.
2. It checks the cooldown for that file.
3. It decides whether to stamp based on whether the property already exists (or whether "create if missing" is enabled). The metadata cache is checked first for speed, then re-verified against the file's actual frontmatter through Obsidian's `processFrontMatter` API.
4. It writes the formatted timestamp and records the resulting modification time, so the follow-up `modify` event it just triggered is recognized as its own and ignored.

All frontmatter writes go through `app.fileManager.processFrontMatter`, which is the supported Obsidian API for safely editing frontmatter without disturbing the rest of the file.

## Installation

### From the Community Plugins browser
1. Deactivate restricted mode in the Community plugins tab.
2. Search for **Simple Timestamp** in **Settings → Community plugins → Browse**. 
3. Install it, and enable it.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](../../releases).
2. Copy them into `<your vault>/.obsidian/plugins/obsidian-simple-timestamp/`.
3. Reload Obsidian and enable **Simple Timestamp** under **Settings → Community plugins**.

The build produces `main.js` at the repository root, alongside `manifest.json` and `styles.css` - the three files Obsidian needs.

## Compatibility

- Minimum Obsidian version: **1.5.0** (see `manifest.json`).
- Desktop and mobile: both supported (`isDesktopOnly: false`).

## License

MIT - see [LICENSE](LICENSE).
