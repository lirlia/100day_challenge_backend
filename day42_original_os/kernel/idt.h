#ifndef IDT_H
#define IDT_H

#include <stdint.h>
#include <stdbool.h>

// IDT Entry structure (16 bytes for x86-64)
struct idt_entry {
    uint16_t offset_low;    // Lower 16 bits of handler function address
    uint16_t selector;      // Kernel code segment selector (e.g., 0x08)
    uint8_t  ist;           // Interrupt Stack Table offset (0 if not used)
    uint8_t  type_attr;     // Type and attributes (e.g., 0x8E for 64-bit interrupt gate)
    uint16_t offset_mid;    // Middle 16 bits of handler function address
    uint32_t offset_high;   // Upper 32 bits of handler function address
    uint32_t reserved;      // Reserved, must be 0
} __attribute__((packed));

// IDT Pointer structure (for lidt instruction)
struct idt_ptr {
    uint16_t limit;         // Size of IDT - 1
    uint64_t base;          // Address of IDT
} __attribute__((packed));

// Structure to hold CPU registers, passed to interrupt handlers
struct registers {
    /* 汎用レジスタを push する順番と同じにする */
    uint64_t r15, r14, r13, r12, r11, r10, r9, r8;
    uint64_t rbp, rdi, rsi, rdx, rcx, rbx, rax;

    /* ≪ここからはスタブが積む≫ */
    uint64_t int_no;   // ← 必ず push する
    uint64_t err_code; // ← CPU が push しない割込みは 0 をダミーで push

    /* CPU 自動 push */
    uint64_t rip, cs, rflags, userrsp, ss;
} __attribute__((packed));

// Type for an interrupt handler C function
typedef void (*interrupt_handler_t)(struct registers* regs);

// Interrupt Service Routine (ISR) handler type
typedef void (*isr_t)(struct registers*);

// Interrupt Request (IRQ) handler type (no error code pushed by hardware)
typedef void (*irq_t)(struct registers*);

// Function prototypes
void init_idt(void);
void register_interrupt_handler(uint8_t n, isr_t handler);
void register_irq_handler(uint8_t irq, irq_t handler); // New for IRQs

// External assembly stubs (defined in isr_stubs.s)
// CPU Exceptions (ISRs 0-19)
extern void isr0();
extern void isr1();
extern void isr2();
extern void isr3();
extern void isr4();
extern void isr5();
extern void isr6();
extern void isr7();
extern void isr8();
extern void isr9();
extern void isr10();
extern void isr11();
extern void isr12();
extern void isr13();
extern void isr14();
extern void isr15();
extern void isr16();
extern void isr17();
extern void isr18();
extern void isr19();

// Hardware Interrupts (IRQs 0-15, mapped typically to vectors 32-47)
extern void irq0();  // Timer
extern void irq1();  // Keyboard (example)
extern void irq2();  // Second example IRQ
extern void irq3();
extern void irq4();
extern void irq5();
extern void irq6();
extern void irq7();
extern void irq8();
extern void irq9();
extern void irq10();
extern void irq11();
extern void irq12();
extern void irq13();
extern void irq14();
extern void irq15();

#endif // IDT_H
