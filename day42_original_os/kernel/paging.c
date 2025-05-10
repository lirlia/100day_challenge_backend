#include "paging.h"
#include "pmm.h" // For pmm_alloc_page
#include "io.h"  // For print_serial (indirectly, if we add debug prints)
#include <stddef.h> // For NULL

// For print_serial, print_serial_hex, etc. - ensure they are callable
// If they are static in main.c, we need a way to access them or create alternatives here.
// For now, assume they are globally available or we'll add stubs/alternatives later.
extern void print_serial(uint16_t port, const char *s);
extern void print_serial_hex(uint16_t port, uint64_t h);
extern void print_serial_utoa(uint16_t port, uint64_t u);
extern uint16_t SERIAL_COM1_BASE;

// Placeholder for the PML4 table address (physical)
pml4e_t *kernel_pml4 = NULL;

void init_paging() {
    print_serial(SERIAL_COM1_BASE, "Initializing paging...\n");

    // 1. Allocate a page for PML4 table from PMM
    kernel_pml4 = (pml4e_t *)pmm_alloc_page();
    if (!kernel_pml4) {
        print_serial(SERIAL_COM1_BASE, "ERROR: Failed to allocate page for PML4! Halting.\n");
        for (;;) { asm volatile("cli; hlt"); }
    }
    print_serial(SERIAL_COM1_BASE, "PML4 table allocated at physical address: 0x");
    print_serial_hex(SERIAL_COM1_BASE, (uint64_t)kernel_pml4);
    print_serial(SERIAL_COM1_BASE, "\n");

    // Convert physical address of PML4 to virtual address using HHDM offset
    pml4e_t *pml4_virt = (pml4e_t *)((uint64_t)kernel_pml4 + hhdm_offset);
    print_serial(SERIAL_COM1_BASE, "PML4 table virtual address: 0x");
    print_serial_hex(SERIAL_COM1_BASE, (uint64_t)pml4_virt);
    print_serial(SERIAL_COM1_BASE, "\n");

    // 2. Clear the PML4 table (all entries to 0)
    for (int i = 0; i < 512; i++) {
        pml4_virt[i] = 0;
    }
    print_serial(SERIAL_COM1_BASE, "PML4 table cleared.\n");

    // TODO: Map kernel space (higher half)
    // TODO: Map physical memory (identity map or direct map in lower half if needed for framebuffer/ACPI etc.)
    // TODO: Load PML4 into CR3 (carefully!)

    print_serial(SERIAL_COM1_BASE, "Paging initialization (structure setup) complete.\n");
}
