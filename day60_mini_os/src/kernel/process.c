#include "process.h"
#include "memory.h"
#include "kernel.h"

/* グローバルスケジューラ */
static scheduler_t scheduler;

/* プロセステーブル */
static process_t process_table[MAX_PROCESSES];
static bool process_table_used[MAX_PROCESSES];

/* プロセス管理初期化 */
void process_init(void) {
    kernel_printf("process_init: Initializing process management...\n");

    /* プロセステーブルクリア */
    memset(process_table, 0, sizeof(process_table));
    memset(process_table_used, 0, sizeof(process_table_used));

    /* スケジューラ初期化 */
    scheduler_init();

    kernel_printf("process_init: Process management initialized\n");
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
            kernel_printf("%4u | %-17s | %5u | %u KB\n",
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