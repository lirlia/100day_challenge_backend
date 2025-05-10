#include "idt.h"
#include "io.h"      // For print_serial etc.
#include "gdt.h"     // For KERNEL_CODE_SELECTOR (or define it directly)
#include <stddef.h>  // For NULL
#include "serial.h" // For print_serial_idt and other serial functions
#include "pmm.h"    // For PMM_HIGHER_HALF_OFFSET, if that's what hhdm_offset refers to. Or include paging.h
#include "paging.h" // For PAGING_HHDM_OFFSET

// For serial printing, temporary
// Ideally, we should have a proper logging/panic system
static inline void outb_idt(uint16_t port, uint8_t val) { asm volatile ( "outb %0, %1" : : "a"(val), "Nd"(port) ); }
static inline uint8_t inb_idt(uint16_t port) { uint8_t ret; asm volatile ( "inb %1, %0" : "=a"(ret) : "Nd"(port) ); return ret; }
#define SERIAL_COM1_BASE_IDT 0x3F8
static int is_transmit_empty_idt(uint16_t port) { return inb_idt(port + 5) & 0x20; }
static void write_serial_char_idt(uint16_t port, char a) { while (is_transmit_empty_idt(port) == 0); outb_idt(port, a); }
static void print_serial_idt(uint16_t port, const char *s) { for (int i = 0; s[i] != '\0'; i++) write_serial_char_idt(port, s[i]); }
static void print_hex_idt(uint16_t port, uint64_t h) {
    char buf[19]; buf[0] = '0'; buf[1] = 'x'; int i = 18; buf[i--] = '\0';
    if (h == 0) buf[i--] = '0'; else while (h > 0) { uint8_t d = h % 16; buf[i--] = (d < 10) ? ('0' + d) : ('A' + d - 10); h /= 16; }
    print_serial_idt(port, &buf[i + 1]);
}

// --- DBG Macro Definition (Copied for use in this file if needed for IDT debugging) ---
static inline void dbg_u64_idt(const char *s, uint64_t v) {
    for (const char *p = s; *p; p++) outb(SERIAL_COM1_BASE, *p);
    for (int i = 60; i >= 0; i -= 4) {
        char c = "0123456789ABCDEF"[(v >> i) & 0xF];
        outb(SERIAL_COM1_BASE, c);
    }
    outb(SERIAL_COM1_BASE, '\n');
}
#define DBG_IDT(x) dbg_u64_idt(#x " = ", (uint64_t)(x))
// --- End DBG Macro Definition ---

// Forward declaration for page_fault_c_handler
static void page_fault_c_handler(struct registers *regs);

#define IDT_ENTRIES 256
struct idt_entry idt[IDT_ENTRIES];
struct idt_ptr idt_ptr_struct; // Renamed from idt_ptr to avoid conflict with type

// Array of C interrupt handlers, indexed by interrupt number
static interrupt_handler_t interrupt_handlers[IDT_ENTRIES];

// Helper function to set an IDT entry
static void idt_set_gate(uint8_t num, uint64_t base, uint16_t sel, uint8_t flags, uint8_t ist) {
    idt[num].offset_low = (base & 0xFFFF);
    idt[num].offset_mid = (base >> 16) & 0xFFFF;
    idt[num].offset_high = (base >> 32) & 0xFFFFFFFF;

    idt[num].selector     = sel;  // Kernel Code Segment selector (0x08)
    idt[num].ist          = ist;  // 0 if IST is not used
    idt[num].type_attr    = flags;
    idt[num].reserved     = 0;
}

// Called from the assembly ISR common stub
void isr_handler_c(struct registers *regs) {
    // For now, print a message to serial port. Later, call registered C handler.

    // If it's a page fault, call the dedicated handler
    if (regs->int_no == 14) {
        page_fault_c_handler(regs);
        return; // page_fault_c_handler halts, so this is mostly for clarity
    }

    print_serial_idt(SERIAL_COM1_BASE_IDT, "Interrupt Received: ");
    char int_num_str[4];
    uint64_t val = regs->int_no;
    int k = 0;
    if (val == 0) int_num_str[k++] = '0';
    else { char temp_buf[4]; int tk = 0; while(val > 0) { temp_buf[tk++] = (val % 10) + '0'; val /= 10; } while(tk > 0) int_num_str[k++] = temp_buf[--tk]; }
    int_num_str[k] = '\0';
    print_serial_idt(SERIAL_COM1_BASE_IDT, int_num_str);

    print_serial_idt(SERIAL_COM1_BASE_IDT, ", Error Code: ");
    print_hex_idt(SERIAL_COM1_BASE_IDT, regs->err_code);
    print_serial_idt(SERIAL_COM1_BASE_IDT, "\n");

    if (interrupt_handlers[regs->int_no] != NULL) {
        interrupt_handlers[regs->int_no](regs);
    } else {
        print_serial_idt(SERIAL_COM1_BASE_IDT, "  No specific C handler registered for this interrupt. Halting.\n");
        // For unhandled interrupts, especially exceptions, it's often best to halt.
        asm volatile ("cli; hlt");
    }
}

