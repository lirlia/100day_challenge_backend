#pragma once

#include <stdint.h> // For uint16_t if used in print_serial
#include <stdarg.h> // For va_list in print_serial_format

// Provided by user, assuming COM1_BASE or similar is handled by print_serial_format or its callees
// extern void print_serial(uint16_t port, const char *s);
// extern void print_serial_hex(uint16_t port, uint64_t h);
// extern void print_serial_utoa(uint16_t port, uint64_t u);

/**
 * @brief Outputs a single character to the specified serial port.
 *
 * @param port The I/O port of the serial interface (e.g., 0x3F8 for COM1).
 * @param c The character to output.
 */
void serial_putc_direct(uint16_t port, char c);

/**
 * @brief Outputs a null-terminated string to the specified serial port.
 *
 * @param port The I/O port of the serial interface.
 * @param s The string to output.
 */
void print_serial_direct(uint16_t port, const char *s);

/**
 * @brief Outputs a formatted string to the default serial port (COM1).
 *
 * This function uses vsnprintf to format the string. Ensure your C library
 * supports it or provide a custom minimal printf implementation.
 *
 * @param fmt The format string (printf-like).
 * @param ... Variable arguments for the format string.
 */
void print_serial_format(const char *fmt, ...);

// Existing print_serial that might take a base (0 for default COM1)
// We will provide an implementation for this that calls print_serial_direct with COM1_BASE
void print_serial(int base, const char *s);

/**
 * @brief Outputs a 64-bit unsigned integer as a hexadecimal string to the specified serial port.
 *
 * @param port The I/O port of the serial interface.
 * @param h The 64-bit unsigned integer to output.
 */
void print_serial_hex(uint16_t port, uint64_t h);

/**
 * @brief Outputs a 64-bit unsigned integer as a decimal string to the specified serial port.
 *
 * @param port The I/O port of the serial interface.
 * @param u The 64-bit unsigned integer to output.
 */
void print_serial_utoa(uint16_t port, uint64_t u);
