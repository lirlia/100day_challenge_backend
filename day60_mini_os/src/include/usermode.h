#ifndef USERMODE_H
#define USERMODE_H

#include "kernel.h"
#include "process.h"

/* GDT（Global Descriptor Table）セレクタ */
#define KERNEL_CODE_SELECTOR    0x08    /* カーネルコードセグメント */
#define KERNEL_DATA_SELECTOR    0x10    /* カーネルデータセグメント */
#define USER_CODE_SELECTOR      0x18    /* ユーザーコードセグメント */
#define USER_DATA_SELECTOR      0x20    /* ユーザーデータセグメント */
#define TSS_SELECTOR            0x28    /* タスク状態セグメント */

/* 特権レベル定義 */
#define PRIVILEGE_KERNEL        0       /* Ring 0 - カーネルモード */
#define PRIVILEGE_USER          3       /* Ring 3 - ユーザーモード */

/* GDTエントリ構造体 */
typedef struct {
    u16 limit_low;      /* セグメント制限の下位16ビット */
    u16 base_low;       /* ベースアドレスの下位16ビット */
    u8  base_middle;    /* ベースアドレスの中位8ビット */
    u8  access;         /* アクセス権限 */
    u8  granularity;    /* 粒度とセグメント制限の上位4ビット */
    u8  base_high;      /* ベースアドレスの上位8ビット */
} __attribute__((packed)) gdt_entry_t;

/* GDTポインタ構造体 */
typedef struct {
    u16 limit;          /* GDTのサイズ - 1 */
    u32 base;           /* GDTのベースアドレス */
} __attribute__((packed)) gdt_ptr_t;

/* TSS（Task State Segment）構造体 */
typedef struct {
    u32 prev_tss;       /* 前のタスクへのリンク */
    u32 esp0;           /* Ring 0でのスタックポインタ */
    u32 ss0;            /* Ring 0でのスタックセグメント */
    u32 esp1;           /* Ring 1でのスタックポインタ */
    u32 ss1;            /* Ring 1でのスタックセグメント */
    u32 esp2;           /* Ring 2でのスタックポインタ */
    u32 ss2;            /* Ring 2でのスタックセグメント */
    u32 cr3;            /* ページディレクトリベース */
    u32 eip;            /* 命令ポインタ */
    u32 eflags;         /* フラグレジスタ */
    u32 eax, ecx, edx, ebx, esp, ebp, esi, edi; /* 汎用レジスタ */
    u32 es, cs, ss, ds, fs, gs;                 /* セグメントレジスタ */
    u32 ldt;            /* LDTセレクタ */
    u16 trap;           /* トラップフラグ */
    u16 iomap_base;     /* I/Oマップベースアドレス */
} __attribute__((packed)) tss_t;

/* ユーザーモード管理構造体 */
typedef struct {
    gdt_entry_t gdt[6];     /* GDTエントリ（5個 + NULL） */
    gdt_ptr_t gdt_ptr;      /* GDTポインタ */
    tss_t tss;              /* タスク状態セグメント */
    u32 kernel_stack_top;   /* カーネルスタック頂上 */
    bool usermode_enabled;  /* ユーザーモード有効フラグ */
} usermode_manager_t;

/* ユーザープロセス用コンテキスト */
typedef struct {
    u32 eip;            /* 実行開始アドレス */
    u32 esp;            /* ユーザースタックポインタ */
    u32 user_stack_base;    /* ユーザースタックベース */
    u32 user_stack_size;    /* ユーザースタックサイズ */
    u32 code_base;      /* コードセグメントベース */
    u32 code_size;      /* コードセグメントサイズ */
    u32 data_base;      /* データセグメントベース */
    u32 data_size;      /* データセグメントサイズ */
} user_context_t;

/* 関数プロトタイプ */

/* 初期化・設定 */
void usermode_init(void);
void gdt_setup(void);
void tss_setup(void);

/* GDT管理 */
void gdt_set_gate(int num, u32 base, u32 limit, u8 access, u8 gran);
void gdt_load(void);

/* TSS管理 */
void tss_set_kernel_stack(u32 stack_top);

/* ユーザープロセス管理 */
int create_user_process(const char* name, void* code, u32 code_size, u32 entry_point);
int switch_to_user_mode(user_context_t* context);
void return_to_kernel_mode(void);

/* プロセス実行 */
void execute_user_function(void (*func)(void));
void jump_to_user_mode(u32 code_addr, u32 stack_addr);

/* ユーティリティ */
void usermode_print_info(void);
bool is_usermode_enabled(void);
u32 get_current_privilege_level(void);

/* アセンブリ関数 */
extern void gdt_flush(u32 gdt_ptr);
extern void tss_flush(void);
extern void switch_to_user_mode_asm(u32 user_stack, u32 user_code);
extern u32 get_cs(void);
extern u32 get_ds(void);

/* GDTアクセス権限定数 */
#define GDT_ACCESS_PRESENT      0x80    /* セグメント存在 */
#define GDT_ACCESS_PRIVILEGE(p) ((p) << 5)  /* 特権レベル */
#define GDT_ACCESS_DESCRIPTOR   0x10    /* ディスクリプタタイプ */
#define GDT_ACCESS_EXECUTABLE   0x08    /* 実行可能 */
#define GDT_ACCESS_DIRECTION    0x04    /* 方向/確認ビット */
#define GDT_ACCESS_READWRITE    0x02    /* 読み書き可能 */
#define GDT_ACCESS_ACCESSED     0x01    /* アクセス済み */

/* GDT粒度定数 */
#define GDT_GRAN_4K             0x80    /* 4K粒度 */
#define GDT_GRAN_32BIT          0x40    /* 32ビットデフォルトオペレーションサイズ */
#define GDT_GRAN_LIMIT_HIGH(l)  ((l) & 0x0F)  /* 制限の上位4ビット */

/* TSS定数 */
#define TSS_TYPE                0x89    /* TSSタイプ（存在、実行可能） */

#endif /* USERMODE_H */