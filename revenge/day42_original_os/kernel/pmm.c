#include "pmm.h"
#include "limine.h"
#include "io.h"      // For print_serial, print_serial_hex for debugging
#include <stdint.h>
#include <stddef.h>  // For NULL and size_t
#include <stdbool.h> // For bool, true, false
#include "paging.h" // For PAGE_SIZE (though it might be better to have a common header for such constants)

// External serial printing functions from main.c (for debugging PMM)
// These should ideally be replaced by a proper kernel logging system later.
extern void print_serial(uint16_t port, const char *s);
extern void print_serial_hex(uint16_t port, uint64_t h);
extern void print_serial_utoa(uint16_t port, uint64_t u);
extern void print_serial_dec(uint16_t port, uint64_t u);
#define KERNEL_COM1 SERIAL_COM1_BASE // Assuming SERIAL_COM1_BASE is defined in main.c or a common header if we include it
                                      // For now, let's hardcode it for PMM debugging if needed or pass port.
                                      // Let's use a local define for clarity in PMM if not including main.h directly.
#define PMM_DEBUG_SERIAL_PORT 0x3F8

// --- DBG Macro Definition (Copied for use in this file) ---
// Ensure SERIAL_COM1_BASE is accessible, e.g., via io.h or direct define if not already.
// Assume outb is also accessible, typically from io.h
static inline void dbg_u64_pmm(const char *s, uint64_t v) { // Renamed to avoid conflict
    for (const char *p = s; *p; p++) outb(SERIAL_COM1_BASE, *p);
    for (int i = 60; i >= 0; i -= 4) {
        char c = "0123456789ABCDEF"[(v >> i) & 0xF];
        outb(SERIAL_COM1_BASE, c);
    }
    outb(SERIAL_COM1_BASE, '\n');
}
#define DBG_PMM(x) dbg_u64_pmm(#x " = ", (uint64_t)(x))
// --- End DBG Macro Definition ---

// Global PMM state variable
pmm_state_t pmm_info; // Define pmm_info

#define PMM_STACK_ENTRIES_PER_PAGE ((PAGE_SIZE / sizeof(uint64_t)) - 1) // Reserve 1 entry for 'next' pointer

struct pmm_stack_page {
    struct pmm_stack_page *next;
    uint64_t entries[PMM_STACK_ENTRIES_PER_PAGE];
};

// --- PMM Globals ---
// static uint64_t *pmm_stack = NULL;          // Pointer to the bottom of the physical page stack (virtual address) - REPLACED
static struct pmm_stack_page *pmm_current_stack_head = NULL; // Points to the current (topmost) stack page (virtual address)
static uint64_t pmm_stack_top = 0;       // Index into entries[] of the pmm_current_stack_head
// static uint64_t pmm_stack_capacity = 0;  // Total capacity of the stack (number of page addresses it can hold) - REMOVED
// static uint64_t pmm_stack_page_phys = 0; // Physical address of the page used for the PMM stack - REPLACED by pmm_first_stack_page_phys
static uint64_t pmm_first_stack_page_phys = 0; // Physical address of the *first* page used for the PMM stack
static uint64_t total_free_pages = 0;
// static uint64_t total_usable_pages = 0; // For debugging/verification - Can be re-added if needed

// HHDM offset (defined in main.c via paging.h)
extern uint64_t hhdm_offset;

// Helper to clear a page - ensure this is available
// This could be a shared function if defined elsewhere and not static.
// For now, assume it's available or add a local static version if needed.
static void clear_page_pmm(void *page_virt) { // Renamed to avoid conflict
    uint64_t *p = (uint64_t *)page_virt;
    for (size_t i = 0; i < PAGE_SIZE / sizeof(uint64_t); i++) {
        p[i] = 0;
    }
}

// Helper to align an address up to the nearest page boundary
static uint64_t ALIGN_UP_PMM(uint64_t addr, uint64_t align) { // Renamed to avoid conflict
    return (addr + align - 1) & ~(align - 1);
}

// Forward declaration for pmm_get_allocated_stack_page_count
uint64_t pmm_get_allocated_stack_page_count(void);

static bool pmm_initialized = false;

