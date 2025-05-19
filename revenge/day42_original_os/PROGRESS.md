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
    - [x] `init_paging` 内での各種マッピング処理 (HHDM, Kernel, Framebuffer, Stack)
    *   [x] 高位カーネルへのジャンプ成功 (switch_to_kernel_higher_half_and_run により kernel_main_after_paging が実行されることを確認)

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
    *   [x] **Sub-Task 2.1.5.1: `print_serial_format` の実装と主要箇所へのデバッグログ追加** (PROGRESS.mdではこちらを優先タスクとしていた)
    *   [x] **Sub-Task 2.1.5.1.1: (旧2.1.5.1) PMM `init_pmm` 内スタックポインタ整合性検証** (PROGRESS.md上でのタスク名変更と細分化)
        *   目的: `init_pmm`完了時に`pmm_stack_top`と`pmm_current_stack_head`がPMMスタックの正しい状態を指すことを確認。
        *   作業: `init_pmm`の`pmm_free_page`呼び出し前後で主要変数のログを追加。特にスタックページ追加時の分岐を詳細化。QEMUで実行しログ分析。
        *   期待: `init_pmm`完了時、`pmm_stack_top`が最後のスタックページの空き状況を、`pmm_current_stack_head`がそのページを正しく指す。
    *   [ ] **Sub-Task 2.1.5.2: PMM の自己マッピング安定化**
        *   目的: `map_page` がページテーブル構造を確保し、それをHHDMにマッピングする際に、そのHHDMアドレスへのアクセス（例: `clear_page`）が安全に行えることを保証する。
        *   検証: QEMUで実行し、追加したログを確認する。
        *   期待: ページフォルトが発生せず、PMMが正常に動作する。
        *   [ ] **Sub-Task 2.1.5.3: PMM `pmm_alloc_page` スタック枯渇時の旧スタックページへの切り替えロジック検証**
            *   目的: スタックが空になった際、正しく以前のスタックページ (`previous_stack_page_phys`) を特定し、`pmm_info` の関連変数が適切に更新されることを確認する。
            *   作業: 関連するログを強化し、`kernel/main.c`のPMMスタックテスト（多数確保）などで動作確認。
            *   期待: ログ上で、旧スタックページへの切り替え情報が正しく表示される。
        *   [ ] **Sub-Task 2.1.5.4: PMM `pmm_alloc_page` 切り替え後の新PMMスタックページのマッピング処理検証**
            *   目的: `pmm_alloc_page` がスタックを切り替えた後、新しいPMMスタックページをHHDMにマッピングするために `map_page` (タグ `PMM_ALLOC_SWITCH_STACK`) を呼び出す際の動作を検証する。
            *   作業: `map_page` 呼び出し前後と、その内部での動作ログを分析。
            *   期待: `map_page` が正しく呼び出され、新しいPMMスタックページがHHDMにマッピングされる。
        *   [ ] **Sub-Task 2.1.5.5: (上記2.1.5.2-4解決後) `pmm_alloc_page` スタックページ切り替え全体の動作確認**
            *   目的: 複数のページを連続して割り当て・解放し、PMMスタックページの切り替えが複数回発生してもシステムが安定していることを確認する。
            *   作業: `main.c` などで多数のページ割り当て/解放を行うテストコードを実行。
            *   期待: ページフォルトが発生せず、PMMが正常に動作する。
        *   [ ] **Sub-Task 2.1.5.6: ダミータスク生成とエンキュー最終確認** (旧2.1.5.3)
            *   目的: PMM安定化後、ページフォールトなくタスク生成・エンキューログが出力されることを確認。
            *   作業: 上記修正後、`kernel/main.c`のタスク生成処理を実行。QEMUでページフォールトなく関連ログ出力確認。
            *   期待: 当初のSub-Task 2.1.5目標達成。
        *   [ ] **Sub-Task 2.1.5.7: タイマー割り込みとスケジューラ基本動作確認** (旧2.1.5.4)
            *   目的: `sti`と`hlt`を有効化し、タイマー割り込みによるスケジューラの基本動作を確認。
            *   作業: `kernel_main_after_paging`の`sti`と`hlt`を有効化。
            *   期待: カウントアップ表示またはタスクスイッチを示唆する動作が確認できる。
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
    *   [x] Task 2.1.6: `unmap_page` 関数の実装
        *   目的: 指定された仮想アドレスのマッピングを解除し、関連するページテーブルエントリをクリア（Presentビットを下げるなど）する。
        *   考慮事項:
            *   ラージページ(1GB, 2MB)の扱いはシンプルに（今回はエントリクリアのみ）。
            *   TLBフラッシュ (`invlpg`) を行う。
            *   ページテーブルページ自体の解放はスコープ外。
        *   作業:
            *   `kernel/paging.h` にプロトタイプ宣言追加。
            *   `kernel/paging.c` に4KB, 2MB, 1GBページ対応の `unmap_page` 実装（PTE/PDE/PDPTEクリアと`invlpg`）。
    *   Task 2.1.7: ページフォルトハンドラの基本的な実装
        *   目的: ページフォルト発生時に、エラーコードやフォルトアドレスなどの情報を表示し、カーネルを停止させる基本的なハンドラを実装する。
        *   作業:

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
