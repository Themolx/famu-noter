# FAMU Noter

VS Code extension for organizing FAMU school notes by subject. Works in VS Code, Antigravity, and other VS Code-compatible editors.

## Features

- **Sidebar tree view** — all markdown notes grouped by auto-detected subject (av, ddf, ai, etc.)
- **New Note** — pick a subject, auto-creates next numbered file (e.g. `av24.md`) with date header
- **New Subject** — create a new subject prefix + display name
- **Today's Note** — opens today's note or creates the next one for a subject
- **Search Notes** — full-text search across all notes
- **Open Note** — fuzzy quick-pick across all notes
- **Set Notes Folder** — point to any folder on disk (supports absolute paths, iCloud, etc.)

## How it works

Notes follow the naming convention `{prefix}{number}.md`:
- `av1.md`, `av2.md` → Audiovize
- `ddf1.md`, `ddf4.md` → Dejiny dokumentarniho filmu
- `ai1.md`, `ai2.md` → AI & Emergence

The extension auto-detects subjects from filenames and groups them in the sidebar.

## Commands

All available via `Cmd+Shift+P`:

| Command | Description |
|---------|-------------|
| `FAMU Noter: New Note` | Create next note for a subject |
| `FAMU Noter: New Subject` | Add a new subject with prefix + name |
| `FAMU Noter: Today's Note` | Open/create today's lecture note |
| `FAMU Noter: Open Note` | Quick-pick search across all notes |
| `FAMU Noter: Search Notes` | Full-text search in notes |
| `FAMU Noter: Set Notes Folder` | Pick notes folder with dialog |
| `FAMU Noter: Rename Subject` | Change subject display name |

## Settings

| Setting | Description |
|---------|-------------|
| `famuNoter.notesFolder` | Absolute or relative path to notes folder |
| `famuNoter.subjects` | Custom prefix → name mapping (e.g. `{"av": "Audiovize"}`) |

## Install

```bash
# VS Code
code --install-extension famu-noter-*.vsix

# Antigravity
antigravity --install-extension famu-noter-*.vsix
```

Or: Extensions panel → `...` → Install from VSIX

## Build from source

```bash
npm install
npm run compile
npm run package
```
