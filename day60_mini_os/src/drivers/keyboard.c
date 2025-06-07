#include "../include/keyboard.h"
#include "../include/interrupt.h"
#include "../include/kernel.h"

/* グローバルキーボード状態 */
static keyboard_state_t kb_state;

/* 米国キーボードレイアウト（スキャンコード→ASCII） */
const char keyboard_map[] = {
    0,    27,  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', '\b',
    '\t', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\n',
    0,    'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', '\'', '`',
    0,    '\\', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/',
    0,    '*', 0, ' '
};

/* Shiftキー押下時のキーマップ */
const char keyboard_map_shifted[] = {
    0,    27,  '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', '\b',
    '\t', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '{', '}', '\n',
    0,    'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ':', '"', '~',
    0,    '|', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '<', '>', '?',
    0,    '*', 0, ' '
};

void keyboard_init(void) {
    extern void kernel_printf(const char* format, ...);

    kernel_printf("keyboard_init: Initializing keyboard driver...\n");

    /* キーボード状態を初期化 */
    kernel_printf("keyboard_init: Clearing keyboard state...\n");
    memset(&kb_state, 0, sizeof(keyboard_state_t));
    kernel_printf("keyboard_init: Keyboard state cleared\n");

    /* キーボード割り込み（IRQ1）を有効化 */
    kernel_printf("keyboard_init: Registering interrupt handler...\n");
    register_interrupt_handler(33, keyboard_handler);
    kernel_printf("keyboard_init: Interrupt handler registered\n");
    kernel_printf("keyboard_init: After register_interrupt_handler\n");

        /* PICでIRQ1を有効化 */
    kernel_printf("keyboard_init: Configuring PIC...\n");
    extern void pic_clear_mask(u8 irq);
    pic_clear_mask(1);  // IRQ1をアンマスク
    kernel_printf("keyboard_init: IRQ1 unmasked via pic_clear_mask\n");

    kernel_printf("keyboard_init: PIC configuration completed\n");
    kernel_printf("keyboard_init: Keyboard driver initialized successfully\n");
}

void keyboard_handler(interrupt_frame_t* frame) {
    extern void kernel_printf(const char* format, ...);

    /* スキャンコードを読み取り */
    u8 scancode = inb(KEYBOARD_DATA_PORT);

    /* Key releaseは無視（上位ビットが1） */
    if (scancode & 0x80) {
        u8 release_scancode = scancode & 0x7F;

        /* 修飾キーのリリース処理 */
        if (release_scancode == 0x2A || release_scancode == 0x36) { /* Left/Right Shift */
            kb_state.shift_pressed = false;
        } else if (release_scancode == 0x1D) { /* Ctrl */
            kb_state.ctrl_pressed = false;
        } else if (release_scancode == 0x38) { /* Alt */
            kb_state.alt_pressed = false;
        }

        UNUSED(frame);
        return;
    }

    /* 修飾キーの押下処理 */
    if (scancode == 0x2A || scancode == 0x36) { /* Left/Right Shift */
        kb_state.shift_pressed = true;
        UNUSED(frame);
        return;
    } else if (scancode == 0x1D) { /* Ctrl */
        kb_state.ctrl_pressed = true;
        UNUSED(frame);
        return;
    } else if (scancode == 0x38) { /* Alt */
        kb_state.alt_pressed = true;
        UNUSED(frame);
        return;
    }

    /* スキャンコードを文字に変換 */
    char ascii = 0;
    if (scancode < sizeof(keyboard_map)) {
        if (kb_state.shift_pressed && scancode < sizeof(keyboard_map_shifted)) {
            ascii = keyboard_map_shifted[scancode];
        } else {
            ascii = keyboard_map[scancode];
        }
    }

    /* 有効な文字の場合はバッファに追加 */
    if (ascii != 0 && kb_state.count < KEYBOARD_BUFFER_SIZE) {
        kb_state.buffer[kb_state.write_pos] = ascii;
        kb_state.write_pos = (kb_state.write_pos + 1) % KEYBOARD_BUFFER_SIZE;
        kb_state.count++;

        kernel_printf("🎯 CHAR ADDED: '%c' (0x%02X from scancode 0x%02X)\n",
                     ascii, ascii, scancode);
    } else {
        kernel_printf("🔄 SCAN: 0x%02X (no char)\n", scancode);
    }

    UNUSED(frame);
}

char keyboard_get_char(void) {
    if (kb_state.count == 0) {
        return 0;
    }

    char c = kb_state.buffer[kb_state.read_pos];
    kb_state.read_pos = (kb_state.read_pos + 1) % KEYBOARD_BUFFER_SIZE;
    kb_state.count--;

    return c;
}

/* エイリアス関数 */
int keyboard_getchar(void) {
    return (int)keyboard_get_char();
}

bool keyboard_has_input(void) {
    return kb_state.count > 0;
}

void keyboard_print_status(void) {
    kernel_printf("\n--- Keyboard Status ---\n");
    kernel_printf("Buffer count: %u/%u\n", kb_state.count, KEYBOARD_BUFFER_SIZE);
    kernel_printf("Read pos: %u, Write pos: %u\n", kb_state.read_pos, kb_state.write_pos);
    kernel_printf("Shift: %s, Ctrl: %s, Alt: %s\n",
                  kb_state.shift_pressed ? "ON" : "OFF",
                  kb_state.ctrl_pressed ? "ON" : "OFF",
                  kb_state.alt_pressed ? "ON" : "OFF");
    kernel_printf("----------------------\n");
}
