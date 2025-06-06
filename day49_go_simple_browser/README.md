# Day49: Go言語 ミニブラウザ

## 概要

Go言語とFyneライブラリを使用して、シンプルなGUIベースのミニブラウザを作成しました。
特に、1990年代後半から2000年代初頭のウェブサイトでよく見られたフレームセット構造を持つ、阿部寛さんの公式ホームページ (http://abehiroshi.la.coocan.jp/) を正しく表示することを目標としました。

https://github.com/user-attachments/assets/a5e1e683-0a12-4652-aeab-172b59dd3ec1

[100日チャレンジ day49](https://zenn.dev/gin_nazo/scraps/370bf54c6769e8)

## 主な機能

- URL指定によるウェブページナビゲーション
- HTTPリクエスト処理 (User-Agent設定含む)
- 文字コード変換: Shift_JISからUTF-8への自動変換 (Content-TypeヘッダーおよびHTML metaタグからの検出)
- HTMLパース: `golang.org/x/net/html` を使用したDOMツリー構築
- 基本的なHTML要素のレンダリング:
    - テキストノード、段落 (`<p>`)
    - 見出し (`<h1>` - `<h6>`)
    - リンク (`<a>`): FyneのHyperlinkとして表示 (ただしスタイル適用に制約あり)
    - 画像 (`<img>`): URLから画像データを取得し表示 (gif, png, jpeg対応)
    - 改行 (`<br>`)
    - フォント (`<font>`): color属性を部分的に解釈 (Fyneの制約により限定的)
    - テーブル (`<table>`, `<tr>`, `<td>`): 簡易的なテキストベースの表形式表示
    - 中央揃え (`<center>`)
- フレームセット対応:
    - `<frameset>` および `<frame>` タグを解釈
    - 各フレームのコンテンツを再帰的に読み込み、左右分割で表示
- 画像のURL解決: 相対URLを絶対URLに変換して画像を取得

## 使い方

1. リポジトリをクローンし、`day49_go_simple_browser` ディレクトリに移動します。
2. `go build` コマンドでアプリケーションをビルドします。
3. 生成された実行ファイル (`day49_go_simple_browser`) を実行します。
4. ウィンドウ上部のURL入力欄に表示したいURL (デフォルトは阿部寛さんのホームページ) を入力し、「読み込み」ボタンをクリックします。

## 学んだこと・課題

- **Go言語によるHTTP通信とHTML処理**: `net/http` パッケージによるHTTPクライアントの実装、`golang.org/x/net/html` によるHTMLパースは非常に強力で柔軟でした。
- **文字コードの取り扱い**: Shift_JISのようなレガシーな文字コードのサイトに対応するためには、Content-Typeヘッダーだけでなく、HTMLのmetaタグからもエンコーディングを判定する必要があることを学びました。`golang.org/x/text` パッケージが役立ちました。
- **FyneライブラリでのGUI構築**: FyneはクロスプラットフォームGUIをGoで迅速に構築できる便利なツールですが、HTML/CSSのような詳細なスタイリングやレイアウト制御には限界があることを実感しました。特に、ウィジェットごとの細かい色指定やフォント変更、インラインでの複雑なスタイル適用は標準機能では困難でした。
- **フレームセット構造の再現**: 古いHTML構造であるフレームセットを正しく解釈し、各フレームを個別のコンテンツとして読み込み、レイアウトする処理は興味深い挑戦でした。
- **UI/UXの難しさ**: ブラウザのような複雑なUIを持つアプリケーションでは、ユーザー体験を損なわずに情報を整理し表示することの難しさを改めて感じました。

### 今後の課題・改善点

- **CSSの基本的な解釈と適用**: 現状ではHTMLタグの構造のみを解釈しており、CSSによるスタイリングはほぼ無視されています。基本的なCSSセレクタやプロパティ (フォントサイズ、色、マージン、パディングなど) を解釈し、Fyneのウィジェットに適用する仕組みを導入することで、より忠実なレンダリングが可能になるでしょう。
- **JavaScriptの実行**: 動的なウェブページを表示するためにはJavaScriptエンジンの統合が不可欠ですが、これは非常に大きな課題です。
- **レンダリングパフォーマンスの最適化**: 大量のHTML要素や複雑な構造を持つページでは、現在のレンダリング手法ではパフォーマンスに問題が出る可能性があります。
- **より高度なFyneの活用**: Fyneのカスタムウィジェットやテーマ機能などを活用することで、スタイリングの自由度を高められるかもしれません。
- **エラーハンドリングと安定性の向上**: ネットワークエラーやパースエラーに対するより詳細なフィードバックと、堅牢なエラー処理が必要です。

## 開発後記

阿部寛さんのホームページという、ある種「伝説的」なサイトをターゲットにしたことで、古いHTML仕様や文字コードの問題など、現代のウェブ開発ではあまり遭遇しない課題に取り組む良い機会となりました。
Fyneの制約の中で、どこまで「それらしく」表示できるかを探るのは面白い試みでした。結果として、完全な再現には至りませんでしたが、Go言語でここまでのGUIアプリケーションが作れることを示すことができたと思います。
