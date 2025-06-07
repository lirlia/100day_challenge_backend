; Boot loader for Mini OS (x86-64)
; Entry point from multiboot loader

global _start
extern kernel_main

section .text
bits 32                 ; Start in 32-bit mode

_start:
    ; Set up initial stack
    mov esp, stack_top

    ; Save multiboot info pointer (in case we need it later)
    push ebx
    push eax

    ; Check for CPUID support
    call check_cpuid
    test eax, eax
    jz .no_cpuid

    ; Check for long mode support
    call check_long_mode
    test eax, eax
    jz .no_long_mode

    ; Set up paging for long mode
    call setup_page_tables
    call enable_paging

    ; Load GDT for long mode
    lgdt [gdt64.pointer]

    ; Jump to 64-bit code
    jmp gdt64.code:long_mode_start

.no_cpuid:
    mov esi, no_cpuid_msg
    call print_error
    hlt

.no_long_mode:
    mov esi, no_long_mode_msg
    call print_error
    hlt

; Check if CPUID is supported
check_cpuid:
    pushfd
    pop eax
    mov ecx, eax
    xor eax, 1 << 21
    push eax
    popfd
    pushfd
    pop eax
    push ecx
    popfd
    xor eax, ecx
    ret

; Check if long mode is supported
check_long_mode:
    mov eax, 0x80000000
    cpuid
    cmp eax, 0x80000001
    jb .no_long_mode

    mov eax, 0x80000001
    cpuid
    test edx, 1 << 29
    jz .no_long_mode

    mov eax, 1
    ret

.no_long_mode:
    mov eax, 0
    ret

; Set up page tables for long mode
setup_page_tables:
    ; Clear page tables
    mov edi, page_table_l4
    mov cr3, edi
    xor eax, eax
    mov ecx, 4096
    rep stosd
    mov edi, cr3

    ; Set up PML4 (Page Map Level 4)
    mov dword [edi], page_table_l3
    or dword [edi], 0b11        ; present + writable

    ; Set up PDPT (Page Directory Pointer Table)
    mov edi, page_table_l3
    mov dword [edi], page_table_l2
    or dword [edi], 0b11        ; present + writable

    ; Set up PD (Page Directory) - identity map first 2MB
    mov edi, page_table_l2
    mov eax, 0x83               ; present + writable + huge page
    mov ecx, 512                ; 512 entries * 2MB = 1GB

.map_p2_table:
    mov [edi], eax
    add eax, 0x200000          ; 2MB page size
    add edi, 8
    loop .map_p2_table

    ret

; Enable paging and enter long mode
enable_paging:
    ; Enable PAE (Physical Address Extension)
    mov eax, cr4
    or eax, 1 << 5
    mov cr4, eax

    ; Set long mode bit in EFER MSR
    mov ecx, 0xC0000080
    rdmsr
    or eax, 1 << 8
    wrmsr

    ; Enable paging
    mov eax, cr0
    or eax, 1 << 31
    mov cr0, eax

    ret

; Print error message in 32-bit mode
print_error:
    mov edi, 0xb8000           ; VGA text buffer
.print_loop:
    lodsb
    test al, al
    jz .done
    mov ah, 0x4f               ; white on red
    stosw
    jmp .print_loop
.done:
    ret

; 64-bit mode entry point
bits 64
long_mode_start:
    ; Set up segment registers for 64-bit mode
    mov ax, gdt64.data
    mov ds, ax
    mov es, ax
    mov fs, ax
    mov gs, ax
    mov ss, ax

    ; Set up 64-bit stack
    mov rsp, stack_top

    ; Clear the screen
    call clear_screen

    ; Call the C kernel main function
    call kernel_main

    ; If kernel returns, halt
    cli
    hlt

; Clear VGA text screen
clear_screen:
    mov rdi, 0xb8000
    mov rax, 0x0f200f20         ; space character with white on black
    mov rcx, 80*25              ; 80x25 screen
    rep stosw
    ret

; GDT for 64-bit mode
section .rodata
gdt64:
    dq 0                        ; null descriptor
.code: equ $ - gdt64
    dq (1<<44) | (1<<47) | (1<<41) | (1<<43) | (1<<53) ; code segment
.data: equ $ - gdt64
    dq (1<<44) | (1<<47) | (1<<41)                      ; data segment
.pointer:
    dw $ - gdt64 - 1           ; GDT size
    dq gdt64                   ; GDT address

; Error messages
no_cpuid_msg db "ERROR: CPUID not supported", 0
no_long_mode_msg db "ERROR: Long mode not supported", 0

; BSS section for page tables and stack
section .bss
align 4096
page_table_l4:
    resb 4096
page_table_l3:
    resb 4096
page_table_l2:
    resb 4096

stack_bottom:
    resb 16384                 ; 16KB stack
stack_top:
