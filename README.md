# Obsidian Simple Timestamp Plugin

Automatically writes the current date/time into a frontmatter property every time you save a note.

## Features

- Updates a configurable frontmatter property (default: `updated`) on every file save
- Configurable date format (uses [moment.js tokens](https://momentjs.com/docs/#/displaying/format/))
- Optional "create if missing", add the property to any note automatically
- Loop-safe: will not re-trigger on its own writes


## Settings

| Setting | Default | Description |
|---|---|---|
| Property name | `updated` | The frontmatter key to update |
| Date format | `YYYY-MM-DDTHH:mm:ss` | Any [moment.js format string](https://momentjs.com/docs/#/displaying/format/) |
| Create if missing | `false` | Add the property even if it doesn't exist yet |
