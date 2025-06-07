#include "process.h"
#include "memory.h"
#include "kernel.h"

/* 前方宣言 */
static void daemon_init(void);
static void daemon_execute_task(process_t* daemon);
static const char* daemon_type_to_string(daemon_type_t type);
static void daemon_system_monitor_task(void);
static void daemon_log_cleaner_task(void);
static void daemon_heartbeat_task(void);

/* グローバルスケジューラ */
static scheduler_t scheduler;

/* プロセステーブル */
static process_t process_table[MAX_PROCESSES];
static bool process_table_used[MAX_PROCESSES];

/* プロセス管理初期化 */
void process_init(void) {
    kernel_printf("process_init: Starting...\n");

    // 段階的デバッグ: 最小限の実装
    kernel_printf("process_init: Step 1 - Basic initialization\n");

    // まずは静的変数への直接アクセスをテスト
    scheduler.ready_queue = NULL;
    kernel_printf("process_init: Step 2 - Scheduler basic setup\n");

    scheduler.current_process = NULL;
    scheduler.next_pid = 1;
    scheduler.process_count = 0;
    scheduler.time_quantum = DEFAULT_TIME_QUANTUM;

    kernel_printf("process_init: Step 3 - Scheduler initialized\n");

    // プロセステーブルの初期化は後回し
    for (int i = 0; i < MAX_PROCESSES; i++) {
        process_table_used[i] = false;
    }

    kernel_printf("process_init: Completed successfully\n");

    /* デーモン初期化 */
    kernel_printf("process_init: About to call daemon_init...\n");
    daemon_init();
    kernel_printf("process_init: daemon_init completed\n");
}

/* デーモンシステム初期化 */
static void daemon_init(void) {
    static bool daemon_initialized = false;

    if (daemon_initialized) {
        kernel_printf("daemon_init: Already initialized, skipping\n");
        return;
    }

    kernel_printf("daemon_init: Initializing daemon system...\n");

    /* システム監視デーモン作成 (10秒間隔 = 20 ticks) */
    process_t* sysmon = daemon_create("sysmon", DAEMON_SYSTEM_MONITOR, NULL, 20);
    if (sysmon != NULL) {
        daemon_start(sysmon);
    }

    /* ハートビートデーモン作成 (5秒間隔 = 10 ticks) */
    process_t* heartbeat = daemon_create("heartbeat", DAEMON_HEARTBEAT, NULL, 10);
    if (heartbeat != NULL) {
        daemon_start(heartbeat);
    }

    daemon_initialized = true;
    kernel_printf("daemon_init: Default daemons created and started\n");
}

/* スケジューラ初期化 */
void scheduler_init(void) {
    kernel_printf("scheduler_init: Initializing scheduler...\n");

    scheduler.ready_queue = NULL;
    scheduler.current_process = NULL;
    scheduler.next_pid = 1;  /* PID 0はアイドルプロセス用 */
    scheduler.process_count = 0;
    scheduler.time_quantum = DEFAULT_TIME_QUANTUM;

    kernel_printf("scheduler_init: Scheduler initialized\n");
}

/* 空いているプロセステーブルエントリを検索 */
static process_t* allocate_process_entry(void) {
    for (int i = 0; i < MAX_PROCESSES; i++) {
        if (!process_table_used[i]) {
            process_table_used[i] = true;
            return &process_table[i];
        }
    }
    return NULL;
}

/* プロセステーブルエントリを解放 */
static void free_process_entry(process_t* process) {
    if (process == NULL) return;

    int index = process - process_table;
    if (index >= 0 && index < MAX_PROCESSES) {
        process_table_used[index] = false;
        memset(process, 0, sizeof(process_t));
    }
}

