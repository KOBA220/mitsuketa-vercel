# みつけた！ ファイル差分チェッカー

旧版と新版の画像・Word・Excelを比較し、変更箇所を視覚化するWebアプリです。任意でAnthropic Claudeによる変更内容の説明も生成できます。

## 対応形式

- 画像（PNG / JPEG）: 画素差を赤丸表示し、結果画像を保存
- Word（DOCX）: 追加・削除された本文行を色分け
- Excel（XLSX / XLS / CSV）: 変更セルと旧値を表示
- Claude AI: 重要な変更、業務への影響、確認事項を日本語で整理

## ローカルで画面を確認

```powershell
npm install
npm run dev
```

`http://127.0.0.1:5173` を開きます。Vite単体では `/api/analyze` がないため、AI以外の比較機能を確認できます。AIを含めてローカル確認する場合はVercel CLIの `vercel dev` を使用します。

## GitHubへ公開

このフォルダをGitHubリポジトリへpushします。`.env` は `.gitignore` 対象です。APIキーをソースコード、`.env.example`、GitHub上の通常ファイルへ書かないでください。

## Vercelへデプロイ

1. Vercelで「Add New → Project」を開き、GitHubリポジトリをImportします。
2. Framework Presetは `Vite`、Build Commandは `npm run build`、Output Directoryは `dist` を選びます（`vercel.json` に設定済みです）。
3. Project Settings → Environment Variablesへ次を登録します。

| Name | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | Anthropic Consoleで発行した秘密鍵 |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-20250514`（必要に応じて変更） |

4. Production / Preview / Developmentの必要な環境にチェックしてDeployします。

GitHubへpushするたび、Vercelが自動で再ビルドします。APIキーはVercelのサーバー環境だけにあり、ブラウザへ配信されません。

## 構成

```text
.
├─ api/
│  ├─ analyze.js       # Anthropic API中継（Vercel Function）
│  └─ health.js        # 稼働・環境変数チェック
├─ src/
│  ├─ main.js          # アップロード、比較、AI分析UI
│  ├─ style.css
│  └─ fix.css
├─ .github/workflows/ci.yml
├─ .env.example
├─ index.html
├─ package.json
└─ vercel.json
```

## セキュリティと制限

- ローカル比較だけならファイルは外部送信されません。「AI分析を実行」を押した場合のみ、比較内容がVercel Function経由でAnthropic APIへ送信されます。
- Vercel Functionのリクエスト上限に収めるため、AI画像分析は小～中サイズの画像向けです。大きな画像はブラウザ側で縮小する実装を追加してください。
- Wordは本文、Excelは保存済みセル値を比較します。完全なレイアウトやマクロは対象外です。
- 公開サービスでは、認証・利用回数制限・監査ログの追加を推奨します。APIキーの悪用や予期しない課金を防ぐためです。

Anthropicの画像入力はbase64画像ブロックを使い、APIキーは `ANTHROPIC_API_KEY` 環境変数からVercel Functionだけが読み取ります。
