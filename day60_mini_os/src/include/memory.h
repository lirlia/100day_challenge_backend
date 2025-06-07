#ifndef MEMORY_H
#define MEMORY_H

#include "kernel.h"

/* Memory layout constants */
#define PAGE_SIZE       4096
#define PAGE_SHIFT      12
#define PAGE_MASK       (PAGE_SIZE - 1)

/* Multiboot constants */
#define MULTIBOOT_BOOTLOADER_MAGIC      0x2BADB002

/* Convert between addresses and page numbers */
#define ADDR_TO_PAGE(addr)  ((addr) >> PAGE_SHIFT)
#define PAGE_TO_ADDR(page)  ((page) << PAGE_SHIFT)
#define PAGE_ALIGN(addr)    (((addr) + PAGE_MASK) & ~PAGE_MASK)

/* Multiboot memory map types */
#define MULTIBOOT_MEMORY_AVAILABLE      1
#define MULTIBOOT_MEMORY_RESERVED       2
#define MULTIBOOT_MEMORY_ACPI_RECLAIMABLE   3
#define MULTIBOOT_MEMORY_NVS            4
#define MULTIBOOT_MEMORY_BADRAM         5

/* Multiboot info structure (simplified) */
struct multiboot_info {
    u32 flags;
    u32 mem_lower;
    u32 mem_upper;
    u32 boot_device;
    u32 cmdline;
    u32 mods_count;
    u32 mods_addr;
    u32 syms[4];
    u32 mmap_length;
    u32 mmap_addr;
    u32 drives_length;
    u32 drives_addr;
    u32 config_table;
    u32 boot_loader_name;
    u32 apm_table;
    u32 vbe_control_info;
    u32 vbe_mode_info;
    u16 vbe_mode;
    u16 vbe_interface_seg;
    u16 vbe_interface_off;
    u16 vbe_interface_len;
} __attribute__((packed));

/* Multiboot memory map entry */
struct multiboot_mmap_entry {
    u32 size;
    u32 addr_low;
    u32 addr_high;
    u32 len_low;
    u32 len_high;
    u32 type;
} __attribute__((packed));

/* Page frame allocator */
struct page_frame {
    u32 ref_count;      /* Reference count */
    u32 flags;          /* Page flags */
};

/* Memory manager state */
struct memory_manager {
    u32 total_memory;           /* Total available memory in bytes (32-bit limit) */
    u32 used_memory;            /* Currently used memory in bytes */
    u32 total_pages;            /* Total number of pages */
    u32 used_pages;             /* Number of used pages */
    u32 *page_bitmap;           /* Bitmap for page allocation */
    u32 bitmap_size;            /* Size of bitmap in u32s */
    struct page_frame *page_frames; /* Page frame database */
    u32 kernel_start;           /* Kernel start address */
    u32 kernel_end;             /* Kernel end address */
};

/* Page flags */
#define PAGE_FLAG_USED      0x01
#define PAGE_FLAG_KERNEL    0x02
#define PAGE_FLAG_USER      0x04
#define PAGE_FLAG_WRITE     0x08

/* Function declarations */

/* Memory manager initialization */
void memory_init(struct multiboot_info* mboot_info);
void parse_memory_map(struct multiboot_info* mboot_info);

/* Page frame allocator */
u32 alloc_page(void);
void free_page(u32 addr);
u32 alloc_pages(u32 count);
void free_pages(u32 addr, u32 count);

/* Kernel memory allocator */
void* kmalloc(size_t size);
void kfree(void* ptr);
void* kmalloc_aligned(size_t size, size_t alignment);

/* Memory information */
void memory_print_info(void);
void memory_print_map(void);
u32 get_total_memory(void);
u32 get_free_memory(void);
u32 get_total_pages(void);
u32 get_free_pages(void);

/* Utility functions */
bool is_page_free(u32 page_num);
void mark_page_used(u32 page_num);
void mark_page_free(u32 page_num);
u32 find_free_pages(u32 count);

/* Debugging */
void memory_dump_bitmap(void);
void memory_test(void);

/* External kernel symbols */
extern u32 kernel_start;
extern u32 kernel_end;

#endif /* MEMORY_H */
