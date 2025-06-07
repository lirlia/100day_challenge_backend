#include "paging.h"
#include "memory.h"
#include "interrupt.h"

/* アセンブリ関数の宣言 */
extern void invalidate_page(u32 virtual_addr);

/* グローバルページング管理変数 */
static paging_manager_t paging_manager;
static bool paging_enabled = false;

void paging_init(void) {
    kernel_printf("paging_init: Initializing virtual memory system...\n");

    /* ページング管理構造体の初期化 */
    kernel_printf("paging_init: Clearing paging manager...\n");
    memset(&paging_manager, 0, sizeof(paging_manager_t));
    kernel_printf("paging_init: Paging manager cleared\n");

    /* カーネルページディレクトリの作成 */
    kernel_printf("paging_init: Creating kernel page directory...\n");
    paging_manager.kernel_page_dir = paging_create_directory();
    if (!paging_manager.kernel_page_dir) {
        kernel_panic("Failed to create kernel page directory");
    }
    kernel_printf("paging_init: Kernel page directory created\n");

    /* カーネル空間の恒等マッピング設定 */
    kernel_printf("paging_init: Setting up kernel identity mapping...\n");
    paging_identity_map_kernel();
    kernel_printf("paging_init: Kernel identity mapping completed\n");

    /* カーネルヒープ領域の設定 */
    kernel_printf("paging_init: Setting up kernel heap...\n");
    paging_manager.kernel_heap_start = PAGING_KERNEL_VIRTUAL_BASE + 0x1000000;  /* カーネルベース + 16MB */
    paging_manager.kernel_heap_current = paging_manager.kernel_heap_start;
    paging_manager.kernel_heap_max = paging_manager.kernel_heap_start + 0x10000000; /* +256MB */
    kernel_printf("paging_init: Kernel heap configured\n");

    /* ページフォルトハンドラの登録 */
    kernel_printf("paging_init: Registering page fault handler...\n");
    register_interrupt_handler(14, page_fault_handler);
    kernel_printf("paging_init: Page fault handler registered\n");

    /* 現在のページディレクトリを設定 */
    kernel_printf("paging_init: Setting current page directory...\n");
    paging_manager.current_page_dir = paging_manager.kernel_page_dir;
    kernel_printf("paging_init: Current page directory set\n");

    kernel_printf("paging_init: Virtual memory system initialized\n");
}

void paging_enable(void) {
    if (paging_enabled) {
        kernel_printf("paging_enable: Paging already enabled\n");
        return;
    }

    kernel_printf("paging_enable: Enabling paging...\n");

    /* ページディレクトリをCR3にロード */
    u32 page_dir_physical = paging_virtual_to_physical((u32)paging_manager.kernel_page_dir);
    load_page_directory(page_dir_physical);

    /* ページングを有効化 */
    enable_paging();
    paging_enabled = true;

    kernel_printf("paging_enable: Paging enabled successfully\n");
}

void paging_disable(void) {
    if (!paging_enabled) {
        kernel_printf("paging_disable: Paging already disabled\n");
        return;
    }

    kernel_printf("paging_disable: Disabling paging...\n");
    // disable_paging(); // 一時的にコメントアウト
    paging_enabled = false;
    kernel_printf("paging_disable: Paging disabled\n");
}

page_directory_t* paging_create_directory(void) {
    kernel_printf("paging_create_directory: Starting...\n");

    /* ページディレクトリ用の物理ページを割り当て */
    kernel_printf("paging_create_directory: Allocating page...\n");
    u32 page_dir_physical = alloc_page();
    if (page_dir_physical == 0) {
        kernel_printf("paging_create_directory: Failed to allocate page directory\n");
        return NULL;
    }
    kernel_printf("paging_create_directory: Page allocated at 0x%x\n", page_dir_physical);

    /* ページディレクトリを初期化 */
    kernel_printf("paging_create_directory: Initializing page directory...\n");
    page_directory_t* page_dir = (page_directory_t*)page_dir_physical;
    memset(page_dir, 0, sizeof(page_directory_t));
    kernel_printf("paging_create_directory: Page directory initialized\n");

    kernel_printf("paging_create_directory: Created page directory at 0x%x\n", page_dir_physical);
    return page_dir;
}

