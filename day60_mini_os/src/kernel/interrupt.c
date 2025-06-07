#include "interrupt.h"
#include "kernel.h"

/* IDT テーブル */
static idt_entry_t idt[IDT_ENTRIES];
static idt_ptr_t idt_ptr;

/* 割り込みハンドラテーブル */
static interrupt_handler_t interrupt_handlers[IDT_ENTRIES];

/* 割り込み初期化 */
void interrupt_init(void) {
    kernel_printf("interrupt_init: Starting interrupt system initialization...\n");

    /* IDTポインタ設定 */
    idt_ptr.limit = sizeof(idt_entry_t) * IDT_ENTRIES - 1;
    idt_ptr.base = (u32)&idt;

    /* IDTエントリをクリア */
    memset(&idt, 0, sizeof(idt_entry_t) * IDT_ENTRIES);
    memset(&interrupt_handlers, 0, sizeof(interrupt_handler_t) * IDT_ENTRIES);

    /* PIC初期化 */
    kernel_printf("interrupt_init: About to call pic_init...\n");
    pic_init();
    kernel_printf("interrupt_init: pic_init completed\n");

            /* 例外ハンドラ設定 - 段階的に実装 */
    kernel_printf("interrupt_init: Setting up exception handlers...\n");

    /* 一時的に例外ハンドラ設定をスキップ */
    kernel_printf("interrupt_init: Skipping exception handlers for debugging...\n");

    /* ハードウェア割り込みハンドラ設定 */
    kernel_printf("interrupt_init: Setting up hardware interrupt handlers...\n");
    // idt_set_gate(32, (u32)irq0, 0x08, IDT_FLAG_PRESENT | IDT_FLAG_RING0 | IDT_FLAG_INTERRUPT); /* タイマー */
    kernel_printf("interrupt_init: Setting up IRQ1 (keyboard)...\n");
    idt_set_gate(33, (u32)irq1, 0x08, IDT_FLAG_PRESENT | IDT_FLAG_RING0 | IDT_FLAG_INTERRUPT); /* キーボード */

    /* システムコールハンドラ設定 */
    kernel_printf("interrupt_init: Setting up system call handler...\n");
    kernel_printf("interrupt_init: Setting up ISR 128...\n");
    idt_set_gate(128, (u32)isr128, 0x08, IDT_FLAG_PRESENT | IDT_FLAG_RING3 | IDT_FLAG_INTERRUPT); /* システムコール */

    /* IDTロード */
    kernel_printf("interrupt_init: Loading IDT...\n");
    idt_load();

    /* PIT初期化（一時的にコメントアウト） */
    // kernel_printf("interrupt_init: Initializing PIT...\n");
    // pit_init(10);

    /* キーボード割り込み（IRQ1）のマスクを解除 */
    pic_clear_mask(1);

    /* 割り込みを有効化 */
    kernel_printf("interrupt_init: Enabling interrupts...\n");
    asm volatile("sti");  /* 割り込み有効化 */

    kernel_printf("interrupt_init: Interrupt system initialized successfully, keyboard enabled!\n");
}

/* IDTゲート設定 */
void idt_set_gate(u8 num, u32 base, u16 selector, u8 flags) {
    idt[num].offset_low = base & 0xFFFF;
    idt[num].offset_high = (base >> 16) & 0xFFFF;
    idt[num].selector = selector;
    idt[num].zero = 0;
    idt[num].type_attr = flags;
}

/* IDTロード（アセンブリ関数） */
extern void idt_flush(u32 idt_ptr);

void idt_load(void) {
    idt_flush((u32)&idt_ptr);
}

/* 汎用割り込みハンドラ（アセンブリから呼び出される） */
void interrupt_handler(interrupt_frame_t* frame) {
    /* 正常な割り込み処理に戻す */

    /* キーボード割り込み（IRQ1 = 33）を直接処理 */
    if (interrupt_handlers[33] != NULL) {
        interrupt_handlers[33](frame);
        /* PIC EOI送信 (IRQ1) */
        outb(0x20, 0x20);
        return;
    }

    /* キーボード割り込みハンドラーが登録されていない場合の緊急処理 */
    if (inb(0x64) & 0x01) {  /* キーボードバッファに入力がある */
        u8 scancode = inb(0x60);
        kernel_printf("🎉 DIRECT KEYBOARD: 0x%02X\n", scancode);
        /* PIC EOI送信 (IRQ1) */
        outb(0x20, 0x20);
        return;
    }

    /* その他の割り込み */
    kernel_printf("Other interrupt\n");
    /* 念のためEOI送信 */
    outb(0x20, 0x20);
}

