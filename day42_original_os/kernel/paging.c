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

// Kernel symbols from linker script
extern uint8_t _kernel_start[];
extern uint8_t _kernel_end[];

// HHDM offset (defined in main.c via paging.h)
// uint64_t hhdm_offset; // This line is removed as it's extern in paging.h

// Top-level PML4 table (physical address)
pml4e_t *kernel_pml4_phys = NULL;

// Helper function to clear a page (used for new page tables)
static void clear_page(void *page_virt) {
    uint64_t *p = (uint64_t *)page_virt;
    for (int i = 0; i < PAGE_SIZE / sizeof(uint64_t); i++) {
        p[i] = 0;
    }
}

// Function to map a single virtual page to a physical page
// virt_addr and phys_addr must be page-aligned
void map_page(pml4e_t *pml4_virt, uint64_t virt_addr, uint64_t phys_addr, uint64_t flags) {
    if ((virt_addr % PAGE_SIZE != 0) || (phys_addr % PAGE_SIZE != 0)) {
        print_serial(SERIAL_COM1_BASE, "ERROR: map_page addresses not page-aligned!\n");
        // Consider halting or returning an error
        return;
    }

    uint64_t pml4_idx = PML4_INDEX(virt_addr);
    uint64_t pdpt_idx = PDPT_INDEX(virt_addr);
    uint64_t pd_idx = PD_INDEX(virt_addr);
    uint64_t pt_idx = PT_INDEX(virt_addr);

    pdpte_t *pdpt_virt;
    if (!(pml4_virt[pml4_idx] & PTE_PRESENT)) {
        uint64_t pdpt_phys = (uint64_t)pmm_alloc_page();
        if (!pdpt_phys) { /* Handle allocation failure */ return; }
        pdpt_virt = (pdpte_t *)(pdpt_phys + hhdm_offset);
        clear_page(pdpt_virt);
        pml4_virt[pml4_idx] = pdpt_phys | PTE_PRESENT | PTE_WRITABLE | PTE_USER; // TODO: PTE_USER might be too permissive for kernel tables
    } else {
        pdpt_virt = (pdpte_t *)((pml4_virt[pml4_idx] & PTE_ADDR_MASK) + hhdm_offset);
    }

    pde_t *pd_virt;
    if (!(pdpt_virt[pdpt_idx] & PTE_PRESENT)) {
        uint64_t pd_phys = (uint64_t)pmm_alloc_page();
        if (!pd_phys) { /* Handle allocation failure */ return; }
        pd_virt = (pde_t *)(pd_phys + hhdm_offset);
        clear_page(pd_virt);
        pdpt_virt[pdpt_idx] = pd_phys | PTE_PRESENT | PTE_WRITABLE | PTE_USER;
    } else {
        pd_virt = (pde_t *)((pdpt_virt[pdpt_idx] & PTE_ADDR_MASK) + hhdm_offset);
    }

    pte_t *pt_virt;
    if (!(pd_virt[pd_idx] & PTE_PRESENT)) {
        uint64_t pt_phys = (uint64_t)pmm_alloc_page();
        if (!pt_phys) { /* Handle allocation failure */ return; }
        pt_virt = (pte_t *)(pt_phys + hhdm_offset);
        clear_page(pt_virt);
        pd_virt[pd_idx] = pt_phys | PTE_PRESENT | PTE_WRITABLE | PTE_USER;
    } else {
        pt_virt = (pte_t *)((pd_virt[pd_idx] & PTE_ADDR_MASK) + hhdm_offset);
    }

    pt_virt[pt_idx] = phys_addr | flags;
}

void init_paging() {
    print_serial(SERIAL_COM1_BASE, "Initializing paging...\n");

    kernel_pml4_phys = (pml4e_t *)pmm_alloc_page();
    if (!kernel_pml4_phys) {
        print_serial(SERIAL_COM1_BASE, "ERROR: Failed to allocate page for PML4! Halting.\n");
        for (;;) { asm volatile("cli; hlt"); }
    }
    pml4e_t *pml4_virt = (pml4e_t *)((uint64_t)kernel_pml4_phys + hhdm_offset);
    clear_page(pml4_virt);

    print_serial(SERIAL_COM1_BASE, "PML4 table allocated at V:0x"); print_serial_hex(SERIAL_COM1_BASE, (uint64_t)pml4_virt);
    print_serial(SERIAL_COM1_BASE, " P:0x"); print_serial_hex(SERIAL_COM1_BASE, (uint64_t)kernel_pml4_phys);
    print_serial(SERIAL_COM1_BASE, "\n");

    // Map kernel code and data
    uint64_t kernel_start_addr = (uint64_t)_kernel_start;
    uint64_t kernel_end_addr = (uint64_t)_kernel_end;
    print_serial(SERIAL_COM1_BASE, "Kernel VAddr Start: 0x"); print_serial_hex(SERIAL_COM1_BASE, kernel_start_addr);
    print_serial(SERIAL_COM1_BASE, " End: 0x"); print_serial_hex(SERIAL_COM1_BASE, kernel_end_addr);
    print_serial(SERIAL_COM1_BASE, "\n");

    // Physical start of kernel is its virtual address minus HHDM offset
    uint64_t kernel_phys_start = kernel_start_addr - hhdm_offset;

    print_serial(SERIAL_COM1_BASE, "Mapping kernel...");
    for (uint64_t v = kernel_start_addr, p = kernel_phys_start; v < kernel_end_addr; v += PAGE_SIZE, p += PAGE_SIZE) {
        // For kernel code/data: Present, Writable. NX bit depends on section, for now enable execute.
        // TODO: Use linker script symbols to differentiate .text, .rodata, .data sections for more precise flags.
        map_page(pml4_virt, v, p, PTE_PRESENT | PTE_WRITABLE /* | PTE_NO_EXECUTE for data */);
    }
    print_serial(SERIAL_COM1_BASE, " done.\n");

    // TODO: Map framebuffer
    // TODO: Map other necessary regions (ACPI, etc.)

    // TODO: Load PML4 into CR3 (this is the critical step to enable paging)
    // asm volatile("mov %0, %%cr3" :: "r"((uint64_t)kernel_pml4_phys));

    print_serial(SERIAL_COM1_BASE, "Paging structures prepared. CR3 not loaded yet.\n");
}
