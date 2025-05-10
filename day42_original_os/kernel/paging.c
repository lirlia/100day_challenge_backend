#include "paging.h"
#include "pmm.h"
#include "serial.h"
#include <stddef.h>
#include <stdint.h>
#include "idt.h" // For struct idt_entry and idt_ptr, if needed by debug code
#include "io.h"  // For print_serial (indirectly, if we add debug prints)

#ifndef ALIGN_UP
#define ALIGN_UP(addr, align) (((addr) + (align) - 1) & ~((align) - 1))
#endif
#ifndef ALIGN_DOWN
#define ALIGN_DOWN(addr, align) ((addr) & ~((align) - 1))
#endif

extern struct idt_ptr idt_ptr_struct; // Declare idt_ptr_struct as extern

// --- DBG Macro Definition (Copied for use in this file) ---
// Ensure SERIAL_COM1_BASE is accessible, e.g., via io.h or direct define if not already.
// Assume outb is also accessible, typically from io.h
static inline void dbg_u64_paging(const char *s, uint64_t v) { // Renamed to avoid conflict if linked globally
    for (const char *p = s; *p; p++) outb(SERIAL_COM1_BASE, *p);
    for (int i = 60; i >= 0; i -= 4) {
        char c = "0123456789ABCDEF"[(v >> i) & 0xF];
        outb(SERIAL_COM1_BASE, c);
    }
    outb(SERIAL_COM1_BASE, '\n');
}
#define DBG_PAGING(x) dbg_u64_paging(#x " = ", (uint64_t)(x))
// --- End DBG Macro Definition ---

// For print_serial, print_serial_hex, etc. - ensure they are callable
// If they are static in main.c, we need a way to access them or create alternatives here.
// For now, assume they are globally available or we'll add stubs/alternatives later.
// extern void print_serial(uint16_t port, const char *s); // CONFLICTING: Removed, serial.h provides the correct one.
// extern void print_serial_hex(uint16_t port, uint64_t h); // Now provided by serial.h
// extern void print_serial_utoa(uint16_t port, uint64_t u); // Now provided by serial.h
// extern void print_serial_format(const char *format, ...); // Now provided by serial.h

// Kernel symbols from linker script
extern uint8_t _kernel_start[]; // Used for calculating physical address of sections
extern uint8_t _kernel_end[];   // Used for calculating physical address of sections
extern uint8_t _text_start[], _text_end[];
extern uint8_t _rodata_start[], _rodata_end[];
extern uint8_t _data_start[], _data_end[];
extern uint8_t _bss_start[],  _bss_end[];

// Limine requests (defined in main.c)
// extern struct limine_framebuffer_request framebuffer_request; // Removed

// HHDM offset (defined in main.c via paging.h)
// uint64_t hhdm_offset; // This line is removed as it's extern in paging.h

// Top-level PML4 table (physical address)
pml4e_t *kernel_pml4_phys = NULL;

// Global PML4 table, page-aligned.
__attribute__((aligned(PAGE_SIZE)))
static uint64_t pml4_table[512];

// Global PDPT for the kernel's higher-half mapping, page-aligned.
__attribute__((aligned(PAGE_SIZE)))
static uint64_t kernel_pdpt[512];

// Global Page Directory for the kernel's first 1GiB of higher-half mapping, page-aligned.
__attribute__((aligned(PAGE_SIZE)))
static uint64_t kernel_pd_0[512];

// Structure for sidt/sgdt
struct descriptor_table_register_packed {
    uint16_t limit;
    uint64_t base;
} __attribute__((packed));

// Helper function to clear a page (used for new page tables)
static void clear_page(void *page_virt) {
    uint64_t *p = (uint64_t *)page_virt;
    for (int i = 0; i < PAGE_SIZE / sizeof(uint64_t); i++) {
        p[i] = 0;
    }
}

