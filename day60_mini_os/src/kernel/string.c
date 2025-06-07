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

char* strncpy(char* dest, const char* src, size_t n) {
    if (!dest || !src) return dest;

    char* orig_dest = dest;
    size_t i;

    for (i = 0; i < n && src[i] != '\0'; i++) {
        dest[i] = src[i];
    }

    for (; i < n; i++) {
        dest[i] = '\0';
    }

    return orig_dest;
}

/* 数値を文字列に変換 */
void int_to_string(u32 num, char* buffer) {
    if (!buffer) return;

    if (num == 0) {
        buffer[0] = '0';
        buffer[1] = '\0';
        return;
    }

    char temp[16];
    int i = 0;

    while (num > 0) {
        temp[i++] = '0' + (num % 10);
        num /= 10;
    }

    int j = 0;
    for (int k = i - 1; k >= 0; k--) {
        buffer[j++] = temp[k];
    }
    buffer[j] = '\0';
}
