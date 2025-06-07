#include "kernel.h"

/* Serial port registers */
#define SERIAL_DATA_PORT(base)          (base)
#define SERIAL_FIFO_COMMAND_PORT(base)  (base + 2)
#define SERIAL_LINE_COMMAND_PORT(base)  (base + 3)
#define SERIAL_MODEM_COMMAND_PORT(base) (base + 4)
#define SERIAL_LINE_STATUS_PORT(base)   (base + 5)

/* Line status register bits */
#define SERIAL_LINE_ENABLE_DLAB         0x80

void serial_init(void) {
    /* Disable all interrupts */
    outb(SERIAL_COM1_BASE + 1, 0x00);

    /* Enable DLAB (set baud rate divisor) */
    outb(SERIAL_LINE_COMMAND_PORT(SERIAL_COM1_BASE), SERIAL_LINE_ENABLE_DLAB);

    /* Set divisor to 3 (lo byte) 38400 baud */
    outb(SERIAL_DATA_PORT(SERIAL_COM1_BASE), 0x03);
    outb(SERIAL_COM1_BASE + 1, 0x00);  /* hi byte */

    /* 8 bits, no parity, one stop bit */
    outb(SERIAL_LINE_COMMAND_PORT(SERIAL_COM1_BASE), 0x03);

    /* Enable FIFO, clear them, with 14-byte threshold */
    outb(SERIAL_FIFO_COMMAND_PORT(SERIAL_COM1_BASE), 0xC7);

    /* IRQs enabled, RTS/DSR set */
    outb(SERIAL_MODEM_COMMAND_PORT(SERIAL_COM1_BASE), 0x0B);

    /* Set in loopback mode, test the serial chip */
    outb(SERIAL_MODEM_COMMAND_PORT(SERIAL_COM1_BASE), 0x1E);

    /* Test serial chip (send byte 0xAE and check if serial returns same byte) */
    outb(SERIAL_DATA_PORT(SERIAL_COM1_BASE), 0xAE);

    /* Check if serial is faulty (i.e., not same byte as sent) */
    if (inb(SERIAL_DATA_PORT(SERIAL_COM1_BASE)) != 0xAE) {
        return;  /* Serial is faulty */
    }

    /* Set it in normal operation mode */
    /* (not-loopback with IRQs enabled and OUT#1 and OUT#2 bits enabled) */
    outb(SERIAL_MODEM_COMMAND_PORT(SERIAL_COM1_BASE), 0x0F);
}

static int serial_is_transmit_fifo_empty(void) {
    /* 0x20 = transmitter holding register empty */
    return inb(SERIAL_LINE_STATUS_PORT(SERIAL_COM1_BASE)) & 0x20;
}

void serial_putchar(char c) {
    while (serial_is_transmit_fifo_empty() == 0);
    outb(SERIAL_DATA_PORT(SERIAL_COM1_BASE), c);
}

void serial_write(const char* str) {
    if (!str) return;

    while (*str) {
        serial_putchar(*str);
        str++;
    }
}

/* Simple printf implementation for serial output */
static void serial_print_number(unsigned long num, int base) {
    char digits[] = "0123456789ABCDEF";
    char buffer[32];
    int i = 0;

    if (num == 0) {
        serial_putchar('0');
        return;
    }

    while (num > 0) {
        buffer[i++] = digits[num % base];
        num /= base;
    }

    while (i > 0) {
        serial_putchar(buffer[--i]);
    }
}

void serial_printf(const char* format, ...) {
    __builtin_va_list args;
    __builtin_va_start(args, format);

    while (*format) {
        if (*format == '%') {
            format++;
            switch (*format) {
                case 's': {
                    const char* str = __builtin_va_arg(args, const char*);
                    serial_write(str ? str : "(null)");
                    break;
                }
                case 'd': {
                    int num = __builtin_va_arg(args, int);
                    if (num < 0) {
                        serial_putchar('-');
                        num = -num;
                    }
                    serial_print_number(num, 10);
                    break;
                }
                case 'x': {
                    unsigned int num = __builtin_va_arg(args, unsigned int);
                    serial_print_number(num, 16);
                    break;
                }
                case 'p': {
                    void* ptr = __builtin_va_arg(args, void*);
                    serial_write("0x");
                    serial_print_number((unsigned long)ptr, 16);
                    break;
                }
                case '%': {
                    serial_putchar('%');
                    break;
                }
                default: {
                    serial_putchar('%');
                    serial_putchar(*format);
                    break;
                }
            }
        } else {
            serial_putchar(*format);
        }
        format++;
    }

    __builtin_va_end(args);
}
