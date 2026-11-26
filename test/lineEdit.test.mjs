import {
  appendNoteToTaskLine,
  taskDescriptionHead,
  appendNoteToCompletedLine,
  applyNoteToToggledResult,
  extractInlineTemplate,
  finalizeCompletedLine,
  removeInlineTemplate,
  replaceInlineTemplate,
  normalizeHeadForMatch,
  findTaskLine,
  UNCHECKED_TASK_LINE_RE,
} from './lineEdit.mjs';

let failures = 0;
function check(name, actual, expected) {
  if (actual === expected) {
    console.log('ok   - ' + name);
  } else {
    failures++;
    console.log('FAIL - ' + name);
    console.log('  expected: ' + expected);
    console.log('  actual  : ' + actual);
  }
}

// 1. Run task with due date + recurrence: note goes right after the title,
//    before the first Tasks field.
check(
  'run with due+recurrence',
  appendNoteToTaskLine('- [ ] Jog 📅 2026-11-21 🔁 every week when done', '5.78km 44分'),
  '- [ ] Jog 5.78km 44分 📅 2026-11-21 🔁 every week when done',
);

// 2. Plain task, no fields: note appended at the end.
check(
  'plain reading task',
  appendNoteToTaskLine('- [ ] 読書', '30分 『賢者の書』'),
  '- [ ] 読書 30分 『賢者の書』',
);

// 3. Wikilink in the description must not be mistaken for a Dataview field.
check(
  'wikilink in description',
  appendNoteToTaskLine('- [ ] 読書 [[読書メモ]] 📅 2026-11-21', '30分'),
  '- [ ] 読書 [[読書メモ]] 30分 📅 2026-11-21',
);

// 4. Dataview inline field: note goes before it.
check(
  'dataview field',
  appendNoteToTaskLine('- [ ] 読書 [due:: 2026-11-21]', '30分'),
  '- [ ] 読書 30分 [due:: 2026-11-21]',
);

// 5. Start date comes before due date: insert before the earliest field.
check(
  'start+due dates',
  appendNoteToTaskLine('- [ ] Long Jog 🛫 2026-11-20 📅 2026-11-21', '10.2km 1時間05分'),
  '- [ ] Long Jog 10.2km 1時間05分 🛫 2026-11-20 📅 2026-11-21',
);

// 6. Indented subtask keeps its indentation.
check(
  'indented subtask',
  appendNoteToTaskLine('  - [ ] サブタスク 📅 2026-11-21', 'メモ'),
  '  - [ ] サブタスク メモ 📅 2026-11-21',
);

// 7. Tag in the description stays with the description.
check(
  'tag in description',
  appendNoteToTaskLine('- [ ] 読書 #習慣 📅 2026-11-21', '20分'),
  '- [ ] 読書 #習慣 20分 📅 2026-11-21',
);

// 8. Empty note returns the line unchanged.
check(
  'empty note',
  appendNoteToTaskLine('- [ ] Jog 📅 2026-11-21', '   '),
  '- [ ] Jog 📅 2026-11-21',
);

// 9. Time-like text must not end up right after 📅 (Tasks parsing landmine):
//    the note is inserted before 📅, never after it.
check(
  'note with time text',
  appendNoteToTaskLine('- [ ] Jog 📅 2026-11-21', '44分'),
  '- [ ] Jog 44分 📅 2026-11-21',
);

// 10. Description head extraction for the modal title.
check(
  'description head',
  taskDescriptionHead('- [ ] Jog 📅 2026-11-21 🔁 every week when done'),
  'Jog',
);
check(
  'description head with note already present',
  taskDescriptionHead('- [ ] 読書 30分 『賢者の書』'),
  '読書 30分 『賢者の書』',
);

// 11. Append at the end of a completed line, after the ✅ date —
//     exactly the established record format found in the vault.
check(
  'append to completed line',
  appendNoteToCompletedLine(
    '- [x] Jog 🔁 every day when done 📅 2026-11-17 ✅ 2026-11-17',
    '4.23 km / 31 min',
  ),
  '- [x] Jog 🔁 every day when done 📅 2026-11-17 ✅ 2026-11-17 4.23 km / 31 min',
);

// 12. Toggle result of a recurring task (next occurrence first):
//     the note goes ONLY onto the completed line; the next
//     occurrence stays clean.
check(
  'toggled result, next occurrence first',
  applyNoteToToggledResult(
    '- [ ] Jog 🔁 every day when done 🛫 2026-11-22\n' +
      '- [x] Jog 🔁 every day when done 🛫 2026-11-18 ✅ 2026-11-21',
    '5.78 km / 44 min',
    'end',
  ),
  '- [ ] Jog 🔁 every day when done 🛫 2026-11-22\n' +
    '- [x] Jog 🔁 every day when done 🛫 2026-11-18 ✅ 2026-11-21 5.78 km / 44 min',
);

