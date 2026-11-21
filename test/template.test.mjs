import {
  parseTemplateDefs,
  placeholdersOf,
  composeNote,
  selectTemplate,
  DEFAULT_TEMPLATES_RAW,
} from './template.mjs';

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log('ok   - ' + name);
  } else {
    failures++;
    console.log('FAIL - ' + name);
    console.log('  expected: ' + e);
    console.log('  actual  : ' + a);
  }
}

// 1. Parse the default definitions.
const defs = parseTemplateDefs(DEFAULT_TEMPLATES_RAW);
check('default defs count', defs.length, 3);
check('run def', defs[0], {
  name: 'ラン',
  keywords: ['Jog', 'Long Jog', 'ランニング'],
  template: '{km} km / {minutes} min',
  position: 'end',
});

// 2. Placeholders in order, deduplicated.
check('placeholders', placeholdersOf('{km} km / {minutes} min'), ['km', 'minutes']);
check(
  'placeholders dedupe',
  placeholdersOf('{km}km ({km}) {minutes}分'),
  ['km', 'minutes'],
);

// 3. Compose a run note in the established record format.
check(
  'compose run',
  composeNote('{km} km / {minutes} min', { km: '4.23', minutes: '31' }),
  '4.23 km / 31 min',
);

// 4. Empty optional field: value dropped, whitespace tidied.
check(
  'compose with empty title',
  composeNote('{minutes}分 {title}', { minutes: '30', title: '' }),
  '30分',
);

// 5. A repeated placeholder is substituted everywhere.
check(
  'compose repeated placeholder',
  composeNote('{km}km ({km})', { km: '5.78' }),
  '5.78km (5.78)',
);

// 6. Selection by keyword, then fallback.
check('select run', selectTemplate(defs, 'Jog')?.name, 'ラン');
check('select long jog', selectTemplate(defs, 'Long Jog')?.name, 'ラン');
check('select reading', selectTemplate(defs, '読書')?.name, '読書');
check('select fallback', selectTemplate(defs, '買い物')?.name, '自由');

// 7. Broken lines are skipped.
check(
  'broken lines skipped',
  parseTemplateDefs('no pipes here\n名前だけ | キーワードなし\n').length,
  0,
);

// 8. Optional 4th segment selects the title position.
check(
  'position segment',
  parseTemplateDefs('メモ | 買い物 | {note} | title')[0].position,
  'title',
);
check(
  'position defaults to end',
  parseTemplateDefs('メモ | 買い物 | {note}')[0].position,
  'end',
);

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
