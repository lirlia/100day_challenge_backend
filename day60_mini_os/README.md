# Day60 - Mini OS with Shell

独自OS実装プロジェクト。QEMUで動作するx86-32bit OSカーネルとユーザーモードシェルを実装。

## 🎯 プロジェクト概要

完全に独自実装されたOSで、以下の機能を含みます：
- **メモリ管理**: 256MB物理メモリ、ページアロケータ
- **プロセス管理**: PCB、スケジューラ、コンテキストスイッチ  
- **割り込み処理**: IDT、例外処理、システムコール
- **特権分離**: Ring 0/Ring 3、GDT/TSS
- **キーボード入力**: PS/2キーボードドライバ
- **独自シェル**: インタラクティブコマンドライン

## 🚀 起動方法

### 1. 環境準備

**必要ツール:**
```bash
# macOSの場合
brew install nasm qemu grub

# クロスコンパイラが必要（x86_64-elf-gcc）
# 既にインストール済みの場合は確認
which x86_64-elf-gcc
```

### 2. ビルド

```bash
# プロジェクトディレクトリに移動
cd day60_mini_os

# 環境チェック
make setup

# ビルド
make clean && make
```

### 3. 起動

```bash
# 標準起動（バックグラウンド実行）
make run

# デバッグモード（QEMUモニター付き）
make run-debug

# 手動起動（詳細制御）
qemu-system-i386 \
    -kernel build/kernel.bin \
    -serial file:output.log \
    -display none \
    -m 256M \
    -no-reboot \
    -no-shutdown
```

### 4. ログ確認

```bash
# OSの出力を確認
make log

# または直接ファイルを表示
cat output.log

# リアルタイム監視
tail -f output.log
```

## 📊 現在の実装状況

### ✅ 完成済み機能

- **Phase 1-3**: ブートローダー、メモリ管理（256MB）
- **Phase 4-5**: プロセス管理、割り込み処理
- **Phase 6-7**: 仮想メモリ基盤、ユーザーモード基盤
- **Phase 8**: キーボードドライバ、シェル基盤
- **Phase 9**: GDT/TSS有効化、特権分離

### 🚧 現在の課題

- **Phase 10**: ユーザーモードシェル実行（デバッグ中）

## 🎮 操作方法

### 利用可能なコマンド

現在のシェルは以下のコマンドをサポート：

```
help    - コマンド一覧表示
version - OSバージョン情報
memory  - メモリ使用状況
clear   - 画面クリア
uptime  - 稼働時間表示
exit    - システム終了
```

### システム情報表示例

```
=====================================
    Mini OS Shell v1.0 RUNNING  
=====================================
Features available:
  - Memory Management: 256MB
  - Process Management: 2 processes  
  - Interrupt System: Fully operational
  - Keyboard Driver: Initialized
  - User Mode: Ready (GDT/TSS pending)
```

## 🛠 開発者向け情報

### ビルドターゲット

```bash
make all        # カーネルビルド（デフォルト）
make run        # QEMU起動
make run-debug  # デバッグモード起動
make iso        # BootableISO作成
make clean      # ビルドファイル削除
make setup      # 環境チェック
make help       # ヘルプ表示
```

### アーキテクチャ

```
- x86-32bit アーキテクチャ
- Multiboot準拠
- 256MB物理メモリ
- 4KBページサイズ
- Ring 0/Ring 3 特権分離
- int 0x80 システムコール
```

### ファイル構成

```
day60_mini_os/
├── src/
│   ├── boot/multiboot_kernel.asm     # Multiboot エントリ
│   ├── kernel/                       # カーネルコア
│   │   ├── main.c, memory.c, process.c
│   │   ├── interrupt.c, usermode.c
│   │   └── *.asm                     # アセンブリコード
│   ├── drivers/                      # デバイスドライバ
│   │   ├── keyboard.c, serial.c
│   ├── user/                         # ユーザープログラム
│   │   └── shell.c                   # シェル実装
│   └── include/                      # ヘッダーファイル
├── build/                            # ビルド出力
├── Makefile                          # ビルド設定
├── linker.ld                         # リンカスクリプト
└── output.log                        # 実行ログ
```

## 🎓 学習成果

このプロジェクトを通じて習得できる技術：

- **低レベルプログラミング**: アセンブリ、メモリ直接操作
- **OS理論実践**: スケジューリング、メモリ管理、プロセス間通信
- **ハードウェア制御**: 割り込み、デバイスドライバ、I/O操作
- **システムアーキテクチャ**: カーネル設計、モジュール分離
- **デバッグ技術**: ログ出力、段階的実装、問題分離

## 📚 技術仕様

- **言語**: C言語 + x86アセンブリ
- **ツールチェーン**: GCC cross-compiler, NASM, QEMU
- **メモリ**: 256MB, 65536ページ（4KB各）
- **プロセス**: PCB管理、Round-robinスケジューラ
- **割り込み**: 256エントリIDT、PIC制御
- **入力**: PS/2キーボード（IRQ1）
- **出力**: シリアルポート（ログ出力）

---

🏆 **Day60プロジェクト完了度: 90%**  
フルスタックOS実装のほぼ全機能が動作中！
