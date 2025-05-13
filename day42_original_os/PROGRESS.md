# OS開発プロジェクト進捗

## フェーズ別タスクリスト

### Phase 1: "Hello, kernel!" が QEMU で起動
- [x] UEFI ブートローダ (MikanLoaderPkg または Limine) のセットアップ
- [x] カーネルエントリーポイント (C言語) の作成
- [x] GDT (Global Descriptor Table) の設定
- [x] Long mode への切り替え
- [x] QEMU で "Hello, kernel!" の表示確認

### Phase 2: VGA/Framebuffer 文字表示 & 例外ハンドラ
- [x] UEFI から Framebuffer 情報取得
- [x] 簡易的な文字表示関数の実装 (printf ライク)
- [x] IDT (Interrupt Descriptor Table) の設定
- [x] 例外ハンドラの実装 (例: #DE, #GP)
- [x] 構造体定義: `struct FrameBuffer`, `struct IDTR`, `struct InterruptFrame`

### Phase 3: 物理メモリ管理 & ページング開始
- [x] UEFI Memory Map の解析と利用 (Limine経由で取得しPMMで使用)
- [x] 物理メモリマネージャ (PMM) の実装 (スタック/フリーリスト方式)
- [x] `alloc_page` / `free_page` 関数の実装
- [x] 4レベルページテーブルの動的生成
  - [x] HHDMオフセットの取得と確認
  - [x] ページング関連構造体定義 (`paging.h`)
  - [x] PML4テーブル初期化準備 (`paging.c`)
  - [x] カーネル空間のマッピング (k_start to k_end)
  - [x] フレームバッファのマッピング
- [x] カーネルの Higher Half (例: `0xFFFF8000_00000000`) への再配置 (ページングにより実現)
- [x] CR3 レジスタ切り替えによる仮想メモリ有効化

### Phase 4: タイマ割り込み & ラウンドロビン・スケジューラ

*   [X] **Sub-Task 1: APIC タイマ割り込みの実装**
    *   [X] Limine から SMP 情報取得
    *   [X] `apic.c`/`apic.h` の作成
    *   [X] タイマベクタ (32) 用の IDT/ISR 更新
    *   [X] `init_apic` 呼び出し、割り込み有効化、ティックカウント表示
    *   [X] xAPIC フォールバック対応
    *   [X] QEMU でのビルドとテスト (カーネル起動、タイマ動作確認)
*   [ ] **Sub-Task 2: 基本的なラウンドロビン・スケジューラ**
    *   [X] タスク状態セグメント (TSS) 構造体の定義 (`gdt.h`)
    *   [X] TSS 用の GDT エントリ作成 (`gdt.c`, `gdt.h`)
    *   [X] タスク状態セグメントレジスタ (LTR) のロード (`gdt.c`)
    *   [X] TSS.RSP0 フィールドへのカーネルスタックポインタ設定 (`gdt.c`, `main.c`, `paging.c`)
    *   [ ] シンプルなプロセス制御ブロック (PCB) 構造体 (例: `struct task`) の定義
    *   [ ] シンプルなタスクキュー (例: 固定長配列) の作成
    *   [ ] タイマ割り込みハンドラ (`timer_handler`) 内に `schedule()` 関数を実装
        *   現在のタスクの状態 (レジスタ、RSP) を PCB に保存
        *   キューから次のタスクを選択
        *   次のタスクの状態を PCB からロード
        *   コンテキストスイッチ実行 (RSP 更新、必要なら CR3 更新)
    *   [ ] ダミータスクの作成 (例: 異なる文字をループ表示するタスクを複数)
    *   [ ] タスクキューと PCB の初期化
    *   [ ] `kernel_main_after_paging` を修正し、アイドルループの代わりに最初のタスクを開始
    *   [ ] QEMU でのビルドとテスト (異なるタスクの出力が交互に表示されることを確認)
*   [ ] **Sub-Task 3: 改良 (当面はオプション)**
    *   [ ] アイドルタスク
    *   [ ] 基本的なスリープ/譲渡 (yield) 機能

### Phase 5: ELF 形式のユーザプロセス起動
- [ ] ELF64 ローダーの実装
- [ ] `.text`, `.data` セクションのユーザー空間へのマッピング
- [ ] システムコールインターフェースの実装 (例: `int 0x80`)
- [ ] 基本的なシステムコール (`sys_write`, `sys_exit` など) の実装
- [ ] `init` プロセスの作成
- [ ] `fork` と `exec` (または同等の機能) の実装 (`init` から `/bin/sh` 起動目標)

### Phase 6: ミニシェル + echo / ls
- [ ] ミニシェルの実装
    - [ ] `readline()` (入力取得)
    - [ ] `parse()` (コマンド解析)
    - [ ] `exec()` (コマンド実行)
- [ ] 仮想ファイルシステム (VFS) 層の設計と実装
- [ ] RAMFS (RAMベースのファイルシステム) の実装とルートマウント
- [ ] デバイスファイルの実装 (例: `/dev/console`, `/proc/meminfo`)
- [ ] `ls` コマンドの実装 (RAMFS のディレクトリエントリ列挙)
- [ ] `echo` コマンドの実装 (`write(1, ...)` を使用)

## その他

- [x] ホスト環境構築 (クロスツールチェーン、QEMUなど)
- [x] ビルドスクリプトの整備
- [ ] デバッグ環境の確立 (GDB/LLDBリモートデバッグ)
