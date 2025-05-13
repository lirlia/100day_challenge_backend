#include "gdt.h"
#include <stddef.h> // For NULL
#include <stdint.h> // For standard integer types
#include "serial.h" // For print_serial (debugging, if needed)

// Define the GDT with only Null, Kernel Code, Kernel Data
#define GDT_ENTRIES 3
struct gdt_entry_packed gdt[GDT_ENTRIES];
struct gdt_ptr_packed gdt_ptr;

// Helper function to set a GDT entry (original simple version)
static void set_gdt_entry(int num, uint32_t base, uint32_t limit, uint8_t access, uint8_t gran_flags) {
    gdt[num].base_low    = (base & 0xFFFF);
    gdt[num].base_mid  = (base >> 16) & 0xFF;
    gdt[num].base_high   = (base >> 24) & 0xFF;

    gdt[num].limit_low   = (limit & 0xFFFF);
    // In original 8-byte GDT entry, limit_high is 4 bits, granularity flags are 4 bits.
    // For a 64-bit L-bit segment, limit is often set to 0 or 0xFFFFF with G=1.
    // The gran_flags parameter combines limit_high[19:16] and flags (G, D/B, L, AVL)
    gdt[num].limit_high_flags = ((limit >> 16) & 0x0F) | (gran_flags & 0xF0);
    gdt[num].access      = access;
}

void init_gdt(void) {
    // Initialize GDT pointer
    gdt_ptr.limit = (sizeof(struct gdt_entry_packed) * GDT_ENTRIES) - 1;
    gdt_ptr.base  = (uint64_t)&gdt;

    // NULL descriptor
    set_gdt_entry(0, 0, 0, 0, 0);

    // Kernel Code Segment (CS) - Selector 0x08
    // Access: P=1, DPL=0, S=1 (Code/Data), Type=Executable, Readable (0xA)
    // Granularity: G=1 (4KiB pages), L=1 (64-bit code segment)
    set_gdt_entry(GDT_ENTRY_KERNEL_CODE, 0, 0xFFFFF, 0x9A, 0xAF); // 0xAF -> G=1, L=1, Sz=0, AVL=0

    // Kernel Data Segment (DS, SS, ES, FS, GS) - Selector 0x10
    // Access: P=1, DPL=0, S=1 (Code/Data), Type=Writable (0x2)
    // Granularity: G=1 (4KiB pages), D/B=1 (32-bit default, but L=0 here)
    set_gdt_entry(GDT_ENTRY_KERNEL_DATA, 0, 0xFFFFF, 0x92, 0xCF); // 0xCF -> G=1, Sz=1, L=0, AVL=0

    // Load GDT
    asm volatile("lgdt %0" : : "m"(gdt_ptr));

    // Load new segment selectors
    asm volatile(
        "pushq $0x08\n"
        "lea .Lgdt_cs_loaded(%%rip), %%rax\n"
        "pushq %%rax\n"
        "lretq\n"
        ".Lgdt_cs_loaded:\n"
        "mov $0x10, %%ax\n"
        "mov %%ax, %%ds\n"
        "mov %%ax, %%es\n"
        "mov %%ax, %%fs\n"
        "mov %%ax, %%gs\n"
        "mov %%ax, %%ss\n"
        : : : "rax", "memory"
    );

    print_serial(SERIAL_COM1_BASE, "GDT Initialized and Loaded (Basic).\n");
}