/* 例外ハンドラ */
void exception_handler(interrupt_frame_t* frame) {
    const char* exception_messages[] = {
        "Division Error",
        "Debug Exception",
        "Non-Maskable Interrupt",
        "Breakpoint",
        "Overflow",
        "Bound Range Exceeded",
        "Invalid Opcode",
        "Device Not Available",
        "Double Fault",
        "Reserved",
        "Invalid TSS",
        "Segment Not Present",
        "Stack Fault",
        "General Protection Fault",
        "Page Fault",
        "Reserved",
        "FPU Error"
    };

    kernel_printf("\n=====================================\n");
    kernel_printf("        EXCEPTION OCCURRED\n");
    kernel_printf("=====================================\n");

    if (frame->int_no < 17) {
        kernel_printf("Exception: %s\n", exception_messages[frame->int_no]);
    } else {
        kernel_printf("Exception: Unknown (%u)\n", frame->int_no);
    }

    kernel_printf("Error Code: %u\n", frame->err_code);
    kernel_printf("EIP: 0x%x\n", frame->eip);
    kernel_printf("CS: 0x%x\n", frame->cs);
    kernel_printf("EFLAGS: 0x%x\n", frame->eflags);
    kernel_printf("=====================================\n");

    /* システムを停止 */
    kernel_panic("Unhandled exception occurred");
}

/* タイマー割り込みハンドラ */
void timer_handler(interrupt_frame_t* frame) {
    static u32 tick_count = 0;

    tick_count++;

    /* 最初の10回のみ出力（安全性確保） */
    if (tick_count <= 10) {
        kernel_printf("Timer tick: %u\n", tick_count);
    }

    /* スケジューラのタイムスライス処理（一時的にコメントアウト） */
    // scheduler_tick();

    UNUSED(frame);
}

/* キーボード割り込みハンドラはkeyboard.cで実装 */

/* システムコールハンドラ（usermode.c実装への転送） */
extern void handle_syscall(interrupt_frame_t* frame);

void syscall_handler(interrupt_frame_t* frame) {
    handle_syscall(frame);
}

/* PIC初期化 */
void pic_init(void) {
    /* ICW1: カスケード、ICW4必要 */
    outb(PIC1_COMMAND, 0x11);
    outb(PIC2_COMMAND, 0x11);

    /* ICW2: 割り込みベクタオフセット */
    outb(PIC1_DATA, 0x20); /* マスターPIC: 32-39 */
    outb(PIC2_DATA, 0x28); /* スレーブPIC: 40-47 */

    /* ICW3: カスケード設定 */
    outb(PIC1_DATA, 0x04); /* IRQ2でスレーブ接続 */
    outb(PIC2_DATA, 0x02); /* スレーブはIRQ2で接続 */

    /* ICW4: 8086モード */
    outb(PIC1_DATA, 0x01);
    outb(PIC2_DATA, 0x01);

    /* 全割り込みをマスク（無効化） */
    outb(PIC1_DATA, 0xFF); /* 全ての割り込みを無効化 */
    outb(PIC2_DATA, 0xFF); /* スレーブPICは全てマスク */
}

/* PIC EOI送信 */
void pic_send_eoi(u8 irq) {
    if (irq >= 8) {
        outb(PIC2_COMMAND, PIC_EOI);
    }
    outb(PIC1_COMMAND, PIC_EOI);
}

/* PIC割り込みマスク設定 */
void pic_set_mask(u8 irq) {
    u16 port;
    u8 value;

    if (irq < 8) {
        port = PIC1_DATA;
    } else {
        port = PIC2_DATA;
        irq -= 8;
    }

    value = inb(port) | (1 << irq);
    outb(port, value);
}

/* PIC割り込みマスク解除 */
void pic_clear_mask(u8 irq) {
    u16 port;
    u8 value;

    if (irq < 8) {
        port = PIC1_DATA;
    } else {
        port = PIC2_DATA;
        irq -= 8;
    }

    value = inb(port) & ~(1 << irq);
    outb(port, value);
}

/* PIT初期化 */
void pit_init(u32 frequency) {
    u32 divisor = PIT_FREQUENCY / frequency;

    /* チャンネル0、低バイト/高バイト、モード3（方形波）*/
    outb(PIT_COMMAND, 0x36);

    /* 分周比設定 */
    outb(PIT_CHANNEL0, divisor & 0xFF);
    outb(PIT_CHANNEL0, (divisor >> 8) & 0xFF);

    kernel_printf("PIT initialized: %u Hz (%u divisor)\n", frequency, divisor);
}

/* 割り込みハンドラ登録 */
void register_interrupt_handler(u8 n, interrupt_handler_t handler) {
    interrupt_handlers[n] = handler;
    kernel_printf("Interrupt handler registered for vector %u\n", n);
}

/* 割り込みハンドラ取得（テスト用） */
interrupt_handler_t get_interrupt_handler(u8 n) {
    return interrupt_handlers[n];
}