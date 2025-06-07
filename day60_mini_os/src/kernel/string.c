#include "kernel.h"

size_t strlen(const char* str) {
    if (!str) return 0;

    size_t len = 0;
    while (str[len]) {
        len++;
    }
    return len;
}

int strcmp(const char* s1, const char* s2) {
    if (!s1 || !s2) {
        if (s1 == s2) return 0;
        return s1 ? 1 : -1;
    }

    while (*s1 && (*s1 == *s2)) {
        s1++;
        s2++;
    }

    return *(unsigned char*)s1 - *(unsigned char*)s2;
}

char* strcpy(char* dest, const char* src) {
    if (!dest || !src) return dest;

    char* orig_dest = dest;
    while ((*dest++ = *src++));
    return orig_dest;
}

void* memset(void* ptr, int value, size_t size) {
    if (!ptr) return ptr;

    unsigned char* p = (unsigned char*)ptr;
    unsigned char val = (unsigned char)value;

    while (size--) {
        *p++ = val;
    }

    return ptr;
}

void* memcpy(void* dest, const void* src, size_t size) {
    if (!dest || !src) return dest;

    unsigned char* d = (unsigned char*)dest;
    const unsigned char* s = (const unsigned char*)src;

    while (size--) {
        *d++ = *s++;
    }

    return dest;
}