void register_interrupt_handler(uint8_t n, interrupt_handler_t handler, uint8_t type_attr) {
    interrupt_handlers[n] = handler;
    // Note: idt_set_gate should be called here or in init_idt after handlers are registered
    // For now, we will call idt_set_gate from init_idt for the predefined ISR stubs.
    // This function would be more useful if we were dynamically adding handlers for IRQs later.
}

// Placeholder C handlers for specific exceptions
static void divide_by_zero_handler(struct registers* regs) {
    print_serial_idt(SERIAL_COM1_BASE_IDT, "EXCEPTION: Divide by Zero\n");
    asm volatile ("cli; hlt");
}

static void general_protection_fault_handler(struct registers* regs) {
    print_serial_idt(SERIAL_COM1_BASE_IDT, "EXCEPTION: General Protection Fault. Error code: ");
    print_hex_idt(SERIAL_COM1_BASE_IDT, regs->err_code);
    print_serial_idt(SERIAL_COM1_BASE_IDT, "\n");
    asm volatile ("cli; hlt");
}

// static void page_fault_handler(struct registers* regs) { // This is redundant with page_fault_c_handler
//    print_serial_idt(SERIAL_COM1_BASE_IDT, "EXCEPTION: Page Fault. Error code: ");
//    print_hex_idt(SERIAL_COM1_BASE_IDT, regs->err_code);
//    uint64_t cr2;
//    asm volatile ("mov %%cr2, %0" : "=r"(cr2));
//    print_serial_idt(SERIAL_COM1_BASE_IDT, ", Accessed Address: ");
//    print_hex_idt(SERIAL_COM1_BASE_IDT, cr2);
//    print_serial_idt(SERIAL_COM1_BASE_IDT, "\n");
//    asm volatile ("cli; hlt");
// }

