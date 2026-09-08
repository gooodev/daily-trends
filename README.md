# daily-trends

日々の技術トレンドネタ収集ログ。SvelteKit 製サイトとして GitHub Pages で公開し、PC を問わずブラウザから閲覧できるようにしたもの。

## 使い方

Claude Code（ローカル・Claude Code on the web どちらでも）でこのリポジトリを開き、`/output` と発話するとその日のトレンドネタを収集し、記事一覧と要約を `site/src/lib/data/YYYY-MM-DD.json` に1回で書き込む。手動でのチェック・絞り込みステップは無い（無人実行前提のため、収集された記事は全件自動で要約まで生成される）。

- `/output`: トレンドネタ収集（`collect` を内部で呼び出す）・`site/src/lib/data/YYYY-MM-DD.json` への一覧＋要約の出力

実行後は変更を commit・push すること（push すると GitHub Actions がサイトをビルド・デプロイする。ローカルで `pnpm run build` する必要はない）。毎朝 7:00 (JST) に Claude Code のスケジュールルーティンから自動実行される。

## 構成

- `site/`: SvelteKit 製フロントエンド（Vite + Tailwind CSS + daisyUI + Iconify、`@sveltejs/adapter-static` で静的書き出し）
  - `site/src/lib/data/*.json`: 日別のトレンドデータ（一覧＋要約を含む）。ホームで日付一覧、`/[date]` で当日分を表示。各記事に「興味あり」の星ボタンあり
  - `site/src/routes/admin/`: 興味プロファイル（情報ソース・興味フラグ）の管理 UI（トークン認証）
- `.claude/skills/output/`: 出力レイヤー（収集 JSON を `site/src/lib/data/` に書き込む）
- `.claude/skills/collect/`: 収集レイヤー（巡回・重複統合・興味度判定に加え、公開対象全件の本文取得・要約生成まで行う）。`guidance.md` に収集上限・カテゴリ粒度メモを置く（興味領域・収集ソース自体は D1 側）
- `.trends-work/`（gitignore 対象）: 収集の中間 JSON
- `trends-published-urls.txt`: 過去に掲載した全記事 URL の索引（1行1件）。`collect` の既出除外（同じ記事を再掲しない）が参照し、`output` が投稿のたびに追記する
- `db/`: Cloudflare D1 のスキーマ・シード。`schema.sql`/`seed.sql`（興味フラグ・情報ソース）、`schema_marks.sql`（記事ごとの「興味あり」マーク用テーブル、追加分）
- `worker/`: D1 の内容を JSON で返す Cloudflare Worker（`daily-trends-interests-api`）のソース
- `.github/workflows/deploy.yml`: push 時に `site/` をビルドし GitHub Pages にデプロイする GitHub Actions

## 公開設定

- GitHub Pages: GitHub Actions ビルド（`.github/workflows/deploy.yml`）。Jekyll は使用していない
- リポジトリ直下は pnpm workspace（`.` に wrangler、`site` に SvelteKit アプリ）。ルートで `pnpm install` すれば両方の依存関係が入る

## 興味プロファイル（Cloudflare D1）

興味領域（興味フラグ）と収集ソースの一覧は、リポジトリ内のファイルではなく Cloudflare D1 データベース `daily-trends-interests` で管理する。`collect` は起動時に `https://daily-trends-interests-api.gooodev.workers.dev/interests`（認証不要の読み取り専用 JSON API）から取得する。

管理は `/admin` ページ（サイト右上の歯車アイコン）から行う。初回だけ管理トークン（Worker のシークレット `ADMIN_TOKEN`）をブラウザに入力すればよい（以後は localStorage に保存され、`/[date]` ページの「興味あり」ボタンの認証にも共用される）。トークンを忘れた・再発行したい場合:

```bash
cd worker && pnpm exec wrangler secret put ADMIN_TOKEN
```

管理 UI を使わず直接更新したい場合は `db/seed.sql` を編集して `wrangler d1 execute` で再実行するか、`wrangler d1 execute daily-trends-interests --remote --command "..."` を直接叩く。Worker 自体を変更した場合は `cd worker && pnpm exec wrangler deploy` で再デプロイする。

## 記事の「興味あり」マーク

各日のページで記事ごとに星ボタンを押すと、`article_marks` テーブル（D1、`db/schema_marks.sql`）に `(date, url)` の組で保存される。読み取り（星の表示）は誰でも見られるが、書き込みは `/admin` と同じ `ADMIN_TOKEN` が必要（星ボタン自体、未ログイン時は非表示になる — 既にマーク済みの記事だけ読み取り専用で表示される）。

## 注意

- `.claude/skills/collect/scripts/` の Python スクリプト（Zenn・Qiita・HF Papers 取得）を使う場合は、初回のみ `scripts/README.md` の手順で venv を作成する
- 収集対象の全記事について本文取得・要約まで行うため、チェック式の絞り込みだった頃より1回の実行にかかる時間・WebFetch 呼び出し数が増える
- スケジュールルーティンから起動されるセッションは、処理をバックグラウンドの subagent に委譲したままターンを終了すると、その結果が失われる（ルーティンはターン完了時点で成功扱いになるため）。全工程を同一ターン内で完了させること
