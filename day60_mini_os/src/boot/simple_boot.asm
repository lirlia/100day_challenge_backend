; Simple bootloader for Mini OS
; This creates a flat binary that QEMU can load directly

[BITS 16]
[ORG 0x7C00]

start:
    ; Clear screen
    mov ax, 0x0003
    int 0x10

    ; Print "Mini OS Starting..."
    mov si, boot_msg
    call print_string

    ; Initialize serial port
    call init_serial

    ; Send message to serial
    mov si, serial_msg
    call send_serial_string

    ; Infinite loop
    jmp $

print_string:
    lodsb
    or al, al
    jz .done
    mov ah, 0x0E
    int 0x10
    jmp print_string
.done:
    ret

init_serial:
    ; Initialize COM1 (0x3F8)
    mov dx, 0x3F8 + 1    ; Interrupt enable register
    mov al, 0x00         ; Disable interrupts
    out dx, al

    mov dx, 0x3F8 + 3    ; Line control register
    mov al, 0x80         ; Enable DLAB
    out dx, al

    mov dx, 0x3F8 + 0    ; Divisor low byte
    mov al, 0x03         ; 38400 baud
    out dx, al

    mov dx, 0x3F8 + 1    ; Divisor high byte
    mov al, 0x00
    out dx, al

    mov dx, 0x3F8 + 3    ; Line control register
    mov al, 0x03         ; 8N1, disable DLAB
    out dx, al

    mov dx, 0x3F8 + 2    ; FIFO control register
    mov al, 0xC7         ; Enable FIFO
    out dx, al

    mov dx, 0x3F8 + 4    ; Modem control register
    mov al, 0x0B         ; RTS/DSR set
    out dx, al

    ret

send_serial_char:
    ; Send character in AL to serial port
    push ax
    push dx
    mov ah, al           ; Save character
    mov dx, 0x3F8 + 5    ; Line status register
.wait:
    in al, dx
    test al, 0x20        ; Transmitter holding register empty?
    jz .wait

    mov dx, 0x3F8        ; Data register
    mov al, ah           ; Restore character
    out dx, al
    pop dx
    pop ax
    ret

send_serial_string:
    lodsb
    or al, al
    jz .done
    call send_serial_char
    jmp send_serial_string
.done:
    ret

boot_msg db 'Mini OS Starting...', 13, 10, 0
serial_msg db 'Hello from Mini OS!', 13, 10, 0

; Boot sector signature
times 510-($-$$) db 0
dw 0xAA55
