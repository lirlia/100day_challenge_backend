#ifndef KERNEL_MAIN_H
#define KERNEL_MAIN_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include "limine.h"

// --- Global Variables (declared in main.c) ---
extern struct limine_framebuffer *framebuffer;
extern uint64_t hhdm_offset;

// Drawing state
extern int cursor_x;
extern int cursor_y;
extern int FONT_SCALE;
extern uint32_t text_color;
extern uint32_t bg_color;

// From apic.c (or apic.h)
extern volatile uint64_t tick_counter;

// --- Constants for Framebuffer Drawing ---
#define FONT_DATA_WIDTH 8
#define FONT_DATA_HEIGHT 8
#define EFFECTIVE_FONT_WIDTH (FONT_DATA_WIDTH * FONT_SCALE)
#define EFFECTIVE_FONT_HEIGHT (FONT_DATA_HEIGHT * FONT_SCALE)

// --- Structure Definitions (if not elsewhere) ---
struct kernel_addr {
    uint64_t physical_base;
    uint64_t virtual_base;
    // uint64_t size; // If needed
};

// --- Function Prototypes (defined in main.c or other .c files) ---

// Entry point for kernel after paging
void kernel_main_after_paging(struct limine_framebuffer *fb_info_virt);

// Utility functions from main.c
void hcf(void);
void *memcpy(void *dest, const void *src, size_t n);
void *memset(void *s, int c, size_t n);
void uint64_to_dec_str(uint64_t value, char *buffer);
void uint64_to_hex_str(uint64_t value, char *buffer);
void panic(const char *message);

// Framebuffer drawing functions from main.c (or font.c if moved)
void fill_screen(uint32_t color);
// void put_pixel_scaled(int x_unscaled, int y_unscaled, uint32_t color); // Removed
void put_char(char c, int x_char_pos, int y_char_pos); // Takes CHARACTER grid coordinates
void put_string(const char *str);
void put_hex(uint64_t value);

// Serial helper functions (prototypes might be in serial.h, but also used by main.c helpers)
// If these are in serial.h and included by main.c, these are redundant here unless main.c implements them.
// Assuming print_serial_str_hex and print_serial_str_int are specific to main.c for now.
void print_serial_str_hex(uint16_t port, const char* str, uint64_t value);
void print_serial_str_int(uint16_t port, const char* str, uint64_t value);


#endif // KERNEL_MAIN_H