// 13. Same, but the completed line comes first.
check(
  'toggled result, completed first',
  applyNoteToToggledResult(
    '- [x] Jog 🔁 every day when done 🛫 2026-11-18 ✅ 2026-11-21\n' +
      '- [ ] Jog 🔁 every day when done 🛫 2026-11-22',
    '5.78 km / 44 min',
    'end',
  ),
  '- [x] Jog 🔁 every day when done 🛫 2026-11-18 ✅ 2026-11-21 5.78 km / 44 min\n' +
    '- [ ] Jog 🔁 every day when done 🛫 2026-11-22',
);

// 14. Non-recurring task: single completed line gets the note.
check(
  'toggled result, single line',
  applyNoteToToggledResult('- [x] 読書 ✅ 2026-11-21', '30分 『賢者の書』', 'end'),
  '- [x] 読書 ✅ 2026-11-21 30分 『賢者の書』',
);

// 15. Title position still works on the completed line.
check(
  'toggled result, title position',
  applyNoteToToggledResult(
    '- [x] 読書 📅 2026-11-21 ✅ 2026-11-21',
    '30分',
    'title',
  ),
  '- [x] 読書 30分 📅 2026-11-21 ✅ 2026-11-21',
);

// 16. Empty note leaves the toggle result untouched.
check(
  'toggled result, empty note',
  applyNoteToToggledResult('- [x] Jog ✅ 2026-11-21', '  ', 'end'),
  '- [x] Jog ✅ 2026-11-21',
);

// 17. Inline template extraction: right after the task name,
//     before the fields.
check(
  'inline template extraction',
  extractInlineTemplate(
    '- [ ] Jog {km} / {minutes} min 🔁 every day when done 🛫 2026-11-18',
  )?.template,
  '{km} / {minutes} min',
);

// 17b. Braces AFTER a date field are NOT a template (they break
//      Dataview/Tasks pickup, so that placement is not supported).
check(
  'inline template after field is ignored',
  extractInlineTemplate(
    '- [ ] Jog 🔁 every day when done 🛫 2026-11-18  {km} / {minutes} min',
  ),
  null,
);

// 18. Inline template stops before a following Tasks field.
check(
  'inline template before field',
  extractInlineTemplate('- [ ] Jog {km}km 📅 2026-11-21')?.template,
  '{km}km',
);

// 19. No braces -> no inline template.
check(
  'inline template none',
  extractInlineTemplate('- [ ] Jog 📅 2026-11-21'),
  null,
);

// 20. Removing the inline template from a completed line.
check(
  'remove inline template',
  removeInlineTemplate(
    '- [x] Jog {km} / {minutes} min 🔁 every day when done 🛫 2026-11-18 ✅ 2026-11-21',
  ),
  '- [x] Jog 🔁 every day when done 🛫 2026-11-18 ✅ 2026-11-21',
);

// 21. Full flow: recurring task whose lines carry the template after
//     the name. The next occurrence keeps the definition; on the
//     completed line the record replaces it in place, and nothing
//     is written after the date fields.
check(
  'toggled result with inline template',
  applyNoteToToggledResult(
    '- [ ] Jog {km} / {minutes} min 🔁 every day when done 🛫 2026-11-22\n' +
      '- [x] Jog {km} / {minutes} min 🔁 every day when done 🛫 2026-11-18 ✅ 2026-11-21',
    '5.78 / 44 min',
    'end',
  ),
  '- [ ] Jog {km} / {minutes} min 🔁 every day when done 🛫 2026-11-22\n' +
    '- [x] Jog 5.78 / 44 min 🔁 every day when done 🛫 2026-11-18 ✅ 2026-11-21',
);

// 22. Completing with an empty record still consumes the template.
check(
  'finalize completed line, empty note',
  finalizeCompletedLine(
    '- [x] Jog {km} / {minutes} min 🛫 2026-11-18 ✅ 2026-11-21',
    '',
  ),
  '- [x] Jog 🛫 2026-11-18 ✅ 2026-11-21',
);

// 23. In-place replacement keeps single spacing.
check(
  'replace inline template',
  replaceInlineTemplate(
    '- [x] 読書 {minutes}分 {title} 📅 2026-11-21 ✅ 2026-11-21',
    '30分 『賢者の書』',
  ),
  '- [x] 読書 30分 『賢者の書』 📅 2026-11-21 ✅ 2026-11-21',
);

// 24. Normalize a wikilink head the way the rendered text looks.
check(
  'normalize wikilink alias',
  normalizeHeadForMatch(
    '[[03 メモ/2026-12-04 動画学習メモ 制作課題＋型紙.md|動画学習：制作課題＋型紙]]',
  ),
  '動画学習：制作課題＋型紙',
);
check(
  'normalize wikilink target',
  normalizeHeadForMatch('[[03 メモ/走ることについて.md]]'),
  '走ることについて',
);

