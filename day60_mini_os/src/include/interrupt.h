#ifndef INTERRUPT_H
#define INTERRUPT_H

#include "kernel.h"

/* 割り込みベクタ番号 */
#define INT_DIVIDE_ERROR        0x00    /* 除算エラー */
#define INT_DEBUG               0x01    /* デバッグ */
#define INT_NMI                 0x02    /* ノンマスカブル割り込み */
#define INT_BREAKPOINT          0x03    /* ブレークポイント */
#define INT_OVERFLOW            0x04    /* オーバーフロー */
#define INT_BOUND_RANGE         0x05    /* 境界範囲超過 */
#define INT_INVALID_OPCODE      0x06    /* 無効オペコード */
#define INT_DEVICE_NOT_AVAIL    0x07    /* デバイス使用不可 */
#define INT_DOUBLE_FAULT        0x08    /* ダブルフォルト */
#define INT_INVALID_TSS         0x0A    /* 無効TSS */
#define INT_SEGMENT_NOT_PRESENT 0x0B    /* セグメント不在 */
#define INT_STACK_FAULT         0x0C    /* スタックフォルト */
#define INT_GENERAL_PROTECTION  0x0D    /* 一般保護例外 */
#define INT_PAGE_FAULT          0x0E    /* ページフォルト */
#define INT_FPU_ERROR           0x10    /* FPUエラー */

/* ハードウェア割り込み（PIC経由） */
#define INT_TIMER               0x20    /* タイマー割り込み（IRQ0） */
#define INT_KEYBOARD            0x21    /* キーボード割り込み（IRQ1） */
#define INT_SERIAL_COM2         0x23    /* シリアルCOM2（IRQ3） */
#define INT_SERIAL_COM1         0x24    /* シリアルCOM1（IRQ4） */
#define INT_FLOPPY              0x26    /* フロッピー（IRQ6） */
#define INT_PARALLEL            0x27    /* パラレルポート（IRQ7） */

/* システムコール */
#define INT_SYSCALL             0x80    /* システムコール */

/* IDT エントリ数 */
#define IDT_ENTRIES             256

/* 割り込み記述子テーブル（IDT）エントリ構造体 */
typedef struct {
    u16 offset_low;     /* オフセット下位16bit */
    u16 selector;       /* セグメントセレクタ */
    u8  zero;           /* 予約（0） */
    u8  type_attr;      /* タイプ・属性 */
    u16 offset_high;    /* オフセット上位16bit */
} __attribute__((packed)) idt_entry_t;

/* IDT レジスタ構造体 */
typedef struct {
    u16 limit;          /* IDTのサイズ - 1 */
    u32 base;           /* IDTのベースアドレス */
} __attribute__((packed)) idt_ptr_t;

/* 割り込みフレーム構造体（スタックにプッシュされる情報） */
/* スタック配置順序：ESP位置[0]から実際のメモリ配置に正確に対応 */
typedef struct {
    /* pusha で最後にプッシュされるのはEDI（ESP位置[0]） */
    u32 edi, esi, ebp, orig_esp, ebx, edx, ecx, eax;  /* [0-7] */
    /* データセグメント保存: mov ax, ds; push eax */
    u32 ds;          /* [8] */
    /* IRQ スタブでのプッシュ順序：先にerr_code、後でint_no（スタックは逆順） */
    u32 int_no;      /* [9] push byte 33 (後でプッシュ = ESP寄り) */
    u32 err_code;    /* [10] push byte 0 (先でプッシュ = ESP遠い) */
    /* CPU が自動でプッシュ（最初にプッシュ） */
    u32 eip, cs, eflags;  /* [11-13] */
    /* リング変更時のみ（今回は使用しない） */
    u32 useresp, ss;
} __attribute__((packed)) interrupt_frame_t;

/* 割り込みハンドラの型定義 */
typedef void (*interrupt_handler_t)(interrupt_frame_t* frame);

/* PIC（Programmable Interrupt Controller）関連 */
#define PIC1_COMMAND    0x20    /* マスターPIC コマンドポート */
#define PIC1_DATA       0x21    /* マスターPIC データポート */
#define PIC2_COMMAND    0xA0    /* スレーブPIC コマンドポート */
#define PIC2_DATA       0xA1    /* スレーブPIC データポート */

#define PIC_EOI         0x20    /* End of Interrupt コマンド */

/* PIT（Programmable Interval Timer）関連 */
#define PIT_CHANNEL0    0x40    /* チャンネル0 データポート */
#define PIT_CHANNEL1    0x41    /* チャンネル1 データポート */
#define PIT_CHANNEL2    0x42    /* チャンネル2 データポート */
#define PIT_COMMAND     0x43    /* コマンドポート */

#define PIT_FREQUENCY   1193182 /* PITのベース周波数（Hz） */

/* 関数プロトタイプ */

/* 割り込み管理 */
void interrupt_init(void);
void idt_set_gate(u8 num, u32 base, u16 selector, u8 flags);
void idt_load(void);

/* 例外ハンドラ */
void exception_handler(interrupt_frame_t* frame);

/* ハードウェア割り込みハンドラ */
void timer_handler(interrupt_frame_t* frame);
void keyboard_handler(interrupt_frame_t* frame);

/* システムコールハンドラ */
void syscall_handler(interrupt_frame_t* frame);

/* システムコールハンドラ（ユーザーモード用） */
void handle_syscall(interrupt_frame_t* frame);

/* PIC制御 */
void pic_init(void);
void pic_send_eoi(u8 irq);
void pic_set_mask(u8 irq);
void pic_clear_mask(u8 irq);

/* PIT制御 */
void pit_init(u32 frequency);

/* 割り込みハンドラ登録 */
void register_interrupt_handler(u8 n, interrupt_handler_t handler);

/* 割り込みハンドラ取得（テスト用） */
interrupt_handler_t get_interrupt_handler(u8 n);

/* プロセス管理からの関数（前方宣言） */
void scheduler_tick(void);

/* アセンブリで定義される割り込みスタブ */
extern void isr0(void);   /* 除算エラー */
extern void isr1(void);   /* デバッグ */
extern void isr2(void);   /* NMI */
extern void isr3(void);   /* ブレークポイント */
extern void isr4(void);   /* オーバーフロー */
extern void isr5(void);   /* 境界範囲超過 */
extern void isr6(void);   /* 無効オペコード */
extern void isr7(void);   /* デバイス使用不可 */
extern void isr8(void);   /* ダブルフォルト */
extern void isr10(void);  /* 無効TSS */
extern void isr11(void);  /* セグメント不在 */
extern void isr12(void);  /* スタックフォルト */
extern void isr13(void);  /* 一般保護例外 */
extern void isr14(void);  /* ページフォルト */
extern void isr16(void);  /* FPUエラー */

extern void irq0(void);   /* タイマー */
extern void irq1(void);   /* キーボード */

extern void isr128(void); /* システムコール (int 0x80) */
extern void isr_syscall(void); /* システムコール */

/* IDT タイプ・属性フラグ */
#define IDT_FLAG_PRESENT    0x80    /* 存在フラグ */
#define IDT_FLAG_RING0      0x00    /* リング0（カーネル） */
#define IDT_FLAG_RING3      0x60    /* リング3（ユーザー） */
#define IDT_FLAG_INTERRUPT  0x0E    /* 32bit割り込みゲート */
#define IDT_FLAG_TRAP       0x0F    /* 32bitトラップゲート */

#endif /* INTERRUPT_H */