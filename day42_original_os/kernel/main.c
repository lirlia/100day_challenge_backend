#include "limine.h"
#include "main.h"
#include "serial.h"
#include "io.h"
#include "gdt.h"
#include "paging.h"
#include "pmm.h"
#include "idt.h"
#include "apic.h"
#include "font.h"
#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

// --- Limine Requests --- (Keep as static volatile)
static volatile struct limine_framebuffer_request framebuffer_request = { .id = LIMINE_FRAMEBUFFER_REQUEST, .revision = 0 };
static volatile struct limine_memmap_request memmap_request = { .id = LIMINE_MEMMAP_REQUEST, .revision = 0 };
static volatile struct limine_hhdm_request hhdm_request = { .id = LIMINE_HHDM_REQUEST, .revision = 0 };
static volatile struct limine_kernel_address_request kernel_addr_request = { .id = LIMINE_KERNEL_ADDRESS_REQUEST, .revision = 0 };
static volatile struct limine_smp_request smp_request = { .id = LIMINE_SMP_REQUEST, .revision = 0 };

// --- Global variables (Defined here, declared extern in main.h) ---
struct limine_framebuffer *framebuffer = NULL;
uint64_t hhdm_offset = 0;

// Drawing state (Non-static, definitions match extern in main.h)
int cursor_x = 0;
int cursor_y = 0;
int FONT_SCALE = 1;
uint32_t text_color = 0xFFFFFF;
uint32_t bg_color = 0x000000;

// Define KERNEL_STACK_PAGES once at the top level
#define KERNEL_STACK_PAGES 16

extern uint64_t kernel_stack_top_phys; // Re-add TSS related extern

// Kernel entry point
void _start(void) {
    struct kernel_addr kernel_addresses; // Local struct is fine

    // Honor Limine requests (accessing static volatiles is okay)
    if (framebuffer_request.response == NULL || framebuffer_request.response->framebuffer_count < 1) { hcf(); }
    framebuffer = framebuffer_request.response->framebuffers[0];
    if (memmap_request.response == NULL) { hcf(); }
    if (hhdm_request.response == NULL) { hcf(); }
    hhdm_offset = hhdm_request.response->offset;
    if (kernel_addr_request.response == NULL) { hcf(); }
    kernel_addresses.physical_base = kernel_addr_request.response->physical_base;
    kernel_addresses.virtual_base = kernel_addr_request.response->virtual_base;
    if (smp_request.response == NULL) { hcf(); }

    // Initialize serial
    if (init_serial(SERIAL_COM1_BASE) != 0) { /* Handle error? */ }
    print_serial(SERIAL_COM1_BASE, "Serial port initialized.\n");

    // Print Limine info (using helpers that call correct print_serial)
    print_serial_str_hex(SERIAL_COM1_BASE, "HHDM Offset: ", hhdm_offset);
    // ... other print calls ...
    print_serial_str_int(SERIAL_COM1_BASE, "SMP CPU Count: ", smp_request.response->cpu_count);
    // ... other print calls ...

    // Initialize GDT, IDT, PMM
    init_gdt();
    init_idt();
    init_pmm(memmap_request.response, hhdm_offset);
    print_serial(SERIAL_COM1_BASE, "PMM Initialized. Free pages: ");
    print_serial_dec(SERIAL_COM1_BASE, pmm_get_free_page_count());
    print_serial(SERIAL_COM1_BASE, "\n");

    // --- Allocate Kernel Stack ---
    uint64_t stack_phys_bottom = 0;
    uint64_t stack_size = KERNEL_STACK_PAGES * PAGE_SIZE;
    print_serial_str_int(SERIAL_COM1_BASE, "Allocating kernel stack (pages): ", KERNEL_STACK_PAGES);
    stack_phys_bottom = (uint64_t)pmm_alloc_page();
    if (stack_phys_bottom == 0) { panic("Failed to allocate page for kernel stack!"); }
    print_serial_str_hex(SERIAL_COM1_BASE, "Kernel stack allocated. Bottom Phys Addr: ", stack_phys_bottom);
    uint64_t new_rsp_virt_top = (stack_phys_bottom + stack_size - 8) + hhdm_offset;
    print_serial_str_hex(SERIAL_COM1_BASE, "Calculated initial RSP (virtual top): ", new_rsp_virt_top);
    struct limine_framebuffer *fb_for_kernel_main = framebuffer;

    print_serial(SERIAL_COM1_BASE, "Calling init_paging...\n");

    // Call init_paging with correct arguments
    init_paging(
        framebuffer_request.response,
        memmap_request.response,
        stack_phys_bottom,
        stack_size,
        new_rsp_virt_top,
        kernel_main_after_paging, // Function pointer
        fb_for_kernel_main
    );
    hcf(); // Should not return
}

