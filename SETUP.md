# 導入手順（4ステップ）

## ① ZIPを展開

展開先で `npm install`、続けて `npm run build` を実行します。

## ② APIキーを安全に入力

`Copy-Item .env.example .env.local` を実行し、`.env.local` の `ANTHROPIC_API_KEY` を実際のキーへ書き換えます。APIキーを `api/analyze.js` へ直接書かないでください。

## ③ Vercelへデプロイ

Vercel Projectの Settings → Environment Variables に `ANTHROPIC_API_KEY` と `ANTHROPIC_MODEL` を登録します。ローカルから先に公開する場合は `npx vercel --prod` を実行します。

## ④ GitHubへアップロード

`git add .` の前に `git status --short` を確認し、`.env.local` が表示されていないことを確認します。その後、commitしてGitHubへpushします。

詳しいコマンドと注意事項は `README.md` を参照してください。
