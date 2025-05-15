#ifndef PAGING_H
#define PAGING_H

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
#define PTE_PSE (1ULL << 7) // Page Size Extension (for PDEs/PDPTEs marking a large page)
#define PTE_PAT (1ULL << 7)       // Page Attribute Table (PAT) index for 4KiB PTEs (overlaps with PSE for larger pages)
#define PTE_GLOBAL (1ULL << 8)
#define PTE_NX (1ULL << 63) // No Execute bit (alias for PTE_NO_EXECUTE for consistency)
#define PTE_NO_EXECUTE (1ULL << 63) // No Execute bit
#define PTE_NO_CACHE_DISABLE (1ULL << 4) // Page Cache Disable (PCD)
#define PTE_WRITE_THROUGH    (1ULL << 3) // Page Write Through (PWT)

// Macros to get parts of an address
#define PML4_INDEX(addr) (((addr) >> 39) & 0x1FF)
#define PDPT_INDEX(addr) (((addr) >> 30) & 0x1FF)
#define PD_INDEX(addr) (((addr) >> 21) & 0x1FF)
#define PT_INDEX(addr) (((addr) >> 12) & 0x1FF)

// Address mask for page table entries (physical address of the next level table or page)
// For 4KB pages, bits 12 through (MAX_PHY_ADDR-1) store the address.
// MAX_PHY_ADDR is typically 52 for modern x86_64 CPUs.
#define PTE_ADDR_MASK 0x000FFFFFFFFFF000ULL

// Address masks for larger pages
#define PTE_ADDR_MASK_2MB 0x000FFFFFFFE00000ULL // For 2MB pages (PD entry), bits 21 to (MAX_PHY_ADDR-1)
#define PTE_ADDR_MASK_1GB 0x000FFFFFC0000000ULL // For 1GB pages (PDPT entry), bits 30 to (MAX_PHY_ADDR-1)

// Flags mask (all bits except address and reserved bits that should be 0)
// This will mask out the address part, leaving only flags.
#define PTE_FLAGS_MASK (~PTE_ADDR_MASK)

// Structure for a Page Map Level 4 Entry (PML4E)
typedef uint64_t pml4e_t;
// Structure for a Page Directory Pointer Table Entry (PDPTE)
typedef uint64_t pdpte_t;
// Structure for a Page Directory Entry (PDE)
typedef uint64_t pde_t;
// Structure for a Page Table Entry (PTE)
typedef uint64_t pte_t;

// Page sizes
#define SIZE_4KB (4UL * 1024)
#define SIZE_2MB (2UL * 1024 * 1024)
#define SIZE_1GB (1UL * 1024 * 1024 * 1024)

// HHDM offset (defined in main.c, used by paging.c)
extern uint64_t hhdm_offset;
extern pml4e_t *kernel_pml4_phys; // Declare kernel_pml4_phys as extern
extern pml4e_t *kernel_pml4_virt; // Add extern for kernel_pml4_virt
extern uint64_t kernel_stack_top_phys; // Re-add extern declaration for stack top physical address

// Forward declaration from main.c for the function to call after paging setup
struct limine_framebuffer; // Forward declare if not already included via other headers
void kernel_main_after_paging(struct limine_framebuffer *fb, uint64_t new_rsp);

// Function to initialize paging
void init_paging(
    uint64_t physical_base_addr,
    uint64_t virtual_base_addr,
    uint64_t kernel_phys_start,
    uint64_t kernel_phys_end,
    uint64_t _hhdm_offset,
    struct limine_memmap_entry **memmap,
    size_t memmap_entries,
    struct limine_kernel_address_response *kernel_addr,
    struct limine_framebuffer *fb
);

// Function to map a single virtual page to a physical page
// virt_addr and phys_addr must be page-aligned
// The PML4 table virtual address (pml4_virt_param) must be provided.
void map_page(uint64_t *pml4_virt_param, uint64_t virt_addr, uint64_t phys_addr, uint64_t flags, const char* debug_tag);
void unmap_page(uint64_t *pml4_virt, uint64_t virt_addr);

// Re-add stack virtual address macros
#define KERNEL_STACK_PAGES 16
#define KERNEL_STACK_SIZE  (KERNEL_STACK_PAGES * PAGE_SIZE)
#define KERNEL_STACK_VIRT_BOTTOM 0xFFFF800000000000 // Example, adjust as needed
#define KERNEL_STACK_VIRT_TOP    (KERNEL_STACK_VIRT_BOTTOM + KERNEL_STACK_SIZE)

void map_phys_to_virt_range(uint64_t v_addr_start, uint64_t p_addr_start, uint64_t size, uint64_t flags);

// Inline functions to get/set CR3
static inline uint64_t get_current_cr3(void) {
    uint64_t cr3_val;
    asm volatile("mov %%cr3, %0" : "=r"(cr3_val));
    return cr3_val;
}

static inline void load_cr3(uint64_t cr3_val) {
    asm volatile("mov %0, %%cr3" :: "r"(cr3_val) : "memory");
}

// Function to invalidate a TLB entry
static inline void invlpg(void *addr) {
    asm volatile("invlpg (%0)" :: "r"(addr) : "memory");
}

// Assembly function to switch to higher half and run the kernel
extern void switch_to_kernel_higher_half_and_run(
    uint64_t pml4_phys,
    uint64_t new_rsp_virt,
    void (*kernel_entry_virt)(struct limine_framebuffer *, uint64_t),
    struct limine_framebuffer *fb_virt
) __attribute__((noreturn));

void load_pml4(uint64_t pml4_phys);

#endif // PAGING_H