// Page Fault C Handler
// The assembly stub for ISR 14 is expected to push the error code and then call this handler,
// passing a pointer to the stack where registers (including error code) are saved.
void page_fault_c_handler(struct registers *regs) { // err_code is now part of struct registers
    // Temporarily disable all serial output to isolate the issue
    /*
    uint64_t faulting_address;
    asm volatile("mov %%cr2, %0" : "=r"(faulting_address));

    print_serial_idt(SERIAL_COM1_BASE_IDT, "\n--- PAGE FAULT (#14) ---");
    DBG_IDT(faulting_address); // Using DBG macro
    DBG_IDT(regs->err_code);   // Accessing err_code from struct registers

    print_serial_idt(SERIAL_COM1_BASE_IDT, "  Error Code Breakdown: ");
    if (regs->err_code & 0x1) print_serial_idt(SERIAL_COM1_BASE_IDT, "P ");   // Present
    else print_serial_idt(SERIAL_COM1_BASE_IDT, "~P ");
    if (regs->err_code & 0x2) print_serial_idt(SERIAL_COM1_BASE_IDT, "W ");   // Write
    else print_serial_idt(SERIAL_COM1_BASE_IDT, "R ");
    if (regs->err_code & 0x4) print_serial_idt(SERIAL_COM1_BASE_IDT, "U ");   // User
    else print_serial_idt(SERIAL_COM1_BASE_IDT, "S ");
    if (regs->err_code & 0x8) print_serial_idt(SERIAL_COM1_BASE_IDT, "RSVD "); // Reserved Write
    if (regs->err_code & 0x10) print_serial_idt(SERIAL_COM1_BASE_IDT, "I/D"); // Instruction Fetch
    print_serial_idt(SERIAL_COM1_BASE_IDT, "\n");

    print_serial_idt(SERIAL_COM1_BASE_IDT, "  Registers at fault:\n");
    print_serial_format_idt("  RAX=0x%016llx RBX=0x%016llx RCX=0x%016llx RDX=0x%016llx\n", regs->rax, regs->rbx, regs->rcx, regs->rdx);
    print_serial_format_idt("  RSI=0x%016llx RDI=0x%016llx RBP=0x%016llx RSP=0x%016llx\n", regs->rsi, regs->rdi, regs->rbp, regs->rsp);
    print_serial_format_idt("  R8 =0x%016llx R9 =0x%016llx R10=0x%016llx R11=0x%016llx\n", regs->r8, regs->r9, regs->r10, regs->r11);
    print_serial_format_idt("  R12=0x%016llx R13=0x%016llx R14=0x%016llx R15=0x%016llx\n", regs->r12, regs->r13, regs->r14, regs->r15);
    print_serial_format_idt("  RIP=0x%016llx RFLAGS=0x%016llx CS=0x%04x SS=0x%04x\n", regs->rip, regs->rflags, regs->cs, regs->ss);
    print_serial_format_idt("  CR2=0x%016llx ERR=0x%016llx\n", faulting_address, regs->err_code);


    // Simple on-screen panic message (if VGA is mapped and working)
    // This part might cause issues if paging isn't fully set up for video memory
    // For now, this is more of a placeholder or best-effort debug output.
    // Ensure PAGING_HHDM_OFFSET is available from paging.h
    volatile char *video_mem = (volatile char*)(0xB8000 + PAGING_HHDM_OFFSET); // Standard VGA text mode memory, HHDM mapped
    const char *panic_msg = "PANIC: PAGE FAULT! System Halted.";
    for (int i = 0; panic_msg[i] != '\0'; ++i) {
        video_mem[i * 2] = panic_msg[i];
        video_mem[i * 2 + 1] = 0xCF; // White text on blue background
    }
    */

    // Halt the system
    print_serial_idt(SERIAL_COM1_BASE_IDT, "System Halted due to Page Fault.\n");
    asm volatile ("cli; hlt");
}

// Generic interrupt handler C function (placeholder, or for other interrupts)
// Called by assembly stubs. Assembly stub must put int_no and err_code (if any) into struct registers.
void interrupt_handler_c(struct registers *regs) {
    // if (regs->int_no == 14) { // Page fault should be handled by isr14 -> page_fault_c_handler directly
    //     page_fault_c_handler(regs);
    //     return;
    // }
    // This function is now replaced by the modified isr_handler_c above.
    // The old interrupt_handler_c and its content (including the UNHANDLED INTERRUPT message)
    // will be effectively replaced by the logic in the new isr_handler_c.
    // For clarity, this old function body can be removed or commented out if isr_handler_c is the sole entry point.

    // For now, let's assume the edit means to modify the existing isr_handler_c and
    // the separately defined (and now somewhat redundant) interrupt_handler_c is not the target.
    // The instructions implied modifying the main C entry point from assembly.

    print_serial_idt(SERIAL_COM1_BASE_IDT, "\n--- GENERIC C INTERRUPT HANDLER (should not be reached if specific dispatch works) ---\n");
    DBG_IDT(regs->int_no);
    if (regs->int_no == 8 || (regs->int_no >= 10 && regs->int_no <= 14) || regs->int_no == 17 || regs->int_no == 21 || regs->int_no == 29 || regs->int_no == 30 ) {
        DBG_IDT(regs->err_code);
    }
    DBG_IDT(regs->rip);
    print_serial_idt(SERIAL_COM1_BASE_IDT, "Halting system due to GENERIC interrupt_handler_c.\n");
    for(;;) { asm volatile("cli; hlt"); }

    // Register a few specific C handlers
    // interrupt_handlers[0] = divide_by_zero_handler;
    // interrupt_handlers[13] = general_protection_fault_handler;
    // interrupt_handlers[14] = page_fault_handler; // Removed, PF handled by dedicated path

    // Register Page Fault Handler (ISR 14)
    // The KERNEL_CODE_SELECTOR should be 0x08 (from GDT)
    // Flags: 0x8E (Interrupt Gate, Ring 0, Present) or 0x8F (Trap Gate, Ring 0, Present)
    // Trap gates are generally preferred for faults as they don't re-disable interrupts.
    // idt_set_gate(14, (uint64_t)isr14, 0x08, 0x8F, 0); // Using Trap Gate for Page Fault

    // Load the IDT pointer
    // asm volatile ("lidt %0" : : "m"(idt_ptr_struct));

    // print_serial_idt(SERIAL_COM1_BASE_IDT, "IDT Initialized and Loaded.\\n"); // For debugging
}

