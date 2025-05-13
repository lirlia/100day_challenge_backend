#ifndef GDT_H
#define GDT_H

#include <stdint.h>

// Basic GDT Entry Indices (adjust if user entries were planned)
#define GDT_ENTRY_KERNEL_CODE 1
#define GDT_ENTRY_KERNEL_DATA 2

// GDT Entry structure (8 bytes, matching earlier definition)
struct gdt_entry_packed {
    uint16_t limit_low;    // Lower 16 bits of limit
    uint16_t base_low;     // Lower 16 bits of base
    uint8_t  base_mid;     // Middle 8 bits of base
    uint8_t  access;       // Access flags
    uint8_t  limit_high_flags; // Limit high nibble + granularity flags
    uint8_t  base_high;    // Upper 8 bits of base
} __attribute__((packed));

// GDT Pointer structure (for lgdt instruction)
struct gdt_ptr_packed {
    uint16_t limit;        // Size of GDT - 1
    uint64_t base;         // Address of GDT
} __attribute__((packed));

// Function prototype for GDT initialization
void init_gdt(void);

#endif // GDT_H
