#include "gdt.h"
#include <stddef.h> // For NULL
#include <stdint.h> // For standard integer types
#include "serial.h" // For print_serial, print_serial_hex (debugging)
#include "main.h" // Add include for print_serial_str_hex/int prototypes

// Increase GDT entries to include TSS descriptor (spans 2 entries)
#define GDT_ENTRIES 7
struct gdt_entry_packed gdt[GDT_ENTRIES];
struct gdt_ptr_packed gdt_ptr;

// Define the Task State Segment (TSS)
__attribute__((aligned(16))) // Align TSS to 16 bytes (optional but good practice)
struct tss_packed tss;

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

// Helper function to set a TSS GDT entry (16 bytes) - Added back
static void set_gdt_tss_entry(int num_low, uint64_t base, uint32_t limit) {
    struct tss_entry_packed *tss_desc = (struct tss_entry_packed *)&gdt[num_low];

    tss_desc->limit_low = limit & 0xFFFF;
    tss_desc->base_low = base & 0xFFFF;
    tss_desc->base_mid = (base >> 16) & 0xFF;
    // Type = 0x9 (64-bit TSS Available), S=0 (System), DPL=0, P=1 (Present)
    tss_desc->type_attr = 0x89; // 10001001b
    // Limit [19:16], AVL=0, G=0 (byte granularity for TSS limit)
    tss_desc->limit_high_avl = (limit >> 16) & 0x0F;
    tss_desc->base_high = (base >> 24) & 0xFF;
    tss_desc->base_highest = (base >> 32) & 0xFFFFFFFF;
    tss_desc->reserved = 0;
}

void init_gdt(void) {
    // Initialize GDT pointer (adjust size for GDT_ENTRIES)
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

    // Initialize TSS structure - Added back
    tss.rsp0 = 0; // Placeholder, will be set later by tss_set_rsp0
    tss.iomap_base = sizeof(struct tss_packed); // No I/O map

    // TSS Segment setup - Added back
    uint64_t tss_base = (uint64_t)&tss;
    uint32_t tss_limit = sizeof(struct tss_packed) - 1;
    set_gdt_tss_entry(GDT_ENTRY_TSS_LOW, tss_base, tss_limit);

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

    // Load Task Register (LTR) - Added back
    uint16_t tss_selector = GDT_ENTRY_TSS_LOW * sizeof(struct gdt_entry_packed);
    asm volatile("ltr %0" : : "r"(tss_selector));

    print_serial(SERIAL_COM1_BASE, "GDT and TSS Initialized and Loaded.\n");
    print_serial_str_hex(SERIAL_COM1_BASE, "TSS Base: ", tss_base);
    print_serial_str_hex(SERIAL_COM1_BASE, "TSS Limit: ", tss_limit);
    print_serial_str_hex(SERIAL_COM1_BASE, "TSS Selector: ", tss_selector);
}

// Function to update TSS.RSP0 - Added back
void tss_set_rsp0(uint64_t rsp0_value) {
    tss.rsp0 = rsp0_value;
    print_serial_str_hex(SERIAL_COM1_BASE, "TSS RSP0 updated to: ", rsp0_value);
}
