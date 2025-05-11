#include "paging.h"
#include "pmm.h"
#include "serial.h"
#include <stddef.h>
#include <stdint.h>
#include "idt.h" // For struct idt_entry and idt_ptr, if needed by debug code
#include "io.h"  // For print_serial (indirectly, if we add debug prints)
#include "msr.h" // Added for MSR operations

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

// Global PML4 table, page-aligned. (Unused due to dynamic allocation)
// __attribute__((aligned(PAGE_SIZE)))
// static uint64_t pml4_table[512];

// Global PDPT for the kernel\'s higher-half mapping, page-aligned. (Unused)
// __attribute__((aligned(PAGE_SIZE)))
// static uint64_t kernel_pdpt[512];

// Global Page Directory for the kernel\'s first 1GiB of higher-half mapping, page-aligned. (Unused)
// __attribute__((aligned(PAGE_SIZE)))
// static uint64_t kernel_pd_0[512];

// Structure for sidt/sgdt
struct descriptor_table_register_packed {
    uint16_t limit;
    uint64_t base;
} __attribute__((packed));

// Helper function to clear a page (used for new page tables)
static void clear_page(void *page_virt) {
    uint64_t *p = (uint64_t *)page_virt;
    for (uint64_t i = 0; i < PAGE_SIZE / sizeof(uint64_t); i++) {
        p[i] = 0;
    }
}

static inline void load_pml4(uint64_t pml4_addr) {
    asm volatile("mov %0, %%cr3" : : "r"(pml4_addr) : "memory");
}

// Function to map a physical page to a virtual page
void map_page(uint64_t *pml4_virt_param, uint64_t virt_addr, uint64_t phys_addr, uint64_t flags, const char* debug_tag) {
    (void)debug_tag; // Suppress unused parameter warning for now if not used extensively

    if ((virt_addr % PAGE_SIZE != 0) || (phys_addr % PAGE_SIZE != 0)) {
        print_serial(SERIAL_COM1_BASE, "ERROR: map_page addresses not page-aligned!\n");
        return;
    }

    uint64_t pml4_idx = PML4_INDEX(virt_addr);
    uint64_t pdpt_idx = PDPT_INDEX(virt_addr);
    uint64_t pd_idx = PD_INDEX(virt_addr);
    uint64_t pt_idx = PT_INDEX(virt_addr);

    pdpte_t *pdpt_virt;
    if (!(pml4_virt_param[pml4_idx] & PTE_PRESENT)) {
        uint64_t pdpt_phys = (uint64_t)pmm_alloc_page();
        if (!pdpt_phys) {
            print_serial(SERIAL_COM1_BASE, "CRITICAL PMM alloc failed for PDPT in map_page! Halting.\n");
            for(;;) asm volatile("cli; hlt");
        }
        pdpt_virt = (pdpte_t *)(pdpt_phys + hhdm_offset);
        clear_page(pdpt_virt);
        pml4_virt_param[pml4_idx] = pdpt_phys | PTE_PRESENT | PTE_WRITABLE;
    } else {
        pdpt_virt = (pdpte_t *)((pml4_virt_param[pml4_idx] & PTE_ADDR_MASK) + hhdm_offset);
    }

    pde_t *pd_virt;
    if (!(pdpt_virt[pdpt_idx] & PTE_PRESENT)) {
        uint64_t pd_phys = (uint64_t)pmm_alloc_page();
        if (!pd_phys) {
            print_serial(SERIAL_COM1_BASE, "CRITICAL PMM alloc failed for PD in map_page! Halting.\n");
            for(;;) asm volatile("cli; hlt");
        }
        pd_virt = (pde_t *)(pd_phys + hhdm_offset);
        clear_page(pd_virt);
        pdpt_virt[pdpt_idx] = pd_phys | PTE_PRESENT | PTE_WRITABLE;
    } else {
        pd_virt = (pde_t *)((pdpt_virt[pdpt_idx] & PTE_ADDR_MASK) + hhdm_offset);
    }

    pte_t *pt_virt;
    if (!(pd_virt[pd_idx] & PTE_PRESENT)) {
        uint64_t pt_phys = (uint64_t)pmm_alloc_page();
        if (!pt_phys) {
            print_serial(SERIAL_COM1_BASE, "CRITICAL PMM alloc failed for PT in map_page! Halting.\n");
            for(;;) asm volatile("cli; hlt");
        }
        pt_virt = (pte_t *)(pt_phys + hhdm_offset);
        clear_page(pt_virt);
        pd_virt[pd_idx] = pt_phys | PTE_PRESENT | PTE_WRITABLE;
    } else {
        pt_virt = (pte_t *)((pd_virt[pd_idx] & PTE_ADDR_MASK) + hhdm_offset);
    }

    pt_virt[pt_idx] = phys_addr | flags;
}

