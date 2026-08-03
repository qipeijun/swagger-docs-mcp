# swagger-docs-mcp

[简体中文](README.md) | [English](README.en.md) | **日本語** | [한국어](README.ko.md)

[![npm version](https://img.shields.io/npm/v/swagger-docs-mcp?label=npm&color=CB3837)](https://www.npmjs.com/package/swagger-docs-mcp)
[![CI](https://github.com/qipeijun/swagger-docs-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/qipeijun/swagger-docs-mcp/actions/workflows/ci.yml)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Swagger 2.0](https://img.shields.io/badge/Swagger-2.0-85EA2D?logo=swagger&logoColor=111)](#対応範囲)
[![MCP Server](https://img.shields.io/badge/MCP-Server-1B5E3C)](#mcp-tools)
[![License MIT](https://img.shields.io/badge/License-MIT-2F6FEB)](LICENSE)
[![Website](https://img.shields.io/badge/Website-ランディングページ-1B5E3C)](https://qipeijun.github.io/swagger-docs-mcp/?lang=ja)

AI Agent が Swagger 2.0 / Knife4j の API 定義をリアルタイムに検索・展開できる、読み取り専用 MCP サーバーです。

`swagger-docs-mcp` は、バックエンド API ドキュメントを読む必要がある AI Agent 向けに設計されています。Swagger 2.0 ドキュメントをリアルタイムに取得し、エンドポイント、パラメーター、Schema を構造化された結果へ変換します。ステートレス、読み取り専用、出典追跡可能という境界を維持します。

## 特長

- **リアルタイム取得**：Swagger JSON と Knife4j（Springfox）の `doc.html` 検出に対応します。
- **多角的な検索**：カテゴリ、パス、HTTP Method、キーワード、Knife4j ディープリンクから API を特定できます。
- **構造化 Schema**：対応するリクエスト・レスポンスモデルを再帰的に展開し、動的 Map、循環、欠落参照、外部参照の境界を明示します。
- **追跡可能な結果**：各クエリにドキュメント入口、実際の仕様 URL、取得時刻、ドキュメントフィンガープリントが含まれます。
- **明確な境界**：ドキュメント URL を保存せず、呼び出し間キャッシュを使わず、業務 API を実行せず、解決できないフィールドを推測しません。
- **複数クライアント**：Codex、Claude Code、Gemini CLI、IDE 系 Agent クライアント向けの設定を提供します。

## クイックスタート

Node.js 20 以降が必要です。グローバルインストールは不要です。

### MCP クライアントへ接続

[`swagger-docs-mcp`](https://www.npmjs.com/package/swagger-docs-mcp) は npm で公開されています。Codex、Claude Code、Gemini CLI では設定を自動的に書き込み、実際の起動コマンドが期待値と一致することを検証します。

```bash
npx --yes swagger-docs-mcp@latest setup codex
npx --yes swagger-docs-mcp@latest setup claude
npx --yes swagger-docs-mcp@latest setup gemini
```

IDE 系クライアントでも同じ入口から対応形式の設定を生成できます。

```bash
npx --yes swagger-docs-mcp@latest setup cursor
npx --yes swagger-docs-mcp@latest setup vscode
npx --yes swagger-docs-mcp@latest setup opencode
```

対応クライアントをすべて表示します。

```bash
npx --yes swagger-docs-mcp@latest setup list
```

自動設定では、後続の起動を再現できるように現在の正確なパッケージバージョンを保存します。このプロジェクトが作成した旧設定を削除するには次を実行します。

```bash
npx --yes swagger-docs-mcp@latest remove claude
```

現在の `upgrade` は所有権と安全性の確認のみを行います。公式クライアント CLI は検証可能なアトミック置換と完全なロールバックを提供していないため、旧バージョンを検出した場合は既存設定を先に削除せず、停止して手動アップグレードを求めます。

### Agent にセットアップを依頼

ローカルコマンドとファイル操作が可能な Agent に、次のタスクを送信してください。既存設定を上書きしないよう、インストール前にクライアントと設定契約を検証させます。

```text
現在の MCP クライアントに swagger-docs-mcp をインストールして設定してください。

要件：
1. Node.js がバージョン 20 以降であることを確認し、現在のクライアント名を正確に特定してください。クライアントや設定形式を推測しないでください。
2. `npx --yes swagger-docs-mcp@latest setup list` を実行し、出力から正確なクライアント ID を選択してください。
3. `npx --yes swagger-docs-mcp@latest setup <client>` を実行してください。
4. コマンドが設定を自動的に書き込む場合、起動コマンドの整合性検証が明示的に成功したことを確認してください。
5. JSON のみが出力される場合は、現在のクライアントの公式な設定ファイル位置と構造を確認してから、他の設定を保持したまま `swagger-docs` エントリを統合してください。書き込み後に再度解析し、完全な起動コマンドを検証してください。
6. 同名設定、権限エラー、検証失敗、不明確な外部契約がある場合は停止して理由を説明してください。上書き、削除、推測による修復をしないでください。
7. 最後に `npx --yes swagger-docs-mcp@latest doctor` を実行し、使用したクライアント ID、コマンド、変更箇所、検証結果を報告してください。

Swagger ドキュメント URL、パスワード、Token を保存せず、今回の接続に無関係な MCP 設定を変更しないでください。
```

### 診断を実行

```bash
# ローカル実行環境を確認
npx --yes swagger-docs-mcp@latest doctor

# リアルタイムのドキュメント検出を確認
npx --yes swagger-docs-mcp@latest doctor http://127.0.0.1:8080/doc.html

# 指定グループを確認
npx --yes swagger-docs-mcp@latest doctor https://example.com/doc.html --group exact-group-name

# CI やスクリプト向けに JSON を出力
npx --yes swagger-docs-mcp@latest doctor https://example.com/doc.html --json
```

## 対応クライアント

| ID | クライアント | 接続方式 |
| --- | --- | --- |
| `codex` | OpenAI Codex | 設定を書き込み、起動コマンドの整合性を検証 |
| `claude` | Claude Code | 設定を書き込み、起動コマンドの整合性を検証 |
| `gemini` | Gemini CLI | 設定を書き込み、起動コマンドの整合性を検証 |
| `vscode` | VS Code / GitHub Copilot | `servers` 設定を生成 |
| `cursor` | Cursor | `mcpServers` 設定を生成 |
| `windsurf` | Windsurf | `mcpServers` 設定を生成 |
| `trae` | Trae | `mcpServers` 設定を生成 |
| `cline` | Cline | `mcpServers` 設定を生成 |
| `roo` | Roo Code | `mcpServers` 設定を生成 |
| `kiro` | Kiro | `mcpServers` 設定を生成 |
| `opencode` | OpenCode v2 | `mcp.servers` 設定を生成 |

自動設定は公式クライアント CLI のみを呼び出します。検出コマンドはシステムの一時ディレクトリで実行し、15 秒でタイムアウトします。設定生成モードは JSON のみを出力し、ユーザーファイルを読み書きしません。`setup` は同名設定を上書きしません。npm alias、追加起動引数、解析不能な設定は外部設定として扱います。追加や検証に失敗しても、並行書き込みを誤って削除しないようサービス名による自動削除は行わず、手動確認を求めます。削除時は実行前に起動コマンドを再検証し、実行後に同名設定が消えたことを確認します。

「設定を生成」は、クライアントが公開する設定構造に基づいたテンプレートを出力することを意味します。すべてのクライアントバージョンで実動作を検証済みという意味ではありません。設定形式が変わった場合は公式ドキュメントを確認し、互換性 Issue を作成してください。

## 使用例

会話内でドキュメント URL と検索対象を同時に指定します。

```text
http://203.0.113.10:8080/doc.html の API カテゴリをすべて一覧表示してください。
```

```text
http://203.0.113.10:8080/doc.html の
/api/v1/study-exam-stat/baseline-class-stat POST を取得し、
リクエストとレスポンスの全フィールドを展開してください。
```

```text
http://203.0.113.10:8080/doc.html で「成績統計」を検索してください。
```

Knife4j ディープリンクを直接指定することもできます。

```text
次の API を確認してください：
http://203.0.113.10:8080/doc.html#/default/uniform-study-exam-stat-controller/getUniformStudyExamStatDetailUsingGET
```

例の `203.0.113.10` は IANA 予約アドレスで、実在するサービスではありません。

### メイン Agent で開発とデバッグを継続

`swagger-docs-mcp` はリアルタイム API ドキュメントを読み取り、検証した Tool 結果を現在のメイン Agent に返します。Agent はリクエスト・レスポンスフィールドを手作業でコピーせず、コードの確認、接続実装、テストを続行できます。

```text
次の API ドキュメントに基づいて現在の機能をデバッグしてください：

http://203.0.113.10:8080/doc.html#/default/uniform-study-exam-stat-controller/getUniformStudyExamStatDetailUsingGET

要件：
1. 最初に swagger-docs-mcp で API をリアルタイムに検索・検証し、フィールドを推測しないでください。
2. リクエスト Method、パス、必須パラメーター、リクエストボディ、レスポンスフィールドを確認してください。
3. 現在のプロジェクトにある API ラッパー、呼び出し箇所、ページ状態を確認してください。
4. 既存のプロジェクトパターンに従って修正または接続を完了し、推測的な互換分岐を追加しないでください。
5. 必要なテストやページ診断を実行し、ドキュメントの出典と実際の検証結果を報告してください。
```

メイン Agent には、対象コード、ターミナルまたはブラウザのデバッグ環境、テスト環境へアクセスするためのネットワークとログイン状態も必要です。この MCP はドキュメントのみを読み取り、Swagger に記載された業務 API は呼び出しません。業務リクエストはプロジェクトの実行環境またはメイン Agent のデバッグツールが実行します。

## MCP Tools

| Tool | 説明 |
| --- | --- |
| `inspect_api_docs` | ドキュメント入口またはディープリンクを識別し、ナビゲーションの手がかりを検証して次の操作を返す |
| `list_api_categories` | API カテゴリと操作数をページングで一覧表示 |
| `get_api_category` | 正確なカテゴリ名から概要または完全なドキュメントを返す |
| `get_api_by_path` | 正確なパスと任意の HTTP Method から完全な API ドキュメントを返す |
| `search_apis` | パス、概要、説明、カテゴリ、operationId を検索 |

すべての Tool は `docsUrl` の明示指定と `outputSchema` の宣言が必要です。成功結果には `source`、`sourceNotice`、`data`、`warnings`、`completeness` が共通して含まれます。エラー結果は `isError: true` と安定したエラーコード、失敗段階を返します。API 詳細にはリクエストパラメーター、リクエストボディ Schema、レスポンスステータスに加えて次が含まれます。

- `schemaTree`：モデル階層を保持するフィールドツリー。
- `flatFields`：検索・表示向けのフラットなフィールドパス。
- `schemaReferences`：解決中に参照した Schema。
- `unresolvedDynamicFields`：静的展開できない動的フィールド。
- `warnings`、`completeness`：解析境界と結果の完全性。

### クエリフロー

1. `inspect_api_docs` がドキュメント入口と Knife4j hash の手がかりをリアルタイムに確認します。
2. 複数グループがある場合は候補を返し、ユーザーが正確に選択します。サーバーは推測しません。
3. カテゴリや API が一意でない場合は候補を返し、一意になった後に `get_api_by_path` を呼び出します。
4. 後続呼び出しにも元の `docsUrl` と確定済みの `group`、`path`、`method` を渡します。

`sourceNotice` は今回の出典とキャッシュ状態を説明します。Agent は最終回答にもこの情報を残してください。

## 対応範囲

| 項目 | 状態 |
| --- | --- |
| Swagger 2.0 JSON | 対応 |
| Knife4j / Springfox ドキュメント検出 | 対応 |
| Knife4j hash ディープリンク | 対応 |
| OpenAPI 3.x | 未対応。明示的なバージョンエラーを返す |
| MCP トランスポート | stdio |
| ドキュメントプロトコル | HTTP、HTTPS |
| URL 埋め込み認証情報 | 非対応 |
| 外部 `$ref` | 取得せず、解析境界を保持 |
| トップレベルのパラメーター / レスポンスのローカル `$ref` | 対応。欠落参照は部分的完全として表示 |
| Schema のローカル `$ref`、配列、`allOf` | 再帰的に展開 |
| 動的 Map、循環参照、最大深度 | 境界を保持し、部分的完全として表示 |

## セキュリティ境界

- ユーザーが明示したドキュメント入口と同一オリジンの検出 URL のみへアクセスし、仕様に記載された業務 API は呼び出しません。
- Tool 呼び出しごとにドキュメントを再取得し、URL、選択状態、過去レスポンスを保存しません。
- リクエストタイムアウトは 10 秒、レスポンス本文は最大 20 MB です。
- 同一オリジンのリダイレクトを最大 3 回だけ追跡し、別ホストへのリダイレクトと検出 URL を拒否します。
- ユーザー名またはパスワードを含む URL を拒否し、外部 `$ref` を取得しません。
- 動的フィールド、欠落参照、循環、最大深度の境界を明示的に警告します。
- 上流障害時は失敗段階とリクエスト URL を返し、過去ドキュメントへフォールバックしません。
- 追跡用にドキュメント URL を結果へ含めます。URL クエリにパスワードや Token を入れないでください。

デフォルトでは、プロセスから到達可能な公開・プライベートネットワーク・localhost の HTTP(S) アドレスへアクセスできます。そのため、このツールは SSRF 分離プロキシではありません。信頼できない URL を扱う場合は、正確なオリジン許可リストを設定してください。

```bash
SWAGGER_DOCS_ALLOWED_ORIGINS=https://api.example.com,http://127.0.0.1:8080 \
  npx --yes swagger-docs-mcp@latest
```

完全な信頼境界と脆弱性報告方法は [SECURITY.md](SECURITY.md) を参照してください。

## 開発

```bash
npm run dev               # TypeScript エントリを直接実行
npm run typecheck         # 型チェック
npm test                  # 全テスト
npm run test:integration  # MCP 統合テスト
npm run build             # dist をビルド
npm run check             # 型チェック、テスト、ビルド
```

ビルド後、`node dist/index.js setup <client> --local` でローカルソースを接続できます。`--local` はこのリポジトリの `dist/index.js` の絶対パスを書き込みます。リポジトリを移動した場合は設定を再生成してください。

| ディレクトリ | 責務 |
| --- | --- |
| `src/source` | 安全な HTTP 取得とドキュメント検出 |
| `src/navigation` | Knife4j hash ナビゲーション解析 |
| `src/parser` | パーサー共通契約 |
| `src/swagger2` | Swagger 2.0 パーサー実装 |
| `src/service` | クエリ、ページング、出典情報 |
| `src/server` | MCP Tool 契約 |
| `src/cli` | 診断とクライアント設定 |
| `src/domain` | 共有ドメインモデル |

新しい仕様バージョンには `ApiSpecParser` を実装し、既存の Service と MCP Tool 契約を再利用できます。

### JavaScript / TypeScript API

npm のルートエクスポートには CLI の副作用がありません。`createMcpServer`、`ApiDocsService`、`Swagger2Parser`、`SafeHttpClient` とドメイン型を公開します。ルートからエクスポートされない `dist` 内部パスは Semantic Versioning の互換範囲外です。

```ts
import { ApiDocsService } from "swagger-docs-mcp";

const service = new ApiDocsService();
const result = await service.listCategories("https://api.example.com/v2/api-docs", undefined, 1, 20);
```

## リリース

1. バージョンと [CHANGELOG.md](CHANGELOG.md) を更新し、`npm run check` と `npm pack --dry-run` を実行します。
2. npm Trusted Publisher がこのリポジトリの `publish.yml` を参照し、GitHub の `npm` Environment 保護と公開権限が意図どおりであることを確認します。これらは一度だけ設定し、契約変更時のみ更新します。
3. `package.json` と一致する `vX.Y.Z` GitHub Release を作成します。ワークフローが公開ゲートを再実行し、OIDC と provenance を使って公開します。

手動の `npm publish` では `prepublishOnly` が型チェック、全テスト、ビルドを強制します。`0.x` 期間は実験的機能がマイナーバージョンで変更される場合があります。公開契約が安定した後に `1.0.0` を公開します。

## License

[MIT](LICENSE)
