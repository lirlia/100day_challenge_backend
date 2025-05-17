#ifndef GDT_H
#define GDT_H

#include <stdint.h>

// Basic GDT Entry Indices (adjust if user entries were planned)
#define GDT_ENTRY_KERNEL_CODE 1
#define GDT_ENTRY_KERNEL_DATA 2
// #define GDT_ENTRY_USER_CODE   3 // Not used yet
// #define GDT_ENTRY_USER_DATA   4 // Not used yet
#define GDT_ENTRY_TSS_LOW     5 // TSS Descriptor (Lower 8 bytes)
#define GDT_ENTRY_TSS_HIGH    6 // TSS Descriptor (Upper 8 bytes)

// GDT Entry structure (8 bytes, matching earlier definition)
struct gdt_entry_packed {
    uint16_t limit_low;    // Lower 16 bits of limit
    uint16_t base_low;     // Lower 16 bits of base
    uint8_t  base_mid;     // Middle 8 bits of base
    uint8_t  access;       // Access flags
    uint8_t  limit_high_flags; // Limit high nibble + granularity flags
    uint8_t  base_high;    // Upper 8 bits of base
} __attribute__((packed));

// TSS Entry structure (System Segment Descriptor - 16 bytes)
struct tss_entry_packed {
    uint16_t limit_low;
    uint16_t base_low;
    uint8_t  base_mid;
    uint8_t  type_attr; // Type (4 bits), S=0, DPL (2 bits), P=1 (1 bit)
    uint8_t  limit_high_avl; // Limit [19:16] (4 bits), AVL=0, Ignored (2 bits), G=0 (1 bit)
    uint8_t  base_high;
    uint32_t base_highest;
    uint32_t reserved; // Must be zero
} __attribute__((packed));

// Task State Segment (TSS) structure for x86-64
struct tss_packed {
    uint32_t reserved0;
    uint64_t rsp0;       // Stack pointer for Ring 0
    uint64_t rsp1;       // Stack pointer for Ring 1 (unused)
    uint64_t rsp2;       // Stack pointer for Ring 2 (unused)
    uint64_t reserved1;
    uint64_t ist[7];     // Interrupt Stack Table pointers (IST1-IST7)
    uint64_t reserved2;
    uint16_t reserved3;
    uint16_t iomap_base; // I/O Map Base Address (relative to TSS start)
} __attribute__((packed));

// GDT Pointer structure (for lgdt instruction)
struct gdt_ptr_packed {
    uint16_t limit;        // Size of GDT - 1
    uint64_t base;         // Address of GDT
} __attribute__((packed));

// Function prototype for GDT initialization
void init_gdt(void);

// Function prototype for updating TSS.RSP0 (Added back)
void tss_set_rsp0(uint64_t rsp0_value);

#endif // GDT_H