// Unmap a page (optional, good for later use)
// ... existing code ...

// Initialize paging
void init_paging(
    struct limine_framebuffer_response *framebuffer_resp,
    struct limine_memmap_response *memmap_resp,
    uint64_t kernel_stack_phys_base,
    uint64_t kernel_stack_size,
    uint64_t new_rsp_virt_top,
    void (*kernel_entry_after_paging_fn)(struct limine_framebuffer *),
    struct limine_framebuffer *fb_for_kernel_main // Specific framebuffer to pass
) {
    print_serial(SERIAL_COM1_BASE, "Inside init_paging...\n");

    kernel_pml4_phys = (pml4e_t *)pmm_alloc_page();
    if (!kernel_pml4_phys) {
        print_serial(SERIAL_COM1_BASE, "ERROR: Failed to allocate page for PML4! Halting.\n");
        for (;;) { asm volatile("cli; hlt"); }
    }
    pml4e_t *pml4_virt = (pml4e_t *)((uint64_t)kernel_pml4_phys + hhdm_offset);
    clear_page(pml4_virt);

    print_serial_format("PML4 table allocated at V:0x%llx P:0x%llx\n", (uint64_t)pml4_virt, (uint64_t)kernel_pml4_phys);

    uint64_t kernel_load_phys_addr = 0;
    if (memmap_resp) {
        for (uint64_t i = 0; i < memmap_resp->entry_count; i++) {
            struct limine_memmap_entry *entry = memmap_resp->entries[i];
            if (entry->type == LIMINE_MEMMAP_KERNEL_AND_MODULES) {
                kernel_load_phys_addr = entry->base;
                break;
            }
        }
    }
    if (kernel_load_phys_addr == 0) {
        print_serial(SERIAL_COM1_BASE, "CRITICAL ERROR: Could not find kernel physical load address! Using 0x100000 (DANGEROUS!)\n");
        kernel_load_phys_addr = 0x100000;
    }
    print_serial_format("Kernel actual load physical address = 0x%llx\n", kernel_load_phys_addr);

    print_serial_format("Mapping .text section (VA: 0x%llx - 0x%llx)\n", (uint64_t)_text_start, (uint64_t)_text_end);
    for (uint64_t v = ALIGN_DOWN((uint64_t)_text_start, PAGE_SIZE); v < ALIGN_UP((uint64_t)_text_end, PAGE_SIZE); v += PAGE_SIZE) {
        uint64_t p = (v - (uint64_t)_kernel_start) + kernel_load_phys_addr;
        map_page(pml4_virt, v, p, PTE_PRESENT, ".text");
    }

    print_serial_format("Mapping .rodata section (VA: 0x%llx - 0x%llx)\n", (uint64_t)_rodata_start, (uint64_t)_rodata_end);
    for (uint64_t v = ALIGN_DOWN((uint64_t)_rodata_start, PAGE_SIZE); v < ALIGN_UP((uint64_t)_rodata_end, PAGE_SIZE); v += PAGE_SIZE) {
        uint64_t p = (v - (uint64_t)_kernel_start) + kernel_load_phys_addr;
        map_page(pml4_virt, v, p, PTE_PRESENT | PTE_NO_EXECUTE, ".rodata");
    }

    uint64_t data_bss_start_virt = ALIGN_DOWN((uint64_t)_data_start, PAGE_SIZE);
    uint64_t data_bss_end_virt = ALIGN_UP((uint64_t)_bss_end, PAGE_SIZE);
    print_serial_format("Mapping .data/.bss sections (VA: 0x%llx - 0x%llx)\n", data_bss_start_virt, data_bss_end_virt);
    for (uint64_t v = data_bss_start_virt; v < data_bss_end_virt; v += PAGE_SIZE) {
        uint64_t p = (v - (uint64_t)_kernel_start) + kernel_load_phys_addr;
        map_page(pml4_virt, v, p, PTE_PRESENT | PTE_WRITABLE | PTE_NO_EXECUTE, ".data/.bss");
    }
    print_serial(SERIAL_COM1_BASE, "Kernel sections mapped.\n");

    if (framebuffer_resp == NULL || framebuffer_resp->framebuffer_count < 1) {
        print_serial(SERIAL_COM1_BASE, "ERROR: No framebuffer available for mapping! Halting.\n");
        for (;;) { asm volatile("cli; hlt"); }
    }
    struct limine_framebuffer *fb = framebuffer_resp->framebuffers[0];
    uint64_t fb_addr_virt_base = (uint64_t)fb->address;
    uint64_t fb_addr_phys_base = fb_addr_virt_base - hhdm_offset;
    uint64_t fb_size = fb->pitch * fb->height;
    print_serial_format("Mapping framebuffer V:0x%llx P:0x%llx Size:0x%llx\n", fb_addr_virt_base, fb_addr_phys_base, fb_size);
    for (uint64_t offset = 0; offset < fb_size; offset += PAGE_SIZE) {
        map_page(pml4_virt, fb_addr_virt_base + offset, fb_addr_phys_base + offset, PTE_PRESENT | PTE_WRITABLE | PTE_NO_EXECUTE, "Framebuffer");
    }
    print_serial(SERIAL_COM1_BASE, "Framebuffer mapped.\n");

    print_serial_format("Mapping kernel stack P:0x%llx V:0x%llx Size:0x%llx\n", kernel_stack_phys_base, kernel_stack_phys_base + hhdm_offset, kernel_stack_size);
    for (uint64_t off = 0; off < kernel_stack_size; off += PAGE_SIZE) {
        uint64_t stack_page_virt = kernel_stack_phys_base + hhdm_offset + off;
        uint64_t stack_page_phys = kernel_stack_phys_base + off;
        map_page(pml4_virt, stack_page_virt, stack_page_phys, PTE_PRESENT | PTE_WRITABLE, "Kernel Stack Page");
        print_serial_format("  Mapped Stack Page: V=0x%llx -> P=0x%llx\n", stack_page_virt, stack_page_phys);
    }
    print_serial(SERIAL_COM1_BASE, "Kernel stack mapped.\n");

    // map_current_idt(); // Commented out as it needs review for 5-arg map_page

    print_serial(SERIAL_COM1_BASE, "All mappings complete. Preparing to load CR3 and switch context.\n");
    print_serial_format("Kernel PML4 physical address: 0x%llx\n", (uint64_t)kernel_pml4_phys);
    print_serial_format("New RSP virtual top: 0x%llx\n", new_rsp_virt_top);
    print_serial_format("Kernel entry after paging (virtual address): 0x%llx\n", (uint64_t)kernel_entry_after_paging_fn);

    if (fb_for_kernel_main != NULL) {
        print_serial_format("Framebuffer for kernel_main_after_paging (virtual address): 0x%llx\n", (uint64_t)fb_for_kernel_main);
        if (fb_for_kernel_main->address != NULL) {
             print_serial_format("Framebuffer actual content address (virtual): 0x%llx\n", (uint64_t)fb_for_kernel_main->address);
        } else {
            print_serial(SERIAL_COM1_BASE, "fb_for_kernel_main->address is NULL!\n");
        }
    } else {
        print_serial(SERIAL_COM1_BASE, "fb_for_kernel_main is NULL.\n");
    }

    // Enable NXE bit in IA32_EFER MSR before loading CR3
    print_serial(SERIAL_COM1_BASE, "Enabling NXE in IA32_EFER...\n");
    const uint32_t IA32_EFER_MSR_ADDR = 0xC0000080;
    uint64_t efer_value = rdmsr(IA32_EFER_MSR_ADDR);
    print_serial_format("  EFER before set: 0x%llx\n", efer_value);
    efer_value |= (1ULL << 11); // Set NXE bit (bit 11)
    wrmsr(IA32_EFER_MSR_ADDR, efer_value);
    uint64_t efer_after_write = rdmsr(IA32_EFER_MSR_ADDR);
    print_serial_format("  EFER after set attempt: 0x%llx\n", efer_after_write);
    if (efer_after_write & (1ULL << 11)) {
        print_serial(SERIAL_COM1_BASE, "  IA32_EFER.NXE bit is VERIFIED SET.\n");
    } else {
        print_serial_format("  FAILED to VERIFY IA32_EFER.NXE bit! Current EFER: 0x%llx\n", efer_after_write);
    }
    // print_serial(SERIAL_COM1_BASE, "IA32_EFER.NXE should be enabled now.\\n"); // Replaced by verified message

    // Map the current IDT to HHDM so exception handlers can be reached
    struct descriptor_table_register_packed idt_reg_before_paging;
    asm volatile("sidt %0" : "=m"(idt_reg_before_paging));
    // idt_reg_before_paging.base now holds the VIRTUAL address of the IDT (as loaded by lidt earlier)

    // Calculate the physical address of the IDT
    // Assume idt_entries array (and thus idt_ptr_struct.base which points to it) is within the kernel's loaded image.
    uint64_t idt_virt_addr_from_linker = idt_reg_before_paging.base;
    uint64_t idt_phys_start = (idt_virt_addr_from_linker - (uint64_t)_kernel_start) + kernel_load_phys_addr;
    uint64_t idt_size = (uint64_t)idt_reg_before_paging.limit + 1; // Limit is inclusive
    uint64_t idt_phys_end = idt_phys_start + idt_size;

    print_serial_format("IDT original VAddr (from sidt before paging): 0x%llx\\n", idt_virt_addr_from_linker);
    print_serial_format("Calculated IDT physical base: 0x%llx, limit: 0x%x\\n", idt_phys_start, idt_reg_before_paging.limit);
    print_serial_format("Mapping IDT. Phys: 0x%llx - 0x%llx (size: 0x%llx)\\n", idt_phys_start, idt_phys_end, idt_size);

    for (uint64_t p_addr = ALIGN_DOWN(idt_phys_start, PAGE_SIZE); p_addr < ALIGN_UP(idt_phys_end, PAGE_SIZE); p_addr += PAGE_SIZE) {
        uint64_t v_addr = p_addr + hhdm_offset;
        map_page(pml4_virt, v_addr, p_addr, PTE_PRESENT | PTE_WRITABLE | PTE_NO_EXECUTE, "IDT"); // IDT itself is data, handlers are code
        print_serial_format("  Mapped IDT Page: V=0x%llx -> P=0x%llx\\n", v_addr, p_addr);
    }
    print_serial(SERIAL_COM1_BASE, "IDT mapped to HHDM.\\n");

    // After mapping, we also need to update the IDTR to point to the new VIRTUAL address of the IDT in HHDM.
    struct descriptor_table_register_packed new_idt_reg;
    new_idt_reg.base = idt_phys_start + hhdm_offset; // New virtual base in HHDM
    new_idt_reg.limit = idt_reg_before_paging.limit;
    asm volatile("lidt %0" : : "m"(new_idt_reg));
    print_serial_format("LIDT called with new HHDM IDT base: 0x%llx, limit: 0x%x\\n", new_idt_reg.base, new_idt_reg.limit);

    // Temporarily map the old stack page (where current RSP is) to the new PML4
    // This is to prevent a page fault when an interrupt/exception occurs immediately after loading CR3
    // but before switching RSP to the new kernel stack.
    uint64_t old_rsp_val;
    asm volatile("mov %%rsp, %0" : "=r"(old_rsp_val));

    // Assume old_rsp_val is within HHDM, so subtract hhdm_offset to get physical address
    // Ensure the page is aligned. Usually, one page is enough.
    uint64_t old_stack_page_phys = (old_rsp_val - hhdm_offset) & ~(PAGE_SIZE - 1);
    uint64_t old_stack_page_virt = old_stack_page_phys + hhdm_offset; // Map it to its existing HHDM virtual address

    print_serial_format("Old RSP: 0x%llx, mapping its page Phys: 0x%llx to Virt: 0x%llx\\n",
                        old_rsp_val, old_stack_page_phys, old_stack_page_virt);
    map_page(pml4_virt,
             old_stack_page_virt,         // Virtual address (same as current HHDM address)
             old_stack_page_phys,         // Physical address
             PTE_PRESENT | PTE_WRITABLE | PTE_NO_EXECUTE, // Writable, No Execute for stack
             "Limine old stack (temp)");
    print_serial(SERIAL_COM1_BASE, "Old Limine stack page temporarily mapped.\\n");

    // Map the page containing the framebuffer structure (fb_for_kernel_main)
    if (fb_for_kernel_main != NULL) {
        uint64_t fb_struct_virt_addr = (uint64_t)fb_for_kernel_main;
        // fb_for_kernel_main was allocated via pmm_alloc_page() + hhdm_offset in main.c
        // So, its physical address is fb_struct_virt_addr - hhdm_offset
        uint64_t fb_struct_phys_addr = fb_struct_virt_addr - hhdm_offset;

        // Align to page boundary, though it should already be page-aligned if allocated with pmm_alloc_page()
        uint64_t fb_struct_page_phys = ALIGN_DOWN(fb_struct_phys_addr, PAGE_SIZE);
        uint64_t fb_struct_page_virt = fb_struct_page_phys + hhdm_offset;

        print_serial_format("Mapping FB struct page. Struct V:0x%llx, Page P:0x%llx, Page V:0x%llx\\n",
                            fb_struct_virt_addr, fb_struct_page_phys, fb_struct_page_virt);
        map_page(pml4_virt,
                 fb_struct_page_virt,         // Virtual address
                 fb_struct_page_phys,         // Physical address
                 PTE_PRESENT | PTE_WRITABLE | PTE_NO_EXECUTE, // Struct is read/written, not executed
                 "Limine FB struct copy");
        print_serial(SERIAL_COM1_BASE, "Limine Framebuffer structure page mapped.\\n");
    } else {
        print_serial(SERIAL_COM1_BASE, "WARNING: fb_for_kernel_main is NULL, not mapping its page.\\n");
    }

    load_pml4((uint64_t)kernel_pml4_phys);

    __asm__ volatile (
        "jmp 1f\n"
        "1:\n"
        : : : "memory", "cc"
    );

    __asm__ volatile ("mov %0, %%rsp" :: "r"(new_rsp_virt_top) : "memory");

    print_serial(SERIAL_COM1_BASE, ">> After CR3, JMP, and RSP switch - paging fully active\n");

    if (kernel_entry_after_paging_fn != NULL) {
        void (*kernel_main_func)(struct limine_framebuffer *) =
            (void (*)(struct limine_framebuffer *))kernel_entry_after_paging_fn;
        kernel_main_func(fb_for_kernel_main);
    } else {
        print_serial(SERIAL_COM1_BASE, "ERROR: kernel_entry_after_paging_fn is NULL! Halting.\n");
    }

    for (;;) {
        asm volatile ("cli; hlt");
    }
}
