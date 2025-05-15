#include "serial.h"
#include "io.h" // For SERIAL_COM1_BASE and outb/inb
#include "main.h" // Include for uint64_to_..._str prototypes
#include <stdarg.h>
#include <stdbool.h>
#include <stddef.h> // For NULL and size_t

int init_serial(uint16_t port) {
   outb(port + 1, 0x00); // Disable all interrupts
   outb(port + 3, 0x80); // Enable DLAB (set baud rate divisor)
   outb(port + 0, 0x03); // Set divisor to 3 (lo byte) 38400 baud
   outb(port + 1, 0x00); //                  (hi byte)
   outb(port + 3, 0x03); // 8 bits, no parity, one stop bit
   outb(port + 2, 0xC7); // Enable FIFO, clear them, with 14-byte threshold
   outb(port + 4, 0x0B); // IRQs enabled, RTS/DSR set
   // Test loopback
   outb(port + 4, 0x1E); // Set in loopback mode, test the serial chip
   outb(port + 0, 0xAE); // Test serial chip (send byte 0xAE and check if serial returns same byte)
   if(inb(port + 0) != 0xAE) {
      return 1; // Fail
   }
   // If serial is working properly, return normal mode.
   outb(port + 4, 0x0F);
   return 0; // Success
}

// Check if transmit buffer is empty
int is_transmit_empty(uint16_t port) {
   return inb(port + 5) & 0x20;
}

// Write character to serial port
void write_serial_char(uint16_t port, char a) {
   while (is_transmit_empty(port) == 0);
   outb(port, a);
}

// Write string to serial port
void print_serial(uint16_t port, const char *s) {
    for (int i = 0; s[i] != '\0'; i++) {
        write_serial_char(port, s[i]);
    }
}

// --- Number Printing Functions ---

void print_serial_hex(uint16_t port, uint64_t value) {
    char hex_str[17]; // Buffer for hex string (16 digits + null)
    uint64_to_hex_str(value, hex_str);
    print_serial(port, "0x");
    print_serial(port, hex_str);
}

void print_serial_dec(uint16_t port, uint64_t value) {
    char dec_str[21]; // Buffer for decimal string (max 20 digits for uint64_t + null)
    uint64_to_dec_str(value, dec_str);
    print_serial(port, dec_str);
}

// Implemented print_serial_format
void print_serial_format(const char *fmt, ...) {
    va_list args;
    va_start(args, fmt);

    char ch;
    while ((ch = *fmt++)) {
        if (ch != '%') {
            write_serial_char(SERIAL_COM1_BASE, ch);
            continue;
        }

        ch = *fmt++;
        // Support for %l modifier (e.g. %lx, %lu)
        bool is_long = false;
        if (ch == 'l') {
            is_long = true;
            ch = *fmt++;
        }

        switch (ch) {
            case 's': {
                const char *s_val = va_arg(args, const char *);
                if (s_val == NULL) {
                    print_serial(SERIAL_COM1_BASE, "(null)");
                } else {
                    print_serial(SERIAL_COM1_BASE, s_val);
                }
                break;
            }
            case 'c': {
                char c_val = (char)va_arg(args, int); // char is promoted to int
                write_serial_char(SERIAL_COM1_BASE, c_val);
                break;
            }
            case 'x':
            case 'X':
            case 'p': {
                uint64_t val_hex;
                if (is_long) {
                    val_hex = va_arg(args, uint64_t);
                } else {
                    // Non-long %x, %X, %p might be int or unsigned int.
                    // For simplicity and kernel debug, assume they might still pass larger types if not careful.
                    // Safest is to expect uint32_t if not long, then promote to uint64_t for printing.
                    // However, va_arg needs exact type. Let's assume uint32_t for non-long hex.
                    val_hex = (uint64_t)va_arg(args, uint32_t);
                }
                print_serial_hex(SERIAL_COM1_BASE, val_hex);
                break;
            }
            case 'u':
            case 'd': // Treat %d as %u for simplicity for now
            case 'i': // Treat %i as %u for simplicity for now
            {
                uint64_t val_dec;
                if (is_long) {
                    val_dec = va_arg(args, uint64_t);
                } else {
                    // Similar to hex, assume uint32_t for non-long decimal.
                    val_dec = (uint64_t)va_arg(args, uint32_t);
                }
                print_serial_dec(SERIAL_COM1_BASE, val_dec);
                break;
            }
            case '%':
                write_serial_char(SERIAL_COM1_BASE, '%');
                break;
            default:
                write_serial_char(SERIAL_COM1_BASE, '%');
                write_serial_char(SERIAL_COM1_BASE, ch);
                break;
        }
    }
    va_end(args);
}
