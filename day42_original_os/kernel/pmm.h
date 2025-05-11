#ifndef KERNEL_PMM_H
#define KERNEL_PMM_H

#include <stdint.h>
#include <stddef.h> // For size_t, NULL
#include "limine.h"  // For struct limine_memmap_response
#include "paging.h"  // For PAGE_SIZE

#define PAGE_SHIFT 12 // log2(PAGE_SIZE), assuming PAGE_SIZE is 4096

// Structure to hold PMM state and the free list stack
// The stack itself will be dynamically placed in memory by init_pmm.
typedef struct {
    uint64_t *stack_base;    // Pointer to the beginning of the memory used for the stack
    uint64_t *stack_ptr;     // Current top of the stack (points to the next free slot or last item depending on convention)
    size_t capacity;         // How many page addresses the stack can hold
    size_t free_pages;       // Number of currently free pages (managed by PMM)
    size_t total_pages_initial; // Total number of usable pages initially found by PMM from memmap
} pmm_state_t;

// Function to initialize the physical memory manager
void init_pmm(struct limine_memmap_response *memmap, uint64_t hhdm_offset);
void *pmm_alloc_page(void); // Returns a physical address
void pmm_free_page(void *p);  // p is a physical address
uint64_t pmm_get_free_page_count(void);

#endif // PMM_H
