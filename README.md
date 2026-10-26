# Simple Timestamp

A lightweight plugin that keeps a "last modified" timestamp in the frontmatter of your Markdown notes. Every time you edit a note, Simple Timestamp writes the current date and time to a property of your choice - no commands, no hotkeys, no manual work.

## What it does

- Watches for edits you make to Markdown notes in Obsidian's editor and stamps a frontmatter property with the current date/time.
- Ignores changes that don't come from your edits: sync between devices, `git pull`, other plugins writing to files, and link updates after a rename.
- The property name, date format, and scope are all configurable.
- Designed to stay out of the way: it never opens dialogs during editing, never moves your cursor, and never triggers itself in a loop.

## Features

- **Configurable property**: Pick any frontmatter key (default: `updated`).
- **Configurable date format**: Any [moment.js format string](https://momentjs.com/docs/#/displaying/format/). The default, `YYYY-MM-DDTHH:mm`, is the format of Obsidian's "Date & time" property type, so Properties and Dataview read it as a date. A live preview is shown in settings.
- **Opt-in property creation**: By default the plugin only updates files that already have the property, so it doesn't add frontmatter to notes that don't want it. Enable "Create property if missing" to stamp every note.
- **Folder exclusions**: Exclude entire folders (and their subfolders) from stamping. Pick a folder from the suggestions, or type a path and press Enter. Paths are case-sensitive.
- **Template autofill**: One click reads the configuration of the core Templates plugin and the Templater community plugin (if installed) and adds their template folders to the exclusion list, so your templates aren't stamped when you edit them.
- **Cooldown**: Optional minimum interval between stamps for the same file (default: 1 minute, adjustable 0–60). Useful for noisy editors or sync-heavy vaults.
- **Excalidraw-aware**: Files produced by the Excalidraw plugin are detected (by filename or `excalidraw-plugin` frontmatter key) and skipped automatically; their bodies are JSON, not prose, and shouldn't be timestamped on every stroke.
- **Loop-safe**: The plugin tracks the modification time of its own writes and ignores the resulting `modify` event, so it never restamps itself.
- **Quiet on sync**: If the property already holds the current timestamp, the file isn't rewritten, so saves within the same minute don't create extra changes for sync or git.
- **Lifecycle-aware**: Internal bookkeeping is updated when files are renamed or deleted, so state doesn't leak across the vault's lifetime.

## Settings

| Setting | Default | Description |
|---|---|---|
| Property name | `updated` | The frontmatter key that will be written whenever you edit a note. Reserved JavaScript names (`__proto__`, `constructor`, `prototype`) are rejected. |
| Date format | `YYYY-MM-DDTHH:mm` | Any moment.js format string. A live preview updates as you type. |
| Create property if missing | Off | When off, only notes that already contain the property are stamped. When on, the property is added to every Markdown file you edit. |
| Excluded folders | (empty) | Files inside these folders (and their subfolders) are never stamped. Paths are case-sensitive. |
| Autofill from template plugins | - | Reads `templates.json` (core Templates) and Templater's `data.json` and merges their template folders into the exclusion list. |
| Minimum minutes between stamps | `1` | Cooldown per file. `0` disables the cooldown. |

## How it works

The plugin listens for the workspace's `editor-change` event and the vault's `modify` event:

1. When an editor changes a note, the note is marked as edited - but only if the editor content now differs from the file on disk. Obsidian also fires `editor-change` when it reloads an open note after an outside write, and those reloads don't count.
2. When a marked note is saved (the `modify` event), the mark is consumed. A `modify` event for a note without a mark - sync, git, another plugin - is ignored.
3. It checks whether the file is empty, inside an excluded folder, or an Excalidraw drawing - if so, it stops.
4. It checks the cooldown for that file.
5. It decides whether to stamp based on whether the property already exists (or whether "create if missing" is enabled), and skips the write if the property already holds the current timestamp. The metadata cache is checked first for speed, then re-verified against the file's actual frontmatter through Obsidian's `processFrontMatter` API.
6. It writes the formatted timestamp and records the resulting modification time, so the follow-up `modify` event it just triggered is recognized as its own and ignored.

All frontmatter writes go through `app.fileManager.processFrontMatter`, which is the supported Obsidian API for safely editing frontmatter without disturbing the rest of the file.

Because only editor changes count, edits made without an editor - for example in the File properties sidebar or a Bases table - don't update the timestamp. Editing properties inside the note itself does.

## Installation

### From the Community Plugins browser
1. Deactivate restricted mode in the Community plugins tab.
2. Search for **Simple Timestamp** in **Settings → Community plugins → Browse**. 
3. Install it, and enable it.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](../../releases).
2. Copy them into `<your vault>/.obsidian/plugins/simple-timestamp/`.
3. Reload Obsidian and enable **Simple Timestamp** under **Settings → Community plugins**.

The build produces `main.js` at the repository root, alongside `manifest.json` and `styles.css` - the three files Obsidian needs.

## Releasing

Push a tag that matches the `version` in `manifest.json` exactly (for example `1.1.0`, no `v` prefix). The release workflow builds the plugin and creates a draft GitHub release with `main.js`, `manifest.json`, and `styles.css` attached; publish the draft once you've checked it.

## Compatibility

- Minimum Obsidian version: **1.5.0** (see `manifest.json`).
- Desktop and mobile: both supported (`isDesktopOnly: false`).

## License

MIT - see [LICENSE](LICENSE).