// 25. findTaskLine: exact hint, wikilink description.
const fileLines = [
  '# Daily',
  '- [ ] [[03 メモ/2026-12-04 動画学習メモ 制作課題＋型紙.md|動画学習：制作課題＋型紙]] 🛫 2026-12-04',
  '- [ ] Jog {km} km / {minutes} min 🔁 every day when done 🛫 2026-11-18',
];
check(
  'findTaskLine exact',
  findTaskLine(fileLines, 1, '動画学習：制作課題＋型紙'),
  1,
);
// 26. findTaskLine: hint off by one (1-based data-line).
check(
  'findTaskLine off by one',
  findTaskLine(fileLines, 3, 'Jog {km} km / {minutes} min'),
  2,
);
// 27. findTaskLine: no match -> -1 (never guess).
check(
  'findTaskLine no match',
  findTaskLine(fileLines, 1, '存在しないタスク'),
  -1,
);
// 28. findTaskLine: completed lines are not candidates.
check(
  'findTaskLine skips completed',
  findTaskLine(['- [x] Jog ✅ 2026-11-21'], 0, 'Jog'),
  -1,
);
// 29. findTaskLine: query results pass a RESULT INDEX as data-line,
//     which generally points at an unrelated line. The full-file scan
//     must still find the task by description (regression: the Jog in
//     the activity record was never found).
const activityLines = [
  '# 2026 活動記録',
  '',
  '- [ ] 読書 {minutes}分 {title} 🔁 every day when done',
  '- [x] Jog {km} km / {minites} min 🔁 every day when done 🛫 2026-11-18 ✅ 2026-11-21',
  '- [ ] Jog {km} km / {minites} min 🔁 every day when done 🛫 2026-11-22',
];
check(
  'findTaskLine ignores a bogus result-index hint',
  findTaskLine(activityLines, 0, 'Jog {km} km / {minites} min'),
  4,
);
// 30. findTaskLine: rendered field texts disambiguate two open lines
//     that share a description.
const dupLines = [
  '- [ ] Jog {km} km / {minites} min 🔁 every day when done 🛫 2026-11-20',
  '- [ ] Jog {km} km / {minites} min 🔁 every day when done 🛫 2026-11-22',
];
check(
  'findTaskLine uses field texts to disambiguate duplicates',
  findTaskLine(dupLines, 0, 'Jog {km} km / {minites} min', [
    '🔁 every day when done',
    '🛫 2026-11-22',
  ]),
  1,
);
// 31. findTaskLine: field texts that match no line -> -1.
check(
  'findTaskLine field mismatch',
  findTaskLine(dupLines, 0, 'Jog {km} km / {minites} min', ['🛫 2026-12-31']),
  -1,
);
// 32. Tasks inside a callout/blockquote carry a `>` prefix. Dataview
//     still indexes them, so the unchecked-line test must accept them.
check(
  'quoted task line is an unchecked task line',
  UNCHECKED_TASK_LINE_RE.test(
    '> - [ ] マネーフォワードにレシートを登録 🔁 every week 📅 2026-11-26',
  ),
  true,
);
check(
  'nested quoted task line is an unchecked task line',
  UNCHECKED_TASK_LINE_RE.test('> > - [ ] nested task'),
  true,
);
check(
  'quoted completed line is not an unchecked task line',
  UNCHECKED_TASK_LINE_RE.test('> - [x] done task ✅ 2026-11-26'),
  false,
);
// 33. taskDescriptionHead strips the quote prefix and the checkbox.
check(
  'head of a quoted task line',
  taskDescriptionHead(
    '> - [ ] マネーフォワードにレシートを登録 🔁 every week 📅 2026-11-26',
  ),
  'マネーフォワードにレシートを登録',
);
// 34. findTaskLine locates a quoted task line in the source file.
const calloutLines = [
  '> [!todo] レシート管理',
  '>',
  '> - [ ] マネーフォワードにレシートを登録 🔁 every week 📅 2026-11-26',
  '> - [x] マネーフォワードにレシートを登録 🔁 every week 📅 2026-11-19 ✅ 2026-11-19',
];
check(
  'findTaskLine finds a quoted task line',
  findTaskLine(calloutLines, 0, 'マネーフォワードにレシートを登録', [
    '🔁 every week',
    '📅 2026-11-26',
  ]),
  2,
);
// 35. The note lands on the quoted completed line only; the next
//     occurrence of the recurring task stays clean.
check(
  'note applied to a quoted toggled result',
  applyNoteToToggledResult(
    '> - [x] マネーフォワードにレシートを登録 🔁 every week 📅 2026-11-26 ✅ 2026-11-26\n' +
      '> - [ ] マネーフォワードにレシートを登録 🔁 every week 📅 2026-12-03',
    '登録した',
    'end',
  ),
  '> - [x] マネーフォワードにレシートを登録 🔁 every week 📅 2026-11-26 ✅ 2026-11-26 登録した\n' +
    '> - [ ] マネーフォワードにレシートを登録 🔁 every week 📅 2026-12-03',
);
// 36. appendNoteToTaskLine keeps the quote prefix intact.
check(
  'appendNoteToTaskLine on a quoted line',
  appendNoteToTaskLine(
    '> - [ ] マネーフォワードにレシートを登録 🔁 every week 📅 2026-11-26',
    '登録した',
  ),
  '> - [ ] マネーフォワードにレシートを登録 登録した 🔁 every week 📅 2026-11-26',
);

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
