#ifndef PROCESS_H
#define PROCESS_H

#include "kernel.h"

/* プロセス状態 */
typedef enum {
    PROCESS_READY = 0,      /* 実行可能状態 */
    PROCESS_RUNNING,        /* 実行中 */
    PROCESS_BLOCKED,        /* 待機状態 */
    PROCESS_TERMINATED      /* 終了状態 */
} process_state_t;

/* CPU レジスタ状態 (32bit x86) */
typedef struct {
    u32 eax, ebx, ecx, edx;     /* 汎用レジスタ */
    u32 esp, ebp;               /* スタックポインタ */
    u32 esi, edi;               /* インデックスレジスタ */
    u32 eip;                    /* 命令ポインタ */
    u32 eflags;                 /* フラグレジスタ */
    u32 cs, ds, es, fs, gs, ss; /* セグメントレジスタ */
} cpu_context_t;

/* プロセス制御ブロック (PCB) */
typedef struct process {
    u32 pid;                    /* プロセスID */
    char name[32];              /* プロセス名 */
    process_state_t state;      /* プロセス状態 */

    cpu_context_t context;      /* CPUコンテキスト */
    u32 stack_top;              /* スタック最上位アドレス */
    u32 stack_size;             /* スタックサイズ */

    u32 priority;               /* 優先度 (0=最高) */
    u32 time_slice;             /* タイムスライス (ms) */
    u32 remaining_time;         /* 残りタイムスライス */

    /* ユーザーモード用フィールド */
    u32 user_stack_base;        /* ユーザースタックベース */
    u32 user_stack_size;        /* ユーザースタックサイズ */
    u32 code_base;              /* コードセグメントベース */
    u32 code_size;              /* コードセグメントサイズ */
    bool is_user_mode;          /* ユーザーモードプロセスフラグ */

    struct process* next;       /* プロセスリストの次のプロセス */
} process_t;

/* スケジューラ制御構造体 */
typedef struct {
    process_t* ready_queue;     /* 実行可能プロセスキュー */
    process_t* current_process; /* 現在実行中のプロセス */
    u32 next_pid;               /* 次に割り当てるPID */
    u32 process_count;          /* 総プロセス数 */
    u32 time_quantum;           /* デフォルトタイムクォンタム (ms) */
} scheduler_t;

/* プロセス管理関数 */
void process_init(void);
process_t* process_create(const char* name, void* entry_point, u32 stack_size);
void process_destroy(process_t* process);
void process_set_state(process_t* process, process_state_t new_state);

/* スケジューラ関数 */
void scheduler_init(void);
void scheduler_add_process(process_t* process);
void scheduler_remove_process(process_t* process);
process_t* scheduler_get_next_process(void);
void scheduler_switch_process(void);
void scheduler_tick(void);  /* タイマー割り込みから呼び出される */

/* コンテキストスイッチ */
void context_switch(cpu_context_t* old_context, cpu_context_t* new_context);

/* プロセス情報表示 */
void process_print_info(void);
void process_list_all(void);

/* カーネルプロセス用関数 */
process_t* kernel_process_create(const char* name, void (*entry_point)(void));

/* デバッグ用プロセス */
void idle_process(void);        /* アイドルプロセス */
void test_process_a(void);      /* テストプロセスA */
void test_process_b(void);      /* テストプロセスB */

/* プロセス制御定数 */
#define MAX_PROCESSES           8
#define DEFAULT_STACK_SIZE      (8 * 1024)     /* 8KB */
#define DEFAULT_TIME_QUANTUM    100             /* 100ms */
#define IDLE_PROCESS_PID        0

/* プロセス作成フラグ */
#define PROCESS_FLAG_KERNEL     0x01

#endif /* PROCESS_H */