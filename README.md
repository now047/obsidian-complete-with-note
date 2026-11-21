# Complete with Note

[日本語版 README](README.ja.md)

A small Obsidian plugin. When you complete a task, you can **type a short note and have it written into the task line as it is completed**.

- Run: `- [x] Jog 4.23 km / 31 min 🔁 every day when done 🛫 2026-11-18 ✅ 2026-11-21`
- Reading: `- [x] Reading 30 min "The Wise Book" 🔁 every day when done ✅ 2026-11-21`
- Small win: `- [x] Small win: posted to my journal 🔁 every day when done ✅ 2026-11-21`

The note goes **only into the completed line** and never leaks into the next occurrence of a recurring task. Completion itself (adding ✅ and generating the next occurrence) is **delegated to the Tasks plugin's official API (apiV1)**, so recurrence rules are handled exactly according to your Tasks settings.

## Usage

### 1. Directly in Tasks lists (the main way)

Clicking a checkbox in a Tasks plugin query result (```tasks blocks in a Todos note or Daily Notes) or in Reading View opens the note modal. The display is exactly the Tasks format; only the completion action is intercepted.

- Only the **TODO → done direction** is intercepted. Un-checking and in-progress statuses pass through to the Tasks plugin.
- By default, the modal opens only for tasks that have a note format (a template, described below); other tasks complete normally without a note. This can be changed to "All tasks" in the settings, and the hook can be disabled entirely.
- If the source task cannot be identified, the click is processed as a normal click (it never produces a broken completion).
- Applies to query results and Reading View. **Checkboxes in the note body in Live Preview are not covered.**

### 2. Editor command

1. In the source note, place the cursor on an incomplete task line
2. Run "Complete with Note: Complete with note" from the command palette (assigning a hotkey is recommended)
3. Type the note in the modal and press Enter (completing with the fields left empty is fine)

## API (for DataviewJS and other plugins)

Other plugins and DataviewJS can open the note modal and complete a task through the public API.

```ts
const plugin = app.plugins.plugins['complete-with-note'];
plugin.completeWithNote(path, lineNumber, expectedText?);
```

| Argument | Type | Description |
|---|---|---|
| `path` | `string` | Vault-relative path of the file containing the task |
| `lineNumber` | `number` | Line number of the task line (0-based) |
| `expectedText` | `string` (optional) | Line verification. When given, the first 20 characters (trimmed) must be contained in the target line; otherwise the call aborts |

- Returns `Promise<void>`. The modal opens; on submit, the note is written and the task is completed in the source file.
- If the file is not found, the target line is not an incomplete task (`- [ ]`), or `expectedText` does not match, a notice is shown and nothing happens.

## Input templates

The modal's input fields are defined by templates. Each `{name}` becomes one input field; literal text (units etc.) is written as-is.

### In the task line (recommended)

```
- [ ] Jog {km} km / {minutes} min 🔁 every day when done 🛫 2026-11-18
```

- **Place it right after the task name, before the fields (🔁 📅 🛫 …)**. A `{…}` written after a date field is not treated as a template, because text after date fields can make the task invisible to Dataview/Tasks queries.
- In the completed line, the template is replaced in place by the entered values (nothing is written after the date fields).
- For recurring tasks, the template stays on the next occurrence (it is the definition).
- The template is also removed from the completed line when you complete with empty fields.
- An inline template takes precedence over settings templates, so each task can have its own format without managing keywords in the settings.

### In the settings

Edited in the plugin settings, one per line, in the form "Name | Keywords | Template | Position" (position optional):

```
Run | Jog, Long Jog, Running | {km} km / {minutes} min
Reading | Reading | {minutes} min {title}
Free |  | {note}
```

- The template whose keyword appears in the task name is selected automatically (you can also switch with the chips in the modal).
- A line without keywords is the default (fallback). If there is none, a single free-text field (`{note}`) is used.
- If the same `{name}` appears more than once, there is one input field and the value is reflected in every occurrence.
- Position is `end` (default: after the ✅ date, i.e. the end of the line) or `title` (right after the task name). With `title`, the note goes before the Tasks fields (📅 ⏳ 🛫 🔁 …).
- The preview at the bottom of the modal shows the task name as it will look with the note applied.

## Settings

- **Templates**: the "Name | Keywords | Template | Position" form described above
- **Hook checkboxes in Tasks lists**: on/off
- **Hook scope**: "Only tasks with a template" (default) / "All tasks"
- **Debug notices**: show the hook decision process as notices (for troubleshooting; normally off)

## Languages

The UI follows Obsidian's display language: Japanese when the app is in Japanese, English otherwise. There is no language setting in the plugin.

## Requirements

- Obsidian 1.5 or later
- Tasks plugin **7.2.0 or later** (the version with the API)
  - If it is not found, the plugin falls back to a simple completion (`[x]` + ✅ only, no recurrence handling) and notifies you

## Installation

1. Download `main.js` and `manifest.json` from [Releases](https://github.com/now047/obsidian-complete-with-note/releases)
2. Put them into your vault's `.obsidian/plugins/complete-with-note/` folder (create the folder if needed)
3. Enable "Complete with Note" under Settings → Community plugins

## Development

- Source: `src/main.ts` (the plugin), `src/lineEdit.ts` (pure line-editing logic), `src/template.ts` (template handling), `src/i18n.ts` (display-language detection and string table)
- `npm run build` produces `dist/complete-with-note/main.js`
- `npm test` runs the unit tests (48 cases): `test/lineEdit.test.mjs` and `test/template.test.mjs`

## License

MIT
