#ifndef KERNEL_H
#define KERNEL_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

/* Basic type definitions */
typedef uint8_t  u8;
typedef uint16_t u16;
typedef uint32_t u32;
typedef uint64_t u64;

typedef int8_t   s8;
typedef int16_t  s16;
typedef int32_t  s32;
typedef int64_t  s64;

/* Utility macros */
#define NULL ((void*)0)
#define UNUSED(x) ((void)(x))

/* Kernel configuration */
#define KERNEL_VERSION "0.1.0"
#define KERNEL_NAME "Mini OS"

/* Memory layout constants */
#define KERNEL_VIRTUAL_BASE 0x100000    /* 1MB */
#define PAGE_SIZE 4096
#define PAGE_SHIFT 12

/* VGA text mode constants */
#define VGA_MEMORY 0xB8000
#define VGA_WIDTH 80
#define VGA_HEIGHT 25

/* Serial port constants (COM1) */
#define SERIAL_COM1_BASE 0x3F8

/* Function declarations */

/* Serial I/O */
void serial_init(void);
void serial_putchar(char c);
void serial_write(const char* str);
void serial_printf(const char* format, ...);

/* VGA text mode */
void vga_init(void);
void vga_putchar(char c);
void vga_write(const char* str);
void vga_clear(void);
void vga_set_color(u8 foreground, u8 background);

/* Console (combined VGA + Serial output) */
void console_write(const char* str);
void console_putchar(char c);

/* Kernel logging */
void kernel_printf(const char* format, ...);
void kernel_log(const char* level, const char* format, ...);

#define LOG_INFO(fmt, ...) kernel_log("INFO", fmt, ##__VA_ARGS__)
#define LOG_WARN(fmt, ...) kernel_log("WARN", fmt, ##__VA_ARGS__)
#define LOG_ERROR(fmt, ...) kernel_log("ERROR", fmt, ##__VA_ARGS__)
#define LOG_DEBUG(fmt, ...) kernel_log("DEBUG", fmt, ##__VA_ARGS__)

/* Memory management */
void* kmalloc(size_t size);
void kfree(void* ptr);

/* String functions */
size_t strlen(const char* str);
int strcmp(const char* s1, const char* s2);
char* strcpy(char* dest, const char* src);
char* strncpy(char* dest, const char* src, size_t n);
void* memset(void* ptr, int value, size_t size);
void* memcpy(void* dest, const void* src, size_t size);
void int_to_string(u32 num, char* buffer);

/* Kernel panic */
void kernel_panic(const char* message) __attribute__((noreturn));

/* Halt the system */
static inline void halt(void) {
    __asm__ volatile ("cli; hlt");
}

/* Enable/disable interrupts */
static inline void enable_interrupts(void) {
    __asm__ volatile ("sti");
}

static inline void disable_interrupts(void) {
    __asm__ volatile ("cli");
}

/* I/O port operations */
static inline void outb(u16 port, u8 value) {
    __asm__ volatile ("outb %0, %1" : : "a"(value), "Nd"(port));
}

static inline u8 inb(u16 port) {
    u8 result;
    __asm__ volatile ("inb %1, %0" : "=a"(result) : "Nd"(port));
    return result;
}

static inline void outw(u16 port, u16 value) {
    __asm__ volatile ("outw %0, %1" : : "a"(value), "Nd"(port));
}

static inline u16 inw(u16 port) {
    u16 result;
    __asm__ volatile ("inw %1, %0" : "=a"(result) : "Nd"(port));
    return result;
}

#endif /* KERNEL_H */
