#include "memory.h"
#include "kernel.h"

/* Global memory manager */
static struct memory_manager mm;

/* Kernel symbols (provided by linker) */
extern char _kernel_start[];
extern char _kernel_end[];

/* Forward declarations */
static void init_page_allocator(void);
static void mark_kernel_pages(void);
static bool is_page_used(u32 page_num);
void parse_memory_map(struct multiboot_info* mboot_info);

void memory_init(struct multiboot_info* mboot_info) {
    kernel_printf("memory_init: Starting...\n");

    /* Initialize memory manager structure */
    kernel_printf("memory_init: Clearing mm struct...\n");
    memset(&mm, 0, sizeof(mm));
    kernel_printf("memory_init: mm struct cleared\n");

    /* Set kernel boundaries */
    kernel_printf("memory_init: Setting kernel boundaries...\n");
    mm.kernel_start = (u32)_kernel_start;
    mm.kernel_end = (u32)_kernel_end;
    kernel_printf("memory_init: Kernel boundaries set\n");

    kernel_printf("  - Kernel loaded at: %u - %u (%u KB)\n",
                  mm.kernel_start, mm.kernel_end,
                  (mm.kernel_end - mm.kernel_start) / 1024);

    /* Parse memory map from multiboot or use fallback */
    kernel_printf("memory_init: Checking multiboot info...\n");
    if (mboot_info && (mboot_info->flags & (1 << 6))) {
        kernel_printf("memory_init: Calling parse_memory_map...\n");
        parse_memory_map(mboot_info);
        kernel_printf("memory_init: parse_memory_map returned\n");
    } else {
        kernel_printf("  - WARNING: No multiboot memory map. Using fallback (256MB).\n");
        mm.total_memory = 256 * 1024 * 1024;
        mm.total_pages = mm.total_memory / PAGE_SIZE;
        kernel_printf("memory_init: Fallback memory set\n");
    }

    kernel_printf("memory_init: About to call init_page_allocator...\n");
    init_page_allocator();
    kernel_printf("memory_init: init_page_allocator returned\n");

    kernel_printf("memory_init: About to call mark_kernel_pages...\n");
    mark_kernel_pages();
    kernel_printf("memory_init: mark_kernel_pages returned\n");

    kernel_printf("memory_init: About to call memory_print_info...\n");
    memory_print_info();
    kernel_printf("memory_init: Completed successfully\n");
}

void parse_memory_map(struct multiboot_info* mboot_info) {
    kernel_printf("  - Parsing memory map from bootloader...\n");

    struct multiboot_mmap_entry* mmap = (struct multiboot_mmap_entry*)(u32)mboot_info->mmap_addr;
    struct multiboot_mmap_entry* mmap_end =
        (struct multiboot_mmap_entry*)(u32)(mboot_info->mmap_addr + mboot_info->mmap_length);

    u32 highest_addr = 0;
    while (mmap < mmap_end) {
        if (mmap->type == MULTIBOOT_MEMORY_AVAILABLE) {
            u64 addr = ((u64)mmap->addr_high << 32) | mmap->addr_low;
            u64 len = ((u64)mmap->len_high << 32) | mmap->len_low;
            u64 end_addr = addr + len;

            if (end_addr > highest_addr && end_addr < 0xFFFFFFFF) {
                highest_addr = end_addr;
            }
        }
        mmap = (struct multiboot_mmap_entry*)((u32)mmap + mmap->size + sizeof(mmap->size));
    }

    mm.total_memory = highest_addr;
    mm.total_pages = mm.total_memory / PAGE_SIZE;

    kernel_printf("  - Memory detected: %u MB total, %u pages\n",
                  mm.total_memory / (1024 * 1024), mm.total_pages);
}

static void init_page_allocator(void) {
    kernel_printf("init_page_allocator: Starting...\n");

    /* Calculate bitmap size */
    kernel_printf("init_page_allocator: Total pages: %u\n", mm.total_pages);
    mm.bitmap_size = (mm.total_pages + 31) / 32;  /* Round up to u32 boundary */
    kernel_printf("init_page_allocator: Bitmap size: %u u32s\n", mm.bitmap_size);

    /* Allocate bitmap at end of kernel */
    kernel_printf("init_page_allocator: Setting bitmap address...\n");
    mm.page_bitmap = (u32*)PAGE_ALIGN(mm.kernel_end);
    kernel_printf("init_page_allocator: Bitmap address set to: %u\n", (u32)mm.page_bitmap);

    /* Clear bitmap (all pages free initially) */
    kernel_printf("init_page_allocator: About to clear bitmap...\n");
    kernel_printf("init_page_allocator: Bitmap size in bytes: %u\n", mm.bitmap_size * sizeof(u32));

    // Test if we can access the bitmap memory
    kernel_printf("init_page_allocator: Testing bitmap memory access...\n");
    mm.page_bitmap[0] = 0;  // Test write
    kernel_printf("init_page_allocator: Bitmap memory test passed\n");

    memset(mm.page_bitmap, 0, mm.bitmap_size * sizeof(u32));
    kernel_printf("init_page_allocator: Bitmap cleared\n");

    /* Update kernel end to include bitmap */
    mm.kernel_end = (u32)((u8*)mm.page_bitmap + (mm.bitmap_size * sizeof(u32)));
    kernel_printf("init_page_allocator: Updated kernel_end to: %u\n", mm.kernel_end);

    kernel_printf("init_page_allocator: Completed\n");
}

