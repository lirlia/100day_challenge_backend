#include "kernel.h"

/* Global kernel printf function */
void kernel_printf(const char* format, ...) {
    __builtin_va_list args;
    __builtin_va_start(args, format);

    /* For now, redirect to serial output */
    char buffer[1024];
    int i = 0;

    while (*format && i < sizeof(buffer) - 1) {
        if (*format == '%') {
            format++;
            switch (*format) {
                case 's': {
                    const char* str = __builtin_va_arg(args, const char*);
                    if (str) {
                        while (*str && i < sizeof(buffer) - 1) {
                            buffer[i++] = *str++;
                        }
                    } else {
                        const char* null_str = "(null)";
                        while (*null_str && i < sizeof(buffer) - 1) {
                            buffer[i++] = *null_str++;
                        }
                    }
                    break;
                }
                case 'd': {
                    int num = __builtin_va_arg(args, int);
                    char num_buffer[32];
                    int num_len = 0;

                    if (num < 0) {
                        if (i < sizeof(buffer) - 1) buffer[i++] = '-';
                        num = -num;
                    }

                    if (num == 0) {
                        if (i < sizeof(buffer) - 1) buffer[i++] = '0';
                    } else {
                        while (num > 0) {
                            num_buffer[num_len++] = '0' + (num % 10);
                            num /= 10;
                        }
                        for (int j = num_len - 1; j >= 0 && i < sizeof(buffer) - 1; j--) {
                            buffer[i++] = num_buffer[j];
                        }
                    }
                    break;
                }
                case 'x': {
                    unsigned int num = __builtin_va_arg(args, unsigned int);
                    char digits[] = "0123456789abcdef";
                    char num_buffer[32];
                    int num_len = 0;

                    if (num == 0) {
                        if (i < sizeof(buffer) - 1) buffer[i++] = '0';
                    } else {
                        while (num > 0) {
                            num_buffer[num_len++] = digits[num % 16];
                            num /= 16;
                        }
                        for (int j = num_len - 1; j >= 0 && i < sizeof(buffer) - 1; j--) {
                            buffer[i++] = num_buffer[j];
                        }
                    }
                    break;
                }
                case '%': {
                    if (i < sizeof(buffer) - 1) buffer[i++] = '%';
                    break;
                }
                default: {
                    if (i < sizeof(buffer) - 1) buffer[i++] = '%';
                    if (i < sizeof(buffer) - 1) buffer[i++] = *format;
                    break;
                }
            }
        } else {
            buffer[i++] = *format;
        }
        format++;
    }

    buffer[i] = '\0';
    serial_write(buffer);

    __builtin_va_end(args);
}

void kernel_log(const char* level, const char* format, ...) {
    __builtin_va_list args;
    __builtin_va_start(args, format);

    /* Print timestamp placeholder and level */
    kernel_printf("[%s] ", level);

    /* Print the actual message */
    char buffer[1024];
    int i = 0;

    while (*format && i < sizeof(buffer) - 1) {
        if (*format == '%') {
            format++;
            switch (*format) {
                case 's': {
                    const char* str = __builtin_va_arg(args, const char*);
                    if (str) {
                        while (*str && i < sizeof(buffer) - 1) {
                            buffer[i++] = *str++;
                        }
                    }
                    break;
                }
                case 'd': {
                    int num = __builtin_va_arg(args, int);
                    char num_buffer[32];
                    int num_len = 0;

                    if (num < 0) {
                        if (i < sizeof(buffer) - 1) buffer[i++] = '-';
                        num = -num;
                    }

                    if (num == 0) {
                        if (i < sizeof(buffer) - 1) buffer[i++] = '0';
                    } else {
                        while (num > 0) {
                            num_buffer[num_len++] = '0' + (num % 10);
                            num /= 10;
                        }
                        for (int j = num_len - 1; j >= 0 && i < sizeof(buffer) - 1; j--) {
                            buffer[i++] = num_buffer[j];
                        }
                    }
                    break;
                }
                default: {
                    if (i < sizeof(buffer) - 1) buffer[i++] = *format;
                    break;
                }
            }
        } else {
            buffer[i++] = *format;
        }
        format++;
    }

    buffer[i] = '\0';
    serial_write(buffer);
    serial_write("\n");

    __builtin_va_end(args);
}

void kernel_panic(const char* message) {
    disable_interrupts();

    kernel_printf("\n\n");
    kernel_printf("=====================================\n");
    kernel_printf("        KERNEL PANIC\n");
    kernel_printf("=====================================\n");
    kernel_printf("Message: %s\n", message);
    kernel_printf("System halted.\n");
    kernel_printf("=====================================\n");

    while (1) {
        halt();
    }
}

/* Main kernel entry point */
void kernel_main(void) {
    /* Initialize serial output first */
    serial_init();

    /* Print startup banner */
    kernel_printf("\n");
    kernel_printf("=====================================\n");
    kernel_printf("       %s v%s\n", KERNEL_NAME, KERNEL_VERSION);
    kernel_printf("=====================================\n");
    kernel_printf("\n");

    LOG_INFO("Kernel boot sequence started");
    LOG_INFO("Serial communication initialized");

    /* Test basic functionality */
    LOG_INFO("Testing basic kernel functions...");

    /* Test string functions */
    const char* test_str = "Hello, OS World!";
    LOG_INFO("String test: length of '%s' is %d", test_str, strlen(test_str));

    /* Test memory functions */
    char buffer[64];
    memset(buffer, 'X', sizeof(buffer) - 1);
    buffer[sizeof(buffer) - 1] = '\0';
    LOG_INFO("Memory test: filled buffer with pattern");

    strcpy(buffer, "Memory copy test");
    LOG_INFO("String copy test: '%s'", buffer);

    /* Phase 2 completion message */
    LOG_INFO("Phase 2: Basic kernel initialization complete!");
    LOG_INFO("Features working:");
    LOG_INFO("  - Boot sequence (32->64 bit transition)");
    LOG_INFO("  - Long mode paging");
    LOG_INFO("  - Serial output (COM1)");
    LOG_INFO("  - Basic string and memory functions");
    LOG_INFO("  - Kernel logging system");

    kernel_printf("\n");
    kernel_printf("========== READY FOR PHASE 3 ==========\n");
    kernel_printf("Next: Physical memory management\n");
    kernel_printf("======================================\n");

    /* Main kernel loop - for now just halt */
    LOG_INFO("Entering main kernel loop (halting for now)");

    while (1) {
        halt();
    }
}
