#include "../include/kernel.h"

/* VGA text mode driver */
static u16* vga_buffer = (u16*)VGA_MEMORY;
static u8 vga_color = 0x07; /* White text on black background */
static u8 vga_x = 0;
static u8 vga_y = 0;

/* VGA color constants */
enum vga_color {
    VGA_COLOR_BLACK = 0,
    VGA_COLOR_BLUE = 1,
    VGA_COLOR_GREEN = 2,
    VGA_COLOR_CYAN = 3,
    VGA_COLOR_RED = 4,
    VGA_COLOR_MAGENTA = 5,
    VGA_COLOR_BROWN = 6,
    VGA_COLOR_LIGHT_GREY = 7,
    VGA_COLOR_DARK_GREY = 8,
    VGA_COLOR_LIGHT_BLUE = 9,
    VGA_COLOR_LIGHT_GREEN = 10,
    VGA_COLOR_LIGHT_CYAN = 11,
    VGA_COLOR_LIGHT_RED = 12,
    VGA_COLOR_LIGHT_MAGENTA = 13,
    VGA_COLOR_LIGHT_BROWN = 14,
    VGA_COLOR_WHITE = 15,
};

static u8 vga_entry_color(u8 fg, u8 bg) {
    return fg | bg << 4;
}

static u16 vga_entry(char c, u8 color) {
    return (u16)c | (u16)color << 8;
}

void vga_init(void) {
    vga_color = vga_entry_color(VGA_COLOR_LIGHT_GREY, VGA_COLOR_BLACK);
    vga_x = 0;
    vga_y = 0;
    vga_clear();
}

void vga_clear(void) {
    for (u8 y = 0; y < VGA_HEIGHT; y++) {
        for (u8 x = 0; x < VGA_WIDTH; x++) {
            const u32 index = y * VGA_WIDTH + x;
            vga_buffer[index] = vga_entry(' ', vga_color);
        }
    }
    vga_x = 0;
    vga_y = 0;
}

void vga_set_color(u8 foreground, u8 background) {
    vga_color = vga_entry_color(foreground, background);
}

static void vga_scroll(void) {
    /* Move all lines up by one */
    for (u8 y = 1; y < VGA_HEIGHT; y++) {
        for (u8 x = 0; x < VGA_WIDTH; x++) {
            vga_buffer[(y - 1) * VGA_WIDTH + x] = vga_buffer[y * VGA_WIDTH + x];
        }
    }

    /* Clear the last line */
    for (u8 x = 0; x < VGA_WIDTH; x++) {
        vga_buffer[(VGA_HEIGHT - 1) * VGA_WIDTH + x] = vga_entry(' ', vga_color);
    }

    vga_y = VGA_HEIGHT - 1;
}

void vga_putchar(char c) {
    if (c == '\n') {
        vga_x = 0;
        vga_y++;
    } else if (c == '\r') {
        vga_x = 0;
    } else if (c == '\t') {
        vga_x = (vga_x + 8) & ~(8 - 1);
    } else if (c == '\b') {
        if (vga_x > 0) {
            vga_x--;
        }
    } else {
        const u32 index = vga_y * VGA_WIDTH + vga_x;
        vga_buffer[index] = vga_entry(c, vga_color);
        vga_x++;
    }

    if (vga_x >= VGA_WIDTH) {
        vga_x = 0;
        vga_y++;
    }

    if (vga_y >= VGA_HEIGHT) {
        vga_scroll();
    }
}

void vga_write(const char* str) {
    while (*str) {
        vga_putchar(*str);
        str++;
    }
}

/* Combined VGA and serial output */
void console_write(const char* str) {
    vga_write(str);
    serial_write(str);
}

void console_putchar(char c) {
    vga_putchar(c);
    serial_putchar(c);
}