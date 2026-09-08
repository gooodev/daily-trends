---
name: collect
description: "トレンドネタ収集（収集レイヤー）。はてブ・Hacker News 等から人気記事を収集し、重複統合・興味度判定した上で、公開する全件について本文取得・要約生成まで行い JSON として出力する。保存先・出力形式には関知しない。トリガーは「トレンド収集」「trends collect」など。通常は `/output` から自動的に呼び出される。"
---

# トレンドネタ収集（収集レイヤー）

サイトから人気記事を収集し、興味領域とのマッチング・重複統合を行った上で、**公開対象に決まった全件について本文を取得し要約を生成**し、**JSON ファイル**として出力する。保存先ディレクトリやファイル名・見出しレベルなど「どこに・どう書くか」は関知しない（`/output` 等の出力レイヤー側の責務）。

## 出力先

`./.trends-work/trends-collect-YYYY-MM-DD.json`（カレントディレクトリ相対。ディレクトリが無ければ作成する）

既に当日分のファイルが存在する場合は上書きせず、その旨を報告して終了する（再収集したい場合はユーザーに確認の上で明示的に削除してから再実行する）。

## 実行手順

### 0. 収集プロファイル読み込み

興味領域（興味フラグ）と収集ソース一覧は Cloudflare D1 + Worker API から取得する（このリポジトリ単体の設定ファイルではなく外部ストア）:

```bash
curl -s https://daily-trends-interests-api.gooodev.workers.dev/
```

レスポンス形式は `{ "flags": [...], "sources": [...] }`。

- `flags[]`: `{ label, tier, notes, updated_at }`。`tier` が `core` / `rising` → ★★★ 判定の基準、`watching` → ★★、`suppressed` → 原則不採用（`label` がトピック名、`notes` に補足説明）
- `sources[]`: `{ group_name, source_type, url, label, enabled, notes, updated_at }`。無効化されたソース（除外・停止中）は API 側で既に除かれており `enabled=1` のみ返る。`group_name` でソース種別グループ（はてブIT / Hacker News / 生成AI・研究 / セキュリティブログ・研究 / エンタープライズIT / モダンデータスタック / JavaScript/TypeScriptエコシステム / インフラ・DevOps / Redditサブレッド / 日本発信）を判定し、`source_type` で取得方法（`hatena` / `hn` / `blog` / `hf-papers` / `reddit` / `script-zenn` / `script-qiita`）を判定する。`url` が対象URL（Reddit のみ `r/サブレッド名` 形式）

加えて、このスキルと同じディレクトリの `guidance.md`（業務文脈・収集上限・カテゴリ粒度メモ）を読み込む。

サンドボックス環境では curl が名前解決に失敗することがある。その場合は `dangerouslyDisableSandbox: true` で実行する。API が応答しない場合はその旨を報告して中断する（ローカルへのフォールバックは無い）。

### 1. トレンド情報の収集（一覧取得）

手順 0 で取得した `sources` から最新のトレンド情報を取得する。この段階ではタイトル・URL・シグナル値（ブックマーク数/ポイント数/ups 等）の軽量な一覧取得のみを行う（本文取得は手順 4 でまとめて行う）。`group_name` ごとの取得方法：

**はてブIT**（`source_type: hatena`）

- 各ソースの `url`（カテゴリ URL）を巡回
- 各エントリーの**タイトル、元記事 URL、ブックマーク数**を必ず取得すること
- はてブのエントリーページ URL ではなく、リンク先の元記事 URL を抽出

**Hacker News**（`source_type: hn`）

- 各記事の**タイトル、HN コメントページ URL（`https://news.ycombinator.com/item?id=XXXXX`形式）、ポイント数**を取得
- **元記事 URL ではなく HN のコメントページ URL を使用すること**（コメントも確認できるようにするため）
- **タイトルは日本語に翻訳して出力**

**セキュリティブログ・研究**（`source_type: blog`、`group_name: セキュリティブログ・研究`）

- 各ブログの最新 1-3 記事をチェックし、興味度 ★★★ のものがあれば注目トピックに含める

