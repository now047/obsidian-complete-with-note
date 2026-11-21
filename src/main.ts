import {
  App,
  Editor,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
} from 'obsidian';
import {
  applyNoteToToggledResult,
  extractInlineTemplate,
  findTaskLine,
  replaceInlineTemplate,
  taskDescriptionHead,
} from './lineEdit';
import {
  TemplateDef,
  DEFAULT_TEMPLATES_RAW,
  parseTemplateDefs,
  placeholdersOf,
  composeNote,
  selectTemplate,
} from './template';

interface TasksApiV1 {
  executeToggleTaskDoneCommand: (line: string, path: string) => string;
}

interface CompleteWithNoteSettings {
  templatesRaw: string;
  hookTasksLists: boolean;
  hookScope: 'templated' | 'all';
  debugNotices: boolean;
}

const DEFAULT_SETTINGS: CompleteWithNoteSettings = {
  templatesRaw: DEFAULT_TEMPLATES_RAW,
  hookTasksLists: true,
  hookScope: 'templated',
  debugNotices: false,
};

class NoteModal extends Modal {
  private taskLine: string;
  private defs: TemplateDef[];
  private current: TemplateDef | null;
  private hasInline: boolean;
  private values: Record<string, string> = {};
  private onSubmit: (note: string, position: 'end' | 'title') => void;

  private fieldsEl: HTMLElement;
  private previewEl: HTMLElement;

  constructor(
    app: App,
    taskLine: string,
    defs: TemplateDef[],
    onSubmit: (note: string, position: 'end' | 'title') => void,
  ) {
    super(app);
    this.taskLine = taskLine;
    // A template written in the task line itself wins over the
    // configured templates:  - [ ] Jog … {km} / {minutes} min
    const inline = extractInlineTemplate(taskLine);
    this.hasInline = !!inline;
    this.defs = inline
      ? [
          {
            name: 'タスク内テンプレート',
            keywords: [],
            template: inline.template,
            position: 'end' as const,
          },
        ]
      : defs;
    this.current = selectTemplate(this.defs, taskDescriptionHead(taskLine));
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: '追記して完了' });
    contentEl.createEl('p', {
      text: taskDescriptionHead(this.taskLine),
      cls: 'complete-with-note-task',
    });

    // Template chips
    if (this.defs.length > 1) {
      const chipRow = contentEl.createDiv();
      chipRow.style.display = 'flex';
      chipRow.style.gap = '0.4em';
      chipRow.style.flexWrap = 'wrap';
      chipRow.style.marginBottom = '0.8em';
      for (const def of this.defs) {
        const chip = chipRow.createEl('button', { text: def.name });
        if (def === this.current) chip.addClass('mod-cta');
        chip.addEventListener('click', () => {
          this.current = def;
          chipRow.querySelectorAll('button').forEach((b) =>
            b.removeClass('mod-cta'),
          );
          chip.addClass('mod-cta');
          this.renderFields();
        });
      }
    }

    this.fieldsEl = contentEl.createDiv();
    this.previewEl = contentEl.createEl('p');
    this.previewEl.style.opacity = '0.75';
    this.renderFields();

    const hintEl = contentEl.createEl('p', {
      text: '追記は完了した行にだけ入ります（繰り返しの次回分には入りません）。空欄のまま完了もできます。',
    });
    hintEl.style.fontSize = '0.85em';
    hintEl.style.opacity = '0.7';

    const btnRow = contentEl.createDiv();
    btnRow.style.display = 'flex';
    btnRow.style.justifyContent = 'flex-end';
    btnRow.style.gap = '0.6em';
    btnRow.style.marginTop = '1em';
    const okBtn = btnRow.createEl('button', {
      text: '追記して完了',
      cls: 'mod-cta',
    });
    okBtn.addEventListener('click', () => this.submit());
    const cancelBtn = btnRow.createEl('button', { text: 'キャンセル' });
    cancelBtn.addEventListener('click', () => this.close());
  }

  private renderFields() {
    this.fieldsEl.empty();
    if (!this.current) return;
    const names = placeholdersOf(this.current.template);
    let firstInput: HTMLInputElement | null = null;
    for (const name of names) {
      const row = this.fieldsEl.createDiv();
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '0.6em';
      row.style.marginBottom = '0.5em';
      const label = row.createEl('label', { text: name });
      label.style.minWidth = '5em';
      const input = row.createEl('input', { type: 'text' });
      input.style.flex = '1';
      input.value = this.values[name] ?? '';
      input.addEventListener('input', () => {
        this.values[name] = input.value;
        this.updatePreview();
      });
      input.addEventListener('keydown', (e) => {
        // The Enter that confirms an IME conversion must not submit:
        // during composition, keydown carries isComposing (and the
        // legacy keyCode 229). A plain Enter after conversion still
        // submits as before.
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
          e.preventDefault();
          this.submit();
        }
      });
      if (!firstInput) firstInput = input;
    }
    this.updatePreview();
    firstInput?.focus();
  }

  private composed(): string {
    if (!this.current) return '';
    return composeNote(this.current.template, this.values);
  }

  private updatePreview() {
    // Preview the resulting task description, not just the note:
    // "Jog 100 km / min" reads better than the bare record text.
    const note = this.composed();
    const head = taskDescriptionHead(this.taskLine);
    let preview: string;
    if (this.hasInline) {
      preview = replaceInlineTemplate(head, note);
    } else if (this.current?.position === 'title') {
      preview = note ? `${head} ${note}` : head;
    } else {
      // 'end': the note lands after the ✅ date, at the line's end.
      preview = note ? `${head} … ${note}` : head;
    }
    this.previewEl.setText('プレビュー: ' + preview);
  }

  private submit() {
    const note = this.composed();
    const position = this.current?.position ?? 'end';
    this.close();
    this.onSubmit(note, position);
  }

  onClose() {
    this.contentEl.empty();
  }
}

