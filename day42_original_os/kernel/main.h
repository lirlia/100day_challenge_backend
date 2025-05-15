#ifndef KERNEL_MAIN_H
#define KERNEL_MAIN_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include "limine.h"

// --- Constants ---
#define SERIAL_COM1_BASE 0x3F8

// Font dimensions (assuming 8x8 font for scaling purposes)
#define FONT_DATA_WIDTH 8
#define FONT_DATA_HEIGHT 8

// Effective dimensions after scaling
#define EFFECTIVE_FONT_WIDTH (FONT_DATA_WIDTH * FONT_SCALE)
#define EFFECTIVE_FONT_HEIGHT (FONT_DATA_HEIGHT * FONT_SCALE)

// --- Color Definitions (Add more as needed) ---
#define COLOR_BLACK          0x000000
#define COLOR_WHITE          0xFFFFFF
#define COLOR_RED            0xFF0000
#define COLOR_GREEN          0x00FF00
#define COLOR_BLUE           0x0000FF
#define COLOR_YELLOW         0xFFFF00
#define COLOR_CYAN           0x00FFFF
#define COLOR_MAGENTA        0xFF00FF
#define COLOR_GRAY           0x808080
#define COLOR_LIGHT_GRAY     0xC0C0C0
#define COLOR_DARK_GRAY      0x404040
#define COLOR_LIGHT_RED      0xFF8080
#define COLOR_LIGHT_GREEN    0x80FF80
#define COLOR_LIGHT_BLUE     0x8080FF
#define COLOR_LIGHT_YELLOW   0xFFFF80
#define COLOR_LIGHT_CYAN     0x80FFFF  // Previously missing, added based on error
#define COLOR_LIGHT_MAGENTA  0xFF80FF
#define COLOR_DARK_SLATE_GRAY 0x2F4F4F // Previously missing, added based on error

// --- Global Variables (declared here, defined in main.c) ---
extern struct limine_framebuffer *framebuffer;
extern uint64_t hhdm_offset;

// Drawing state (declared extern here, defined in main.c)
extern int cursor_x;
extern int cursor_y;
extern int FONT_SCALE;
extern uint32_t text_color;
extern uint32_t bg_color;

// From apic.c (or apic.h)
extern volatile uint64_t tick_counter;

// --- Structure Definitions (if not elsewhere) ---
struct kernel_addr {
    uint64_t physical_base;
    uint64_t virtual_base;
    // uint64_t size; // If needed
};

// --- Function Prototypes ---
void _start(void) __attribute__((noreturn));
void hcf(void) __attribute__((noreturn)); // Halt and catch fire

// Memory utility functions
void *memcpy(void *dest, const void *src, size_t n);
void *memset(void *s, int c, size_t n);

// String conversion utilities
void uint64_to_dec_str(uint64_t value, char *buffer);
void uint64_to_hex_str(uint64_t value, char *buffer);

// Panic function
void panic(const char *message) __attribute__((noreturn));

// Framebuffer drawing functions
void fill_screen(uint32_t color);
void put_char(char c, int x_char_pos, int y_char_pos); // Takes character grid position
void put_string(const char *str);
void put_hex(uint64_t value);

// Added based on compiler errors
void clear_screen_with_color(uint32_t color);
void set_text_color(uint32_t color);
void set_bg_color(uint32_t color);
void put_string_at(const char *s, int x_char_pos, int y_char_pos, uint32_t fg, uint32_t bg);

// Serial output functions
void print_serial(uint16_t port, const char *s); // from serial.h, but ensure consistency
void print_serial_hex(uint16_t port, uint64_t h); // from serial.h
void print_serial_dec(uint16_t port, uint64_t d); // from serial.h
void write_serial_char(uint16_t port, char c); // from serial.h

// Helper serial print functions
void print_serial_str(uint16_t port, const char* str); // Added based on error (print_serial_str without port)
void print_serial_str_hex(uint16_t port, const char* str, uint64_t value);
void print_serial_str_int(uint16_t port, const char* str, uint64_t value);
void put_string_at_serial(const char *s); // Added based on error

// Inline function to get RSP
static inline uint64_t get_rsp(void) {
    uint64_t rsp;
    asm volatile ("mov %%rsp, %0" : "=r" (rsp));
    return rsp;
}

// Add these prototypes
void uint64_to_hex_str(uint64_t value, char *str);
void uint64_to_dec_str(uint64_t value, char *str);

#endif // KERNEL_MAIN_H
