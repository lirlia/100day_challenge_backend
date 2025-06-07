; Multiboot kernel entry with integrated headers
[BITS 32]

; Multiboot constants
MULTIBOOT_MAGIC     equ 0x1BADB002
MULTIBOOT_FLAGS     equ 0x00000003  ; Page align + memory info
MULTIBOOT_CHECKSUM  equ -(MULTIBOOT_MAGIC + MULTIBOOT_FLAGS)

; Multiboot header
section .multiboot
align 4
multiboot_header:
    dd MULTIBOOT_MAGIC
    dd MULTIBOOT_FLAGS
    dd MULTIBOOT_CHECKSUM

; Stack for initial setup
section .bss
align 16
stack_bottom:
    resb 32768  ; 32KB stack
stack_top:

; Boot section
section .text
global _start
extern kmain

_start:
    ; Set up the stack
    mov esp, stack_top

    ; Call kernel main without arguments
    call kmain

    ; If kmain returns, halt the system
.halt:
    cli
    hlt
    jmp .halt

; The original code had init_serial and print_serial here.
; These are no longer needed as the C kernel will handle serial output.
; Keeping the file minimal.