**エンタープライズIT**（`source_type: blog`、`group_name: エンタープライズIT`）

- 各サイトのトップ・新着から記事を取得

**Redditサブレッド**（`source_type: reddit`）

- **重要**: WebFetch ツールは reddit.com をブロックするため、**Bash ツールで curl コマンドを使用**すること
- 各 `url`（`r/サブレッド名` 形式）から `/hot.json?t=day&limit=10` で上位 10 件を取得
- **www.reddit.com を使用**（old.reddit.com は 403 エラーが返されるため）
- User-Agent ヘッダーを設定: `"User-Agent: neta-trend-collector/1.0 (trend analysis tool)"`
- 各記事の**タイトル、Reddit コメントページの完全 URL、投票数（ups）、コメント数**を取得
- **タイトルは日本語に翻訳して出力**

取得例（Bash ツールで実行。サンドボックス下では名前解決に失敗するため `dangerouslyDisableSandbox` が必要）:

```bash
curl -s -H "User-Agent: neta-trend-collector/1.0 (trend analysis tool)" \
  "https://www.reddit.com/r/programming/hot.json?t=day&limit=10" | \
  jq -r '.data.children[] | "\(.data.title)|\(.data.ups)|\(.data.num_comments)|https://www.reddit.com\(.data.permalink)"'
```

データ構造:

- `data.children[].data.title`: タイトル
- `data.children[].data.ups`: 投票数
- `data.children[].data.num_comments`: コメント数
- `data.children[].data.permalink`: パス（`https://www.reddit.com` + permalink で完全 URL）

**生成AI・研究**（`source_type: blog`、`group_name: 生成AI・研究`）

- 各ブログの最新記事を WebFetch で取得
- タイトルは日本語。英語記事は翻訳して掲載

**生成AI・研究 / Hugging Face Papers**（`source_type: hf-papers`）

- AI/ML 論文の日次トレンドを **Python スクリプト** `scripts/fetch_hf_papers.py` で取得

**モダンデータスタック**（`source_type: blog`、`group_name: モダンデータスタック`）

- 各ブログを WebFetch で取得

**JavaScript/TypeScriptエコシステム・インフラ・DevOps**（`source_type: blog`）

- 各公式ブログを WebFetch で取得

**日本発信（Zenn・Qiita）**（`source_type: script-zenn` / `script-qiita`）

- Zenn: **Python スクリプト** `scripts/fetch_zenn.py` で「ai」「typescript」「dataengineering」タグの記事取得（RSS フィード経由）
- Qiita: **Python スクリプト** `scripts/fetch_qiita.py` で直近の人気記事取得（Qiita API は sort パラメータに対応していないため、直近数日分を取得しいいね数でスクリプト側でソート）
- タグフィルタで関連度の高い記事のみ抽出
- 事前に `scripts/.venv` を作成し `pip install -r scripts/requirements.txt` を実行しておくこと（`scripts/README.md` 参照）。スクリプトは `--format json` で実行し JSON を読み取る

### 2. 分析

収集した情報を以下の観点で分析：

**興味領域マッチング（最優先）**

- 各記事を手順 0 で取得した `flags` と照合し、関連度を評価
- `tier: core` / `rising` に該当する記事を最上位に配置（`interest: 3`）
- `tier: suppressed` に該当する記事は関連度を下げる（`interest: 1`。原則不採用）

**はてブ IT**

- 日本のエンジニアに刺さりやすい話題
- 議論を呼びそうなトピック
- 技術トレンド（AI、開発手法、ツール等）
- キャリア・働き方関連

**Hacker News**

- グローバルで話題の技術トレンド
- スタートアップ・プロダクト関連
- セキュリティ関連（脆弱性、攻撃手法、インシデント）
- 議論を呼んでいるトピック（ポイント数が高い）

**Reddit**

- 投票数（ups）とコメント数でコミュニティの反応を評価
- 議論が活発なトピック（コメント数が多い）を優先

### 3. 既出除外・重複統合・件数確定（必須）

