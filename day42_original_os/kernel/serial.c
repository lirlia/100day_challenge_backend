#include "serial.h"
#include "io.h" // For SERIAL_COM1_BASE and outb
#include <stdarg.h>
#include <stdint.h> // For int_types
#include <stddef.h> // For NULL and size_t

// Helper function to print a character
static void putchar_serial(char c) {
    // Wait for transmit buffer to be empty
    while ((inb(SERIAL_COM1_BASE + 5) & 0x20) == 0); // LSR, bit 5: THRE
    outb(SERIAL_COM1_BASE, c); // Data register
}

// Helper function to print a string
static void print_string_serial(const char *s) {
    if (s == NULL) {
        print_string_serial("(null)");
        return;
    }
    while (*s) {
        putchar_serial(*s++);
    }
}

// Helper function to print an unsigned long long in a given base
static void print_ull_base(unsigned long long n, int base, int min_digits, char pad_char, int uppercase_hex) {
    char buf[65]; // Max 64 bits + null terminator
    int i = 0;
    if (n == 0) {
        buf[i++] = '0';
    } else {
        while (n > 0) {
            int digit = n % base;
            if (digit < 10) {
                buf[i++] = digit + '0';
            } else {
                buf[i++] = digit - 10 + (uppercase_hex ? 'A' : 'a');
            }
            n /= base;
        }
    }

    while (i < min_digits) {
        buf[i++] = pad_char;
    }

    buf[i] = '\0';

    // Reverse the string
    for (int j = 0; j < i / 2; j++) {
        char temp = buf[j];
        buf[j] = buf[i - 1 - j];
        buf[i - 1 - j] = temp;
    }
    print_string_serial(buf);
}


void print_serial_format(const char *fmt, ...) {
    va_list args;
    va_start(args, fmt);

    char ch;
    while ((ch = *fmt++)) {
        if (ch != '%') {
            putchar_serial(ch);
            continue;
        }

        char pad_char = ' ';
        int min_digits = 0;
        int width_from_arg = 0;
        int zero_pad = 0;

        if (*fmt == '0') {
            pad_char = '0';
            zero_pad = 1;
            fmt++;
        }

        if (*fmt == '*') {
            min_digits = va_arg(args, int);
            fmt++;
            width_from_arg = 1;
            if (min_digits < 0) { // Negative width is typically for left-alignment, not supported here simply.
                min_digits = 0;
            }
        } else {
            while (*fmt >= '0' && *fmt <= '9') {
                min_digits = min_digits * 10 + (*fmt++ - '0');
            }
        }
        if (zero_pad && width_from_arg) { // If '0' and '*' are used, '0' is padding char
             // min_digits is already set
        } else if (zero_pad) {
            // pad_char is '0'
        }


        int is_long = 0;
        int is_long_long = 0;
        if (*fmt == 'l') {
            fmt++;
            is_long = 1;
            if (*fmt == 'l') {
                fmt++;
                is_long_long = 1;
            }
        } else if (*fmt == 'z') { // size_t typically corresponds to unsigned long or unsigned long long
            fmt++;
            if (sizeof(size_t) == sizeof(unsigned long)) {
                is_long = 1;
            } else if (sizeof(size_t) == sizeof(unsigned long long)) {
                is_long_long = 1;
            }
        }


        switch (*fmt++) {
            case 'c':
                putchar_serial((char)va_arg(args, int));
                break;
            case 's':
                print_string_serial(va_arg(args, const char *));
                break;
            case 'd':
            case 'i': {
                long long val;
                 if (is_long_long) val = va_arg(args, long long);
                 else if (is_long) val = va_arg(args, long);
                 else val = va_arg(args, int);

                if (val < 0) {
                    putchar_serial('-');
                    val = -val;
                }
                print_ull_base(val, 10, min_digits, pad_char, 0);
                break;
            }
            case 'u': {
                unsigned long long val_u;
                if (is_long_long) val_u = va_arg(args, unsigned long long);
                else if (is_long) val_u = va_arg(args, unsigned long);
                else val_u = va_arg(args, unsigned int);
                print_ull_base(val_u, 10, min_digits, pad_char, 0);
                break;
            }
            case 'x': {
                unsigned long long val_x;
                if (is_long_long) val_x = va_arg(args, unsigned long long);
                else if (is_long) val_x = va_arg(args, unsigned long);
                else val_x = va_arg(args, unsigned int);
                print_ull_base(val_x, 16, min_digits, pad_char, 0);
                break;
            }
            case 'X': {
                unsigned long long val_X;
                if (is_long_long) val_X = va_arg(args, unsigned long long);
                else if (is_long) val_X = va_arg(args, unsigned long);
                else val_X = va_arg(args, unsigned int);
                print_ull_base(val_X, 16, min_digits, pad_char, 1);
                break;
            }
            case 'p':
                print_string_serial("0x");
                // Pointers are typically padded with leading zeros to their full width
                print_ull_base((unsigned long long)va_arg(args, void*), 16, sizeof(void*) * 2, '0', 0);
                break;
            case '%':
                putchar_serial('%');
                break;
            default:
                putchar_serial('%');
                if (*(fmt-1)) putchar_serial(*(fmt-1));
                break;
        }
    }
    va_end(args);
}

void serial_putc_direct(uint16_t port, char c) {
    while ((inb(port + 5) & 0x20) == 0);
    outb(port, c);
}

void print_serial_direct(uint16_t port, const char *s) {
    if (s == NULL) {
        // Handle null string explicitly if desired, e.g., print "(null)"
        const char* null_str = "(null)";
        for (int i = 0; null_str[i] != '\0'; i++) {
            serial_putc_direct(port, null_str[i]);
        }
        return;
    }
    for (int i = 0; s[i] != '\0'; i++) {
        serial_putc_direct(port, s[i]);
    }
}

void print_serial(int base, const char *s) {
    (void)base; // Assuming COM1 for now.
    print_serial_direct(SERIAL_COM1_BASE, s);
}

void print_serial_hex(uint16_t port, uint64_t h) {
    char buf[17];
    int i = 15;
    buf[16] = '\0';

    if (h == 0) {
        serial_putc_direct(port, '0');
        return;
    }

    while (h > 0 && i >= 0) {
        unsigned char digit = h % 16;
        buf[i--] = (digit < 10) ? (digit + '0') : (digit - 10 + 'a'); // lowercase hex
        h /= 16;
    }
    // To print leading zeros, one might adjust the loop or buf initialization.
    // This version prints minimal digits.
    print_serial_direct(port, &buf[i + 1]);
}

void print_serial_utoa(uint16_t port, uint64_t u) {
    char buf[21]; // Max 20 digits for uint64_t + null
    int i = 19;
    buf[20] = '\0';

    if (u == 0) {
        serial_putc_direct(port, '0');
        return;
    }

    while (u > 0 && i >= 0) {
        buf[i--] = (u % 10) + '0';
        u /= 10;
    }
    print_serial_direct(port, &buf[i + 1]);
}
