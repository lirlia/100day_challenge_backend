#include "limine.h"
#include <stdint.h>
#include <stddef.h>
#include "font8x8_basic.h"
#include "gdt.h"
#include "idt.h"
#include "pmm.h"
#include "io.h"
#include "paging.h"
#include "serial.h"

// Forward declaration for panic from pmm.c (ideally in a common header)
void panic(const char *message);

// --- DBG Macro Definition ---
static inline void dbg_u64(const char *s, uint64_t v) {
    // Simple serial output, assuming SERIAL_COM1_BASE is available and init_serial was called
    for (const char *p = s; *p; p++) outb(SERIAL_COM1_BASE, *p);
    for (int i = 60; i >= 0; i -= 4) {
        char c = "0123456789ABCDEF"[(v >> i) & 0xF];
        outb(SERIAL_COM1_BASE, c);
    }
    outb(SERIAL_COM1_BASE, '\n');
}
#define DBG(x) dbg_u64(#x " = ", (uint64_t)(x))
// --- End DBG Macro Definition ---

static volatile LIMINE_BASE_REVISION(1); // Declare the base revision once globally

// 自前の memcpy 関数
void *memcpy(void *dest, const void *src, size_t n) {
    uint8_t *pdest = (uint8_t *)dest;
    const uint8_t *psrc = (const uint8_t *)src;
    for (size_t i = 0; i < n; i++) {
        pdest[i] = psrc[i];
    }
    return dest;
}

// --- I/O Port Helper Functions ---

// --- Serial Port Configuration ---

#define SERIAL_DATA_PORT(base)          (base)
#define SERIAL_FIFO_COMMAND_PORT(base)  (base + 2)
#define SERIAL_LINE_COMMAND_PORT(base)  (base + 3)
#define SERIAL_MODEM_COMMAND_PORT(base) (base + 4)
#define SERIAL_LINE_STATUS_PORT(base)   (base + 5)

// SERIAL_LINE_COMMAND_PORT bits
#define SERIAL_LINE_ENABLE_DLAB         0x80 // Enable Divisor Latch Access Bit

void init_serial(uint16_t port) {
    // Disable interrupts
    outb(port + 1, 0x00);

    // Enable DLAB (set baud rate divisor)
    outb(SERIAL_LINE_COMMAND_PORT(port), SERIAL_LINE_ENABLE_DLAB);

    // Set divisor to 3 (lo byte) for 38400 baud (115200 / 3 = 38400)
    outb(SERIAL_DATA_PORT(port), 0x03);
    // Set divisor to 0 (hi byte)
    outb(port + 1, 0x00);

    // Disable DLAB and set line control parameters
    // 8 bits, no parity, one stop bit (8N1)
    outb(SERIAL_LINE_COMMAND_PORT(port), 0x03);

    // Enable FIFO, clear them, with 14-byte threshold
    outb(SERIAL_FIFO_COMMAND_PORT(port), 0xC7);

    // Mark data terminal ready, request to send
    // Out2, RTS, DTR
    outb(SERIAL_MODEM_COMMAND_PORT(port), 0x0B);

    // Enable interrupts again (if desired, for now kept off)
    // outb(port + 1, 0x01); // Enable ERBFI (Received Data Available Interrupt)
}

// Framebuffer request
// Place the framebuffer request in the .requests section.
struct limine_framebuffer_request framebuffer_request __attribute__((section(".requests"))) = {
    .id = LIMINE_FRAMEBUFFER_REQUEST,
    .revision = 0
};

// Place the memory map request in the .requests section.
struct limine_memmap_request memmap_request __attribute__((section(".requests"))) = {
    .id = LIMINE_MEMMAP_REQUEST,
    .revision = 0
};

// Place the HHDM request in the .requests section.
struct limine_hhdm_request hhdm_request __attribute__((section(".requests"))) = {
    .id = LIMINE_HHDM_REQUEST,
    .revision = 0
};

// Global variable to store HHDM offset
uint64_t hhdm_offset = 0;

// Global variables to keep track of cursor position and text colors
static int cursor_x = 0;
static int cursor_y = 0;
static uint32_t text_color = 0xFFFFFF; // White
static uint32_t bg_color = 0x0000FF;   // Blue (to match Limine's default background)
// static const int FONT_WIDTH = 8; // 元の定義はコメントアウトまたは削除
// static const int FONT_HEIGHT = 8;

static int FONT_SCALE = 2; // ★ 文字の拡大率 (1なら等倍、2なら2倍)
static int FONT_DATA_WIDTH = 8;    // フォントデータの実際の幅
static int FONT_DATA_HEIGHT = 8;   // フォントデータの実際の高さ
#define EFFECTIVE_FONT_WIDTH (FONT_DATA_WIDTH * FONT_SCALE)
#define EFFECTIVE_FONT_HEIGHT (FONT_DATA_HEIGHT * FONT_SCALE)