void init_pmm(struct limine_memmap_response *memmap) {
    if (pmm_initialized) {
        return;
    }

    print_serial(SERIAL_COM1_BASE, "PMM_DBG: init_pmm start\n"); // DBG

    print_serial(SERIAL_COM1_BASE, "PMM: Initializing Physical Memory Manager (Growable Stack)...\n");

    if (memmap == NULL) {
        print_serial(SERIAL_COM1_BASE, "PMM_DBG: memmap is NULL, returning.\n"); // DBG
        return;
    }
    // DBG_PMM(memmap->entry_count); // Optional debug

    /* --- 1. Find and reserve the *first* safe page for the PMM stack (e.g., 2MiB) --- */
    for (size_t i = 0; i < memmap->entry_count; i++) {
        struct limine_memmap_entry *e = memmap->entries[i];
        if (e->type == LIMINE_MEMMAP_USABLE) {
            uint64_t potential_stack_start = ALIGN_UP_PMM(0x200000, PAGE_SIZE);
            if (e->base <= potential_stack_start && (e->base + e->length) >= (potential_stack_start + PAGE_SIZE)) {
                pmm_first_stack_page_phys = potential_stack_start;
                print_serial(SERIAL_COM1_BASE, "PMM_DBG: Found first PMM stack page at P:0x"); // DBG
                print_serial_hex(SERIAL_COM1_BASE, pmm_first_stack_page_phys); // DBG
                print_serial(SERIAL_COM1_BASE, "\n"); // DBG
                break;
            }
        }
    }

    if (pmm_first_stack_page_phys == 0) {
        print_serial(SERIAL_COM1_BASE, "PMM_DBG: pmm_first_stack_page_phys is 0, returning.\n"); // DBG
        return;
    }

    /* --- 2. Initialize the first PMM stack page --- */
    pmm_current_stack_head = (struct pmm_stack_page *)(pmm_first_stack_page_phys + hhdm_offset);
    clear_page_pmm(pmm_current_stack_head);
    pmm_current_stack_head->next = NULL;
    pmm_stack_top = 0; // Current page is empty

    print_serial(SERIAL_COM1_BASE, "PMM_DBG: First stack page V:0x"); print_serial_hex(SERIAL_COM1_BASE, (uint64_t)pmm_current_stack_head); // DBG
    print_serial(SERIAL_COM1_BASE, ", P:0x"); print_serial_hex(SERIAL_COM1_BASE, pmm_first_stack_page_phys); // DBG
    print_serial(SERIAL_COM1_BASE, ", pmm_stack_top="); print_serial_dec(SERIAL_COM1_BASE, pmm_stack_top); // DBG
    print_serial(SERIAL_COM1_BASE, "\n"); // DBG

    print_serial(SERIAL_COM1_BASE, "PMM: First stack page initialized at V:0x"); print_serial_hex(SERIAL_COM1_BASE, (uint64_t)pmm_current_stack_head);
    print_serial(SERIAL_COM1_BASE, " (P:0x"); print_serial_hex(SERIAL_COM1_BASE, pmm_first_stack_page_phys); print_serial(SERIAL_COM1_BASE, ")\n");
    print_serial(SERIAL_COM1_BASE, "PMM: Stack entries per page: "); print_serial_dec(SERIAL_COM1_BASE, PMM_STACK_ENTRIES_PER_PAGE); print_serial(SERIAL_COM1_BASE, "\n");

    /* --- 3. Populate the free page stack (it will grow as needed) --- */
    print_serial(SERIAL_COM1_BASE, "PMM: Populating free page stack...\n");
    total_free_pages = 0; // Reset before populating
    print_serial(SERIAL_COM1_BASE, "PMM_DBG: Before populating loop: total_free_pages="); print_serial_dec(SERIAL_COM1_BASE, total_free_pages); print_serial(SERIAL_COM1_BASE, "\n"); // DBG

    // Iterate through memory map entries to find usable memory
    for (uint64_t i = 0; i < memmap->entry_count; i++) {
        struct limine_memmap_entry *entry = memmap->entries[i];
        if (entry->type == LIMINE_MEMMAP_USABLE) {
            // DBG_PMM(entry->base); // Optional
            // DBG_PMM(entry->length); // Optional

            uint64_t base = ALIGN_UP_PMM(entry->base, PAGE_SIZE);
            uint64_t top = (entry->base + entry->length); // Iterate up to, but not exceeding, top

            for (uint64_t p = base; (p + PAGE_SIZE) <= top; p += PAGE_SIZE) {
                if (p == pmm_first_stack_page_phys) { // Don't add the first stack page itself to be managed initially
                    print_serial(SERIAL_COM1_BASE, "PMM_DBG: Skipping first PMM stack page 0x"); // DBG
                    print_serial_hex(SERIAL_COM1_BASE, p); // DBG
                    print_serial(SERIAL_COM1_BASE, " from free list.\n"); // DBG
                    continue;
                }
                // print_serial(SERIAL_COM1_BASE, "PMM_DBG: Calling pmm_free_page for P:0x"); print_serial_hex(SERIAL_COM1_BASE, p); print_serial(SERIAL_COM1_BASE, "\n"); // DBG
                pmm_free_page((void *)p);
                // print_serial(SERIAL_COM1_BASE, "PMM_DBG: After pmm_free_page for P:0x"); print_serial_hex(SERIAL_COM1_BASE, p); // DBG
                // print_serial(SERIAL_COM1_BASE, ", current_stack_head V:0x"); print_serial_hex(SERIAL_COM1_BASE, (uint64_t)pmm_current_stack_head); // DBG
                // print_serial(SERIAL_COM1_BASE, ", pmm_stack_top="); print_serial_dec(SERIAL_COM1_BASE, pmm_stack_top); // DBG
                // print_serial(SERIAL_COM1_BASE, ", total_free_pages="); print_serial_dec(SERIAL_COM1_BASE, total_free_pages); print_serial(SERIAL_COM1_BASE, "\n"); // DBG
            }
        }
    }

    print_serial(SERIAL_COM1_BASE, "PMM_DBG: After populating loop: total_free_pages="); print_serial_dec(SERIAL_COM1_BASE, total_free_pages); // DBG
    print_serial(SERIAL_COM1_BASE, ", allocated_stack_pages="); print_serial_dec(SERIAL_COM1_BASE, pmm_get_allocated_stack_page_count()); // DBG
    print_serial(SERIAL_COM1_BASE, "\n"); // DBG

    print_serial(SERIAL_COM1_BASE, "PMM: Initialization complete. Total free pages: ");
    print_serial_dec(SERIAL_COM1_BASE, total_free_pages);
    print_serial(SERIAL_COM1_BASE, "\n");
    print_serial(SERIAL_COM1_BASE, "PMM: Total stack pages allocated: ");
    print_serial_dec(SERIAL_COM1_BASE, pmm_get_allocated_stack_page_count());
    print_serial(SERIAL_COM1_BASE, "\n");

    pmm_info.stack_phys_base = pmm_first_stack_page_phys;
    pmm_info.stack_base = (uint64_t *)((uint64_t)pmm_first_stack_page_phys + hhdm_offset);
    pmm_info.free_pages = total_free_pages;
    pmm_info.pmm_stack_size_pages = pmm_get_allocated_stack_page_count();

    pmm_initialized = true;
}