// Function to map a single virtual page to a physical page
// virt_addr and phys_addr must be page-aligned
void map_page(uint64_t virt_addr, uint64_t phys_addr, uint64_t flags) {
    // pml4_virt is now derived from kernel_pml4_phys and hhdm_offset inside this function if needed,
    // or we assume kernel_pml4_phys is already known and its virtual address can be computed.
    pml4e_t *pml4_virt = (pml4e_t *)((uint64_t)kernel_pml4_phys + hhdm_offset);

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

void map_current_idt(void) {
    struct descriptor_table_register_packed current_idtr;
    asm volatile ("sidt %0" : "=m"(current_idtr));

    uint64_t idt_virt_start = current_idtr.base;
    uint64_t idt_size_bytes = current_idtr.limit + 1; // Limit is max offset, so size is limit + 1
    uint64_t idt_virt_end = idt_virt_start + idt_size_bytes;

    uint64_t map_virt_start_aligned = ALIGN_DOWN(idt_virt_start, PAGE_SIZE);
    uint64_t map_virt_end_aligned = ALIGN_UP(idt_virt_end, PAGE_SIZE);

    print_serial_format("IDT Info: BaseV=0x%llx, Limit=%u, Size=%llu bytes\\n",
                        idt_virt_start, current_idtr.limit, idt_size_bytes);
    print_serial_format("Aligning for mapping: VStartRaw=0x%llx, VEndRaw=0x%llx -> VStartAligned=0x%llx, VEndAligned=0x%llx\\n",
                        idt_virt_start, idt_virt_end, map_virt_start_aligned, map_virt_end_aligned);

    if (map_virt_start_aligned >= map_virt_end_aligned) {
        print_serial_format("ERROR: IDT map range is invalid after alignment (Start: 0x%llx, End: 0x%llx). Skipping IDT map.\\n",
                            map_virt_start_aligned, map_virt_end_aligned);
        return;
    }

    for (uint64_t v_addr_page = map_virt_start_aligned; v_addr_page < map_virt_end_aligned; v_addr_page += PAGE_SIZE) {
        uint64_t p_addr_page = v_addr_page - hhdm_offset; // Physical address of the page
        // No need to align p_addr_page again if v_addr_page is already page-aligned and hhdm_offset is page-aligned (which it should be)

        // print_serial_format("Mapping IDT page: V=0x%llx -> P=0x%llx\\n", v_addr_page, p_addr_page); // Verbose
        map_page(v_addr_page, p_addr_page, PTE_PRESENT | PTE_WRITABLE | PTE_NO_EXECUTE);
    }

    print_serial_format("IDT mapped: V=0x%llx-0x%llx (mapped %llu pages)\\n",
                        map_virt_start_aligned, map_virt_end_aligned -1, (map_virt_end_aligned - map_virt_start_aligned)/PAGE_SIZE);
}

void init_paging(struct limine_framebuffer_response *fb_response,
                 struct limine_memmap_response *memmap_response, // Still needed for PMM, but not for mass mapping here
                 uint64_t kernel_stack_phys_base,
                 uint64_t kernel_stack_size,
                 uint64_t new_rsp_virt_top) { // new_rsp_virt_top is for post-paging RSP switch
    print_serial(SERIAL_COM1_BASE, "Inside init_paging (minimal mapping strategy)...\n");
    if (fb_response == NULL) {
        print_serial(SERIAL_COM1_BASE, "fb_response IS NULL at start of init_paging\n");
    } else {
        print_serial(SERIAL_COM1_BASE, "fb_response is NOT NULL at start of init_paging. Count: ");
        print_serial_utoa(SERIAL_COM1_BASE, fb_response->framebuffer_count);
        print_serial(SERIAL_COM1_BASE, "\n");
        if (fb_response->framebuffer_count > 0 && fb_response->framebuffers[0] != NULL) {
            print_serial(SERIAL_COM1_BASE, "fb_response->framebuffers[0]->address at start: 0x");
            print_serial_hex(SERIAL_COM1_BASE, (uint64_t)fb_response->framebuffers[0]->address);
            print_serial(SERIAL_COM1_BASE, "\n");
        }
    }

    print_serial(SERIAL_COM1_BASE, "Initializing paging with minimal mappings...\n");

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

    // ----------< Identity map low memory - COMMENTED OUT >----------
    /*
    print_serial(SERIAL_COM1_BASE, "Identity mapping low memory (first 4MB)...\n");
    for (uint64_t addr = 0; addr < 0x400000; addr += PAGE_SIZE) {
        map_page(addr, addr, PTE_PRESENT | PTE_WRITABLE | PTE_NO_EXECUTE); // Ensure NO_EXECUTE for data
    }
    print_serial(SERIAL_COM1_BASE, "Low memory identity mapped.\n");
    */

    // ----------< Map kernel sections individually >----------
    uint64_t kernel_phys_offset = (uint64_t)_kernel_start - hhdm_offset; // Base physical address of kernel

    print_serial_format("Mapping .text section (VA: 0x%x - 0x%x, PA_base: 0x%x), Flags: PTE_PRESENT\\n",
                        (uint64_t)_text_start, (uint64_t)_text_end, kernel_phys_offset + ((uint64_t)_text_start - (uint64_t)_kernel_start) );
    for (uint64_t v = ((uint64_t)_text_start & ~(PAGE_SIZE-1)); v < (uint64_t)_text_end; v += PAGE_SIZE) {
        uint64_t p = v - hhdm_offset; // Physical address is virtual (HHDM) minus offset
        map_page(v, p, PTE_PRESENT); // Executable by default (NX bit not set)
    }

    print_serial_format("Mapping .rodata section (VA: 0x%x - 0x%x, PA_base: 0x%x), Flags: PTE_PRESENT | PTE_NO_EXECUTE\\n",
                        (uint64_t)_rodata_start, (uint64_t)_rodata_end, kernel_phys_offset + ((uint64_t)_rodata_start - (uint64_t)_kernel_start));
    for (uint64_t v = ((uint64_t)_rodata_start & ~(PAGE_SIZE-1)); v < (uint64_t)_rodata_end; v += PAGE_SIZE) {
        uint64_t p = v - hhdm_offset;
        map_page(v, p, PTE_PRESENT | PTE_NO_EXECUTE);
    }

    // Map .data and .bss together if _bss_start immediately follows _data_end
    // Otherwise, map them separately or ensure correct range for combined mapping.
    // For simplicity, assuming _bss_end marks the end of what needs RW mapping after .data
    uint64_t data_bss_start = ((uint64_t)_data_start & ~(PAGE_SIZE-1));
    uint64_t data_bss_end = (uint64_t)_bss_end; // _bss_end should be page aligned up if not already for safety
                                              // or ensure loop condition handles it.

    print_serial_format("Mapping .data/.bss sections (VA_data_start: 0x%x, VA_bss_end: 0x%x, PA_base_data: 0x%x), Flags: PTE_PRESENT | PTE_WRITABLE | PTE_NO_EXECUTE\\n",
                        (uint64_t)_data_start, (uint64_t)_bss_end, kernel_phys_offset + ((uint64_t)_data_start - (uint64_t)_kernel_start));
    for (uint64_t v = data_bss_start; v < data_bss_end; v += PAGE_SIZE) {
        uint64_t p = v - hhdm_offset;
        map_page(v, p, PTE_PRESENT | PTE_WRITABLE | PTE_NO_EXECUTE);
    }
    print_serial(SERIAL_COM1_BASE, "Kernel sections mapped.\\n");


    // Map framebuffer (remains unchanged)
    if (fb_response == NULL || fb_response->framebuffer_count < 1) {
        print_serial(SERIAL_COM1_BASE, "ERROR: No framebuffer available for mapping! Halting.\n");
        for (;;) { asm volatile("cli; hlt"); }
    }

    struct limine_framebuffer *fb = fb_response->framebuffers[0];
    uint64_t fb_addr_virt_base = (uint64_t)fb->address;
    uint64_t fb_addr_phys_base = fb_addr_virt_base - hhdm_offset;
    uint64_t fb_size = fb->pitch * fb->height;

    print_serial(SERIAL_COM1_BASE, "Mapping framebuffer V_base:0x"); print_serial_hex(SERIAL_COM1_BASE, fb_addr_virt_base);
    print_serial(SERIAL_COM1_BASE, " P_base:0x"); print_serial_hex(SERIAL_COM1_BASE, fb_addr_phys_base);
    print_serial(SERIAL_COM1_BASE, " Size:0x"); print_serial_hex(SERIAL_COM1_BASE, fb_size);
    print_serial(SERIAL_COM1_BASE, "...");

    // DBG logs for framebuffer virtual and physical base addresses
    DBG_PAGING(fb_addr_virt_base);
    DBG_PAGING(fb_addr_phys_base);

    for (uint64_t offset = 0; offset < fb_size; offset += PAGE_SIZE) {
        uint64_t current_virt_page = fb_addr_virt_base + offset;
        uint64_t current_phys_page = fb_addr_phys_base + offset;

        map_page(current_virt_page, current_phys_page, PTE_PRESENT | PTE_WRITABLE | PTE_NO_EXECUTE);
    }
    print_serial(SERIAL_COM1_BASE, " done.\\n");

    // Map the new kernel stack (remains largely unchanged, flags are important)
    print_serial(SERIAL_COM1_BASE, "Mapping new kernel stack P:0x");
    print_serial_hex(SERIAL_COM1_BASE, kernel_stack_phys_base);
    print_serial(SERIAL_COM1_BASE, " Size:0x");
    print_serial_hex(SERIAL_COM1_BASE, kernel_stack_size);
    print_serial(SERIAL_COM1_BASE, " to V:0x");
    print_serial_hex(SERIAL_COM1_BASE, kernel_stack_phys_base + hhdm_offset);
    print_serial(SERIAL_COM1_BASE, "...\n");

    for (uint64_t offset = 0; offset < kernel_stack_size; offset += PAGE_SIZE) {
        uint64_t stack_phys_page = kernel_stack_phys_base + offset;
        uint64_t stack_virt_page = stack_phys_page + hhdm_offset; // Stack is in HHDM
        map_page(stack_virt_page, stack_phys_page, PTE_PRESENT | PTE_WRITABLE | PTE_NO_EXECUTE);
    }
    print_serial(SERIAL_COM1_BASE, "Kernel stack mapped.\\n");

    // DEBUG: Check IDT entry 14 content before mapping IDT and loading CR3
    // This debug code was added previously, let's keep it for now or refine.
    // print_serial(SERIAL_COM1_BASE, "DEBUG: Checking IDT entry 14 content before mapping IDT...\\n");
    // if (idt_ptr_struct.base != 0 && idt_ptr_struct.limit >= (14 * sizeof(struct idt_entry) + sizeof(struct idt_entry) -1) ) {
    //     struct idt_entry *idt_entries = (struct idt_entry *)idt_ptr_struct.base;
    //     print_serial_format("  IDT[14]: OffsetLow=%x, Selector=%x, IST=%x, TypeAttr=%x, OffsetMid=%x, OffsetHigh=%x, Reserved=%x\\n",
    //                         idt_entries[14].offset_low, idt_entries[14].selector, idt_entries[14].ist,
    //                         idt_entries[14].type_attr, idt_entries[14].offset_mid, idt_entries[14].offset_high,
    //                         idt_entries[14].reserved);
    //     uint64_t handler_addr = ((uint64_t)idt_entries[14].offset_high << 32) |
    //                             ((uint64_t)idt_entries[14].offset_mid << 16) |
    //                             idt_entries[14].offset_low;
    //     print_serial_format("  IDT[14] Handler Address: 0x%llx\\n", handler_addr);
    // } else {
    //     print_serial(SERIAL_COM1_BASE, "  IDT[14] not accessible or idt_ptr_struct not initialized properly.\\n");
    //     print_serial_format("  IDT base: 0x%llx, limit: %u\\n", idt_ptr_struct.base, idt_ptr_struct.limit);
    // }
    // End of previous debug block

    // Map the currently active IDT to ensure it's accessible after CR3 load
    map_current_idt();

    // CR3にロードするのは、動的に確保し内容を構築したPML4テーブルの物理アドレス (kernel_pml4_phys)
    print_serial_format("Loading PML4 to CR3 (P:0x%llx). THIS IS THE POINT OF NO RETURN (almost).\\n", (uint64_t)kernel_pml4_phys);
    asm volatile("mov %0, %%cr3" :: "r"((uint64_t)kernel_pml4_phys));
    // PAGING IS NOW ENABLED!

    // --- Test Point ---
    print_serial(SERIAL_COM1_BASE, "CR3 loaded. Entering infinite hlt loop BEFORE RSP switch...\n");
    for (;;) {
        asm volatile ("cli; hlt");
    }

    // The following code will not be reached in this test:
    // asm volatile ("mov %0, %%rsp" :: "r"(new_rsp_virt_top) : "memory");

    // Now on the new stack, we can safely use C functions like print_serial.
    // print_serial(SERIAL_COM1_BASE, "RSP switched to new kernel stack (V:0x");
    // print_serial_hex(SERIAL_COM1_BASE, new_rsp_virt_top);
    // print_serial(SERIAL_COM1_BASE, ")! Paging fully active.\n");

    // Kernel should continue execution from wherever main.c would have, or just halt if main has nothing after init_paging.
    // Since this function is noreturn, we must halt here.
    // print_serial(SERIAL_COM1_BASE, "init_paging complete. Halting kernel.\n");
    // for (;;) {
    //     asm volatile ("cli; hlt");
    // }
}