/* プロセス作成 */
process_t* process_create(const char* name, void* entry_point, u32 stack_size) {
    kernel_printf("process_create: Creating process '%s'\n", name);

    /* プロセステーブルエントリ確保 */
    process_t* process = allocate_process_entry();
    if (process == NULL) {
        kernel_printf("process_create: ERROR - No free process entries\n");
        return NULL;
    }

    /* PID割り当て */
    process->pid = scheduler.next_pid++;

    /* プロセス名設定 */
    strncpy(process->name, name, sizeof(process->name) - 1);
    process->name[sizeof(process->name) - 1] = '\0';

    /* 初期状態設定 */
    process->state = PROCESS_READY;

    /* スタック確保 */
    if (stack_size == 0) {
        stack_size = DEFAULT_STACK_SIZE;
    }

    /* スタック用メモリをページアロケータから確保 */
    u32 stack_pages = (stack_size + PAGE_SIZE - 1) / PAGE_SIZE;
    u32 stack_physical = 0;

    for (u32 i = 0; i < stack_pages; i++) {
        u32 page = alloc_page();
        if (page == 0) {
            kernel_printf("process_create: ERROR - Cannot allocate stack memory\n");
            free_process_entry(process);
            return NULL;
        }
        if (i == 0) {
            stack_physical = page;
        }
    }

    process->stack_top = stack_physical + (stack_pages * PAGE_SIZE);
    process->stack_size = stack_pages * PAGE_SIZE;

    /* CPUコンテキスト初期化 */
    memset(&process->context, 0, sizeof(cpu_context_t));
    process->context.eip = (u32)entry_point;      /* 実行開始アドレス */
    process->context.esp = process->stack_top - 4; /* スタックポインタ */
    process->context.ebp = process->stack_top - 4; /* ベースポインタ */
    process->context.eflags = 0x200;              /* 割り込み有効 */

    /* セグメントレジスタ設定 (フラットメモリモデル) */
    process->context.cs = 0x08;  /* カーネルコードセグメント */
    process->context.ds = 0x10;  /* カーネルデータセグメント */
    process->context.es = 0x10;
    process->context.fs = 0x10;
    process->context.gs = 0x10;
    process->context.ss = 0x10;  /* カーネルスタックセグメント */

    /* スケジューリング設定 */
    process->priority = 1;
    process->time_slice = scheduler.time_quantum;
    process->remaining_time = process->time_slice;
    process->next = NULL;

    /* デーモンフィールド初期化 */
    process->is_daemon = false;
    process->daemon_type = DAEMON_NONE;
    process->daemon_interval = 0;
    process->daemon_last_run = 0;
    process->daemon_enabled = false;
    process->daemon_run_count = 0;

    /* プロセス数更新 */
    scheduler.process_count++;

    kernel_printf("process_create: Process '%s' created (PID=%u, Stack=%u bytes)\n",
                  name, process->pid, process->stack_size);

    return process;
}

/* カーネルプロセス作成 (関数ポインタ版) */
process_t* kernel_process_create(const char* name, void (*entry_point)(void)) {
    return process_create(name, (void*)entry_point, DEFAULT_STACK_SIZE);
}

/* プロセス削除 */
void process_destroy(process_t* process) {
    if (process == NULL) return;

    kernel_printf("process_destroy: Destroying process '%s' (PID=%u)\n",
                  process->name, process->pid);

    /* スケジューラから削除 */
    scheduler_remove_process(process);

    /* スタックメモリ解放 */
    u32 stack_pages = process->stack_size / PAGE_SIZE;
    u32 stack_base = process->stack_top - process->stack_size;

    for (u32 i = 0; i < stack_pages; i++) {
        free_page(stack_base + (i * PAGE_SIZE));
    }

    /* プロセス数更新 */
    scheduler.process_count--;

    /* プロセステーブルエントリ解放 */
    free_process_entry(process);
}

/* プロセス状態変更 */
void process_set_state(process_t* process, process_state_t new_state) {
    if (process == NULL) return;

    process_state_t old_state = process->state;
    process->state = new_state;

    kernel_printf("process_set_state: Process '%s' state: %u -> %u\n",
                  process->name, old_state, new_state);
}

