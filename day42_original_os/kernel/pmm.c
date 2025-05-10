#include "pmm.h"
#include "limine.h"
#include <stdint.h>
#include <stddef.h> // For NULL and size_t

// External serial printing functions from main.c (for debugging PMM)
// These should ideally be replaced by a proper kernel logging system later.
extern void print_serial(uint16_t port, const char *s);
extern void print_serial_hex(uint16_t port, uint64_t h);
extern void print_serial_utoa(uint16_t port, uint64_t u);
#define KERNEL_COM1 SERIAL_COM1_BASE // Assuming SERIAL_COM1_BASE is defined in main.c or a common header if we include it
                                      // For now, let's hardcode it for PMM debugging if needed or pass port.
                                      // Let's use a local define for clarity in PMM if not including main.h directly.
#define PMM_DEBUG_SERIAL_PORT 0x3F8

static pmm_state_t pmm_info;

// Helper to align an address down to the nearest page boundary
static inline uint64_t page_align_down(uint64_t addr) {
    return addr & ~(PAGE_SIZE - 1);
}

// Helper to align an address up to the nearest page boundary
static inline uint64_t page_align_up(uint64_t addr) {
    return (addr + PAGE_SIZE - 1) & ~(PAGE_SIZE - 1);
}

void init_pmm(struct limine_memmap_response *memmap) {
    if (memmap == NULL) {
        print_serial(PMM_DEBUG_SERIAL_PORT, "PMM Error: Memory map response is NULL! Halting.\n");
        for (;;) { asm volatile("cli; hlt"); }
    }

    print_serial(PMM_DEBUG_SERIAL_PORT, "PMM: Initializing Physical Memory Manager...\n");

    // Pass 1: Calculate total number of usable pages to determine stack size
    size_t usable_page_count = 0;
    for (uint64_t i = 0; i < memmap->entry_count; i++) {
        struct limine_memmap_entry *entry = memmap->entries[i];
        if (entry->type == LIMINE_MEMMAP_USABLE) {
            usable_page_count += entry->length / PAGE_SIZE;
        }
    }

    if (usable_page_count == 0) {
        print_serial(PMM_DEBUG_SERIAL_PORT, "PMM Error: No usable memory pages found! Halting.\n");
        for (;;) { asm volatile("cli; hlt"); }
    }
    pmm_info.total_pages_initial = usable_page_count;
    pmm_info.capacity = usable_page_count; // Stack must be able to hold all usable page addresses
    size_t pmm_stack_required_bytes = pmm_info.capacity * sizeof(uint64_t);

    print_serial(PMM_DEBUG_SERIAL_PORT, "PMM: Total initial usable pages: ");
    print_serial_utoa(PMM_DEBUG_SERIAL_PORT, pmm_info.total_pages_initial);
    print_serial(PMM_DEBUG_SERIAL_PORT, "\nPMM: Required stack size: ");
    print_serial_utoa(PMM_DEBUG_SERIAL_PORT, pmm_stack_required_bytes);
    print_serial(PMM_DEBUG_SERIAL_PORT, " bytes\n");

    // Pass 2: Find a large enough USABLE memory region to host our PMM stack
    uint64_t pmm_stack_phys_addr = 0;
    for (uint64_t i = 0; i < memmap->entry_count; i++) {
        struct limine_memmap_entry *entry = memmap->entries[i];
        if (entry->type == LIMINE_MEMMAP_USABLE && entry->length >= pmm_stack_required_bytes) {
            // Try to place stack at the beginning of this region, page-aligned UP.
            uint64_t potential_stack_base = page_align_up(entry->base);
            if (potential_stack_base >= entry->base && (potential_stack_base + pmm_stack_required_bytes) <= (entry->base + entry->length)) {
                pmm_stack_phys_addr = potential_stack_base;
                print_serial(PMM_DEBUG_SERIAL_PORT, "PMM: Found region for PMM stack at 0x");
                print_serial_hex(PMM_DEBUG_SERIAL_PORT, pmm_stack_phys_addr);
                print_serial(PMM_DEBUG_SERIAL_PORT, " (length 0x");
                print_serial_hex(PMM_DEBUG_SERIAL_PORT, pmm_stack_required_bytes);
                print_serial(PMM_DEBUG_SERIAL_PORT, ")\n");
                break; // Use the first suitable region found
            }
        }
    }

    if (pmm_stack_phys_addr == 0) {
        print_serial(PMM_DEBUG_SERIAL_PORT, "PMM Error: Could not find suitable memory for PMM stack! Halting.\n");
        for (;;) { asm volatile("cli; hlt"); }
    }

    pmm_info.stack_base = (uint64_t *)pmm_stack_phys_addr;
    pmm_info.stack_ptr = pmm_info.stack_base; // Stack is empty, ptr points to base
    pmm_info.free_pages = 0;

    // Pass 3: Populate the PMM stack with addresses of usable pages
    // Skip pages that are part of the PMM stack itself.
    print_serial(PMM_DEBUG_SERIAL_PORT, "PMM: Populating free page stack...\n");
    for (uint64_t i = 0; i < memmap->entry_count; i++) {
        struct limine_memmap_entry *entry = memmap->entries[i];
        if (entry->type == LIMINE_MEMMAP_USABLE) {
            uint64_t region_start_addr = page_align_up(entry->base);
            uint64_t region_end_addr = page_align_down(entry->base + entry->length);

            for (uint64_t page_addr = region_start_addr; page_addr < region_end_addr; page_addr += PAGE_SIZE) {
                // Check if this page is within the PMM stack's own memory range
                if (page_addr >= pmm_stack_phys_addr && page_addr < (pmm_stack_phys_addr + pmm_stack_required_bytes)) {
                    // This page is used by the PMM stack itself, so skip it.
                    continue;
                }

                if ((size_t)(pmm_info.stack_ptr - pmm_info.stack_base) < pmm_info.capacity) {
                    *pmm_info.stack_ptr = page_addr;
                    pmm_info.stack_ptr++;
                    pmm_info.free_pages++;
                } else {
                    print_serial(PMM_DEBUG_SERIAL_PORT, "PMM Warning: PMM stack full during init. Should not happen.\n");
                    // This indicates an issue with capacity calculation or available memory vs. stack space.
                    break; // Stop adding pages if stack is full
                }
            }
        }
    }

    print_serial(PMM_DEBUG_SERIAL_PORT, "PMM: Initialization complete. Total free pages: ");
    print_serial_utoa(PMM_DEBUG_SERIAL_PORT, pmm_info.free_pages);
    print_serial(PMM_DEBUG_SERIAL_PORT, "\n");
}

