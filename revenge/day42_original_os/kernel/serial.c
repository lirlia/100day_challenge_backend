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

// TODO: Implement print_serial_format if needed (requires vsnprintf or similar)