/* スケジューラ: プロセス追加 */
void scheduler_add_process(process_t* process) {
    if (process == NULL) return;

    kernel_printf("scheduler_add_process: Adding process '%s' to ready queue\n",
                  process->name);

    /* レディキューに追加 (単純な連結リスト) */
    process->next = NULL;

    if (scheduler.ready_queue == NULL) {
        scheduler.ready_queue = process;
    } else {
        process_t* current = scheduler.ready_queue;
        while (current->next != NULL) {
            current = current->next;
        }
        current->next = process;
    }

    process_set_state(process, PROCESS_READY);
}

/* スケジューラ: プロセス削除 */
void scheduler_remove_process(process_t* process) {
    if (process == NULL || scheduler.ready_queue == NULL) return;

    kernel_printf("scheduler_remove_process: Removing process '%s' from ready queue\n",
                  process->name);

    /* レディキューから削除 */
    if (scheduler.ready_queue == process) {
        scheduler.ready_queue = process->next;
    } else {
        process_t* current = scheduler.ready_queue;
        while (current->next != NULL && current->next != process) {
            current = current->next;
        }
        if (current->next == process) {
            current->next = process->next;
        }
    }

    process->next = NULL;
}

/* スケジューラ: 次のプロセス取得 (Round Robin) */
process_t* scheduler_get_next_process(void) {
    if (scheduler.ready_queue == NULL) {
        return NULL;
    }

    /* Round Robin: 先頭のプロセスを取得し、後ろに移動 */
    process_t* next_process = scheduler.ready_queue;
    scheduler.ready_queue = next_process->next;

    /* 取得したプロセスをキューの最後に移動 */
    if (scheduler.ready_queue != NULL) {
        process_t* current = scheduler.ready_queue;
        while (current->next != NULL) {
            current = current->next;
        }
        current->next = next_process;
        next_process->next = NULL;
    } else {
        scheduler.ready_queue = next_process;
        next_process->next = NULL;
    }

    return next_process;
}

/* プロセス情報表示 */
void process_print_info(void) {
    kernel_printf("\n--- Process Information ---\n");
    kernel_printf("Total Processes: %u\n", scheduler.process_count);
    kernel_printf("Time Quantum: %u ms\n", scheduler.time_quantum);

    if (scheduler.current_process != NULL) {
        process_t* proc = scheduler.current_process;
        kernel_printf("Current Process: %s (PID=%u, State=%u)\n",
                      proc->name, proc->pid, proc->state);
    } else {
        kernel_printf("Current Process: None\n");
    }

    kernel_printf("---------------------------\n\n");
}

/* 全プロセス一覧表示 */
void process_list_all(void) {
    kernel_printf("\n--- Process List ---\n");
    kernel_printf("PID  | Name              | State | Stack\n");
    kernel_printf("-----|-------------------|-------|--------\n");

    for (int i = 0; i < MAX_PROCESSES; i++) {
        if (process_table_used[i]) {
            process_t* proc = &process_table[i];
            kernel_printf("%u | %s | %u | %u KB\n",
                          proc->pid, proc->name, proc->state, proc->stack_size / 1024);
        }
    }

    kernel_printf("-------------------\n\n");
}

/* デバッグ用プロセス */
void idle_process(void) {
    kernel_printf("idle_process: Started\n");

    while (1) {
        /* CPU を他のプロセスに譲る */
        asm volatile("hlt");
    }
}

void test_process_a(void) {
    kernel_printf("test_process_a: Started\n");

    for (int i = 0; i < 5; i++) {
        kernel_printf("test_process_a: Iteration %d\n", i);

        /* 簡単な計算処理 */
        volatile u32 sum = 0;
        for (u32 j = 0; j < 10000; j++) {
            sum += j;
        }
    }

    kernel_printf("test_process_a: Finished\n");
}

void test_process_b(void) {
    kernel_printf("test_process_b: Started\n");

    for (int i = 0; i < 3; i++) {
        kernel_printf("test_process_b: Iteration %d\n", i);

        /* 簡単な計算処理 */
        volatile u32 product = 1;
        for (u32 j = 1; j < 100; j++) {
            product = (product * j) % 1000000;
        }
    }

    kernel_printf("test_process_b: Finished\n");
}

