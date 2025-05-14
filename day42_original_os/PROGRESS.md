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
    *   [X] シンプルなプロセス制御ブロック (PCB) 構造体 (`task_t`) の定義 (`task.h`)
    *   [X] シンプルなタスクキュー (`task_queue_t`) の作成と操作関数 (`task.c`, `task.h`)
    *   [X] タイマ割り込みハンドラ (`timer_handler`) 内に `schedule()` 関数を実装済み (基本的な選択とTSS RSP0設定)
        *   [X] コンテキスト保存の準備 (`current_task->context = *regs;` のような処理)
        *   [X] 次タスクの選択 (`dequeue_task`) と `current_task` 更新
        *   [X] 次タスクのRSP0設定 (`tss_set_rsp0`)
        *   [X] コンテキスト復元の準備 (スタック書き換え)
    *   [x] **Sub-Task 2.1: ダミータスクの定義と生成**
        *   [x] `task.h`: `task_t` にタスク名 (`name`)、カーネルスタックの底 (`kernel_stack_bottom`)、初回実行フラグ (`has_run_once`) を追加。タスクエントリーポイントの型 `task_entry_point_t` と `create_task` 関数のプロトタイプを定義。
        *   [x] `kernel/main.c`: 2つのダミータスク処理関数 (例: `dummy_task_a_main`, `dummy_task_b_main`) を定義。それぞれ異なる文字をシリアルポートに無限ループで出力。
        *   [x] `kernel/task.c`: `create_task` 関数を実装。
            *   [x] PIDの割り当て、PCB (`task_t`) の初期化 (PID, 名前、初期状態 `TASK_STATE_READY`, `has_run_once = false`)。
            *   [x] カーネルスタックの割り当て (PMM を使用、例: 1ページ) と `kernel_stack_top`/`kernel_stack_bottom` の設定。
            *   [x] 初期コンテキスト (`full_context_t`) の設定: `rip` にタスク関数エントリポイント、`rsp_user` にカーネルスタックトップ、`cs` (カーネルコードセグメント)、`ss` (カーネルデータセグメント)、`rflags` (割り込み有効 `0x202`)、`cr3` (引数で渡されたPML4アドレス)。タイマー割り込みで `iretq` するために `int_no = 32`, `err_code = 0` も設定。
        *   [ ] **Sub-Task 2.1.4 (変更): PMMスタックページのマッピング検証と修正**
            *   [ ] `init_paging` がPMMの最初のスタックページ (物理アドレス `0x200000`) をHHDMに正しくマッピングしているか確認する。
            *   [ ] マッピングされていない場合、`init_paging` を修正してマッピング処理を追加する。
            *   [ ] デバッグ出力を利用して、`pmm_alloc_page` がページフォールトなく呼び出せることを確認する（`create_task` の呼び出しは一時的にコメントアウトするか、1回だけ呼び出してPMMの動作のみを確認する）。
        *   [ ] **Sub-Task 2.1.5 (新規): ダミータスクの生成とエンキュー (再挑戦)**
            *   [ ] PMMのページング関連の問題が解決した後、`kernel/main.c` (`kernel_main_after_paging` 内) で `init_task_queue(&ready_queue)` を呼び出す。
            *   [ ] `create_task` を呼び出してダミータスクを2つ生成する。
            *   [ ] 生成したタスクを `ready_queue` に `enqueue_task` で追加する。
            *   [ ] QEMUで動作確認し、ページフォールトが発生しないこと、タスクがキューに追加されるデバッグログが出力されることを確認する。
    *   [ ] **Sub-Task 2.2: 初期タスクの起動準備とコンテキストスイッチロジックの調整**
        *   [ ] `kernel/main.c` (`kernel_main_after_paging` 内): `ready_queue` から最初のタスクを `dequeue_task` で取得し `current_task` に設定。このタスクの `tss_set_rsp0(current_task->kernel_stack_top)` を呼び出し。もし `current_task->context.cr3` が現在のCR3と異なれば `load_cr3()` を呼び出す（通常カーネルタスクでは同じはず）。
        *   [ ] `kernel/apic.c` (`timer_handler` 内のコンテキスト保存・復元部分):
            *   [ ] コンテキスト保存時: `current_task` (つまり `old_task`) が `NULL` でなく、`old_task->has_run_once == true` の場合のみ、スタック上のレジスタ情報 (`regs` が指す領域と、それ以降の `iretq` フレーム) を `old_task->context` へコピー。`old_task->context.cr3` も `get_current_cr3()` で更新。初回(`has_run_once == false`)の場合は、`create_task` で設定された初期コンテキストが使われるように保存処理をスキップし、`old_task->has_run_once = true` に設定する。
            *   [ ] コンテキスト復元時: `schedule()` によって `current_task` (つまり `new_task`) が更新された後、`new_task` が `NULL` でなく、(`old_task != new_task` または `!new_task->has_run_once`) の場合に、`new_task->context` からスタック上の対応する位置へレジスタ情報と `iretq` フレームをコピー。`new_task->context.cr3` が現在のCR3と異なれば `load_cr3()`。復元時に `new_task->has_run_once = true` に設定。
        *   [ ] `kernel/main.c` (`kernel_main_after_paging` 内): `init_apic` 呼び出しの後、`asm volatile ("sti");` で割り込みを有効化し、無限 `hlt` ループに入り、最初のタイマー割り込みによるタスクスイッチを待つ。
    *   [ ] **Sub-Task 2.3: 動作検証とデバッグ**
        *   [ ] `make clean && make && make run-bios` でビルドと実行。
        *   [ ] QEMU のシリアルコンソールで、各ダミータスクが出力する異なる文字が交互に表示されることを確認。
        *   [ ] 問題が発生した場合、シリアルデバッグ出力を頼りに、コンテキスト構造体の内容、スタックポインタの操作、`has_run_once` フラグの遷移、`create_task` での初期コンテキスト設定、`timer_handler` でのスタックからの読み書きオフセットなどを中心にデバッグ。

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
