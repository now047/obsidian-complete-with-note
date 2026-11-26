/**
 * Append a short note to a task line, right after the task description
 * and before any Tasks-plugin fields (📅 ⏳ 🛫 ✅ 🔁 priorities, ...).
 *
 * Pure function — no Obsidian dependencies — so it can be unit-tested.
 */

// Emoji/symbol markers that start a Tasks-plugin field.
const FIELD_MARKERS = [
  '📅', '⏳', '🛫', '✅', '❌', '➕', '🔁',
  '⏫', '🔼', '🔽', '⏬', '🆔', '⛔', '🏁', '⏰',
];

/**
 * Task lines may live inside a blockquote or callout, where the line
 * carries one or more `>` markers before the list marker:
 *   > - [ ] task inside a [!todo] callout
 * Dataview and the Tasks plugin both index such tasks, so every
 * task-line test in this plugin tolerates the quote prefix.
 */
export const UNCHECKED_TASK_LINE_RE = /^\s*(?:>\s*)*- \[ \]/;
export const COMPLETED_TASK_LINE_RE = /^\s*(?:>\s*)*- \[x\]/i;
const ANY_TASK_LINE_RE = /^\s*(?:>\s*)*- \[[ xX/-]\]\s*/;

export function appendNoteToTaskLine(line: string, note: string): string {
  const text = note.trim();
  if (!text) return line;

  const trimmed = line.replace(/\s+$/, '');
  let cut = trimmed.length;

  for (const marker of FIELD_MARKERS) {
    const idx = trimmed.indexOf(marker);
    if (idx !== -1 && idx < cut) cut = idx;
  }

  // Dataview inline field: " [key:: value]" — but not a wikilink "[[...]]".
  const dvMatch = trimmed.search(/ \[(?!\[)[^\]\n]*::/);
  if (dvMatch !== -1 && dvMatch < cut) cut = dvMatch;

  const head = trimmed.slice(0, cut).replace(/\s+$/, '');
  const tail = trimmed.slice(cut).replace(/^\s+/, '');
  return tail ? `${head} ${text} ${tail}` : `${head} ${text}`;
}

/**
 * Extract the human-readable description head of a task line
 * (checkbox + description, without the Tasks fields). Used for the
 * modal title and for fuzzy verification of a line coming from Dataview.
 */
export function taskDescriptionHead(line: string): string {
  const withoutBox = line.replace(ANY_TASK_LINE_RE, '');
  let cut = withoutBox.length;
  for (const marker of FIELD_MARKERS) {
    const idx = withoutBox.indexOf(marker);
    if (idx !== -1 && idx < cut) cut = idx;
  }
  const dvMatch = withoutBox.search(/ \[(?!\[)[^\]\n]*::/);
  if (dvMatch !== -1 && dvMatch < cut) cut = dvMatch;
  return withoutBox.slice(0, cut).trim();
}

/**
 * Append a note at the very end of a completed task line — after the
 * ✅ done date. This matches the established record format, e.g.
 *   - [x] Jog 🔁 every day when done 📅 2026-11-17 ✅ 2026-11-17 4.23 km / 31 min
 */
export function appendNoteToCompletedLine(line: string, note: string): string {
  const text = note.trim();
  if (!text) return line;
  return line.replace(/\s+$/, '') + ' ' + text;
}

export interface InlineTemplate {
  template: string;
  start: number;
  end: number;
}

/**
 * Find a template written inside the task line itself, e.g.
 *   - [ ] Jog {km} / {minutes} min 🔁 every day when done 🛫 2026-11-18
 *
 * The template must live in the description head — right after the
 * task name, BEFORE the first Tasks field. Text written after the
 * date fields breaks task pickup in Dataview/Tasks queries, so
 * braces appearing after a field are plain text, not a template.
 * The span runs from the first `{placeholder}` to the end of the head.
 */
export function extractInlineTemplate(line: string): InlineTemplate | null {
  let headEnd = line.length;
  for (const marker of FIELD_MARKERS) {
    const idx = line.indexOf(marker);
    if (idx !== -1 && idx < headEnd) headEnd = idx;
  }
  const dv = line.search(/ \[(?!\[)[^\]\n]*::/);
  if (dv !== -1 && dv < headEnd) headEnd = dv;
  const head = line.slice(0, headEnd);
  const m = head.match(/\{[^{}]+\}/);
  if (!m || m.index === undefined) return null;
  const template = head.slice(m.index).trim();
  if (!template) return null;
  return { template, start: m.index, end: headEnd };
}

/**
 * Replace the inline template in place with the composed record
 * (or remove it when the record is empty), tidying spaces.
 * Nothing is ever written after the date fields.
 */
export function replaceInlineTemplate(line: string, note: string): string {
  const inline = extractInlineTemplate(line);
  if (!inline) return line;
  const text = note.trim();
  const before = line.slice(0, inline.start);
  const after = line.slice(inline.end);
  const joined = text ? `${before}${text} ${after}` : `${before} ${after}`;
  return joined.replace(/ {2,}/g, ' ').replace(/\s+$/, '');
}

/** Remove the inline template (if any) from a line, tidying spaces. */
export function removeInlineTemplate(line: string): string {
  return replaceInlineTemplate(line, '');
}

/**
 * Finish a completed line. With an inline template, the record
 * replaces the template in place (after the task name). Without one,
 * the record is appended at the end, after the ✅ date.
 */
export function finalizeCompletedLine(line: string, note: string): string {
  if (extractInlineTemplate(line)) return replaceInlineTemplate(line, note);
  return appendNoteToCompletedLine(line, note);
}

/**
 * Normalize a task description for fuzzy comparison between the
 * markdown source and the rendered (plain-text) description shown by
 * the Tasks plugin: wikilinks collapse to their alias/target name,
 * markdown links to their text.
 */
export function normalizeHeadForMatch(text: string): string {
  return text
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, (_all, target: string) => {
      const base = target.split('/').pop() ?? target;
      return base.replace(/\.md$/i, '');
    })
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Locate the source line of a task rendered by the Tasks plugin.
 *
 * The rendered element's data-line is NOT a source line number in
 * query results: Tasks' TaskLineRenderer sets it to the task's index
 * within the rendered list (verified in the Tasks source). Only in
 * Reading view does it happen to be the source line. So the whole
 * file is scanned: a candidate must be an unchecked task line whose
 * normalized description head matches the rendered description, and
 * whose text contains every rendered field text (dates, recurrence…)
 * — the fields disambiguate repeated descriptions. Among matches,
 * the one nearest `hintLine` wins. Returns -1 when nothing matches.
 */
export function findTaskLine(
  lines: string[],
  hintLine: number,
  renderedDesc: string,
  fieldTexts: string[] = [],
): number {
  const wanted = normalizeHeadForMatch(renderedDesc).slice(0, 16);
  const fields = fieldTexts
    .map((t) => normalizeHeadForMatch(t))
    .filter((t) => t.length > 0);
  const matches: number[] = [];
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (!UNCHECKED_TASK_LINE_RE.test(line)) continue;
    if (wanted) {
      const head = normalizeHeadForMatch(taskDescriptionHead(line));
      if (!(head.startsWith(wanted) || wanted.startsWith(head.slice(0, 16)))) {
        continue;
      }
    }
    if (fields.length > 0) {
      const normalizedLine = normalizeHeadForMatch(line);
      if (!fields.every((f) => normalizedLine.includes(f))) continue;
    }
    matches.push(idx);
  }
  if (matches.length === 0) return -1;
  let best = matches[0];
  for (const idx of matches) {
    if (Math.abs(idx - hintLine) < Math.abs(best - hintLine)) best = idx;
  }
  return best;
}

/**
 * Apply the note to the result of toggling a task line.
 *
 * The toggle result may contain two lines (the completed instance and
 * the next occurrence of a recurring task). The note is a record of
 * THIS completion, so it goes only onto the completed (`- [x]`) line;
 * the next occurrence must stay clean.
 *
 * position 'end'   -> after the ✅ date (established record format)
 * position 'title' -> right after the task description
 */
export function applyNoteToToggledResult(
  toggled: string,
  note: string,
  position: 'end' | 'title',
): string {
  const text = note.trim();
  const lines = toggled.split('\n');
  const idx = lines.findIndex((l) => COMPLETED_TASK_LINE_RE.test(l));
  if (idx === -1) return toggled;
  if (extractInlineTemplate(lines[idx])) {
    // Inline template: the record replaces the definition in place,
    // right after the task name — never after the date fields.
    lines[idx] = replaceInlineTemplate(lines[idx], text);
  } else if (position === 'title') {
    lines[idx] = text
      ? appendNoteToTaskLine(lines[idx], text)
      : lines[idx];
  } else {
    lines[idx] = finalizeCompletedLine(lines[idx], text);
  }
  return lines.join('\n');
}