/* スケジューラ: プロセス切り替え (スタブ実装) */
void scheduler_switch_process(void) {
    kernel_printf("scheduler_switch_process: Called (stub implementation)\n");
    // TODO: 実際のプロセス切り替え実装
}

/* スケジューラ: タイマー割り込み処理 (スタブ実装) */
void scheduler_tick(void) {
    kernel_printf("scheduler_tick: Called (stub implementation)\n");
    // TODO: タイムスライス管理とプロセス切り替え実装
}

/* =========================== */
/* デーモン管理システム          */
/* =========================== */

/* デーモン作成 */
process_t* daemon_create(const char* name, daemon_type_t type, void (*entry_point)(void), u32 interval_ticks) {
    kernel_printf("daemon_create: Creating daemon '%s' (type=%u, interval=%u)\n", name, type, interval_ticks);

    /* 通常のプロセスとして作成 */
    process_t* daemon = kernel_process_create(name, entry_point);
    if (daemon == NULL) {
        kernel_printf("daemon_create: ERROR - Failed to create process\n");
        return NULL;
    }

    /* デーモン特有の設定 */
    daemon->is_daemon = true;
    daemon->daemon_type = type;
    daemon->daemon_interval = interval_ticks;
    daemon->daemon_last_run = 0;  /* 次回のtickで即座に実行 */
    daemon->daemon_enabled = false;  /* 初期状態は停止 */
    daemon->daemon_run_count = 0;
    daemon->priority = 2;  /* デーモンは低優先度 */

    kernel_printf("daemon_create: Daemon '%s' created successfully (PID=%u)\n", name, daemon->pid);
    return daemon;
}

/* デーモン開始 */
void daemon_start(process_t* daemon) {
    if (daemon == NULL || !daemon->is_daemon) {
        kernel_printf("daemon_start: ERROR - Invalid daemon\n");
        return;
    }

    daemon->daemon_enabled = true;
    extern u32 get_system_ticks(void);
    daemon->daemon_last_run = get_system_ticks();

    kernel_printf("daemon_start: Daemon '%s' started\n", daemon->name);
}

/* デーモン停止 */
void daemon_stop(process_t* daemon) {
    if (daemon == NULL || !daemon->is_daemon) {
        kernel_printf("daemon_stop: ERROR - Invalid daemon\n");
        return;
    }

    daemon->daemon_enabled = false;
    kernel_printf("daemon_stop: Daemon '%s' stopped\n", daemon->name);
}

/* デーモンタスク実行チェック */
void daemon_tick(void) {
    extern u32 get_system_ticks(void);
    u32 current_ticks = get_system_ticks();

    /* 全プロセスをチェック */
    for (int i = 0; i < MAX_PROCESSES; i++) {
        if (!process_table_used[i]) continue;

        process_t* proc = &process_table[i];
        if (!proc->is_daemon || !proc->daemon_enabled) continue;

        /* 実行間隔をチェック */
        if (current_ticks - proc->daemon_last_run >= proc->daemon_interval) {
            /* デーモンタスク実行 */
            proc->daemon_last_run = current_ticks;
            proc->daemon_run_count++;

            kernel_printf("daemon_tick: Running daemon '%s' (count=%u)\n",
                         proc->name, proc->daemon_run_count);

            /* 実際のデーモンタスクを実行 */
            daemon_execute_task(proc);
        }
    }
}

/* デーモンタスク実行 */
static void daemon_execute_task(process_t* daemon) {
    if (daemon == NULL || !daemon->is_daemon) return;

    switch (daemon->daemon_type) {
        case DAEMON_SYSTEM_MONITOR:
            daemon_system_monitor_task();
            break;
        case DAEMON_LOG_CLEANER:
            daemon_log_cleaner_task();
            break;
        case DAEMON_HEARTBEAT:
            daemon_heartbeat_task();
            break;
        case DAEMON_CUSTOM:
            kernel_printf("daemon_execute_task: Custom daemon '%s' (PID=%u)\n",
                         daemon->name, daemon->pid);
            break;
        default:
            kernel_printf("daemon_execute_task: Unknown daemon type %u\n", daemon->daemon_type);
            break;
    }
}