void init_idt() {
    // Initialize IDT pointer
    idt_ptr_struct.limit = sizeof(idt) - 1;
    idt_ptr_struct.base = (uint64_t)&idt;

    // Clear all interrupt handlers initially
    for (int i = 0; i < IDT_ENTRIES; i++) {
        interrupt_handlers[i] = NULL;
        // Optionally clear the IDT entry itself if not zero-initialized globally
        // idt_set_gate(i, 0, 0, 0, 0); // Or better, bzero/memset idt array
    }

    // Register ISR stubs (first 32 are CPU exceptions)
    // Example for a few. You should add all relevant ISRs from isr_stubs.s
    // KERNEL_CODE_SELECTOR (0x08) and Trap Gate (0x8F) or Interrupt Gate (0x8E)
    idt_set_gate(0, (uint64_t)isr0, 0x08, 0x8E, 0);   // Divide by Zero
    idt_set_gate(1, (uint64_t)isr1, 0x08, 0x8E, 0);   // Debug
    idt_set_gate(2, (uint64_t)isr2, 0x08, 0x8E, 0);   // NMI
    idt_set_gate(3, (uint64_t)isr3, 0x08, 0x8E, 0);   // Breakpoint
    idt_set_gate(4, (uint64_t)isr4, 0x08, 0x8E, 0);   // Overflow
    idt_set_gate(5, (uint64_t)isr5, 0x08, 0x8E, 0);   // Bound Range Exceeded
    idt_set_gate(6, (uint64_t)isr6, 0x08, 0x8E, 0);   // Invalid Opcode
    idt_set_gate(7, (uint64_t)isr7, 0x08, 0x8E, 0);   // Device Not Available
    idt_set_gate(8, (uint64_t)isr8, 0x08, 0x8E, 0);   // Double Fault
    // isr9 is coprocessor segment overrun, might not be used if no FPU context saving yet
    idt_set_gate(10, (uint64_t)isr10, 0x08, 0x8E, 0); // Invalid TSS
    idt_set_gate(11, (uint64_t)isr11, 0x08, 0x8E, 0); // Segment Not Present
    idt_set_gate(12, (uint64_t)isr12, 0x08, 0x8E, 0); // Stack-Segment Fault
    idt_set_gate(13, (uint64_t)isr13, 0x08, 0x8E, 0); // General Protection Fault
    idt_set_gate(14, (uint64_t)isr14, 0x08, 0x8F, 0); // Page Fault (using Trap Gate)
    idt_set_gate(16, (uint64_t)isr16, 0x08, 0x8E, 0); // x87 Floating-Point Exception
    idt_set_gate(17, (uint64_t)isr17, 0x08, 0x8E, 0); // Alignment Check
    idt_set_gate(18, (uint64_t)isr18, 0x08, 0x8E, 0); // Machine Check
    idt_set_gate(19, (uint64_t)isr19, 0x08, 0x8E, 0); // SIMD Floating-Point Exception

    // Register C handlers for specific interrupts where needed
    interrupt_handlers[0] = divide_by_zero_handler;
    interrupt_handlers[13] = general_protection_fault_handler;
    // For page faults, isr14 will call page_fault_c_handler directly from assembly
    // So no need to register page_fault_c_handler in the interrupt_handlers array here
    // if page_fault_c_handler is called directly by the stub.
    // However, if isr_handler_c is the generic handler that dispatches, then:
    // interrupt_handlers[14] = page_fault_c_handler; // If isr_handler_c dispatches to it

    // It seems page_fault_c_handler is intended to be called directly from the isr14 stub.
    // Ensure your isr14 stub in isr_stubs.s calls `page_fault_c_handler`.

    // Load the IDT
    asm volatile("lidt %0" : : "m"(idt_ptr_struct));

    print_serial_idt(SERIAL_COM1_BASE_IDT, "IDT Initialized and Loaded.\\n");
}
