; Multiboot header for Mini OS (Multiboot 1)
; This allows QEMU to load our kernel directly

section .multiboot
align 4

; Multiboot 1 constants
MULTIBOOT_MAGIC equ 0x1BADB002
MULTIBOOT_FLAGS equ 0x00000003  ; align modules on page boundaries + memory info

; Multiboot header
multiboot_header:
    dd MULTIBOOT_MAGIC              ; magic number
    dd MULTIBOOT_FLAGS              ; flags
    dd -(MULTIBOOT_MAGIC + MULTIBOOT_FLAGS)  ; checksum