/* デーモン一覧表示 */
void daemon_list_all(void) {
    extern void console_write(const char* str);
    extern void int_to_string(u32 num, char* buffer);

    console_write("\n=== Daemon Status ===\n");
    console_write("PID | Name         | Type   | Status | Interval | Runs\n");
    console_write("----|--------------|--------|--------|----------|-----\n");

    int daemon_count = 0;
    for (int i = 0; i < MAX_PROCESSES; i++) {
        if (!process_table_used[i]) continue;

        process_t* proc = &process_table[i];
        if (!proc->is_daemon) continue;

        daemon_count++;

        /* PID */
        char pid_str[16];
        int_to_string(proc->pid, pid_str);
        console_write(pid_str);
        console_write(" | ");

        /* Name */
        console_write(proc->name);
        console_write(" | ");

        /* Type */
        const char* type_name = daemon_type_to_string(proc->daemon_type);
        console_write(type_name);
        console_write(" | ");

        /* Status */
        const char* status = proc->daemon_enabled ? "ACTIVE" : "STOP";
        console_write(status);
        console_write(" | ");

        /* Interval */
        char interval_str[16];
        int_to_string(proc->daemon_interval, interval_str);
        console_write(interval_str);
        console_write(" | ");

        /* Runs */
        char runs_str[16];
        int_to_string(proc->daemon_run_count, runs_str);
        console_write(runs_str);
        console_write("\n");
    }

    if (daemon_count == 0) {
        console_write("No daemons found.\n");
    }

    console_write("===================\n\n");
}

/* デーモン名で検索 */
process_t* daemon_find_by_name(const char* name) {
    for (int i = 0; i < MAX_PROCESSES; i++) {
        if (!process_table_used[i]) continue;

        process_t* proc = &process_table[i];
        if (proc->is_daemon && strcmp(proc->name, name) == 0) {
            return proc;
        }
    }
    return NULL;
}

/* デーモンタイプで検索 */
process_t* daemon_find_by_type(daemon_type_t type) {
    for (int i = 0; i < MAX_PROCESSES; i++) {
        if (!process_table_used[i]) continue;

        process_t* proc = &process_table[i];
        if (proc->is_daemon && proc->daemon_type == type) {
            return proc;
        }
    }
    return NULL;
}

/* ヘルパー関数 */
static const char* daemon_type_to_string(daemon_type_t type) {
    switch (type) {
        case DAEMON_NONE: return "NONE";
        case DAEMON_SYSTEM_MONITOR: return "SYSMON";
        case DAEMON_LOG_CLEANER: return "LOGCLN";
        case DAEMON_HEARTBEAT: return "BEAT";
        case DAEMON_CUSTOM: return "CUSTOM";
        default: return "UNK";
    }
}

/* デーモンタスク実装 */
static void daemon_system_monitor_task(void) {
    extern u32 get_free_memory(void);
    extern u32 get_total_memory(void);

    u32 free_mem = get_free_memory();
    u32 total_mem = get_total_memory();
    u32 used_percent = ((total_mem - free_mem) * 100) / total_mem;

    kernel_printf("SYSMON: Memory usage: %u%% (%u/%u KB)\n",
                  used_percent, (total_mem - free_mem) / 1024, total_mem / 1024);
}

static void daemon_log_cleaner_task(void) {
    kernel_printf("LOGCLN: Log cleanup completed\n");
    /* 実際のログクリーンアップ処理をここに実装 */
}

static void daemon_heartbeat_task(void) {
    extern u32 get_system_ticks(void);
    static u32 heartbeat_count = 0;
    heartbeat_count++;

    kernel_printf("HEARTBEAT #%u: System alive (uptime: %u ticks)\n",
                  heartbeat_count, get_system_ticks());
}