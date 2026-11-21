import { moment } from 'obsidian';
import { DEFAULT_TEMPLATES_RAW, DEFAULT_TEMPLATES_RAW_EN } from './template';

/**
 * 表示言語の判定と文言テーブル / display-language detection + string table
 * Obsidian の表示言語（moment ロケール）に合わせて日本語／英語を選ぶ。
 * プラグイン側に言語設定は持たない（アプリに追随する）。
 * Pick Japanese or English from Obsidian's UI language (moment
 * locale); fall back to English. There is no plugin-side language
 * setting on purpose — the plugin follows the app, like built-in UI.
 * (Approach follows the Task Gantt plugin's i18n.)
 */
export interface Strings {
  modalTitle: string;
  modalHint: string;
  okButton: string;
  cancelButton: string;
  previewPrefix: string;
  inlineTemplateName: string;
  settingsIntro: string;
  templatesName: string;
  hookName: string;
  hookDesc: string;
  scopeName: string;
  scopeDesc: string;
  scopeTemplated: string;
  scopeAll: string;
  debugName: string;
  debugDesc: string;
  commandName: string;
  fallbackTemplateName: string;
  noticePlaceCursor: string;
  noticeFileNotFoundPrefix: string;
  noticeTaskLineNotFound: string;
  noticeTaskChanged: string;
  noticeFileChanged: string;
  noticeLineNotIdentified: string;
  noticeTasksApiMissing: string;
  dbgOutsideList: string;
  dbgQueryResult: string;
  dbgReadingView: string;
  dbgPassThroughStatus: (status: string) => string;
  dbgBacklinkNone: string;
  dbgFileUnresolved: string;
  dbgHookStart: string;
  dbgLineIdentified: (line: number) => string;
}

const ja: Strings = {
  modalTitle: '追記して完了',
  modalHint:
    '追記は完了した行にだけ入ります（繰り返しの次回分には入りません）。空欄のまま完了もできます。',
  okButton: '追記して完了',
  cancelButton: 'キャンセル',
  previewPrefix: 'プレビュー: ',
  inlineTemplateName: 'タスク内テンプレート',
  settingsIntro:
    '入力テンプレートを1行に1つ、「名前 | キーワード | テンプレート」の形式で書きます。タスク名にキーワードが含まれるテンプレートが自動で選ばれます。キーワードなしの行が既定（フォールバック）です。タスク行自体に {km} のようなテンプレートが書かれている場合は、そちらが優先されます。',
  templatesName: 'テンプレート',
  hookName: 'Tasksの一覧でチェックボックスをフック',
  hookDesc:
    'Tasksプラグインのクエリ結果や閲覧ビューでチェックボックスをクリックしたとき、通常の完了の代わりに記録モーダルを開きます（完了方向のみ。チェックを外す操作は通常どおり）。元のタスクを特定できない場合は通常のクリックとして処理されます。',
  scopeName: 'フックする対象',
  scopeDesc:
    '「テンプレートのあるタスクのみ」では、タスク内テンプレートかキーワード一致する設定テンプレートがあるタスクだけモーダルを開き、それ以外は記録なしで通常完了します。',
  scopeTemplated: 'テンプレートのあるタスクのみ',
  scopeAll: 'すべてのタスク',
  debugName: 'デバッグ通知',
  debugDesc:
    'フックの判定過程を通知で表示します（トラブル調査用。通常はオフ）。',
  commandName: '追記して完了',
  fallbackTemplateName: '自由',
  noticePlaceCursor: '未完了のタスク行にカーソルを置いてください',
  noticeFileNotFoundPrefix: 'ファイルが見つかりません: ',
  noticeTaskLineNotFound:
    '対象のタスク行が見つかりません（完了済みか、行がずれています）',
  noticeTaskChanged: 'タスクの内容が変わっているため中止しました',
  noticeFileChanged: 'ファイルが変更されていたため中止しました',
  noticeLineNotIdentified: '対象のタスク行を特定できませんでした',
  noticeTasksApiMissing:
    'TasksプラグインのAPIが見つからないため、簡易完了にしました（繰り返しは処理されません）',
  dbgOutsideList: '対象リスト外',
  dbgQueryResult: 'クエリ結果',
  dbgReadingView: '閲覧ビュー',
  dbgPassThroughStatus: (status) => 'status=' + status + ' のため素通し',
  dbgBacklinkNone: 'なし',
  dbgFileUnresolved: 'ファイルを特定できず素通し',
  dbgHookStart: '横取りして処理開始',
  dbgLineIdentified: (line) => '行を特定: ' + line + '行目',
};

const en: Strings = {
  modalTitle: 'Complete with Note',
  modalHint:
    'The note is added only to the completed line (not to the next occurrence of a recurring task). You can also complete with the fields left empty.',
  okButton: 'Complete',
  cancelButton: 'Cancel',
  previewPrefix: 'Preview: ',
  inlineTemplateName: 'Inline template',
  settingsIntro:
    'Write one input template per line, in the form "Name | Keywords | Template". The template whose keyword appears in the task name is selected automatically. A line without keywords is the default (fallback). A template written in the task line itself, such as {km}, takes precedence.',
  templatesName: 'Templates',
  hookName: 'Hook checkboxes in Tasks lists',
  hookDesc:
    'When a checkbox is clicked in a Tasks plugin query result or in Reading View, open the note modal instead of completing normally (completing direction only; un-checking works as usual). If the source task cannot be identified, the click is handled as a normal click.',
  scopeName: 'Hook scope',
  scopeDesc:
    'With "Only tasks with a template", the modal opens only for tasks that have an inline template or a keyword-matched settings template; other tasks complete normally without a note.',
  scopeTemplated: 'Only tasks with a template',
  scopeAll: 'All tasks',
  debugName: 'Debug notices',
  debugDesc:
    'Show the hook decision process as notices (for troubleshooting; normally off).',
  commandName: 'Complete with note',
  fallbackTemplateName: 'Free',
  noticePlaceCursor: 'Place the cursor on an incomplete task line',
  noticeFileNotFoundPrefix: 'File not found: ',
  noticeTaskLineNotFound:
    'Task line not found (already completed, or the line has shifted)',
  noticeTaskChanged: 'Aborted because the task text has changed',
  noticeFileChanged: 'Aborted because the file was modified',
  noticeLineNotIdentified: 'Could not identify the task line',
  noticeTasksApiMissing:
    'Tasks plugin API not found; completed simply (recurrence was not processed)',
  dbgOutsideList: 'outside target lists',
  dbgQueryResult: 'query result',
  dbgReadingView: 'reading view',
  dbgPassThroughStatus: (status) => 'passing through (status=' + status + ')',
  dbgBacklinkNone: 'none',
  dbgFileUnresolved: 'file unresolved; passing through',
  dbgHookStart: 'hooked; processing',
  dbgLineIdentified: (line) => 'line identified: ' + line,
};

export function isJapanese(): boolean {
  try {
    return moment.locale().toLowerCase().startsWith('ja');
  } catch {
    return false;
  }
}

export function strings(): Strings {
  return isJapanese() ? ja : en;
}

/** Default settings-template text in the app's language. */
export function defaultTemplatesRaw(): string {
  return isJapanese() ? DEFAULT_TEMPLATES_RAW : DEFAULT_TEMPLATES_RAW_EN;
}
