# Day 23 - Image Resizer API

## 目的

事前にサーバーの `public` ディレクトリに配置したサンプル画像（`picsum.photos` から取得したもの）のIDと、希望のサイズ（幅・高さ）をパスパラメータで受け取り、画像処理ライブラリ `sharp` を使って実際に画像をリサイズし、そのリサイズされた画像データをレスポンスとして返すAPIと、そのAPIをテストするための簡単なUIを提供します。


https://github.com/user-attachments/assets/1ae0d748-ad32-4f64-ac13-d3dffe13d385

[100日チャレンジ day23](https://zenn.dev/gin_nazo/scraps/c38d986ba9c0eb)

## 主要機能

1.  **画像リサイズAPI エンドポイント:**
    *   **パス:** `/api/images/[id]/[width]/[height]`
    *   **メソッド:** `GET`
    *   **パスパラメータ:**
        *   `id`: 事前に配置したサンプル画像のファイル名 (拡張子を除く。例: `cat`, `mountain`) (必須、文字列)
        *   `width`: 希望する画像の幅 (必須、数値、1以上)
        *   `height`: 希望する画像の高さ (必須、数値、1以上)
    *   **処理:**
        *   受け取った `id` から、`public/images/` ディレクトリ内の画像ファイルパスを特定します (例: `public/images/cat.jpg`)。 **注意:** 拡張子は `.jpg` 固定とします。
        *   `fs.promises.access` などでファイルが存在するか確認します。存在しない場合は、ステータスコード `404 Not Found` とエラーメッセージ (`{ message: "Image not found" }`) をJSONで返します。
        *   `width`, `height` が数値であり、かつ1以上であることをバリデーションします。無効な場合は、ステータスコード `400 Bad Request` とエラーメッセージ (`{ message: "Invalid width or height" }`) をJSONで返します。
        *   `fs.promises.readFile` で画像ファイルを読み込みます。
        *   画像処理ライブラリ `sharp` を使用し、読み込んだ画像データを指定された `width` と `height` でリサイズします (`sharp(buffer).resize(width, height).jpeg().toBuffer()`)。出力形式はJPEGとします。
        *   リサイズ後の画像データ (Buffer) をレスポンスボディとして返します。
        *   レスポンスヘッダーに `Content-Type: image/jpeg` を設定します。
        *   レスポンスステータスコードは `200 OK` とします。
    *   **エラーハンドリング:** 画像の読み込み、リサイズ処理中に予期せぬエラーが発生した場合は、`console.error` でログを出力し、ステータスコード `500 Internal Server Error` とエラーメッセージ (`{ message: "Internal server error" }`) をJSONで返します。

2.  **テスト用UI:**
    *   **パス:** `/`
    *   **機能:**
        *   タイトル (`Day23 - Image Resizer API`) を表示します。
        *   利用可能なサンプル画像のID (`cat`, `mountain`, `abstract` など、準備したファイル名から拡張子を除いたもの) を表示または選択できるようにします（例: ラジオボタンやドロップダウン）。
        *   幅 (`width`) と高さ (`height`) を入力する数値入力フィールドを設けます。
        *   「画像表示」ボタンなどを設置します。
        *   ボタンクリック時、または入力値変更時に、選択/入力された `id`, `width`, `height` を使ってAPIエンドポイントのURL (`/api/images/{id}/{width}/{height}`) を動的に生成します。
        *   生成されたURLを `<img>` タグの `src` 属性に設定し、APIから返されるリサイズされた画像を表示します。
        *   初期表示やエラー時には、適切なメッセージやプレースホルダーを表示します。

3.  **サンプル画像の準備:**
    *   `picsum.photos` から適当な画像を **3枚** ダウンロードします。
        *   例1: `https://picsum.photos/seed/cat/600/400` -> `cat.jpg`
        *   例2: `https://picsum.photos/seed/mountain/800/600` -> `mountain.jpg`
        *   例3: `https://picsum.photos/seed/abstract/700/500` -> `abstract.jpg`
    *   `public/images/` ディレクトリを作成し、ダウンロードした画像を上記のファイル名 (`cat.jpg`, `mountain.jpg`, `abstract.jpg`) で保存します。

## 技術スタック

*   フレームワーク: Next.js (App Router)
*   言語: TypeScript
*   API: Next.js Route Handlers
*   画像処理: `sharp`
*   スタイリング: Tailwind CSS
*   DB: なし

## セットアップ

```bash
npm install
npm run dev
```

APIは `http://localhost:3001/api/images/{id}/{width}/{height}` でアクセス可能です。
UIは `http://localhost:3001/` でアクセス可能です。
