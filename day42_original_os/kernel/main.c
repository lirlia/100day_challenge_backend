#include "limine.h"
#include <stdint.h>
#include <stddef.h>
#include "font8x8_basic.h"
#include "gdt.h"
#include "idt.h"
#include "pmm.h"
#include "io.h"
#include "paging.h"

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

int is_transmit_empty(uint16_t port) {
   return inb(SERIAL_LINE_STATUS_PORT(port)) & 0x20; // Check if THR empty
}

void write_serial_char(uint16_t port, char a) {
   while (is_transmit_empty(port) == 0); // Wait until THR is empty
   outb(SERIAL_DATA_PORT(port), a);
}

void print_serial(uint16_t port, const char *s) {
    for (int i = 0; s[i] != '\0'; i++) {
        write_serial_char(port, s[i]);
    }
}

// Helper to print unsigned 64-bit int to serial in hex
void print_serial_hex(uint16_t port, uint64_t h) {
    char buf[19]; // "0x" + 16 hex digits + null
    char *s = &buf[18]; // Start from the end
    *s = '\0';

    if (h == 0) {
        *--s = '0';
    } else {
        while (h > 0) {
            uint8_t digit = h % 16;
            if (digit < 10) {
                *--s = '0' + digit;
            } else {
                *--s = 'A' + (digit - 10);
            }
            h /= 16;
        }
    }
    *--s = 'x';
    *--s = '0';
    print_serial(port, s);
}