class CompleteWithNoteSettingTab extends PluginSettingTab {
  private plugin: CompleteWithNotePlugin;

  constructor(app: App, plugin: CompleteWithNotePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h3', { text: 'Complete with Note' });
    containerEl.createEl('p', {
      text: '入力テンプレートを1行に1つ、「名前 | キーワード | テンプレート」の形式で書きます。タスク名にキーワードが含まれるテンプレートが自動で選ばれます。キーワードなしの行が既定（フォールバック）です。タスク行自体に {km} のようなテンプレートが書かれている場合は、そちらが優先されます。',
    });
    new Setting(containerEl)
      .setName('テンプレート')
      .addTextArea((ta) => {
        ta.setValue(this.plugin.settings.templatesRaw)
          .onChange(async (value) => {
            this.plugin.settings.templatesRaw = value;
            await this.plugin.saveSettings();
          });
        ta.inputEl.rows = 8;
        ta.inputEl.style.width = '100%';
      });
    new Setting(containerEl)
      .setName('Tasksの一覧でチェックボックスをフック')
      .setDesc(
        'Tasksプラグインのクエリ結果や閲覧ビューでチェックボックスをクリックしたとき、通常の完了の代わりに記録モーダルを開きます（完了方向のみ。チェックを外す操作は通常どおり）。元のタスクを特定できない場合は通常のクリックとして処理されます。',
      )
      .addToggle((tg) => {
        tg.setValue(this.plugin.settings.hookTasksLists).onChange(
          async (value) => {
            this.plugin.settings.hookTasksLists = value;
            await this.plugin.saveSettings();
          },
        );
      });
    new Setting(containerEl)
      .setName('フックする対象')
      .setDesc(
        '「テンプレートのあるタスクのみ」では、タスク内テンプレートかキーワード一致する設定テンプレートがあるタスクだけモーダルを開き、それ以外は記録なしで通常完了します。',
      )
      .addDropdown((dd) => {
        dd.addOption('templated', 'テンプレートのあるタスクのみ')
          .addOption('all', 'すべてのタスク')
          .setValue(this.plugin.settings.hookScope)
          .onChange(async (value) => {
            this.plugin.settings.hookScope = value as 'templated' | 'all';
            await this.plugin.saveSettings();
          });
      });
    new Setting(containerEl)
      .setName('デバッグ通知')
      .setDesc(
        'フックの判定過程を通知で表示します（トラブル調査用。通常はオフ）。',
      )
      .addToggle((tg) => {
        tg.setValue(this.plugin.settings.debugNotices).onChange(
          async (value) => {
            this.plugin.settings.debugNotices = value;
            await this.plugin.saveSettings();
          },
        );
      });
  }
}