**既出除外**: リポジトリルートの `trends-published-urls.txt`（過去に掲載した全記事 URL を1行1件で並べたフラットな索引ファイル）と照合し、今回の収集候補のうち URL が完全一致するものは除外する。過去に一度でも掲載した記事は、日付を問わず再掲しない。

- 日々の `site/src/lib/data/*.json` を毎回全件読み直すのではなく、この単一のテキストファイルを Bash（`grep -F` 等）で照合することで、掲載日数が増えても収集のたびに走査量が増大しないようにする
- ファイルが存在しない場合（初回や消失時）は、その旨を報告した上で `site/src/lib/data/*.json` 全件から URL を再構築して補う（`/output` の「既出索引の更新」手順を参照）

**重複統合**: 同一事案を扱う複数記事は代表 1 件に統合する。

- 同じインシデント・同じ製品リリース・同じ研究成果を扱っていれば「同一」と見なす（ソースが異なっていても）
- 例: 「Aikido の GitHub 侵害解説」と「同事案の reddit スレ」「同事案の gigazine 続報」→ 1 件に統合
- 例: 「Qwen 3.7 発表（gigazine）」と「Qwen 3.7 reddit 反応」→ 1 件
- 似ているが事案が違う場合（例: NGINX 0-day と Defender 0-day）は別項目のまま残す

代表記事の選び方（優先順）: 1. 日本語ソース 2. 一次情報・公式発表 3. より詳細・深掘りされている方。統合された他記事の要点は代表記事の要約に 1〜2 句だけ織り込み、URL は `merged_urls` に記録する。

**件数確定**: 全エントリーは載せない。`guidance.md` の「## 収集上限」を目安に、関連性の高い記事のみに絞り込む。ここで**公開する記事リストを確定する**（手順 4 の本文取得はこの確定リストに対してのみ行う。無駄な取得を避けるため、絞り込み前の候補全件には行わない）。

- **ソース横断のカテゴリ別**にする。はてブ / HN / Reddit / Aikido / Wiz など全ソースを 1 つのカテゴリにまとめる
- カテゴリ粒度は**中粒度**。カテゴリ例と細分化・統合の指示は `guidance.md` の「カテゴリ粒度メモ」に従う
- カテゴリは固定リストではない。当日の記事に合わせて適切に切る。1 カテゴリ 2〜3 件しか無いなら近接カテゴリに統合してよい
- 記事の並び順がそのまま出力順（カテゴリ順→記事順）になる。カテゴリ順は関連性の高いものから（ユーザー興味領域に直結するカテゴリを上に）

### 4. 要約生成（確定リストの全件が対象）

手順 3 で確定したリストの**全記事**について、本文を取得し要約を生成する（チェック等による絞り込みは行わない。独立した記事は並列で取得してよい）。

**本文取得**:

- **通常の記事 URL** → WebFetch で本文を取得
- **Hacker News コメントページ**（`news.ycombinator.com/item?id=` 形式）→ HN ページから元記事 URL を抽出して元記事本文も取得。HN コメントの主要な論点があれば 1〜2 点拾う
- **Reddit URL** → WebFetch は reddit.com をブロックするため、Bash で curl を使う（手順 1 と同じ User-Agent）。リンク投稿ならリンク先記事も WebFetch で取得
- **取得失敗時**（ペイウォール・ブロック・404 等）→ はてブコメントページ（`https://b.hatena.ne.jp/entry/{URL}`）や Web 検索で内容を補完し、`note` に「※本文取得不可のため {補完元} から要約」と記録する。それでも情報が足りなければ手順 1〜2 で得たタイトル・スニペットのみから簡潔な要約に留め、`fetch_status: "failed"` とする
- サンドボックス環境では curl がネットワーク制限で失敗することがある。その場合は `dangerouslyDisableSandbox: true` で実行する

`summary_ja`（1〜2 文）: 記事内容のサマリ。何が書かれているか・なぜ重要かを端的に。タイトルの繰り返しは禁止。詳細な論点列挙（bullets）や個別の業務示唆（implication）は生成しない。

