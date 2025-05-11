#ifndef KERNEL_PAGING_H
#define KERNEL_PAGING_H

#include <stdint.h>
#include "limine.h"

#define PAGE_SIZE 0x1000 // 4 KiB

// Page Table Entry Flags
#define PTE_PRESENT (1ULL << 0)
#define PTE_WRITABLE (1ULL << 1)
#define PTE_USER (1ULL << 2)
#define PTE_PWT (1ULL << 3) // Page Write Through
#define PTE_PCD (1ULL << 4) // Page Cache Disable
#define PTE_ACCESSED (1ULL << 5)
#define PTE_DIRTY (1ULL << 6)
#define PTE_PAT (1ULL << 7)       // Page Attribute Table (PAT) index for 4-level paging PTEs
#define PTE_GLOBAL (1ULL << 8)
#define PTE_NO_EXECUTE (1ULL << 63) // No Execute bit

// Macros to get parts of an address
#define PML4_INDEX(addr) (((addr) >> 39) & 0x1FF)
#define PDPT_INDEX(addr) (((addr) >> 30) & 0x1FF)
#define PD_INDEX(addr) (((addr) >> 21) & 0x1FF)
#define PT_INDEX(addr) (((addr) >> 12) & 0x1FF)

// Address mask for page table entries (physical address of the next level table or page)
#define PTE_ADDR_MASK 0x000FFFFFFFFFF000ULL

// Structure for a Page Map Level 4 Entry (PML4E)
typedef uint64_t pml4e_t;
// Structure for a Page Directory Pointer Table Entry (PDPTE)
typedef uint64_t pdpte_t;
// Structure for a Page Directory Entry (PDE)
typedef uint64_t pde_t;
// Structure for a Page Table Entry (PTE)
typedef uint64_t pte_t;

// HHDM offset (defined in main.c, used by paging.c)
extern uint64_t hhdm_offset;

// Forward declaration from main.c for the function to call after paging setup
struct limine_framebuffer; // Forward declare if not already included via other headers
void kernel_main_after_paging(struct limine_framebuffer *fb);

// Function to initialize paging
void init_paging(struct limine_framebuffer_response *fb_response,
                 struct limine_memmap_response *memmap_response,
                 uint64_t kernel_stack_phys_base,
                 uint64_t kernel_stack_size,
                 uint64_t new_rsp_virt_top,
                 void (*kernel_entry_after_paging)(struct limine_framebuffer *fb),
                 struct limine_framebuffer *fb_for_kernel_main) __attribute__((noreturn));

// Function to map a single virtual page to a physical page
// virt_addr and phys_addr must be page-aligned
// The PML4 table virtual address (pml4_virt_param) must be provided.
void map_page(uint64_t *pml4_virt_param, uint64_t virt_addr, uint64_t phys_addr, uint64_t flags, const char* debug_tag);

#endif // KERNEL_PAGING_H
