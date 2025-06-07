#ifndef PAGING_H
#define PAGING_H

#include "kernel.h"
#include "interrupt.h"

/* ページサイズ定数 */
#define PAGE_SIZE       4096
#define PAGING_PAGE_MASK       0xFFFFF000
#define PAGE_OFFSET     0x00000FFF

/* ページディレクトリとページテーブルエントリ数 */
#define PAGE_DIR_ENTRIES    1024
#define PAGE_TABLE_ENTRIES  1024

/* ページエントリフラグ */
#define PAGE_PRESENT    0x001   /* ページが物理メモリに存在 */
#define PAGE_WRITABLE   0x002   /* 書き込み可能 */
#define PAGE_USER       0x004   /* ユーザーモードからアクセス可能 */
#define PAGE_WRITETHROUGH 0x008 /* ライトスルーキャッシュ */
#define PAGE_CACHE_DISABLE 0x010 /* キャッシュ無効化 */
#define PAGE_ACCESSED   0x020   /* アクセス済み（CPUが設定） */
#define PAGE_DIRTY      0x040   /* 変更済み（CPUが設定） */
#define PAGE_SIZE_4MB   0x080   /* 4MBページ（PSE使用時） */
#define PAGE_GLOBAL     0x100   /* グローバルページ */

/* 仮想アドレス空間定義 */
#define PAGING_KERNEL_VIRTUAL_BASE     0xC0000000  /* 3GB */
#define USER_VIRTUAL_START      0x00400000  /* 4MB */
#define USER_VIRTUAL_END        0xBFFFFFFF  /* ~3GB */

/* ページディレクトリエントリ構造体 */
typedef struct {
    u32 present     : 1;   /* 存在フラグ */
    u32 writable    : 1;   /* 書き込み可能 */
    u32 user        : 1;   /* ユーザーアクセス可能 */
    u32 write_through : 1; /* ライトスルーキャッシュ */
    u32 cache_disable : 1; /* キャッシュ無効化 */
    u32 accessed    : 1;   /* アクセス済み */
    u32 reserved    : 1;   /* 予約済み */
    u32 page_size   : 1;   /* ページサイズ（0=4KB, 1=4MB） */
    u32 global      : 1;   /* グローバルページ */
    u32 available   : 3;   /* OS使用可能 */
    u32 page_table_addr : 20; /* ページテーブル物理アドレス（上位20bit） */
} __attribute__((packed)) page_dir_entry_t;

/* ページテーブルエントリ構造体 */
typedef struct {
    u32 present     : 1;   /* 存在フラグ */
    u32 writable    : 1;   /* 書き込み可能 */
    u32 user        : 1;   /* ユーザーアクセス可能 */
    u32 write_through : 1; /* ライトスルーキャッシュ */
    u32 cache_disable : 1; /* キャッシュ無効化 */
    u32 accessed    : 1;   /* アクセス済み */
    u32 dirty       : 1;   /* 変更済み */
    u32 reserved    : 1;   /* 予約済み */
    u32 global      : 1;   /* グローバルページ */
    u32 available   : 3;   /* OS使用可能 */
    u32 page_frame_addr : 20; /* ページフレーム物理アドレス（上位20bit） */
} __attribute__((packed)) page_table_entry_t;

/* ページディレクトリ構造体 */
typedef struct {
    page_dir_entry_t entries[PAGE_DIR_ENTRIES];
} __attribute__((aligned(PAGE_SIZE))) page_directory_t;

/* ページテーブル構造体 */
typedef struct {
    page_table_entry_t entries[PAGE_TABLE_ENTRIES];
} __attribute__((aligned(PAGE_SIZE))) page_table_t;

/* ページング管理構造体 */
typedef struct {
    page_directory_t* kernel_page_dir;    /* カーネルページディレクトリ */
    page_directory_t* current_page_dir;   /* 現在のページディレクトリ */
    u32 total_mapped_pages;               /* マップ済みページ数 */
    u32 kernel_heap_start;                /* カーネルヒープ開始アドレス */
    u32 kernel_heap_current;              /* カーネルヒープ現在位置 */
    u32 kernel_heap_max;                  /* カーネルヒープ最大アドレス */
} paging_manager_t;

/* 関数プロトタイプ */

/* 初期化・設定 */
void paging_init(void);
void paging_enable(void);
void paging_disable(void);

/* ページディレクトリ管理 */
page_directory_t* paging_create_directory(void);
void paging_destroy_directory(page_directory_t* dir);
void paging_switch_directory(page_directory_t* dir);

/* ページマッピング */
int paging_map_page(u32 virtual_addr, u32 physical_addr, u32 flags);
int paging_unmap_page(u32 virtual_addr);
u32 paging_get_physical_addr(u32 virtual_addr);

/* カーネルマッピング */
void paging_identity_map_kernel(void);
void paging_map_kernel_space(void);

/* ユーザースペース管理 */
int paging_map_user_page(page_directory_t* dir, u32 virtual_addr, u32 flags);
int paging_unmap_user_page(page_directory_t* dir, u32 virtual_addr);

/* ページフォルト処理 */
void page_fault_handler(interrupt_frame_t* frame);

/* ユーティリティ */
u32 paging_virtual_to_physical(u32 virtual_addr);
int paging_is_page_present(u32 virtual_addr);
void paging_print_info(void);

/* インラインヘルパー関数 */
static inline u32 page_align_down(u32 addr) {
    return addr & PAGING_PAGE_MASK;
}

static inline u32 page_align_up(u32 addr) {
    return (addr + PAGE_SIZE - 1) & PAGING_PAGE_MASK;
}

static inline u32 get_page_directory_index(u32 virtual_addr) {
    return (virtual_addr >> 22) & 0x3FF;
}

static inline u32 get_page_table_index(u32 virtual_addr) {
    return (virtual_addr >> 12) & 0x3FF;
}

static inline u32 get_page_offset(u32 virtual_addr) {
    return virtual_addr & PAGE_OFFSET;
}

/* アセンブリ関数 */
extern void load_page_directory(u32 page_dir_physical);
extern void enable_paging(void);
extern void flush_tlb(void);
extern u32 read_cr0(void);
extern u32 read_cr2(void);
extern u32 read_cr3(void);
extern void write_cr3(u32 value);

#endif /* PAGING_H */