# Complete with Note（追記して完了）

Obsidian 用の小さなプラグイン。タスクを完了にするとき、**短い記録を入力してタスク行に書き込んでから完了**にできる。

- ラン：`- [x] Jog 4.23 km / 31 min 🔁 every day when done 🛫 2026-11-18 ✅ 2026-11-21`
- 読書：`- [x] 読書 30分 『賢者の書』 🔁 every day when done ✅ 2026-11-21`
- 小さな成長：`- [x] 小さな成長 noteに投稿できた 🔁 every day when done ✅ 2026-11-21`

記録は**完了した行にだけ**入り、繰り返しタスクの次回分には混入しない。完了処理（✅ の付与と次回分の生成）は **Tasks プラグインの公式 API（apiV1）に委譲**しているので、繰り返しルールも Tasks の設定どおりに処理される。

## 使い方

### 1. Tasks の一覧でそのまま（主な使い方）

Tasks プラグインのクエリ結果（Todos や Daily Note の ```tasks ブロック）や閲覧ビューのチェックボックスをクリックすると、記録モーダルが開く。表示は Tasks の形式そのままで、横取りするのは完了アクションだけ。

- 横取りするのは **TODO → 完了方向だけ**。チェックを外す操作や進行中ステータスは Tasks の通常処理に渡す
- 既定では、記録フォーマットのあるタスク（後述のテンプレートがあるタスク）だけモーダルを開き、それ以外は記録なしで通常完了する。設定で「すべてのタスク」に変更可、フック自体の無効化も可
- 元のタスクを特定できない場合は横取りせず、通常のクリックとして処理される（壊れた完了にはならない）
- 対象はクエリ結果と閲覧ビュー。**ライブプレビューの本文中のチェックボックスは対象外**

### 2. エディタのコマンド

1. 元ノートで、未完了タスクの行にカーソルを置く
2. コマンドパレットから「Complete with Note: 追記して完了」を実行（ホットキーの割り当てがおすすめ）
3. モーダルで記録を入力して Enter（空欄のまま完了もできる）

### 3. DataviewJS のボタン

Dataview の設定で DataviewJS が有効なら、表示用ノートに次のブロックを置くと、各タスクに「記録して完了」ボタンが付く。

```dataviewjs
// 「記録して完了」ボタン付きタスク一覧（日付フィルター付き）
// 置いたノートの日付（Daily Note のファイル名の日付、なければ今日）で絞る
const plugin = app.plugins.plugins['complete-with-note'];
if (!plugin) {
  dv.paragraph('⚠️ プラグイン「Complete with Note」が有効になっていません');
} else {
  // ===== 設定 =====
  const SOURCE = '"03 メモ"';        // 対象フォルダ
  const INCLUDE_OVERDUE = true;      // 📅⏳ が過ぎた未完了も出す
  const START_MODE = 'onOrBefore';   // 🛫 目安の日付: 'onOrBefore'（その日以降ずっと候補）/ 'exact'（当日のみ）/ 'off'（出さない）
  const INCLUDE_UNDATED = false;     // 日付のないタスクも出す
  // ================
  const day = dv.current().file.day ?? dv.date('today');
  const dayMs = day.toMillis();
  const le = (d) => !!d && (INCLUDE_OVERDUE ? d.toMillis() <= dayMs : d.toMillis() === dayMs);
  const startHit = (d) => {
    if (!d || START_MODE === 'off') return false;
    return START_MODE === 'exact' ? d.toMillis() === dayMs : d.toMillis() <= dayMs;
  };
  const tasks = dv.pages(SOURCE)
    .file.tasks
    .where(t => !t.completed)
    .where(t => le(t.due) || le(t.scheduled) || startHit(t.start)
      || (INCLUDE_UNDATED && !t.due && !t.scheduled && !t.start))
    .sort(t => (t.due ? t.due.toMillis() : Number.MAX_SAFE_INTEGER));
  if (tasks.length === 0) dv.paragraph('（この日のタスクはありません）');
  for (const t of tasks) {
    const row = dv.el('div', '');
    row.createEl('span', { text: '・' + t.text });
    const btn = row.createEl('button', { text: '記録して完了' });
    btn.style.marginLeft = '0.6em';
    btn.onclick = () => plugin.completeWithNote(t.path, t.line, t.text);
  }
}
```

日付フィルターの既定の挙動：

- 📅 締切と ⏳ 実施日は、その日以前の未完了を出す（期限切れも拾う。`INCLUDE_OVERDUE = false` で当日のみ）
- 🛫 目安は「その日が来たら候補」なので、その日以降ずっと出す（`START_MODE` で当日だけ／出さないに変更可）
- 日付のないタスクは出さない（`INCLUDE_UNDATED = true` で出す）

ボタンを押すとモーダルが開き、入力した記録を**元のファイルの該当行**に書き込んで完了にする。行番号と内容が照合できない場合（表示後にファイルが変わった等）は、安全のため中止して通知する。

## 入力テンプレート

モーダルの入力欄はテンプレートで定義できる。`{名前}` が入力欄になり、リテラル文字（単位など）はそのまま書く。

### タスク行に書く（推奨）

```
- [ ] Jog {km} km / {minutes} min 🔁 every day when done 🛫 2026-11-18
```

- **置き場所はタスク名の直後、フィールド（🔁 📅 🛫 など）より前**。日付フィールドより後ろに書くと Dataview／Tasks のクエリでタスクを拾えなくなることがあるため、その位置の `{…}` はテンプレートとして扱わない
- 完了した行では、テンプレートが入力値にその場で置き換わる（日付より後ろには何も書かない）
- 繰り返しタスクでは次回分にテンプレートがそのまま残る（定義だから）
- 空欄で完了した場合も、完了行からテンプレートは取り除かれる
- 設定よりタスク行のテンプレートが優先される。タスクごとに形式を変えられるので、設定でキーワードを管理しなくてよい

### 設定に書く

プラグイン設定で編集する。1行に1つ、「名前 | キーワード | テンプレート | 位置」の形式（位置は省略可）：

```
ラン | Jog, Long Jog, ランニング | {km} km / {minutes} min
読書 | 読書 | {minutes}分 {title}
自由 |  | {note}
```

- タスク名にキーワードが含まれるテンプレートが自動で選ばれる（モーダル上のチップで切替もできる）
- キーワードなしの行が既定（フォールバック）。どれもなければ自由文1欄（`{note}`）
- 同じ `{名前}` が複数回出てきたら、入力欄は1つで全箇所に反映される
- 位置は `end`（既定：✅ の後ろ＝行末）か `title`（タスク名の直後）。`title` にすると Tasks フィールド（📅 ⏳ 🛫 🔁 など）の手前に入る
- モーダル下部のプレビューには、記録を反映した後のタスク名が表示される

## 設定

- **テンプレート定義**：上記の「名前 | キーワード | テンプレート | 位置」形式
- **Tasks の一覧でチェックを横取り**：オン／オフ
- **フックする対象**：「テンプレートのあるタスクのみ」（既定）／「すべてのタスク」
- **デバッグ通知**：フックの判定過程を通知で表示（トラブル調査用。通常はオフ）

## 必要なもの

- Obsidian 1.5 以上
- Tasks プラグイン **7.2.0 以上**（API のある版）
  - 見つからない場合は簡易完了（`[x]`＋✅ のみ、繰り返し未処理）にフォールバックし、その旨を通知する

## インストール

1. [Releases](https://github.com/now047/obsidian-complete-with-note/releases) から `main.js` と `manifest.json` をダウンロードする
2. Vault の `.obsidian/plugins/complete-with-note/` フォルダに入れる（フォルダがなければ作る）
3. Obsidian の 設定 → コミュニティプラグイン で「Complete with Note」を有効にする

## 仕組みメモ

- 処理順序：素のタスク行を Tasks API でトグル → 戻ってきた完了行（`- [x]` の行）にだけ記録を適用。繰り返しの次回分は無記録のまま残る
- Tasks に「完了を横取りする」公式フックはないので、一覧のフックは描画されたチェックボックスへのクリックを capture フェーズで受け取り、Tasks 自身の処理の前に振り替えている。元のタスクの特定は、バックリンクの表示テキストから元ファイルを解決し、ファイル内では説明文と描画されているフィールド文字列（日付・繰り返しなど）で照合する。特定できない場合は横取りしない
- 記録の挿入位置（タスク内テンプレートがない場合）：既定は行末（✅ の後ろ）。テンプレートで `title` を指定した場合はタスク名の直後で、判定は Tasks フィールドの絵文字（📅 ⏳ 🛫 ✅ ❌ ➕ 🔁 優先度 🆔 ⛔ 🏁 ⏰）と Dataview 形式フィールド `[key:: …]` のうち最も早いものの手前。Wiki リンク `[[…]]` はフィールドと誤認しない
- 日本語入力（IME）の変換確定 Enter では送信されない。変換後の素の Enter で送信される

## 開発

- ソース：`src/main.ts`（プラグイン本体）、`src/lineEdit.ts`（行編集の純粋ロジック）、`src/template.ts`（テンプレート処理）
- `npm run build` で `dist/complete-with-note/main.js` を生成
- `npm test` で単体テスト（48 ケース）

## ライセンス

MIT