// Function to clear the screen
void clear_screen(struct limine_framebuffer *fb, uint32_t color) {
    for (uint64_t y = 0; y < fb->height; y++) {
        for (uint64_t x = 0; x < fb->width; x++) {
            ((uint32_t*)fb->address)[y * (fb->pitch / 4) + x] = color;
        }
    }
}

// Function to put a character on screen using the new font rendering logic
void put_char(struct limine_framebuffer *fb, char c, int x_pos, int y_pos, uint32_t fg, uint32_t bg) {
    if (fb == NULL || fb->address == NULL) {
        return;
    }
    if ((unsigned char)c >= 128) { // Ignore characters outside ASCII range
        return;
    }

    const uint8_t *glyph = font8x8_basic[(unsigned char)c];

    for (int y = 0; y < FONT_DATA_HEIGHT; y++) { // フォントデータの行 (0-7)
        for (int x = 0; x < FONT_DATA_WIDTH; x++) { // フォントデータの列 (0-7)
            // スケーリングして描画 (背景色も同様に)
            uint32_t current_pixel_color = ((glyph[y] >> x) & 1) ? fg : bg;
            for (int sy = 0; sy < FONT_SCALE; sy++) {
                for (int sx = 0; sx < FONT_SCALE; sx++) {
                    int screen_x = x_pos + (x * FONT_SCALE) + sx;
                    int screen_y = y_pos + (y * FONT_SCALE) + sy;
                    if (screen_y >= 0 && screen_y < (int)fb->height && screen_x >=0 && screen_x < (int)fb->width) {
                        ((uint32_t*)fb->address)[screen_y * (fb->pitch / 4) + screen_x] = current_pixel_color;
                    }
                }
            }
        }
    }
}

// Function to print a string on screen, managing cursor position
void put_string(struct limine_framebuffer *fb, const char *str) {
    if (fb == NULL || fb->address == NULL) {
        return;
    }
    for (size_t i = 0; str[i] != '\0'; i++) {
        if (str[i] == '\n') {
            cursor_x = 0;
            cursor_y += EFFECTIVE_FONT_HEIGHT;
        } else if (str[i] == '\r') {
            cursor_x = 0;
        } else {
            // Handle line wrapping
            if (cursor_x + EFFECTIVE_FONT_WIDTH > (int)fb->width) {
                cursor_x = 0;
                cursor_y += EFFECTIVE_FONT_HEIGHT;
            }
            // Simple scroll logic
            if (cursor_y + EFFECTIVE_FONT_HEIGHT > (int)fb->height) {
                clear_screen(fb, bg_color);
                cursor_x = 0;
                cursor_y = 0;
            }
            put_char(fb, str[i], cursor_x, cursor_y, text_color, bg_color);
            cursor_x += EFFECTIVE_FONT_WIDTH;
        }
    }
}

// Function to convert a hexadecimal number to a string for display
void put_hex(struct limine_framebuffer *fb, uint64_t h) {
    char buf[17]; // "0x" + 16 hex digits + null
    buf[0] = '0';
    buf[1] = 'x';
    int i = 15 + 2; // start from the end for digits
    buf[i--] = '\0';
    if (h == 0) {
        buf[i--] = '0';
    } else {
        while (h > 0) {
            uint8_t digit = h % 16;
            if (digit < 10) {
                buf[i--] = '0' + digit;
            } else {
                buf[i--] = 'A' + (digit - 10);
            }
            h /= 16;
        }
    }
    // Move valid hex digits to the start of the buffer after "0x"
    int j = 2;
    while(++i < 15 + 2) { // ++i to skip to the first valid digit
        if (buf[i] != '\0') { // Check if it's part of the number
            buf[j++] = buf[i];
        }
    }
    buf[j] = '\0'; // Null terminate the potentially shorter string

    put_string(fb, buf);
}