static void mark_kernel_pages(void) {
    u32 kernel_start_page = ADDR_TO_PAGE(mm.kernel_start);
    u32 kernel_end_page = ADDR_TO_PAGE(mm.kernel_end);

    kernel_printf("  - Marking kernel pages as used: %u - %u\n",
                  kernel_start_page, kernel_end_page);

    for (u32 page = kernel_start_page; page <= kernel_end_page; page++) {
        mark_page_used(page);
    }

    /* Also mark low memory (0-1MB) as used */
    for (u32 page = 0; page < 256; page++) {  /* First 1MB is often reserved */
        mark_page_used(page);
    }
}

u32 alloc_page(void) {
    u32 page = find_free_pages(1);
    if (page == (u32)-1) {
        kernel_panic("Out of memory");
        return 0;
    }

    mark_page_used(page);
    mm.used_pages++;
    mm.used_memory += PAGE_SIZE;

    u32 addr = PAGE_TO_ADDR(page);
    memset((void*)addr, 0, PAGE_SIZE);
    return addr;
}

void free_page(u32 addr) {
    if (addr == 0 || (addr & PAGE_MASK) != 0) return;
    u32 page = ADDR_TO_PAGE(addr);
    if (page >= mm.total_pages || !is_page_used(page)) return;

    mark_page_free(page);
    mm.used_pages--;
    mm.used_memory -= PAGE_SIZE;
}

u32 alloc_pages(u32 count) {
    if (count == 0) return 0;
    u32 start_page = find_free_pages(count);
    if (start_page == (u32)-1) {
        kernel_panic("Out of contiguous memory");
        return 0;
    }

    for (u32 i = 0; i < count; i++) {
        mark_page_used(start_page + i);
    }
    mm.used_pages += count;
    mm.used_memory += count * PAGE_SIZE;
    return PAGE_TO_ADDR(start_page);
}

void free_pages(u32 addr, u32 count) {
    if (addr == 0 || (addr & PAGE_MASK) != 0 || count == 0) return;
    u32 start_page = ADDR_TO_PAGE(addr);
    if (start_page + count > mm.total_pages) return;

    for (u32 i = 0; i < count; i++) {
        u32 page = start_page + i;
        if (is_page_used(page)) {
            mark_page_free(page);
            mm.used_pages--;
            mm.used_memory -= PAGE_SIZE;
        }
    }
}

bool is_page_free(u32 page_num) {
    if (page_num >= mm.total_pages) return false;
    u32 idx = page_num / 32;
    u32 bit = page_num % 32;
    return !(mm.page_bitmap[idx] & (1 << bit));
}

static bool is_page_used(u32 page_num) {
    return !is_page_free(page_num);
}

void mark_page_used(u32 page_num) {
    if (page_num >= mm.total_pages) return;
    u32 idx = page_num / 32;
    u32 bit = page_num % 32;
    mm.page_bitmap[idx] |= (1 << bit);
}

void mark_page_free(u32 page_num) {
    if (page_num >= mm.total_pages) return;
    u32 idx = page_num / 32;
    u32 bit = page_num % 32;
    mm.page_bitmap[idx] &= ~(1 << bit);
}

u32 find_free_pages(u32 count) {
    u32 consecutive = 0;
    for (u32 i = 0; i < mm.total_pages; i++) {
        if (is_page_free(i)) {
            consecutive++;
            if (consecutive == count) {
                return i - count + 1;
            }
        } else {
            consecutive = 0;
        }
    }
    return (u32)-1;
}

void memory_print_info(void) {
    u32 free_pages = mm.total_pages - mm.used_pages;
    u32 free_mem_kb = free_pages * PAGE_SIZE / 1024;
    u32 total_mem_kb = mm.total_memory / 1024;

    kernel_printf("\n--- Memory Status ---\n");
    kernel_printf("Total Memory: %u KB (%u MB)\n", total_mem_kb, total_mem_kb / 1024);
    kernel_printf("Used Memory:  %u KB\n", mm.used_memory / 1024);
    kernel_printf("Free Memory:  %u KB\n", free_mem_kb);
    kernel_printf("Total Pages:  %u\n", mm.total_pages);
    kernel_printf("Used Pages:   %u\n", mm.used_pages);
    kernel_printf("Free Pages:   %u\n", free_pages);
    kernel_printf("Kernel size:  %u KB\n", (mm.kernel_end - mm.kernel_start) / 1024);
    kernel_printf("---------------------\n");
}

void memory_test(void) {
    kernel_printf("\n--- Running Memory Tests ---\n");

    u32* p1 = (u32*)alloc_page();
    kernel_printf("Allocated page at 0x%x\n", (u32)p1);
    *p1 = 0xDEADBEEF;
    if (*p1 == 0xDEADBEEF) {
        kernel_printf("  - R/W Test 1 OK\n");
    } else {
        kernel_printf("  - R/W Test 1 FAILED\n");
    }

    u32* p2 = (u32*)alloc_pages(10);
    kernel_printf("Allocated 10 pages at 0x%x\n", (u32)p2);
    p2[10 * (PAGE_SIZE / sizeof(u32)) - 1] = 0xCAFEBABE;
    if (p2[10 * (PAGE_SIZE / sizeof(u32)) - 1] == 0xCAFEBABE) {
        kernel_printf("  - R/W Test 2 OK\n");
    } else {
        kernel_printf("  - R/W Test 2 FAILED\n");
    }

    free_page((u32)p1);
    kernel_printf("Freed page at 0x%x\n", (u32)p1);

    free_pages((u32)p2, 10);
    kernel_printf("Freed 10 pages at 0x%x\n", (u32)p2);

    memory_print_info();
    kernel_printf("--- Memory Tests Finished ---\n");
}

u32 get_total_memory(void) { return mm.total_memory; }
u32 get_free_memory(void) { return mm.total_memory - mm.used_memory; }
u32 get_total_pages(void) { return mm.total_pages; }
u32 get_free_pages(void) { return mm.total_pages - mm.used_pages; }
