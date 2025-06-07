# Day60 - Mini OS with Daemon System

独自OS実装プロジェクト。QEMUで動作するx86-32bit OSカーネル、ユーザーモードシェル、バックグラウンドdaemonシステムを実装。

https://github.com/user-attachments/assets/5293bd22-9ed5-4c29-9634-a3656d50ecca

[100日チャレンジ day60（独自OS作成）](https://zenn.dev/gin_nazo/scraps/828db646a6a4be)

## 🎯 プロジェクト概要

完全に独自実装されたOSで、以下の機能を含みます：
- **メモリ管理**: 256MB物理メモリ、ページアロケータ
- **プロセス管理**: PCB、スケジューラ、コンテキストスイッチ  
- **割り込み処理**: IDT、例外処理、システムコール
- **特権分離**: Ring 0/Ring 3、GDT/TSS
- **キーボード入力**: PS/2キーボードドライバ
- **独自シェル**: インタラクティブコマンドライン
- **Daemonシステム**: バックグラウンドプロセス（システム監視、ハートビート）

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
# GUI付き起動（推奨）
make quick-show

# 標準起動（バックグラウンド実行）
make run

# デバッグモード（QEMUモニター付き）
make run-debug
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
- **Phase 10**: Daemonシステム実装 🆕

### 🎉 新機能: Daemon System

**自動実行されるバックグラウンドプロセス:**
- **System Monitor**: メモリ使用状況の定期監視（20 tick間隔）
- **Heartbeat**: システム生存確認（10 tick間隔）
- **タイマー割り込み**: 2Hz で動作、リアルタイムスケジューリング

## 🎮 操作方法

### 利用可能なコマンド

現在のシェルは以下のコマンドをサポート：

```
help     - コマンド一覧表示
version  - OSバージョン情報
memory   - メモリ使用状況
process  - プロセス一覧表示
daemon   - Daemon状況表示 🆕
date     - 現在時刻表示
echo     - テキスト表示
clear    - 画面クリア
uptime   - 稼働時間表示
test     - システムテスト実行
exit     - システム終了
```

### Daemon状況表示例

```
=== Daemon Status ===
| PID | Name      | Type   | Status | Interval | Runs |
| --- | --------- | ------ | ------ | -------- | ---- |
| 1   | sysmon    | SYSMON | ACTIVE | 20       | 1080 |
| 2   | heartbeat | BEAT   | ACTIVE | 10       | 2160 |
===================
```

### システム情報表示例

```
=====================================
    Mini OS Shell v1.0 RUNNING  
=====================================
Features available:
  - Memory Management: 256MB
  - Process Management: 4 processes  
  - Interrupt System: Fully operational
  - Keyboard Driver: Interactive input
  - Daemon System: 2 active daemons 🆕
  - Timer System: 2Hz, 23600+ ticks 🆕
```

## 🛠 開発者向け情報

### ビルドターゲット

```bash
make all         # カーネルビルド（デフォルト）
make quick-show  # クリーンビルド + GUI起動
make run         # QEMU起動（バックグラウンド）
make run-gui     # QEMU起動（GUI）
make run-debug   # デバッグモード起動
make iso         # BootableISO作成
make clean       # ビルドファイル削除
make setup       # 環境チェック
make help        # ヘルプ表示
```

### アーキテクチャ

```
- x86-32bit アーキテクチャ
- Multiboot準拠
- 256MB物理メモリ
- 4KBページサイズ
- Ring 0/Ring 3 特権分離
- int 0x80 システムコール
- タイマー割り込み 2Hz 🆕
- Daemon自動実行システム 🆕
```

### ファイル構成

```
day60_mini_os/
├── src/
│   ├── boot/multiboot_kernel.asm     # Multiboot エントリ
│   ├── kernel/                       # カーネルコア
│   │   ├── main.c, memory.c
│   │   ├── process.c                 # プロセス + Daemon管理 🆕
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
- **リアルタイムシステム**: タイマー割り込み、daemon実行管理 🆕
- **デバッグ技術**: ログ出力、段階的実装、問題分離

## 📚 技術仕様

- **言語**: C言語 + x86アセンブリ
- **ツールチェーン**: GCC cross-compiler, NASM, QEMU
- **メモリ**: 256MB, 65536ページ（4KB各）
- **プロセス**: PCB管理、Round-robinスケジューラ
- **割り込み**: 256エントリIDT、PIC制御、タイマー2Hz 🆕
- **入力**: PS/2キーボード（IRQ1）
- **出力**: シリアルポート（ログ出力）
- **Daemon**: システム監視、ハートビート、自動スケジューリング 🆕

## 🏆 実装完了した主要機能

### **Core OS Features**
✅ **Memory Management** - 256MB完全対応  
✅ **Process Management** - マルチプロセス、コンテキストスイッチ  
✅ **Interrupt System** - 完全な割り込み処理、システムコール  
✅ **Keyboard Driver** - リアルタイム入力、USキーボード対応  
✅ **Interactive Shell** - 11個のコマンド、拡張可能アーキテクチャ  

### **Advanced Features** 🆕
✅ **Daemon System** - バックグラウンドプロセス自動実行  
✅ **Timer System** - 2Hz精密タイマー、リアルタイム管理  
✅ **System Monitoring** - メモリ監視、システム状態監視  
✅ **Process Lifecycle** - daemon作成/開始/停止/監視  

---

🏆 **Day60プロジェクト完了度: 95%**  
フルスタックOS実装 + Daemon System完全実装！

---

## 📄 ライセンス

このプロジェクトは学習目的で作成されています。

© 2025 Day60 Mini OS with Daemon System Project
