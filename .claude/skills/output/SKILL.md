---
name: output
description: "トレンドネタ収集（出力レイヤー）。収集済み JSON（一覧+全件の要約を含む）を出力プロファイルの形式に整形し、SvelteKit サイトのデータファイルへ1回の書き込みで出力する。収集・要約生成自体は collect が行う。"
---

# トレンドネタ収集（出力レイヤー）

`collect` が集めた記事情報（記事一覧と全記事分の要約）を、`output-profile.md`（このスキルと同じディレクトリ）に従って `site/src/lib/data/YYYY-MM-DD.json` へ書き込む。ソース巡回・興味度判定・重複統合・本文取得などの収集ロジックは持たない（`collect` の責務）。

## 実行手順

### 1. 出力プロファイル読み込み

このスキルと同じディレクトリの `output-profile.md` を読み込む。保存先・ファイル形式・中間ファイルの場所の正本。

### 2. 収集 JSON の取得

`output-profile.md` に記載の中間ファイル作業ディレクトリ配下の `trends-collect-YYYY-MM-DD.json`（当日分、日本時間基準）を探す。

- 既に存在する → そのまま読み込む
- 存在しない → `collect` スキルを起動して生成させてから読み込む

### 3. 書き込み（一覧＋詳細を1回で）

まず「ネタ収集完了。」というメッセージを返してから、`output-profile.md` の「変換ルール」に従って `collect` のフラットな `items` 配列を `categories` でグルーピングした JSON に変換し、`site/src/lib/data/YYYY-MM-DD.json` へ**一度の書き込みで**出力する。

- `items` を先頭から順に処理する（配列順 = カテゴリ順→記事順のまま維持）
- 同じ `category` の記事をひとつの `categories[].items` にまとめる
- 各記事は `title_ja` / `url` / `summary_ja` のみを転記する（チェック状態のような絞り込みは存在しない。収集 JSON に載っている記事は全件がここに入る）
- `interest` / `merged_urls` / `fetch_status` / `note` は出力に含めない。ただし `fetch_status: "fallback"` または `note` が空でない場合は、その旨を `summary_ja` の末尾に簡潔に付記してから `note` 自体は落とす

### 4. 既出索引の更新

書き込んだ `items` の `url` を、リポジトリルートの `trends-published-urls.txt`（`collect` の既出除外が参照する索引。1行1 URL、重複無し）に追記する。

- 既存の索引に無い URL だけを追記し、追記後は重複排除・ソートしてから保存する（例: `cat <新規URL群> trends-published-urls.txt | sort -u -o trends-published-urls.txt`）
- ファイルが存在しない場合は、その場で `site/src/lib/data/*.json` 全件から URL を集めて新規作成した上で今回分も加える（初回のみ発生。以後は差分追記のみで済む）

## 注意事項

- **保存先・ファイル形式は `output-profile.md` が正本**。このファイルを差し替えれば別環境・別形式に対応できる
- 収集 JSON が壊れている・`items` が空などの場合は、その旨を報告して書き込みを中断する
- 見出し・要約の本文は通常の日本語で書く（圧縮口調にしない）
- 1 回の実行で収集 JSON の全件を書き込む（件数が多くても省略しない）
- 書き込み後に `site/src/lib/data/YYYY-MM-DD.json` が妥当な JSON であることを確認する（例: `python3 -c "import json; json.load(open('site/src/lib/data/YYYY-MM-DD.json'))"`）
- **無人実行が前提**（スケジュールルーティンから起動される）。`collect` の呼び出しを含め、全工程を同一ターン内・同一セッションで同期的に完了させること。Agent ツール等でバックグラウンドの subagent に処理を委譲してターンを終了してはいけない（ルーティンのセッションはそのターンの完了をもって「成功」扱いになるため、委譲した subagent がその後に出す結果は誰にも回収されず失われる）
