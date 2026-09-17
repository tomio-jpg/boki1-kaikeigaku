# GitHub Pages公開手順

対象は https://github.com/tomio-jpg/boki1-kaikeigaku のみです。

## 採用方式

GitHub Actionsで `dist/` の中身をそのままPagesへ公開します。ビルド・インストールは不要です。ブランチからの公開で選べるフォルダーはルートまたはdocsのため、現在のdist構成にはActionsが適しています。テスト・資料・開発用スクリプトはPagesの公開ファイルに含めません。

## GitHubで行う操作

1. このリポジトリの **Settings → Pages** を開きます。
2. **Build and deployment → Source** を **GitHub Actions** に変更します。
3. この方式ではBranchやフォルダーを選びません。提案される「Static HTML」などのConfigureも不要です。公開用ファイルは追加済みです。
4. リポジトリの **Actions** タブを開き、左側の **Deploy accounting PWA to GitHub Pages** を選択します。
5. **Run workflow** を押し、Branchを **main** にして、もう一度 **Run workflow** を押します。
6. 実行結果が緑のチェックになるまで待ち、表示される公開URLを開きます。

公開予定URL： https://tomio-jpg.github.io/boki1-kaikeigaku/

今回は手動実行式です。今後も変更をpushした後、同じRun workflow操作で公開します。pushだけで自動公開しません。workflowはmain以外では公開せず、Pages設定を自動で有効化する処理も行いません。

## 公開後のPWA確認

初回は通信できる状態で開きます。正式50問、今日の10問、途中再開、結果からの復習を確認してください。iPhone Safariの共有メニューから「ホーム画面に追加」できます。初回読み込み後にオフラインでも開けることを実機で確認してください。

manifestの起動URL・範囲、アイコン、CSS、JavaScript、service workerは相対パスです。service workerは `/boki1-kaikeigaku/` の範囲に登録されます。別のアプリのキャッシュを削除する処理はありません。

localhostと公開URLは別の保存先です。PCのプレビューで保存した学習履歴は公開URLやiPhoneへ自動移行しません。
