# Day 37: CHIP-8 Emulator (Go)

CHIP-8 エミュレーターを Go 言語で実装します。

## 概要

このプロジェクトは、古典的な仮想マシン CHIP-8 のエミュレータを Go 言語で実装する試みです。
Ebiten ライブラリを使用してグラフィカルなインターフェースを提供し、基本的な CHIP-8 ROM を実行できます。

## プロジェクト構成

```
/
├── cmd/
│   ├── chip8_ebiten/  # Ebiten を使用したグラフィカルエミュレータ (メイン)
│   │   └── main.go
│   └── chip8_tester/  # CHIP-8 コアのテスト/デバッグ用 CLI ツール
│       └── main.go
├── internal/
│   └── chip8/         # CHIP-8 エミュレータのコアロジック
│       ├── chip8.go
│       ├── chip8_test.go
│       └── opcodes.go
├── roms/                # CHIP-8 ROM ファイル (ユーザーが配置)
├── assets/
│   └── fonts/         # フォントデータ (現在は未使用、ハードコード)
│       └── chip8_font.bin
├── go.mod
├── go.sum
└── README.md
```

## ビルドと実行

**前提:** Go 言語の開発環境がセットアップされていること。

1.  **リポジトリのクローンと移動:**
    ```bash
    # git clone ... (必要に応じて)
    cd day37_chip8_emulator_go
    ```

2.  **依存関係の取得:**
    ```bash
    go mod tidy
    ```

3.  **テスト ROM の配置:**
    `roms/` ディレクトリを作成し、実行したい CHIP-8 ROM ファイル（例: `PONG`, `INVADERS`, `test_opcode.ch8` など）を配置してください。
    テスト ROM はインターネット上で "chip-8 test roms" 等で検索して入手できます。

4.  **Ebiten 版エミュレータの実行:**
    ```bash
    go run ./cmd/chip8_ebiten/main.go -rom roms/<your_rom_file.ch8>
    ```
    *   ウィンドウが表示され、エミュレーションが開始されます。
    *   `ESC` キーで終了します。

5.  **テスト用 CLI ツールの実行 (オプション):**
    指定した時間エミュレーションを実行し、最終的な画面状態を PNG ファイルに出力します。
    ```bash
    go run ./cmd/chip8_tester/main.go -rom roms/<your_rom_file.ch8> -duration 5s -output snapshot.png
    ```

## 操作方法 (Ebiten 版)

*   **CHIP-8 キーパッド:** 以下のキーボードキーに対応します。
    ```
    1 2 3 C  =>  1 2 3 4
    4 5 6 D  =>  Q W E R
    7 8 9 E  =>  A S D F
    A 0 B F  =>  Z X C V
    ```
*   **終了:** `ESC` キー

## コマンドラインフラグ

### `chip8_ebiten`

*   `-rom <path>`: (必須) 実行する CHIP-8 ROM ファイルへのパス。
*   `-cycles <uint>`: フレームあたりの CPU サイクル数 (デフォルト: 10)。ゲーム速度の調整に使用します。
*   `-schip <bool>`: SCHIP (Super CHIP) の挙動を有効にするか (デフォルト: false)。SHL/SHR や LD [I]/LD Vx の挙動に影響します。
*   `-scale <float>`: ウィンドウの拡大率 (デフォルト: 10)。

### `chip8_tester`

*   `-rom <path>`: (必須) 実行する CHIP-8 ROM ファイルへのパス。
*   `-cycles <uint>`: フレームあたりの CPU サイクル数 (デフォルト: 10)。
*   `-schip <bool>`: SCHIP の挙動を有効にするか (デフォルト: false)。
*   `-duration <duration>`: エミュレーションを実行する時間 (例: `5s`, `1m`、デフォルト: 5s)。
*   `-output <filename>`: 出力する PNG スナップショットのファイル名 (デフォルト: `snapshot.png`)。

## 開発ステップ

(ここに詳細な開発ステップが記述されます) 