void paging_destroy_directory(page_directory_t* dir) {
    if (!dir) return;

    /* ページテーブルの解放 */
    for (int i = 0; i < PAGE_DIR_ENTRIES; i++) {
        if (dir->entries[i].present) {
            u32 page_table_addr = dir->entries[i].page_table_addr << 12;
            free_page(page_table_addr);
        }
    }

    /* ページディレクトリ自体の解放 */
    free_page((u32)dir);
    kernel_printf("paging_destroy_directory: Destroyed page directory\n");
}

void paging_switch_directory(page_directory_t* dir) {
    if (!dir) {
        kernel_printf("paging_switch_directory: Invalid directory\n");
        return;
    }

    paging_manager.current_page_dir = dir;

    if (paging_enabled) {
        u32 page_dir_physical = paging_virtual_to_physical((u32)dir);
        write_cr3(page_dir_physical);
        flush_tlb();
    }

    kernel_printf("paging_switch_directory: Switched to directory 0x%x\n", (u32)dir);
}

int paging_map_page(u32 virtual_addr, u32 physical_addr, u32 flags) {
    /* アドレスをページ境界に合わせる */
    virtual_addr = page_align_down(virtual_addr);
    physical_addr = page_align_down(physical_addr);

    /* ページディレクトリインデックスとページテーブルインデックスを取得 */
    u32 page_dir_index = get_page_directory_index(virtual_addr);
    u32 page_table_index = get_page_table_index(virtual_addr);

    page_directory_t* page_dir = paging_manager.current_page_dir;

    /* ページテーブルが存在しない場合は作成 */
    if (!page_dir->entries[page_dir_index].present) {
        u32 page_table_physical = alloc_page();
        if (page_table_physical == 0) {
            kernel_printf("paging_map_page: Failed to allocate page table\n");
            return -1;
        }

        /* ページテーブルを初期化 */
        page_table_t* page_table = (page_table_t*)page_table_physical;
        memset(page_table, 0, sizeof(page_table_t));

        /* ページディレクトリエントリを設定 */
        page_dir->entries[page_dir_index].page_table_addr = page_table_physical >> 12;
        page_dir->entries[page_dir_index].present = 1;
        page_dir->entries[page_dir_index].writable = (flags & PAGE_WRITABLE) ? 1 : 0;
        page_dir->entries[page_dir_index].user = (flags & PAGE_USER) ? 1 : 0;
    }

    /* ページテーブルエントリを設定 */
    u32 page_table_addr = page_dir->entries[page_dir_index].page_table_addr << 12;
    page_table_t* page_table = (page_table_t*)page_table_addr;

    page_table->entries[page_table_index].page_frame_addr = physical_addr >> 12;
    page_table->entries[page_table_index].present = (flags & PAGE_PRESENT) ? 1 : 0;
    page_table->entries[page_table_index].writable = (flags & PAGE_WRITABLE) ? 1 : 0;
    page_table->entries[page_table_index].user = (flags & PAGE_USER) ? 1 : 0;

    /* TLBエントリを無効化 */
    if (paging_enabled) {
        invalidate_page(virtual_addr);
    }

    paging_manager.total_mapped_pages++;
    return 0;
}

int paging_unmap_page(u32 virtual_addr) {
    virtual_addr = page_align_down(virtual_addr);

    u32 page_dir_index = get_page_directory_index(virtual_addr);
    u32 page_table_index = get_page_table_index(virtual_addr);

    page_directory_t* page_dir = paging_manager.current_page_dir;

    if (!page_dir->entries[page_dir_index].present) {
        return -1; /* ページテーブルが存在しない */
    }

    u32 page_table_addr = page_dir->entries[page_dir_index].page_table_addr << 12;
    page_table_t* page_table = (page_table_t*)page_table_addr;

    if (!page_table->entries[page_table_index].present) {
        return -1; /* ページがマップされていない */
    }

    /* ページエントリをクリア */
    memset(&page_table->entries[page_table_index], 0, sizeof(page_table_entry_t));

    /* TLBエントリを無効化 */
    if (paging_enabled) {
        invalidate_page(virtual_addr);
    }

    paging_manager.total_mapped_pages--;
    return 0;
}