// This is the correct definition called after paging
void kernel_main_after_paging(struct limine_framebuffer *fb_info_virt) {
    framebuffer = fb_info_virt; // Use virtual address

    // Re-add TSS RSP0 setting code
    uint64_t kernel_stack_top_virt = KERNEL_STACK_VIRT_TOP;
    tss_set_rsp0(kernel_stack_top_virt);

    // Access static volatile smp_request
    if (smp_request.response == NULL) {
         print_serial(SERIAL_COM1_BASE, "Error: SMP response unavailable in kernel_main_after_paging! Halting.\n");
         hcf();
    }
    // init_apic call remains
    init_apic(smp_request.response);

    print_serial(SERIAL_COM1_BASE, "Enabling interrupts...\n");
    asm volatile ("sti");

    fill_screen(0x333333);
    text_color = 0xFFFFFF;
    bg_color = 0x333333;
    FONT_SCALE = 2;
    cursor_x = 0;
    cursor_y = 0;

    // Use drawing functions (which now use globals)
    put_string("Hello, kernel from Higher Half!\n");
    put_string("Paging and APIC Timer Initialized.\n");
    put_string("Tick count: ");
    uint64_t last_tick = 0;

    while (1) {
        uint64_t current_tick = tick_counter;
        if (current_tick != last_tick) {
            int saved_x = cursor_x; int saved_y = cursor_y;
            cursor_y = EFFECTIVE_FONT_HEIGHT * 2;
            cursor_x = EFFECTIVE_FONT_WIDTH * 12;
            put_string("          "); // Overwrite
            cursor_y = EFFECTIVE_FONT_HEIGHT * 2;
            cursor_x = EFFECTIVE_FONT_WIDTH * 12;
            put_hex(current_tick);
            cursor_x = saved_x; cursor_y = saved_y;
            last_tick = current_tick;
        }
        asm volatile ("hlt");
    }
}

// --- Utility Functions ---
// (Keep implementations)
void hcf(void) { /* ... */ }
void *memcpy(void *dest, const void *src, size_t n) { return dest; }
void *memset(void *s, int c, size_t n) { return s; }

void uint64_to_dec_str(uint64_t value, char *buffer) {
    if (buffer == NULL) return;
    if (value == 0) {
        buffer[0] = '0';
        buffer[1] = '\0';
        return;
    }
    char temp[21]; // Max 20 digits for uint64_t + null terminator
    int i = 0;
    while (value > 0) {
        temp[i++] = (value % 10) + '0';
        value /= 10;
    }
    int j = 0;
    while (i > 0) {
        buffer[j++] = temp[--i];
    }
    buffer[j] = '\0';
}

void uint64_to_hex_str(uint64_t value, char *buffer) {
    const char *hex_chars = "0123456789ABCDEF";
    if (buffer == NULL) return;
    if (value == 0) {
        buffer[0] = '0';
        buffer[1] = '\0';
        return;
    }
    char temp[17]; // Max 16 hex digits + null terminator
    int i = 0;
    while (value > 0) {
        temp[i++] = hex_chars[value % 16];
        value /= 16;
    }
    int j = 0;
    while (i > 0) {
        buffer[j++] = temp[--i];
    }
    buffer[j] = '\0';
}

// NEW panic function implementation
void panic(const char *message) {
    print_serial(SERIAL_COM1_BASE, "KERNEL PANIC: ");
    print_serial(SERIAL_COM1_BASE, message);
    print_serial(SERIAL_COM1_BASE, "\nSystem Halted.\n");
    hcf(); // Halt the system
}

// --- Framebuffer Drawing Functions (Definitions) ---
// Definitions MUST match declarations in main.h (no fb argument)
void fill_screen(uint32_t color) {
    if (!framebuffer || !framebuffer->address) return;
    // Assuming bpp is 32, framebuffer->address is uint32_t aligned.
    // Pitch is in bytes. Width and height are in pixels.
    uint32_t *fb_ptr = (uint32_t *)framebuffer->address;
    uint64_t pitch_in_pixels = framebuffer->pitch / (framebuffer->bpp / 8);

    for (uint64_t y = 0; y < framebuffer->height; y++) {
        for (uint64_t x = 0; x < framebuffer->width; x++) {
            fb_ptr[y * pitch_in_pixels + x] = color;
        }
    }
    // Reset cursor after filling
    cursor_x = 0;
    cursor_y = 0;
}

