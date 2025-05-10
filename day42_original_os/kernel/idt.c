#include "idt.h"
#include "gdt.h" // For KERNEL_CODE_SELECTOR, though we'll use 0x08 directly
#include <stddef.h> // For NULL

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

#define IDT_ENTRIES 256
static struct idt_entry idt[IDT_ENTRIES];
static struct idt_ptr idt_pointer;

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
void isr_handler_c(struct registers regs) {
    // For now, print a message to serial port. Later, call registered C handler.
    print_serial_idt(SERIAL_COM1_BASE_IDT, "Interrupt Received: ");
    char int_num_str[4];
    uint64_t val = regs.int_no;
    int k = 0;
    if (val == 0) int_num_str[k++] = '0';
    else { char temp_buf[4]; int tk = 0; while(val > 0) { temp_buf[tk++] = (val % 10) + '0'; val /= 10; } while(tk > 0) int_num_str[k++] = temp_buf[--tk]; }
    int_num_str[k] = '\0';
    print_serial_idt(SERIAL_COM1_BASE_IDT, int_num_str);

    print_serial_idt(SERIAL_COM1_BASE_IDT, ", Error Code: ");
    print_hex_idt(SERIAL_COM1_BASE_IDT, regs.err_code);
    print_serial_idt(SERIAL_COM1_BASE_IDT, "\n");

    if (interrupt_handlers[regs.int_no] != NULL) {
        interrupt_handlers[regs.int_no](&regs);
    } else {
        print_serial_idt(SERIAL_COM1_BASE_IDT, "  No specific C handler registered. Halting.\n");
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

static void page_fault_handler(struct registers* regs) {
    print_serial_idt(SERIAL_COM1_BASE_IDT, "EXCEPTION: Page Fault. Error code: ");
    print_hex_idt(SERIAL_COM1_BASE_IDT, regs->err_code);
    // Further analysis of CR2 register would be needed for page fault details
    uint64_t cr2;
    asm volatile ("mov %%cr2, %0" : "=r"(cr2));
    print_serial_idt(SERIAL_COM1_BASE_IDT, ", Accessed Address: ");
    print_hex_idt(SERIAL_COM1_BASE_IDT, cr2);
    print_serial_idt(SERIAL_COM1_BASE_IDT, "\n");
    asm volatile ("cli; hlt");
}

void init_idt() {
    idt_pointer.limit = (sizeof(struct idt_entry) * IDT_ENTRIES) - 1;
    idt_pointer.base  = (uint64_t)&idt;

    // Clear interrupt handlers array
    for (int i = 0; i < IDT_ENTRIES; i++) {
        interrupt_handlers[i] = NULL;
    }

    // Set up ISRs for the first 20 exceptions (0-19)
    // Selector 0x08 is our Kernel Code Segment from GDT
    // Type 0x8E for 64-bit Interrupt Gate (P=1, DPL=0, Type=E)
    // IST = 0 (not using Interrupt Stack Table for now)
    idt_set_gate(0, (uint64_t)isr0, 0x08, 0x8E, 0);
    idt_set_gate(1, (uint64_t)isr1, 0x08, 0x8E, 0);
    idt_set_gate(2, (uint64_t)isr2, 0x08, 0x8E, 0);
    idt_set_gate(3, (uint64_t)isr3, 0x08, 0x8E, 0);
    idt_set_gate(4, (uint64_t)isr4, 0x08, 0x8E, 0);
    idt_set_gate(5, (uint64_t)isr5, 0x08, 0x8E, 0);
    idt_set_gate(6, (uint64_t)isr6, 0x08, 0x8E, 0);
    idt_set_gate(7, (uint64_t)isr7, 0x08, 0x8E, 0);
    idt_set_gate(8, (uint64_t)isr8, 0x08, 0x8E, 0);  // Double Fault
    idt_set_gate(9, (uint64_t)isr9, 0x08, 0x8E, 0);
    idt_set_gate(10, (uint64_t)isr10, 0x08, 0x8E, 0); // Invalid TSS
    idt_set_gate(11, (uint64_t)isr11, 0x08, 0x8E, 0); // Segment Not Present
    idt_set_gate(12, (uint64_t)isr12, 0x08, 0x8E, 0); // Stack-Segment Fault
    idt_set_gate(13, (uint64_t)isr13, 0x08, 0x8E, 0); // General Protection Fault
    idt_set_gate(14, (uint64_t)isr14, 0x08, 0x8E, 0); // Page Fault
    // ISR 15 is reserved
    idt_set_gate(16, (uint64_t)isr16, 0x08, 0x8E, 0); // x87 Floating point
    idt_set_gate(17, (uint64_t)isr17, 0x08, 0x8E, 0); // Alignment Check
    idt_set_gate(18, (uint64_t)isr18, 0x08, 0x8E, 0); // Machine Check
    idt_set_gate(19, (uint64_t)isr19, 0x08, 0x8E, 0); // SIMD Floating point

    // Register a few specific C handlers
    interrupt_handlers[0] = divide_by_zero_handler;
    interrupt_handlers[13] = general_protection_fault_handler;
    interrupt_handlers[14] = page_fault_handler;

    // Load the IDT pointer
    asm volatile ("lidt %0" : : "m"(idt_pointer));

    // print_serial_idt(SERIAL_COM1_BASE_IDT, "IDT Initialized and Loaded.\n"); // For debugging
}