u32 paging_get_physical_addr(u32 virtual_addr) {
    u32 page_dir_index = get_page_directory_index(virtual_addr);
    u32 page_table_index = get_page_table_index(virtual_addr);
    u32 page_offset = get_page_offset(virtual_addr);

    page_directory_t* page_dir = paging_manager.current_page_dir;

    if (!page_dir->entries[page_dir_index].present) {
        return 0; /* ページテーブルが存在しない */
    }

    u32 page_table_addr = page_dir->entries[page_dir_index].page_table_addr << 12;
    page_table_t* page_table = (page_table_t*)page_table_addr;

    if (!page_table->entries[page_table_index].present) {
        return 0; /* ページがマップされていない */
    }

    u32 page_frame = page_table->entries[page_table_index].page_frame_addr << 12;
    return page_frame + page_offset;
}

void paging_identity_map_kernel(void) {
    kernel_printf("paging_identity_map_kernel: Setting up kernel identity mapping...\n");

    /* カーネル領域（最初の4MB）を恒等マッピング */
    /* 0x00000000 - 0x00400000 をそのままマッピング */

    for (u32 addr = 0; addr < 0x400000; addr += PAGE_SIZE) {
        int result = paging_map_page(addr, addr, PAGE_PRESENT | PAGE_WRITABLE);
        if (result != 0) {
            kernel_printf("paging_identity_map_kernel: Failed to map 0x%x\n", addr);
            kernel_panic("Kernel identity mapping failed");
        }
    }

    kernel_printf("paging_identity_map_kernel: Mapped %u pages for kernel\n",
                  0x400000 / PAGE_SIZE);
}

void page_fault_handler(interrupt_frame_t* frame) {
    u32 fault_addr = read_cr2();
    u32 error_code = frame->err_code;

    kernel_printf("\n=====================================\n");
    kernel_printf("        PAGE FAULT OCCURRED\n");
    kernel_printf("=====================================\n");
    kernel_printf("Fault Address: 0x%x\n", fault_addr);
    kernel_printf("Error Code: 0x%x\n", error_code);

    if (error_code & 0x1) {
        kernel_printf("  - Page protection violation\n");
    } else {
        kernel_printf("  - Page not present\n");
    }

    if (error_code & 0x2) {
        kernel_printf("  - Write access\n");
    } else {
        kernel_printf("  - Read access\n");
    }

    if (error_code & 0x4) {
        kernel_printf("  - User mode\n");
    } else {
        kernel_printf("  - Kernel mode\n");
    }

    kernel_printf("EIP: 0x%x\n", frame->eip);
    kernel_printf("=====================================\n");

    kernel_panic("Unhandled page fault");
}

u32 paging_virtual_to_physical(u32 virtual_addr) {
    if (!paging_enabled) {
        return virtual_addr; /* ページング無効時は恒等マッピング */
    }
    return paging_get_physical_addr(virtual_addr);
}

int paging_is_page_present(u32 virtual_addr) {
    return paging_get_physical_addr(virtual_addr) != 0;
}

void paging_print_info(void) {
    kernel_printf("\n--- Paging Status ---\n");
    kernel_printf("Paging Enabled: %s\n", paging_enabled ? "Yes" : "No");
    kernel_printf("Kernel Page Dir: 0x%x\n", (u32)paging_manager.kernel_page_dir);
    kernel_printf("Current Page Dir: 0x%x\n", (u32)paging_manager.current_page_dir);
    kernel_printf("Mapped Pages: %u\n", paging_manager.total_mapped_pages);
    kernel_printf("Kernel Heap: 0x%x - 0x%x (current: 0x%x)\n",
                  paging_manager.kernel_heap_start,
                  paging_manager.kernel_heap_max,
                  paging_manager.kernel_heap_current);

    if (paging_enabled) {
        kernel_printf("CR0: 0x%x\n", read_cr0());
        kernel_printf("CR3: 0x%x\n", read_cr3());
    }
    kernel_printf("---------------------\n");
}