// Updated put_char implementation with integrated scaling
void put_char(char c, int x_char_pos, int y_char_pos) {
    if (!framebuffer || !framebuffer->address) return;
    if ((uint8_t)c >= 128) c = '?'; // Handle out-of-range ASCII
    const uint8_t* glyph = font8x8_basic[(uint8_t)c];

    // Calculate base screen coordinates (top-left corner of the scaled character cell)
    int base_screen_x = x_char_pos * FONT_DATA_WIDTH * FONT_SCALE;
    int base_screen_y = y_char_pos * FONT_DATA_HEIGHT * FONT_SCALE;

    uint32_t *fb_ptr = (uint32_t *)framebuffer->address;
    // Calculate pitch in terms of pixels (uint32_t elements)
    uint64_t pitch_in_pixels = framebuffer->pitch / (framebuffer->bpp / 8);

    for (int cy = 0; cy < FONT_DATA_HEIGHT; cy++) { // Loop rows (font data y)
        uint8_t row_bits = glyph[cy]; // Get the bitmap for the current row
        for (int cx = 0; cx < FONT_DATA_WIDTH; cx++) { // Loop columns (font data x)
            // Determine color based on font bitmap bit
            // Corrected logic: Check bits from LSB (0) to MSB (7) as cx increases
            uint32_t pixel_color = (row_bits & (1 << cx)) ? text_color : bg_color;

            // Draw the scaled pixel block
            for (int sy = 0; sy < FONT_SCALE; sy++) { // Scale Y loop
                for (int sx = 0; sx < FONT_SCALE; sx++) { // Scale X loop
                    int final_x = base_screen_x + cx * FONT_SCALE + sx;
                    int final_y = base_screen_y + cy * FONT_SCALE + sy;

                    // Bounds check before writing to framebuffer
                    if (final_x >= 0 && (uint64_t)final_x < framebuffer->width &&
                        final_y >= 0 && (uint64_t)final_y < framebuffer->height) {
                        fb_ptr[final_y * pitch_in_pixels + final_x] = pixel_color;
                    }
                }
            }
        }
    }
}

// Definition matching main.h declaration: void put_string(const char *str);
void put_string(const char *str) {
    if (!framebuffer || !framebuffer->address) return;
    for (int i = 0; str[i] != '\0'; i++) {
        char c = str[i];
        if (c == '\n') {
            cursor_x = 0;
            cursor_y += EFFECTIVE_FONT_HEIGHT;
        } else if (c == '\r') {
            cursor_x = 0;
        } else {
            if (cursor_x + EFFECTIVE_FONT_WIDTH > (int)framebuffer->width) {
                cursor_x = 0;
                cursor_y += EFFECTIVE_FONT_HEIGHT;
            }
            if (cursor_y + EFFECTIVE_FONT_HEIGHT > (int)framebuffer->height) {
                fill_screen(bg_color);
                cursor_x = 0;
                cursor_y = 0;
            }
            // Pass character grid coordinates
            put_char(c, cursor_x / EFFECTIVE_FONT_WIDTH, cursor_y / EFFECTIVE_FONT_HEIGHT);
            cursor_x += EFFECTIVE_FONT_WIDTH;
        }
    }
}

// Definition matching main.h declaration: void put_hex(uint64_t value);
void put_hex(uint64_t value) {
    char hex_str[17];
    uint64_to_hex_str(value, hex_str);
    put_string("0x");
    put_string(hex_str);
}

// --- Serial Port Helper Functions ---
// (Implementations - assuming print_serial, uint64_to_hex/dec exist)
void print_serial_str_hex(uint16_t port, const char* str, uint64_t value) {
    print_serial(port, str);
    char hex_str[17];
    uint64_to_hex_str(value, hex_str);
    print_serial(port, hex_str);
    print_serial(port, "\n");
}
void print_serial_str_int(uint16_t port, const char* str, uint64_t value) {
    print_serial(port, str);
    char int_str[21];
    uint64_to_dec_str(value, int_str);
    print_serial(port, int_str);
    print_serial(port, "\n");
}
