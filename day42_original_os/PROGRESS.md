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
    *   [ ] **Sub-Task 2.1: ダミータスクの定義と生成**
        *   [x] `task.h`: `task_t` にタスク名 (`name`)、カーネルスタックの底 (`kernel_stack_bottom`)、初回実行フラグ (`has_run_once`) を追加。タスクエントリーポイントの型 `task_entry_point_t` と `create_task` 関数のプロトタイプを定義。
        *   [ ] `kernel/main.c`: 2つのダミータスク処理関数 (例: `dummy_task_a_main`, `dummy_task_b_main`) を定義。それぞれ異なる文字をシリアルポートに無限ループで出力。
        *   [ ] `kernel/task.c`: `create_task(const char *name, task_entry_point_t entry_point, uint64_t pml4_phys_addr)` 関数を実装:
            *   [ ] PIDの割り当て、PCB (`task_t`) の初期化 (PID, 名前、初期状態 `TASK_STATE_READY`, `has_run_once = false`)。
            *   [ ] カーネルスタックの割り当て (PMM を使用、例: 1ページ) と `kernel_stack_top`/`kernel_stack_bottom` の設定。
            *   [ ] 初期コンテキスト (`full_context_t`) の設定: `rip` にタスク関数エントリポイント、`rsp_user` にカーネルスタックトップ、`cs` (カーネルコードセグメント)、`ss` (カーネルデータセグメント)、`rflags` (割り込み有効 `0x202`)、`cr3` (引数で渡されたPML4アドレス)。タイマー割り込みで `iretq` するために `int_no = 32`, `err_code = 0` も設定。
        *   [ ] `kernel/main.c` (`kernel_main_after_paging` 内): `init_task_queue(&ready_queue)` を呼び出し。その後、上記 `create_task` を呼び出してダミータスクを2つ生成し、`ready_queue` に `enqueue_task` で追加。
    *   [ ] **Sub-Task 2.2: 初期タスクの起動準備とコンテキストスイッチロジックの調整**
        *   [ ] `kernel/main.c` (`kernel_main_after_paging` 内): `ready_queue` から最初のタスクを `dequeue_task` で取得し `current_task` に設定。このタスクの `tss_set_rsp0(current_task->kernel_stack_top)` を呼び出し。もし `current_task->context.cr3` が現在のCR3と異なれば `load_cr3()` を呼び出す（通常カーネルタスクでは同じはず）。
        *   [ ] `kernel/apic.c` (`timer_handler` 内のコンテキスト保存・復元部分):
            *   [ ] コンテキスト保存時: `current_task` (つまり `old_task`) が `NULL` でなく、`old_task->has_run_once == true` の場合のみ、スタック上のレジスタ情報 (`regs` が指す領域と、それ以降の `iretq` フレーム) を `old_task->context` へコピー。`old_task->context.cr3` も `get_current_cr3()` で更新。初回(`has_run_once == false`)の場合は、`create_task` で設定された初期コンテキストが使われるように保存処理をスキップし、`old_task->has_run_once = true` に設定する。
            *   [ ] コンテキスト復元時: `schedule()` によって `current_task`