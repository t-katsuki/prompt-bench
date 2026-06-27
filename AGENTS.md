# AGENTS.md

## Git Workflow（YOU MUST: 毎回この順で実行）

新しい作業は必ず feature branch を切ってから始める。`main` に直接 commit しない。

1. `git checkout -b <feature-branch>` でブランチ作成
2. 実装 → commit
3. `git push` → PR を作成
4. CI / Preview の結果を確認
5. **Squash and merge** でマージ
6. `git checkout main`
7. `git pull origin main`
8. `git branch -D <feature-branch>`  ← 小文字 `-d` ではなく大文字 `-D`

注意:
- Squash and merge 後のローカルブランチ削除は必ず `-D`。`-d` は "not fully merged" 警告を出す。

## Security（IMPORTANT）

- 秘密情報（APIキー / 各種シークレット / トークン）をコードや commit に絶対含めない。`.env` 系で管理し `.env*` は gitignore 済みであることを前提とする。
- 新しい秘密情報を扱うときは、まず環境変数経由になっているか確認してから書く。
- ハードコードされた秘密情報を見つけたら、続行せず先に指摘する。