export default class CompleteWithNotePlugin extends Plugin {
  settings: CompleteWithNoteSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new CompleteWithNoteSettingTab(this.app, this));

    this.addCommand({
      id: 'complete-with-note',
      name: '追記して完了',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        const lineNo = editor.getCursor().line;
        const line = editor.getLine(lineNo);
        if (!/^\s*- \[ \]/.test(line)) {
          new Notice('未完了のタスク行にカーソルを置いてください');
          return;
        }
        const path = view.file?.path ?? '';
        this.openModal(line, (note, position) => {
          const result = this.completeLine(line, path, note, position);
          editor.replaceRange(
            result,
            { line: lineNo, ch: 0 },
            { line: lineNo, ch: line.length },
          );
        });
      },
    });

    // Hook checkbox clicks in Tasks-rendered lists (query results and
    // Reading View): the click is captured before the Tasks plugin's
    // own handler runs, and rerouted to the record-and-complete flow.
    this.registerDomEvent(
      document,
      'click',
      (evt) => this.onRenderedCheckboxClick(evt),
      { capture: true },
    );
  }

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData(),
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private templates(): TemplateDef[] {
    const defs = parseTemplateDefs(this.settings.templatesRaw);
    if (defs.length > 0) return defs;
    return [{ name: '自由', keywords: [], template: '{note}', position: 'end' }];
  }

  private openModal(
    taskLine: string,
    onSubmit: (note: string, position: 'end' | 'title') => void,
  ) {
    new NoteModal(this.app, taskLine, this.templates(), onSubmit).open();
  }

  /**
   * Complete a task line: toggle the CLEAN line first (so a recurring
   * task's next occurrence inherits no record), then apply the note to
   * the completed line only.
   */
  private completeLine(
    line: string,
    path: string,
    note: string,
    position: 'end' | 'title',
  ): string {
    const toggled = this.toggleLine(line, path);
    return applyNoteToToggledResult(toggled, note, position);
  }

  /**
   * Public API for DataviewJS (and other plugins):
   *   app.plugins.plugins['complete-with-note']
   *     .completeWithNote(path, lineNumber, expectedText?)
   * Opens the note modal for the task at the given location and, on
   * submit, appends the note and toggles the task done in the source file.
   */
  async completeWithNote(
    path: string,
    lineNumber: number,
    expectedText?: string,
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice('ファイルが見つかりません: ' + path);
      return;
    }
    const content = await this.app.vault.read(file);
    const line = content.split('\n')[lineNumber];
    if (line === undefined || !/^\s*- \[ \]/.test(line)) {
      new Notice('対象のタスク行が見つかりません（完了済みか、行がずれています）');
      return;
    }
    if (expectedText) {
      const probe = expectedText.trim().slice(0, 20);
      if (probe && !line.includes(probe)) {
        new Notice('タスクの内容が変わっているため中止しました');
        return;
      }
    }

    this.openModal(line, async (note, position) => {
      const applied = await this.applyCompletion(
        file,
        lineNumber,
        line,
        note,
        position,
      );
      if (!applied) {
        new Notice('ファイルが変更されていたため中止しました');
      }
    });
  }

  /** Write a completion (toggle + note) into the source file. */
  private async applyCompletion(
    file: TFile,
    lineNumber: number,
    line: string,
    note: string,
    position: 'end' | 'title',
  ): Promise<boolean> {
    let applied = false;
    await this.app.vault.process(file, (data) => {
      const lines = data.split('\n');
      if (lines[lineNumber] !== line) return data; // changed meanwhile
      const result = this.completeLine(line, file.path, note, position);
      lines.splice(lineNumber, 1, ...result.split('\n'));
      applied = true;
      return lines.join('\n');
    });
    return applied;
  }

  /**
   * Capture-phase click handler for checkboxes rendered by the Tasks
   * plugin (query results: ul.plugin-tasks-query-result; Reading View:
   * ul.contains-task-list). The rendered <li> carries data-line and —
   * in query results — a backlink to the source file, which is enough
   * to reroute the click. Anything unresolvable is left untouched so
   * the Tasks plugin handles the click as usual.
   */
  private onRenderedCheckboxClick(evt: MouseEvent) {
    if (!this.settings.hookTasksLists) return;
    const target = evt.target as HTMLElement | null;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type !== 'checkbox') return;
    if (!target.classList.contains('task-list-item-checkbox')) return;
    const li = target.closest('li.task-list-item');
    if (!li) return;
    const inQuery = !!target.closest('ul.plugin-tasks-query-result');
    const inReading = !!target.closest('ul.contains-task-list');
    const dbg: string[] = [];
    const debug = (msg: string) => {
      dbg.push(msg);
      if (this.settings.debugNotices) {
        new Notice('[CWN] ' + dbg.join(' / '), 10000);
      }
    };
    if (!inQuery && !inReading) {
      debug('対象リスト外');
      return;
    }
    debug(inQuery ? 'クエリ結果' : '閲覧ビュー');
    // Only completing a TODO task is hooked; un-completing and other
    // statuses pass through to the Tasks plugin.
    const statusType = li.getAttribute('data-task-status-type');
    if (statusType && statusType !== 'TODO') {
      debug('status=' + statusType + ' のため素通し');
      return;
    }

    // Resolve the source file synchronously. The Tasks backlink is an
    // <a class="internal-link"> WITHOUT href/data-href (navigation is
    // wired to a click handler in the Tasks source); its TEXT is the
    // Obsidian link text for the source file, so resolve that through
    // the metadata cache. If unresolvable, leave the click to Tasks.
    let file: TFile | null = null;
    if (inQuery) {
      const anchor = li.querySelector('.tasks-backlink a.internal-link');
      const rawText = anchor?.textContent?.trim() ?? '';
      debug('backlink=' + (rawText || 'なし'));
      if (rawText) {
        // Link text may carry a heading suffix: "file > Heading".
        const linkpath = rawText.split(' > ')[0].trim();
        const source = this.app.workspace.getActiveFile()?.path ?? '';
        file = this.app.metadataCache.getFirstLinkpathDest(linkpath, source);
        if (!file) {
          for (const candidate of [linkpath, linkpath + '.md']) {
            const f = this.app.vault.getAbstractFileByPath(candidate);
            if (f instanceof TFile) {
              file = f;
              break;
            }
          }
        }
      }
    } else {
      file = this.app.workspace.getActiveFile() ?? null;
    }
    if (!file) {
      debug('ファイルを特定できず素通し');
      return; // cannot resolve -> let Tasks handle it
    }
    debug('file=' + file.path);
    // NOTE: in query results, data-line is the task's index within the
    // rendered list, not a source line (Tasks source). It is only a
    // weak tiebreak hint for findTaskLine's full-file scan.
    const lineAttr = li.getAttribute('data-line');
    const hint = lineAttr ? Number.parseInt(lineAttr, 10) : NaN;
    const desc = li.querySelector('.task-description')?.textContent?.trim() ?? '';
    const fieldTexts: string[] = [];
    for (const sel of [
      '.task-priority',
      '.task-recurrence',
      '.task-created-date',
      '.task-start-date',
      '.task-scheduled-date',
      '.task-due-date',
      '.task-cancelled-date',
    ]) {
      const t = li.querySelector(sel)?.textContent?.trim() ?? '';
      if (t) fieldTexts.push(t);
    }
    debug('desc=' + desc.slice(0, 30) + ' fields=' + fieldTexts.join('|'));

    evt.preventDefault();
    evt.stopPropagation();
    debug('横取りして処理開始');
    void this.completeFromRenderedTask(
      file,
      Number.isNaN(hint) ? -1 : hint,
      desc,
      fieldTexts,
    );
  }

  /** Complete a task that was clicked in a Tasks-rendered list. */
  private async completeFromRenderedTask(
    file: TFile,
    hintLine: number,
    renderedDesc: string,
    fieldTexts: string[] = [],
  ): Promise<void> {
    const content = await this.app.vault.read(file);
    const lines = content.split('\n');
    const idx = findTaskLine(lines, hintLine, renderedDesc, fieldTexts);
    if (idx === -1) {
      new Notice('対象のタスク行を特定できませんでした');
      return;
    }
    if (this.settings.debugNotices) {
      new Notice('[CWN] 行を特定: ' + (idx + 1) + '行目', 8000);
    }
    const line = lines[idx];

    if (this.settings.hookScope === 'templated' && !this.hasRecordTemplate(line)) {
      // No record format defined for this task: complete it plainly,
      // exactly as the Tasks plugin would have.
      const applied = await this.applyCompletion(file, idx, line, '', 'end');
      if (!applied) new Notice('ファイルが変更されていたため中止しました');
      return;
    }
    this.openModal(line, async (note, position) => {
      const applied = await this.applyCompletion(file, idx, line, note, position);
      if (!applied) new Notice('ファイルが変更されていたため中止しました');
    });
  }

  /** Does this task have a record format (inline or keyword-matched)? */
  private hasRecordTemplate(line: string): boolean {
    if (extractInlineTemplate(line)) return true;
    const def = selectTemplate(this.templates(), taskDescriptionHead(line));
    return def !== null && def.keywords.length > 0;
  }

  private getTasksApi(): TasksApiV1 | null {
    const plugins = (this.app as any).plugins?.plugins;
    const tasks = plugins?.['obsidian-tasks-plugin'];
    return (tasks?.apiV1 as TasksApiV1) ?? null;
  }

  /**
   * Toggle a task line done. Delegates to the Tasks plugin API so that
   * done dates and recurrence ("when done" etc.) follow the user's
   * Tasks settings exactly. Falls back to a simple toggle if the
   * Tasks plugin (or its API) is unavailable.
   */
  private toggleLine(line: string, path: string): string {
    const api = this.getTasksApi();
    if (api?.executeToggleTaskDoneCommand) {
      return api.executeToggleTaskDoneCommand(line, path);
    }
    const today = (window as any).moment().format('YYYY-MM-DD');
    new Notice('TasksプラグインのAPIが見つからないため、簡易完了にしました（繰り返しは処理されません）');
    return line.replace(/^(\s*- )\[ \]/, '$1[x]') + ` ✅ ${today}`;
  }
}
