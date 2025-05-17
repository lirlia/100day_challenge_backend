#ifndef KERNEL_FONT_H
#define KERNEL_FONT_H

#include <stdint.h>

// Bitmap font data (e.g., 8x8 ASCII)
// This is typically a large array.
// Example: extern const uint8_t font8x8_basic[128][8];
// The actual data should be in a .c file (e.g., font.c or font8x8_basic.c)

#define FONT_DATA_HEIGHT 8 // Matching the array dimension

// This declares the 8x8 font data array that is defined in font8x8_basic.c
// Each character is 8 bytes (8 rows of 8 bits).
// The array covers ASCII characters U+0000 to U+007F.
extern const uint8_t font8x8_basic[128][FONT_DATA_HEIGHT];

#endif // KERNEL_FONT_H