// Helper to print unsigned 64-bit int to serial in decimal
void print_serial_utoa(uint16_t port, uint64_t u) {
    char buf[21]; // buf should be at least 21 bytes for uint64_t
    char *s = &buf[20]; // Start from the end
    *s = '\0';

    if (u == 0) {
        *--s = '0';
    } else {
        while (u > 0) {
            *--s = (u % 10) + '0';
            u /= 10;
        }
    }
    print_serial(port, s);
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

    // Enable interrupts (VERY IMPORTANT AFTER IDT IS LOADED)
    asm volatile ("sti");
    print_serial(SERIAL_COM1_BASE, "Interrupts enabled (STI).\n");

    print_serial(SERIAL_COM1_BASE, "Attempting to retrieve memory map...\n");
    if (memmap_request.response == NULL) {
        print_serial(SERIAL_COM1_BASE, "ERROR: No memory map response from Limine! Halting.\n");
        // It's critical to halt if we don't get a memory map.
        for (;;) { asm volatile("cli; hlt"); }
    }
    print_serial(SERIAL_COM1_BASE, "Memory map response received.\n");
    print_serial(SERIAL_COM1_BASE, "Number of memory map entries: ");
    print_serial_utoa(SERIAL_COM1_BASE, memmap_request.response->entry_count);
    print_serial(SERIAL_COM1_BASE, "\n");

    for (uint64_t i = 0; i < memmap_request.response->entry_count; i++) {
        struct limine_memmap_entry *entry = memmap_request.response->entries[i];

        print_serial(SERIAL_COM1_BASE, "Entry ");
        print_serial_utoa(SERIAL_COM1_BASE, i);
        print_serial(SERIAL_COM1_BASE, ": Base: ");
        print_serial_hex(SERIAL_COM1_BASE, entry->base);
        print_serial(SERIAL_COM1_BASE, ", Length: ");
        print_serial_hex(SERIAL_COM1_BASE, entry->length);
        print_serial(SERIAL_COM1_BASE, " (");
        print_serial_utoa(SERIAL_COM1_BASE, entry->length); // Also print length in decimal for readability
        print_serial(SERIAL_COM1_BASE, " bytes)");
        print_serial(SERIAL_COM1_BASE, ", Type: ");

        switch (entry->type) {
            case LIMINE_MEMMAP_USABLE: print_serial(SERIAL_COM1_BASE, "USABLE"); break;
            case LIMINE_MEMMAP_RESERVED: print_serial(SERIAL_COM1_BASE, "RESERVED"); break;
            case LIMINE_MEMMAP_ACPI_RECLAIMABLE: print_serial(SERIAL_COM1_BASE, "ACPI RECLAIMABLE"); break;
            case LIMINE_MEMMAP_ACPI_NVS: print_serial(SERIAL_COM1_BASE, "ACPI NVS"); break;
            case LIMINE_MEMMAP_BAD_MEMORY: print_serial(SERIAL_COM1_BASE, "BAD MEMORY"); break;
            case LIMINE_MEMMAP_BOOTLOADER_RECLAIMABLE: print_serial(SERIAL_COM1_BASE, "BOOTLOADER RECLAIMABLE"); break;
            case LIMINE_MEMMAP_KERNEL_AND_MODULES: print_serial(SERIAL_COM1_BASE, "KERNEL AND MODULES"); break;
            case LIMINE_MEMMAP_FRAMEBUFFER: print_serial(SERIAL_COM1_BASE, "FRAMEBUFFER"); break;
            default:
                print_serial(SERIAL_COM1_BASE, "UNKNOWN (");
                print_serial_utoa(SERIAL_COM1_BASE, entry->type);
                print_serial(SERIAL_COM1_BASE, ")");
                break;
        }
        print_serial(SERIAL_COM1_BASE, "\n");
    }
    print_serial(SERIAL_COM1_BASE, "Finished printing memory map.\n");

    // Initialize Physical Memory Manager
    print_serial(SERIAL_COM1_BASE, "Initializing PMM...\n");
    init_pmm(memmap_request.response);
    print_serial(SERIAL_COM1_BASE, "PMM initialized. Free pages: ");
    print_serial_utoa(SERIAL_COM1_BASE, pmm_get_free_page_count());
    print_serial(SERIAL_COM1_BASE, "\n");

    // Initialize Paging
    init_paging();

    // PMM Test Allocations & Deallocations
    print_serial(SERIAL_COM1_BASE, "--- PMM Allocation Test ---\n");
    void *p1 = pmm_alloc_page();
    print_serial(SERIAL_COM1_BASE, "Allocated p1: 0x"); print_serial_hex(SERIAL_COM1_BASE, (uint64_t)p1); print_serial(SERIAL_COM1_BASE, "\n");
    print_serial(SERIAL_COM1_BASE, "Free pages after p1: "); print_serial_utoa(SERIAL_COM1_BASE, pmm_get_free_page_count()); print_serial(SERIAL_COM1_BASE, "\n");

    void *p2 = pmm_alloc_page();
    print_serial(SERIAL_COM1_BASE, "Allocated p2: 0x"); print_serial_hex(SERIAL_COM1_BASE, (uint64_t)p2); print_serial(SERIAL_COM1_BASE, "\n");
    print_serial(SERIAL_COM1_BASE, "Free pages after p2: "); print_serial_utoa(SERIAL_COM1_BASE, pmm_get_free_page_count()); print_serial(SERIAL_COM1_BASE, "\n");

    void *p3 = pmm_alloc_page();
    print_serial(SERIAL_COM1_BASE, "Allocated p3: 0x"); print_serial_hex(SERIAL_COM1_BASE, (uint64_t)p3); print_serial(SERIAL_COM1_BASE, "\n");
    print_serial(SERIAL_COM1_BASE, "Free pages after p3: "); print_serial_utoa(SERIAL_COM1_BASE, pmm_get_free_page_count()); print_serial(SERIAL_COM1_BASE, "\n");

    print_serial(SERIAL_COM1_BASE, "Freeing p2...\n");
    pmm_free_page(p2);
    print_serial(SERIAL_COM1_BASE, "Free pages after freeing p2: "); print_serial_utoa(SERIAL_COM1_BASE, pmm_get_free_page_count()); print_serial(SERIAL_COM1_BASE, "\n");

    print_serial(SERIAL_COM1_BASE, "Freeing p1...\n");
    pmm_free_page(p1);
    print_serial(SERIAL_COM1_BASE, "Free pages after freeing p1: "); print_serial_utoa(SERIAL_COM1_BASE, pmm_get_free_page_count()); print_serial(SERIAL_COM1_BASE, "\n");

    void *p4 = pmm_alloc_page(); // Should get p1 or p2's address if stack works LIFO
    print_serial(SERIAL_COM1_BASE, "Allocated p4: 0x"); print_serial_hex(SERIAL_COM1_BASE, (uint64_t)p4); print_serial(SERIAL_COM1_BASE, "\n");
    print_serial(SERIAL_COM1_BASE, "Free pages after p4: "); print_serial_utoa(SERIAL_COM1_BASE, pmm_get_free_page_count()); print_serial(SERIAL_COM1_BASE, "\n");
    print_serial(SERIAL_COM1_BASE, "--- PMM Allocation Test Done ---\n");

    // Ensure we have a framebuffer.
    if (framebuffer_request.response == NULL ||
        framebuffer_request.response->framebuffer_count < 1) {
        print_serial(SERIAL_COM1_BASE, "ERROR: No framebuffer found! Halting.\n");
        for (;;) { asm volatile ("hlt"); }
    }
    print_serial(SERIAL_COM1_BASE, "Framebuffer request successful.\n");

    // Get the first framebuffer.
    struct limine_framebuffer *framebuffer = framebuffer_request.response->framebuffers[0];
    print_serial(SERIAL_COM1_BASE, "Got framebuffer pointer.\n");

    // Clear screen to the global background color
    clear_screen(framebuffer, bg_color); // bg_color を使用
    cursor_x = 0; // Reset cursor position
    cursor_y = 0;

    // Set text color for the first message
    text_color = 0xFFFFFF; // White
    put_string(framebuffer, "Hello, Limine Kernel with 8x8 Font!\n");

    text_color = 0xFFFF00; // Yellow for next message
    put_string(framebuffer, "Framebuffer found!\n");

    // Restore default text color for general info
    text_color = 0xFFFFFF; // White

    put_string(framebuffer, "Screen Resolution: ");
    char num_buf[32];
    uint64_t val = framebuffer->width;
    int k = 0;
    if (val == 0) num_buf[k++] = '0';
    else {
        char temp_buf[32];
        int tk = 0;
        while(val > 0) { temp_buf[tk++] = (val % 10) + '0'; val /= 10; }
        while(tk > 0) num_buf[k++] = temp_buf[--tk];
    }
    num_buf[k] = '\0';
    put_string(framebuffer, num_buf);

    put_string(framebuffer, "x");

    val = framebuffer->height;
    k = 0;
    if (val == 0) num_buf[k++] = '0';
    else {
        char temp_buf[32];
        int tk = 0;
        while(val > 0) { temp_buf[tk++] = (val % 10) + '0'; val /= 10; }
        while(tk > 0) num_buf[k++] = temp_buf[--tk];
    }
    num_buf[k] = '\0';
    put_string(framebuffer, num_buf);
    put_string(framebuffer, "\n");

    put_string(framebuffer, "Framebuffer address: ");
    put_hex(framebuffer, (uint64_t)framebuffer->address);
    put_string(framebuffer, "\n");
    put_string(framebuffer, "Pitch: ");

    val = framebuffer->pitch;
    k = 0;
    if (val == 0) num_buf[k++] = '0';
    else {
        char temp_buf[32];
        int tk = 0;
        while(val > 0) { temp_buf[tk++] = (val % 10) + '0'; val /= 10; }
        while(tk > 0) num_buf[k++] = temp_buf[--tk];
    }
    num_buf[k] = '\0';
    put_string(framebuffer, num_buf);

    put_string(framebuffer, "\nAll lowercase and uppercase letters:\n");
    for (char c_loop = 'a'; c_loop <= 'z'; c_loop++) { // Renamed c to c_loop to avoid conflict with previous c
        char temp_str[2] = {c_loop, '\0'};
        put_string(framebuffer, temp_str);
    }
    put_string(framebuffer, "\n");
    for (char c_loop = 'A'; c_loop <= 'Z'; c_loop++) { // Renamed c to c_loop
        char temp_str[2] = {c_loop, '\0'};
        put_string(framebuffer, temp_str);
    }
    put_string(framebuffer, "\nNumbers and Symbols:\n");
    for (char c_loop = '0'; c_loop <= '9'; c_loop++) { // Renamed c to c_loop
        char temp_str[2] = {c_loop, '\0'};
        put_string(framebuffer, temp_str);
    }
    char symbols[] = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"; // Escaped characters
    for (size_t idx = 0; symbols[idx] != '\0'; ++idx) { // Renamed i to idx
        char temp_str[2] = {symbols[idx], '\0'};
        put_string(framebuffer, temp_str);
    }
    put_string(framebuffer, "\nEnd of test characters.\n");

    // Halt the system.
    for (;;) { __asm__ volatile ("hlt"); }
}