// Allocate a physical page
void *pmm_alloc_page(void) {
    if (pmm_current_stack_head == NULL) {
        print_serial(SERIAL_COM1_BASE, "PMM_DBG_ALLOC: pmm_current_stack_head is NULL, returning NULL\n"); // DBG
        return NULL;
    }

    if (pmm_stack_top == 0) { // Current stack page is empty
        print_serial(SERIAL_COM1_BASE, "PMM_DBG_ALLOC: pmm_stack_top is 0. current_stack_head V:0x"); print_serial_hex(SERIAL_COM1_BASE, (uint64_t)pmm_current_stack_head); print_serial(SERIAL_COM1_BASE, "\n"); // DBG
        struct pmm_stack_page *old_stack_page_virt = pmm_current_stack_head;
        if (old_stack_page_virt->next == NULL) {
            print_serial(SERIAL_COM1_BASE, "PMM Error: Out of memory! No more stack pages and current is empty.\n");
            print_serial(SERIAL_COM1_BASE, "PMM_DBG_ALLOC: old_stack_page_virt->next is NULL. Returning NULL.\n"); // DBG
            return NULL;
        }
        pmm_current_stack_head = old_stack_page_virt->next;
        pmm_stack_top = PMM_STACK_ENTRIES_PER_PAGE; // New page is full (top is index of last valid entry + 1 for pop)
        print_serial(SERIAL_COM1_BASE, "PMM_DBG_ALLOC: Switched to next stack page. New pmm_current_stack_head V:0x"); print_serial_hex(SERIAL_COM1_BASE, (uint64_t)pmm_current_stack_head); // DBG
        print_serial(SERIAL_COM1_BASE, ", new pmm_stack_top="); print_serial_dec(SERIAL_COM1_BASE, pmm_stack_top); print_serial(SERIAL_COM1_BASE, "\n"); // DBG

        // Optional: Free the physical page of old_stack_page_virt IF it's not the first one.
        // This is tricky because pmm_free_page might try to allocate a new stack page.
        // For now, let's not free old stack pages to avoid complexity. They remain "lost" to the PMM.
        // uint64_t old_stack_page_phys = (uint64_t)old_stack_page_virt - hhdm_offset;
        // if (old_stack_page_phys != pmm_first_stack_page_phys) {
        //    print_serial(SERIAL_COM1_BASE, "PMM: Attempting to free old stack page P:0x"); print_serial_hex(SERIAL_COM1_BASE, old_stack_page_phys); print_serial(SERIAL_COM1_BASE, "\n");
        //    pmm_free_page((void*)old_stack_page_phys); // Risky due to potential recursion / re-allocation
        // }

        print_serial(SERIAL_COM1_BASE, "PMM: Switched to next stack page at V:0x");
        print_serial_hex(SERIAL_COM1_BASE, (uint64_t)pmm_current_stack_head);
        print_serial(SERIAL_COM1_BASE, "\n");
    }

    // Pop an address from the current stack page
    // pmm_stack_top is the count of items, so valid indices are 0 to pmm_stack_top-1
    uint64_t phys_addr = pmm_current_stack_head->entries[--pmm_stack_top];
    total_free_pages--;

    // DBG_PMM(phys_addr); // Debug allocated page
    // DBG_PMM(total_free_pages); // Debug free pages count

    return (void *)phys_addr;
}

