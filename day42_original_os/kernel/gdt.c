#include "gdt.h"

// Define GDT entries (adjust size as needed)
#define GDT_ENTRIES 3 // NULL, Kernel Code, Kernel Data
static struct gdt_entry gdt[GDT_ENTRIES];
static struct gdt_ptr gdt_pointer;

// Helper function to set a GDT entry
static void gdt_set_gate(int num, uint32_t base, uint32_t limit, uint8_t access, uint8_t gran) {
    gdt[num].base_low    = (base & 0xFFFF);
    gdt[num].base_middle = (base >> 16) & 0xFF;
    gdt[num].base_high   = (base >> 24) & 0xFF;

    gdt[num].limit_low   = (limit & 0xFFFF);
    gdt[num].granularity = (limit >> 16) & 0x0F;

    gdt[num].granularity |= gran & 0xF0;
    gdt[num].access      = access;
}

// We will use inline assembly for gdt_load and segment register reload for now
static void gdt_load_and_flush(struct gdt_ptr* p_gdt_ptr) {
    asm volatile("lgdt %0" : : "m"(*p_gdt_ptr));

    // Reload CS, DS, ES, SS. FS and GS can be zero or a data segment.
    // Kernel Code Segment Selector: 0x08 (index 1)
    // Kernel Data Segment Selector: 0x10 (index 2)
    asm volatile(
        "pushq $0x08\n\t"           // New CS selector (our kernel code)
        "leaq .Lflush_cs_%= (%%rip), %%rax\n\t" // RIP of the label .Lflush_cs_ (unique).
        "pushq %%rax\n\t"
        "lretq\n"                 // Far return to reload CS
        ".Lflush_cs_%=:\n\t"         // Label needs to be unique, hence %=
        "movw $0x10, %%ax\n\t"      // Load data segment selector
        "movw %%ax, %%ds\n\t"
        "movw %%ax, %%es\n\t"
        "movw %%ax, %%ss\n\t"
        "movw $0x00, %%ax\n\t"      // Null selector for FS and GS (or 0x10 if needed)
        "movw %%ax, %%fs\n\t"
        "movw %%ax, %%gs\n\t"
        : : : "rax", "memory"
    );
}

void init_gdt_impl() {
    gdt_pointer.limit = (sizeof(struct gdt_entry) * GDT_ENTRIES) - 1;
    gdt_pointer.base  = (uint64_t)&gdt;

    // NULL Descriptor (index 0)
    gdt_set_gate(0, 0, 0, 0, 0);

    // Kernel Code Segment (index 1, selector 0x08)
    // Access: P=1, DPL=0, S=1 (Code/Data), Type=1010 (Execute/Read)
    // Granularity: G=0 (limit in bytes), D=0 (for 64-bit), L=1 (64-bit code segment)
    gdt_set_gate(1, 0, 0x00000000, 0x9A, 0x20); // Base=0, Limit=0 (effectively means max segment for 64-bit flat with L=1)

    // Kernel Data Segment (index 2, selector 0x10)
    // Access: P=1, DPL=0, S=1 (Code/Data), Type=0010 (Read/Write)
    // Granularity: G=1 (limit in 4KB pages), D=1 (32-bit default), L=0
    // For data segment, base=0, limit=0xFFFFF (means 4GB with G=1)
    gdt_set_gate(2, 0, 0xFFFFF, 0x92, 0xC0);

    gdt_load_and_flush(&gdt_pointer);
}

// Wrapper for the header file
void init_gdt() {
    init_gdt_impl();
}
