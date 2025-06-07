; Simple bootloader for Mini OS
; This is a 16-bit bootloader that loads and jumps to our kernel

[BITS 16]
[ORG 0x7C00]

start:
    ; Set up segment registers
    cli
    xor ax, ax
    mov ds, ax
    mov es, ax
    mov ss, ax
    mov sp, 0x7C00
    sti

    ; Initialize serial port (COM1)
    mov dx, 0x3F8 + 3    ; Line Control Register
    mov al, 0x80         ; Enable DLAB
    out dx, al

    mov dx, 0x3F8 + 0    ; Divisor low byte
    mov al, 0x03         ; 38400 baud
    out dx, al

    mov dx, 0x3F8 + 1    ; Divisor high byte
    mov al, 0x00
    out dx, al

    mov dx, 0x3F8 + 3    ; Line Control Register
    mov al, 0x03         ; 8 bits, no parity, one stop bit
    out dx, al

    ; Send boot message
    mov si, boot_msg
    call print_serial_string

    ; Create dummy multiboot info
    mov di, 0x8000       ; Place it at a safe location

    ; multiboot_info structure
    mov dword [di], 0x06       ; flags (bit 1: mem_*, bit 2: mmap_*)
    mov dword [di+4], 640      ; mem_lower (640KB)
    mov dword [di+8], 261888   ; mem_upper (256MB - 1MB)

    ; Skip other fields until mmap
    add di, 44
    mov dword [di], 24         ; mmap_length
    mov dword [di+4], 0x8100   ; mmap_addr

    ; Create dummy memory map at 0x8100
    mov di, 0x8100

    ; First entry: 0-640KB available
    mov dword [di], 20         ; size
    mov dword [di+4], 0        ; addr low
    mov dword [di+8], 0        ; addr high
    mov dword [di+12], 0xA0000 ; len low (640KB)
    mov dword [di+16], 0       ; len high
    mov dword [di+20], 1       ; type (available)

    ; Jump to 32-bit protected mode
    call enable_a20
    lgdt [gdt_descriptor]

    mov eax, cr0
    or al, 1
    mov cr0, eax

    jmp 0x08:protected_mode

enable_a20:
    in al, 0x92
    or al, 2
    out 0x92, al
    ret

print_serial_string:
.loop:
    lodsb
    or al, al
    jz .done
    mov dx, 0x3F8    ; COM1 data port
    out dx, al
    jmp .loop
.done:
    ret

[BITS 32]
protected_mode:
    ; Set up 32-bit segments
    mov ax, 0x10
    mov ds, ax
    mov es, ax
    mov fs, ax
    mov gs, ax
    mov ss, ax
    mov esp, 0x90000

    ; Send 32-bit message
    mov esi, pmode_msg
    call print_serial_string_32

    ; Pass multiboot info to kernel
    mov ebx, 0x8000      ; multiboot info pointer

    ; Jump to kernel (loaded at 1MB)
    jmp 0x100000

print_serial_string_32:
.loop:
    lodsb
    or al, al
    jz .done
    mov dx, 0x3F8    ; COM1 data port
    out dx, al
    jmp .loop
.done:
    ret

; GDT
gdt_start:
    ; Null descriptor
    dq 0

gdt_code:
    ; Code segment: base=0, limit=0xfffff, access=9a, flags=cf
    dw 0xffff    ; limit low
    dw 0x0000    ; base low
    db 0x00      ; base middle
    db 10011010b ; access byte
    db 11001111b ; flags + limit high
    db 0x00      ; base high

gdt_data:
    ; Data segment: base=0, limit=0xfffff, access=92, flags=cf
    dw 0xffff    ; limit low
    dw 0x0000    ; base low
    db 0x00      ; base middle
    db 10010010b ; access byte
    db 11001111b ; flags + limit high
    db 0x00      ; base high

gdt_end:

gdt_descriptor:
    dw gdt_end - gdt_start - 1
    dd gdt_start

; Data
boot_msg db 'Simple Boot: Starting Mini OS...', 13, 10, 0
pmode_msg db 'Simple Boot: Entering protected mode', 13, 10, 0

; Boot signature
times 510-($-$$) db 0
dw 0xAA55
