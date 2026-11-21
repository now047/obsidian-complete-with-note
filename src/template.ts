/**
 * Template support for the note text.
 *
 * A template is a string with {placeholders}, e.g. "{km}km {minutes}分".
 * Each placeholder becomes one input field in the modal; the composed
 * note is the template with the entered values substituted.
 *
 * Template definitions are edited in the plugin settings, one per line:
 *   name | keyword1, keyword2 | template [| position]
 * The first definition whose keyword appears in the task description is
 * auto-selected. A definition with no keywords is the fallback.
 * position is 'end' (default: append after the ✅ date on the completed
 * line) or 'title' (append right after the task description).
 *
 * Pure functions — no Obsidian dependencies — so they can be unit-tested.
 */

export interface TemplateDef {
  name: string;
  keywords: string[];
  template: string;
  position: 'end' | 'title';
}

export const DEFAULT_TEMPLATES_RAW = [
  '# 名前 | キーワード（カンマ区切り） | テンプレート | 位置（end=✅の後ろ・省略可）',
  'ラン | Jog, Long Jog, ランニング | {km} km / {minutes} min',
  '読書 | 読書 | {minutes}分 {title}',
  '自由 |  | {note}',
].join('\n');

export const DEFAULT_TEMPLATES_RAW_EN = [
  '# Name | Keywords (comma-separated) | Template | Position (end = after the ✅ date; optional)',
  'Run | Jog, Long Jog, Running | {km} km / {minutes} min',
  'Reading | Reading | {minutes} min {title}',
  'Free |  | {note}',
].join('\n');

export function parseTemplateDefs(raw: string): TemplateDef[] {
  const defs: TemplateDef[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const first = trimmed.indexOf('|');
    if (first === -1) continue;
    const second = trimmed.indexOf('|', first + 1);
    if (second === -1) continue;
    const name = trimmed.slice(0, first).trim();
    const keywords = trimmed
      .slice(first + 1, second)
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    const rest = trimmed.slice(second + 1);
    const third = rest.indexOf('|');
    const template = (third === -1 ? rest : rest.slice(0, third)).trim();
    const posRaw = third === -1 ? '' : rest.slice(third + 1).trim();
    const position: 'end' | 'title' = posRaw === 'title' ? 'title' : 'end';
    if (!name || !template) continue;
    defs.push({ name, keywords, template, position });
  }
  return defs;
}

/** Placeholder names in order of appearance, deduplicated. */
export function placeholdersOf(template: string): string[] {
  const names: string[] = [];
  const re = /\{([^{}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    const name = m[1].trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/** Substitute values into the template and tidy up whitespace. */
export function composeNote(
  template: string,
  values: Record<string, string>,
): string {
  const replaced = template.replace(/\{([^{}]+)\}/g, (_all, name: string) => {
    return (values[name.trim()] ?? '').trim();
  });
  return replaced.replace(/\s+/g, ' ').trim();
}

/**
 * Pick the template for a task description: the first definition with a
 * matching keyword; otherwise the keyword-less fallback; otherwise the
 * first definition.
 */
export function selectTemplate(
  defs: TemplateDef[],
  description: string,
): TemplateDef | null {
  if (defs.length === 0) return null;
  for (const def of defs) {
    if (def.keywords.some((k) => description.includes(k))) return def;
  }
  const fallback = defs.find((d) => d.keywords.length === 0);
  return fallback ?? defs[0];
}