// Free a physical page
void pmm_free_page(void *p_phys) {
    uint64_t phys_addr = (uint64_t)p_phys;

    // print_serial(SERIAL_COM1_BASE, "PMM_DBG_FREE: pmm_free_page(P:0x"); print_serial_hex(SERIAL_COM1_BASE, phys_addr); print_serial(SERIAL_COM1_BASE, ")\n"); // DBG

    if ((phys_addr % PAGE_SIZE) != 0) {
        print_serial(SERIAL_COM1_BASE, "PMM Error: Attempt to free non-page-aligned address: 0x");
        print_serial_hex(SERIAL_COM1_BASE, phys_addr);
        print_serial(SERIAL_COM1_BASE, "\n");
        // panic("PMM: Attempt to free non-page-aligned address.");
        return;
    }

    if (pmm_current_stack_head == NULL) {
         // This should only happen if called before init_pmm completes first page setup.
        print_serial(SERIAL_COM1_BASE, "PMM_DBG_FREE: pmm_current_stack_head is NULL! (called for P:0x"); print_serial_hex(SERIAL_COM1_BASE, phys_addr); print_serial(SERIAL_COM1_BASE, ")\n"); // DBG
        return;
    }

    // Check if the page being freed is already part of the stack chain (excluding the current head if it's the first page)
    // This is a basic check to prevent obvious corruption. A more robust check would trace the whole list.
    if (phys_addr != pmm_first_stack_page_phys) { // The first stack page has special handling
        struct pmm_stack_page *check_ptr = pmm_current_stack_head->next;
        while(check_ptr) {
            if (((uint64_t)check_ptr - hhdm_offset) == phys_addr) {
                print_serial(SERIAL_COM1_BASE, "PMM Warning: Attempt to free a page already in use as a PMM stack page (P:0x");
                print_serial_hex(SERIAL_COM1_BASE, phys_addr);
                print_serial(SERIAL_COM1_BASE, "). Skipping free to prevent corruption.\n");
                return;
            }
            check_ptr = check_ptr->next;
        }
    }


    if (pmm_stack_top >= PMM_STACK_ENTRIES_PER_PAGE) { // Current stack page is full
        print_serial(SERIAL_COM1_BASE, "PMM_DBG_FREE: Current stack page full. pmm_current_stack_head V:0x"); print_serial_hex(SERIAL_COM1_BASE, (uint64_t)pmm_current_stack_head); // DBG
        print_serial(SERIAL_COM1_BASE, ", pmm_stack_top="); print_serial_dec(SERIAL_COM1_BASE, pmm_stack_top); // DBG
        print_serial(SERIAL_COM1_BASE, ". Page to be freed P:0x"); print_serial_hex(SERIAL_COM1_BASE, phys_addr); print_serial(SERIAL_COM1_BASE, " will become new stack head.\n"); // DBG
        // The page being freed (phys_addr) will become the new stack head.
        if (phys_addr == pmm_first_stack_page_phys && pmm_current_stack_head == (struct pmm_stack_page *)(pmm_first_stack_page_phys + hhdm_offset)) {
             // This case should ideally not be hit if pmm_first_stack_page_phys is never added to free list to begin with.
             // If it is, and the first page is full, we try to make it its own new head - bad.
            print_serial(SERIAL_COM1_BASE, "PMM_DBG_FREE: Attempting to use pmm_first_stack_page_phys as new head while it is current head. Problem!\n"); // DBG
            return;
        }
        // Also, if phys_addr is *any* active stack page, this is problematic.
        // The check above handles pmm_current_stack_head->next and further, but not pmm_current_stack_head itself if it's not the first page.

        struct pmm_stack_page *new_stack_page_virt = (struct pmm_stack_page *)(phys_addr + hhdm_offset);

        // Log before modifying list structure
        // print_serial(SERIAL_COM1_BASE, "PMM: Current stack page full. Using freed page P:0x");
        // print_serial_hex(SERIAL_COM1_BASE, phys_addr);
        // print_serial(SERIAL_COM1_BASE, " as new stack head at V:0x");
        // print_serial_hex(SERIAL_COM1_BASE, (uint64_t)new_stack_page_virt);
        // print_serial(SERIAL_COM1_BASE, "\n");

        clear_page_pmm(new_stack_page_virt);
        new_stack_page_virt->next = pmm_current_stack_head;
        pmm_current_stack_head = new_stack_page_virt;
        pmm_stack_top = 0; // New page is empty, ready for the first entry.
        print_serial(SERIAL_COM1_BASE, "PMM_DBG_FREE: New stack page created. New pmm_current_stack_head V:0x"); print_serial_hex(SERIAL_COM1_BASE, (uint64_t)pmm_current_stack_head); // DBG
        print_serial(SERIAL_COM1_BASE, ", pmm_stack_top="); print_serial_dec(SERIAL_COM1_BASE, pmm_stack_top); print_serial(SERIAL_COM1_BASE, "\n"); // DBG
        // The page phys_addr is now a stack page, so it doesn't increase total_free_pages yet.
        // total_free_pages will be incremented when phys_addr is added to entries below.
    }

    // Push the physical address onto the current stack page's entries
    // pmm_stack_top is the count of items, so next item goes at index pmm_stack_top
    // print_serial(SERIAL_COM1_BASE, "PMM_DBG_FREE: Pushing P:0x"); print_serial_hex(SERIAL_COM1_BASE, phys_addr); // DBG
    // print_serial(SERIAL_COM1_BASE, " to current_stack_head V:0x"); print_serial_hex(SERIAL_COM1_BASE, (uint64_t)pmm_current_stack_head); // DBG
    // print_serial(SERIAL_COM1_BASE, " at index pmm_stack_top="); print_serial_dec(SERIAL_COM1_BASE, pmm_stack_top); print_serial(SERIAL_COM1_BASE, "\n"); // DBG
    pmm_current_stack_head->entries[pmm_stack_top++] = phys_addr;
    total_free_pages++;
    // print_serial(SERIAL_COM1_BASE, "PMM_DBG_FREE: After push. pmm_stack_top="); print_serial_dec(SERIAL_COM1_BASE, pmm_stack_top); // DBG
    // print_serial(SERIAL_COM1_BASE, ", total_free_pages="); print_serial_dec(SERIAL_COM1_BASE, total_free_pages); print_serial(SERIAL_COM1_BASE, "\n"); // DBG

    // DBG_PMM(phys_addr); // Debug freed page
    // DBG_PMM(total_free_pages); // Debug free pages count
}

// Get the number of free pages
uint64_t pmm_get_free_page_count(void) {
    return total_free_pages;
}

// Returns the number of entries a single stack page can hold (excluding the 'next' pointer)
uint64_t pmm_get_stack_entries_per_page(void) {
    return PMM_STACK_ENTRIES_PER_PAGE;
}

// Returns the current fill level (next free slot index) of the topmost stack page
uint64_t pmm_get_current_stack_top_idx(void) {
    return pmm_stack_top;
}

// Returns the physical address of the *first* PMM stack page used.
uint64_t pmm_get_first_pmm_stack_phys_addr(void) {
    return pmm_first_stack_page_phys;
}

// Helper to count how many stack pages are currently allocated (for debugging)
uint64_t pmm_get_allocated_stack_page_count(void) {
    uint64_t count = 0;
    struct pmm_stack_page *current = pmm_current_stack_head;
    while (current) {
        count++;
        current = current->next;
    }
    return count;
}
