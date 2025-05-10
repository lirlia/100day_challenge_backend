#ifndef GDT_H
#define GDT_H

#include <stdint.h>

// GDT Entry structure (8 bytes)
struct gdt_entry {
    uint16_t limit_low;    // Lower 16 bits of limit
    uint16_t base_low;     // Lower 16 bits of base
    uint8_t  base_middle;  // Next 8 bits of base
    uint8_t  access;       // Access flags, determine segment type
    uint8_t  granularity;  // Granularity (limit_high, flags)
    uint8_t  base_high;    // Last 8 bits of base
} __attribute__((packed)); // Ensure structure is packed, no padding

// GDT Pointer structure (for lgdt instruction)
struct gdt_ptr {
    uint16_t limit;        // Size of GDT - 1
    uint64_t base;         // Address of GDT
} __attribute__((packed));

// Function to initialize GDT and load it
void init_gdt();

#endif // GDT_H
