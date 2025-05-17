#ifndef KERNEL_PMM_H
#define KERNEL_PMM_H

#include <stdint.h>
#include <stddef.h> // For size_t, NULL
#include "limine.h"  // For struct limine_memmap_response
#include "paging.h"  // For PAGE_SIZE

#define PAGE_SHIFT 12 // log2(PAGE_SIZE), assuming PAGE_SIZE is 4096

extern volatile struct limine_memmap_request memmap_request; // To get hhdm_offset
extern uint64_t hhdm_offset;

// Physical Memory Manager State
typedef struct {
    uint64_t *stack_base;         // Base address of the PMM stack (virtual)
    uint64_t *stack_ptr;          // Current stack pointer (virtual)
    uint64_t stack_phys_base;     // Physical base address of the stack
    uint64_t capacity;            // Total number of pages the stack can hold
    uint64_t free_pages;          // Number of free pages currently
    uint64_t total_pages_initial; // Total number of usable pages found initially
    uint64_t pmm_stack_size_pages;// Number of pages used by PMM stack itself
} pmm_state_t;

extern pmm_state_t pmm_info;

// Function to initialize the physical memory manager
void init_pmm(struct limine_memmap_response *memmap);
void *pmm_alloc_page(void); // Returns a physical address
void pmm_free_page(void *p);  // p is a physical address
uint64_t pmm_get_free_page_count(void);

#endif // PMM_H