void *pmm_alloc_page(void) {
    if (pmm_info.free_pages == 0) {
        // No pages available, or PMM not initialized properly if stack_ptr is at base
        // print_serial(PMM_DEBUG_SERIAL_PORT, "PMM: pmm_alloc_page: Out of memory!\n");
        return NULL;
    }
    // Stack pointer points to the next free slot; decrement first to get the last item
    pmm_info.stack_ptr--;
    uint64_t page_to_alloc = *pmm_info.stack_ptr;
    pmm_info.free_pages--;
    return (void *)page_to_alloc;
}

void pmm_free_page(void *p) {
    if (p == NULL) {
        print_serial(PMM_DEBUG_SERIAL_PORT, "PMM Warning: Attempt to free NULL page.\n");
        return;
    }
    uint64_t page_to_free = (uint64_t)p;
    if ((page_to_free % PAGE_SIZE) != 0) {
        print_serial(PMM_DEBUG_SERIAL_PORT, "PMM Warning: Attempt to free non-page-aligned address: 0x");
        print_serial_hex(PMM_DEBUG_SERIAL_PORT, page_to_free);
        print_serial(PMM_DEBUG_SERIAL_PORT, "\n");
        return;
    }

    if ((size_t)(pmm_info.stack_ptr - pmm_info.stack_base) >= pmm_info.capacity) {
        print_serial(PMM_DEBUG_SERIAL_PORT, "PMM Error: Stack full on pmm_free_page! Double free or system unstable? Halting.\n");
        for (;;) { asm volatile("cli; hlt"); } // Critical error
    }
    *pmm_info.stack_ptr = page_to_free;
    pmm_info.stack_ptr++;
    pmm_info.free_pages++;
}

uint64_t pmm_get_free_page_count(void) {
    return pmm_info.free_pages;
}