`fetch_status`: `ok`（本文取得成功）/ `fallback`（補完元から要約）/ `failed`（本文取得失敗・簡潔な要約のみ）。`note`: 補完元の注記が必要なときだけ記載、無ければ空文字列。

### 5. JSON 出力

まず「ネタ収集完了。」というメッセージを返してから、`./.trends-work/trends-collect-YYYY-MM-DD.json` へ書き込む。

**タイトル**: 全て日本語。英語ソースは翻訳して掲載。意訳可だが固有名詞（製品名・人名・CVE 番号）は保持。

**フォーマット**（`schema: "trends-collect/3"`。手順 4 で追加した `summary_ja` / `fetch_status` / `note` を含む）:

```json
{
  "schema": "trends-collect/3",
  "date": "YYYY-MM-DD",
  "items": [
    {
      "title_ja": "日本語タイトル",
      "url": "https://...",
      "source": "hatena",
      "category": "AI/エージェント開発・実装",
      "summary_ja": "記事内容のサマリを1〜2文で。",
      "interest": 3,
      "merged_urls": [],
      "fetch_status": "ok",
      "note": ""
    }
  ],
  "stats": { "collected": 0, "published": 0 }
}
```

フィールド定義:

- `source`: ソース識別子（`hatena` / `hn` / `reddit` / `zenn` / `qiita` / `hf-papers` / それ以外はドメイン名）
- `interest`: 1〜3（★ 相当。出力レイヤーは通常これを表示しないが、上限超過時の削り判断に使う）
- `merged_urls`: 重複統合で代表に吸収された URL（無ければ空配列）
- `stats.collected`: 巡回で見つかった全記事数（統合前）、`stats.published`: `items` に採用した件数（= 手順 4 で本文取得した件数）

`fetch_status`/`note` は補完元の注記が必要なときだけ使う内部フィールド（出力レイヤーで `summary_ja` に統合されて落とされる）。

## 注意事項

- WebFetch ツールを使用して情報を取得
- **すべての記事に URL リンクを必ず含める（リンクなしは不可）**
- **はてブは元記事の URL を必ず取得**（はてブページ URL ではなく）
- **Hacker News は HN コメントページ URL（`item?id=`形式）を使用**（元記事 URL ではなく）
- **Hacker News のタイトルは日本語に翻訳**
- **Reddit は Reddit コメントページの完全 URL（`https://www.reddit.com/r/subreddit/comments/...`形式）を使用**
- **Reddit のタイトルは日本語に翻訳**
- Reddit API レート制限に注意（1 分あたり 60 リクエスト程度）
- 要約文（`summary_ja`）は通常の日本語で書く（圧縮口調にしない）。英語記事も要約は日本語
- 投票数（ups）/コメント数が高い記事を優先（**指標自体は JSON に載せない**。重要度判定のためだけに使う）
- ポイント数/ブックマーク数が高い記事は特に注目
- **サンドボックス環境の注意**: Bash の curl（interests API・Reddit）や Python スクリプト（HF Papers・Zenn・Qiita）はサンドボックスのネットワーク制限で名前解決に失敗することがある。その場合は `dangerouslyDisableSandbox: true` で実行する
- カテゴリは中粒度・ソース横断。当日の記事に合わせて 5〜10 個程度に切る
- **`trends-published-urls.txt` に載っている URL は手順 3 の既出除外で必ず取り除く**（同じ記事の再掲を防ぐ。索引ファイルの更新自体は `/output` の責務）
- **同一事案を扱う複数記事は手順 3 の重複統合で代表 1 件にまとめる**（件数確定前に必須）
- **本文取得（手順 4）は件数確定後の公開リストに対してのみ行う**。絞り込み前の候補全件に対しては行わない（無駄なアクセスを避けるため）
- 1 回の実行で確定リスト全件を処理する（件数が多くても省略しない）
- **このスキルは保存先・ファイル形式・Markdown 見出しレベル等に一切関知しない**（`/output` 等の出力レイヤーの責務）