// Kernel entry point
void _start(void) {
    // Initialize serial port COM1 first for early debugging
    init_serial(SERIAL_COM1_BASE);
    print_serial(SERIAL_COM1_BASE, "Serial port initialized!\n");

    // DBG log for framebuffer address from Limine
    if (framebuffer_request.response != NULL &&
        framebuffer_request.response->framebuffer_count > 0 &&
        framebuffer_request.response->framebuffers[0] != NULL) {
        DBG(framebuffer_request.response->framebuffers[0]->address);
    } else {
        print_serial(SERIAL_COM1_BASE, "DBG: Framebuffer not available early.\n");
    }

    // Log framebuffer physical address EARLY
    if (LIMINE_BASE_REVISION_SUPPORTED == 0) { // Check if Limine base revision is supported
        print_serial(SERIAL_COM1_BASE, "Limine base revision not supported!\n");
    } else if (framebuffer_request.response == NULL) {
        print_serial(SERIAL_COM1_BASE, "EARLY CHECK: framebuffer_request.response IS NULL\n");
    } else if (framebuffer_request.response->framebuffer_count < 1) {
        print_serial(SERIAL_COM1_BASE, "EARLY CHECK: framebuffer_request.response->framebuffer_count IS < 1\n");
    } else if (framebuffer_request.response->framebuffers[0] == NULL) {
        print_serial(SERIAL_COM1_BASE, "EARLY CHECK: framebuffer_request.response->framebuffers[0] IS NULL\n");
    } else {
        print_serial(SERIAL_COM1_BASE, "EARLY CHECK: FB phys from Limine: 0x");
        print_serial_hex(SERIAL_COM1_BASE, (uint64_t)framebuffer_request.response->framebuffers[0]->address);
        print_serial(SERIAL_COM1_BASE, "\n");
    }

    // Get HHDM offset
    if (hhdm_request.response == NULL) {
        print_serial(SERIAL_COM1_BASE, "ERROR: No HHDM response from Limine! Halting.\n");
        for (;;) { asm volatile("cli; hlt"); }
    }
    hhdm_offset = hhdm_request.response->offset;
    print_serial(SERIAL_COM1_BASE, "HHDM offset: 0x");
    print_serial_hex(SERIAL_COM1_BASE, hhdm_offset);
    print_serial(SERIAL_COM1_BASE, "\n");

    // Initialize GDT
    init_gdt();
    print_serial(SERIAL_COM1_BASE, "GDT initialized and loaded.\n");

    // Initialize IDT
    init_idt();
    print_serial(SERIAL_COM1_BASE, "IDT initialized and loaded.\n");
    asm volatile ("sti");
    print_serial(SERIAL_COM1_BASE, "Interrupts enabled (STI).\n");

    print_serial(SERIAL_COM1_BASE, "Attempting to retrieve memory map...\n");
    if (memmap_request.response == NULL) {
        print_serial(SERIAL_COM1_BASE, "ERROR: Limine memory map request failed or response is NULL. Halting.\n");
        for (;;) { asm volatile ("cli; hlt"); }
    }
    struct limine_memmap_response *memmap_resp = memmap_request.response;
    print_serial(SERIAL_COM1_BASE, "Memory map response received.\n");
    print_serial(SERIAL_COM1_BASE, "Number of memory map entries: ");
    print_serial_utoa(SERIAL_COM1_BASE, memmap_resp->entry_count);
    print_serial(SERIAL_COM1_BASE, "\n");

    // Print memory map entries for debugging
    for (uint64_t i = 0; i < memmap_resp->entry_count; i++) {
        struct limine_memmap_entry *entry = memmap_resp->entries[i];
        print_serial(SERIAL_COM1_BASE, "Entry "); print_serial_utoa(SERIAL_COM1_BASE, i);
        print_serial(SERIAL_COM1_BASE, ": Base: 0x"); print_serial_hex(SERIAL_COM1_BASE, entry->base);
        print_serial(SERIAL_COM1_BASE, ", Length: 0x"); print_serial_hex(SERIAL_COM1_BASE, entry->length);
        print_serial(SERIAL_COM1_BASE, " ("); print_serial_utoa(SERIAL_COM1_BASE, entry->length); print_serial(SERIAL_COM1_BASE, " bytes), Type: ");
        switch (entry->type) {
            case LIMINE_MEMMAP_USABLE: print_serial(SERIAL_COM1_BASE, "USABLE"); break;
            case LIMINE_MEMMAP_RESERVED: print_serial(SERIAL_COM1_BASE, "RESERVED"); break;
            case LIMINE_MEMMAP_ACPI_RECLAIMABLE: print_serial(SERIAL_COM1_BASE, "ACPI RECLAIMABLE"); break;
            case LIMINE_MEMMAP_ACPI_NVS: print_serial(SERIAL_COM1_BASE, "ACPI NVS"); break;
            case LIMINE_MEMMAP_BAD_MEMORY: print_serial(SERIAL_COM1_BASE, "BAD MEMORY"); break;
            case LIMINE_MEMMAP_BOOTLOADER_RECLAIMABLE: print_serial(SERIAL_COM1_BASE, "BOOTLOADER RECLAIMABLE"); break;
            case LIMINE_MEMMAP_KERNEL_AND_MODULES: print_serial(SERIAL_COM1_BASE, "KERNEL AND MODULES"); break;
            case LIMINE_MEMMAP_FRAMEBUFFER: print_serial(SERIAL_COM1_BASE, "FRAMEBUFFER"); break;
            default: print_serial(SERIAL_COM1_BASE, "UNKNOWN"); break;
        }
        print_serial(SERIAL_COM1_BASE, "\n");
    }
    print_serial(SERIAL_COM1_BASE, "Finished printing memory map.\n");

    if (framebuffer_request.response == NULL || framebuffer_request.response->framebuffer_count < 1) {
        print_serial(SERIAL_COM1_BASE, "ERROR: Limine framebuffer request failed or no framebuffers. Halting.\n");
        for (;;) { asm volatile ("cli; hlt"); }
    }
    struct limine_framebuffer_response *fb_resp = framebuffer_request.response;

    // Initialize Physical Memory Manager (PMM)
    // This must be called BEFORE paging is initialized if paging itself needs to allocate pages from PMM.
    print_serial(SERIAL_COM1_BASE, "Initializing PMM...\n");
    init_pmm(memmap_resp);
    print_serial(SERIAL_COM1_BASE, "PMM initialized. Free pages: ");
    print_serial_utoa(SERIAL_COM1_BASE, pmm_get_free_page_count());
    print_serial(SERIAL_COM1_BASE, "\n");

    // Allocate pages for the new kernel stack
#define KERNEL_STACK_PAGES 4 // Allocate 16KB for the stack
    uint64_t kernel_stack_phys_bottom = 0;
    uint64_t kernel_stack_phys_top_page_start_addr = 0; // Physical address of the start of the highest page of the stack

    print_serial(SERIAL_COM1_BASE, "Allocating kernel stack (");
    print_serial_utoa(SERIAL_COM1_BASE, KERNEL_STACK_PAGES);
    print_serial(SERIAL_COM1_BASE, " pages)...\n");

    for (int i = 0; i < KERNEL_STACK_PAGES; i++) {
        void* page = pmm_alloc_page();
        if (!page) {
            panic("Failed to allocate page for kernel stack");
        }
        if (i == 0) {
            kernel_stack_phys_bottom = (uint64_t)page;
        }
        if (i == KERNEL_STACK_PAGES - 1) { // This is the highest address page
            kernel_stack_phys_top_page_start_addr = (uint64_t)page;
        }
        // For simplicity, we are assuming PMM gives contiguous pages if we were to build a larger single stack segment.
        // However, for our purpose, as long as init_paging maps all these KERNEL_STACK_PAGES pages contiguously in virtual memory (or just ensures they are all mapped),
        // and we set RSP to the top of the highest mapped physical page, it should work.
        // For this iteration, we will pass the bottom address and total size, assuming init_paging will map this entire range.
    }

    uint64_t kernel_stack_size = KERNEL_STACK_PAGES * PAGE_SIZE;
    print_serial(SERIAL_COM1_BASE, "Kernel stack allocated. Bottom P:0x");
    print_serial_hex(SERIAL_COM1_BASE, kernel_stack_phys_bottom);
    print_serial(SERIAL_COM1_BASE, ", Top Page Start P:0x");
    print_serial_hex(SERIAL_COM1_BASE, kernel_stack_phys_top_page_start_addr);
    print_serial(SERIAL_COM1_BASE, ", Total Size: 0x");
    print_serial_hex(SERIAL_COM1_BASE, kernel_stack_size);
    print_serial(SERIAL_COM1_BASE, "\n");

    // Calculate the virtual top of the new kernel stack for RSP
    // RSP should point to the very top (highest address) of the stack space.
    // kernel_stack_phys_top_page_start_addr is the start of the highest page.
    // So, top of stack is (start of highest page + PAGE_SIZE).
    uint64_t new_rsp_virt_top = (kernel_stack_phys_top_page_start_addr + PAGE_SIZE) + hhdm_offset;

    print_serial(SERIAL_COM1_BASE, "Calculated new RSP virtual top: 0x");
    print_serial_hex(SERIAL_COM1_BASE, new_rsp_virt_top);
    print_serial(SERIAL_COM1_BASE, "\n");

    // Initialize Paging System. This function will not return.
    print_serial(SERIAL_COM1_BASE, "Calling init_paging (will not return)...\n");
    init_paging(fb_resp, memmap_resp, kernel_stack_phys_bottom, kernel_stack_size, new_rsp_virt_top);

    // Control should not reach here because init_paging is noreturn.
    print_serial(SERIAL_COM1_BASE, "ERROR: init_paging returned! This should not happen.\n");
    for (;;) { asm volatile ("cli; hlt"); }
}
