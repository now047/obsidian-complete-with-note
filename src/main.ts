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
  UNCHECKED_TASK_LINE_RE,
  applyNoteToToggledResult,
  extractInlineTemplate,
  findTaskLine,
  replaceInlineTemplate,
  taskDescriptionHead,
} from './lineEdit';
import {
  TemplateDef,
  parseTemplateDefs,
  placeholdersOf,
  composeNote,
  selectTemplate,
} from './template';
import { strings, defaultTemplatesRaw } from './i18n';

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
  // Placeholder: loadSettings replaces this with the app's language
  // version (defaultTemplatesRaw) when no settings are saved yet.
  templatesRaw: '',
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
            name: strings().inlineTemplateName,
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
    const s = strings();
    contentEl.createEl('h3', { text: s.modalTitle });
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
      text: s.modalHint,
    });
    hintEl.style.fontSize = '0.85em';
    hintEl.style.opacity = '0.7';

    const btnRow = contentEl.createDiv();
    btnRow.style.display = 'flex';
    btnRow.style.justifyContent = 'flex-end';
    btnRow.style.gap = '0.6em';
    btnRow.style.marginTop = '1em';
    const okBtn = btnRow.createEl('button', {
      text: s.okButton,
      cls: 'mod-cta',
    });
    okBtn.addEventListener('click', () => this.submit());
    const cancelBtn = btnRow.createEl('button', { text: s.cancelButton });
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
    this.previewEl.setText(strings().previewPrefix + preview);
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
    const s = strings();
    containerEl.empty();
    containerEl.createEl('h3', { text: 'Complete with Note' });
    containerEl.createEl('p', {
      text: s.settingsIntro,
    });
    new Setting(containerEl)
      .setName(s.templatesName)
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
      .setName(s.hookName)
      .setDesc(s.hookDesc)
      .addToggle((tg) => {
        tg.setValue(this.plugin.settings.hookTasksLists).onChange(
          async (value) => {
            this.plugin.settings.hookTasksLists = value;
            await this.plugin.saveSettings();
          },
        );
      });
    new Setting(containerEl)
      .setName(s.scopeName)
      .setDesc(s.scopeDesc)
      .addDropdown((dd) => {
        dd.addOption('templated', s.scopeTemplated)
          .addOption('all', s.scopeAll)
          .setValue(this.plugin.settings.hookScope)
          .onChange(async (value) => {
            this.plugin.settings.hookScope = value as 'templated' | 'all';
            await this.plugin.saveSettings();
          });
      });
    new Setting(containerEl)
      .setName(s.debugName)
      .setDesc(s.debugDesc)
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
      name: strings().commandName,
      editorCallback: (editor: Editor, view: MarkdownView) => {
        const lineNo = editor.getCursor().line;
        const line = editor.getLine(lineNo);
        if (!UNCHECKED_TASK_LINE_RE.test(line)) {
          new Notice(strings().noticePlaceCursor);
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
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    if (!saved) {
      // First run: seed the sample templates in the app's language.
      this.settings.templatesRaw = defaultTemplatesRaw();
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private templates(): TemplateDef[] {
    const defs = parseTemplateDefs(this.settings.templatesRaw);
    if (defs.length > 0) return defs;
    return [
      {
        name: strings().fallbackTemplateName,
        keywords: [],
        template: '{note}',
        position: 'end',
      },
    ];
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
    const s = strings();
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(s.noticeFileNotFoundPrefix + path);
      return;
    }
    const content = await this.app.vault.read(file);
    const line = content.split('\n')[lineNumber];
    if (line === undefined || !UNCHECKED_TASK_LINE_RE.test(line)) {
      new Notice(s.noticeTaskLineNotFound);
      return;
    }
    if (expectedText) {
      const probe = expectedText.trim().slice(0, 20);
      if (probe && !line.includes(probe)) {
        new Notice(s.noticeTaskChanged);
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
        new Notice(s.noticeFileChanged);
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
    const s = strings();
    if (!inQuery && !inReading) {
      debug(s.dbgOutsideList);
      return;
    }
    debug(inQuery ? s.dbgQueryResult : s.dbgReadingView);
    // Only completing a TODO task is hooked; un-completing and other
    // statuses pass through to the Tasks plugin.
    const statusType = li.getAttribute('data-task-status-type');
    if (statusType && statusType !== 'TODO') {
      debug(s.dbgPassThroughStatus(statusType));
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
      debug('backlink=' + (rawText || s.dbgBacklinkNone));
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
      debug(s.dbgFileUnresolved);
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
    debug(s.dbgHookStart);
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
    const s = strings();
    const content = await this.app.vault.read(file);
    const lines = content.split('\n');
    const idx = findTaskLine(lines, hintLine, renderedDesc, fieldTexts);
    if (idx === -1) {
      new Notice(s.noticeLineNotIdentified);
      return;
    }
    if (this.settings.debugNotices) {
      new Notice('[CWN] ' + s.dbgLineIdentified(idx + 1), 8000);
    }
    const line = lines[idx];

    if (this.settings.hookScope === 'templated' && !this.hasRecordTemplate(line)) {
      // No record format defined for this task: complete it plainly,
      // exactly as the Tasks plugin would have.
      const applied = await this.applyCompletion(file, idx, line, '', 'end');
      if (!applied) new Notice(s.noticeFileChanged);
      return;
    }
    this.openModal(line, async (note, position) => {
      const applied = await this.applyCompletion(file, idx, line, note, position);
      if (!applied) new Notice(s.noticeFileChanged);
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
    new Notice(strings().noticeTasksApiMissing);
    return (
      line.replace(/^(\s*(?:>\s*)*- )\[ \]/, '$1[x]') + ` ✅ ${today}`
    );
  }
}
