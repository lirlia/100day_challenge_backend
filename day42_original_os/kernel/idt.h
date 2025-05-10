#ifndef IDT_H
#define IDT_H

#include <stdint.h>

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
    uint64_t r15, r14, r13, r12, r11, r10, r9, r8;
    uint64_t rbp, rdi, rsi, rdx, rcx, rbx, rax; // Pushed by common stub
    uint64_t int_no, err_code; // Pushed by specific ISR stub (err_code might not always be present)
    uint64_t rip, cs, rflags, userrsp, ss; // Pushed by CPU automatically on interrupt
};

// Type for an interrupt handler C function
typedef void (*interrupt_handler_t)(struct registers* regs);

// Function to initialize IDT and load it
void init_idt();

// Function to register an interrupt handler
void register_interrupt_handler(uint8_t n, interrupt_handler_t handler, uint8_t type);

// External ISR (Interrupt Service Routine) stubs
// These will be defined in an assembly file (e.g., isr.s or idt_stubs.s)
// We need one for each interrupt we want to handle.
// Example for first 32 exceptions:
extern void isr0();  // Divide by zero error
extern void isr1();  // Debug
extern void isr2();  // NMI
extern void isr3();  // Breakpoint
extern void isr4();  // Overflow
extern void isr5();  // Bound range exceeded
extern void isr6();  // Invalid opcode
extern void isr7();  // Device not available
extern void isr8();  // Double fault
extern void isr9();  // Coprocessor segment overrun
extern void isr10(); // Invalid TSS
extern void isr11(); // Segment not present
extern void isr12(); // Stack segment fault
extern void isr13(); // General protection fault
extern void isr14(); // Page fault
// extern void isr15(); // Reserved
extern void isr16(); // x87 floating point exception
extern void isr17(); // Alignment check
extern void isr18(); // Machine check
extern void isr19(); // SIMD floating point exception
// ... and so on for other ISRs if needed.

#endif // IDT_H
