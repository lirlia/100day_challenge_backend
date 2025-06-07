#include "../include/keyboard.h"
#include "../include/interrupt.h"

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
    kernel_printf("keyboard_init: Initializing keyboard driver...\n");

    /* キーボード状態を初期化 */
    memset(&kb_state, 0, sizeof(keyboard_state_t));

    /* キーボード割り込み（IRQ1）を有効化 */
    register_interrupt_handler(33, keyboard_handler);

    /* PICでIRQ1を有効化 */
    outb(0x21, inb(0x21) & ~0x02);  // IRQ1をアンマスク

    kernel_printf("keyboard_init: Keyboard driver initialized\n");
}

void keyboard_handler(interrupt_frame_t* frame) {
    UNUSED(frame); /* パラメータ未使用の警告を回避 */

    u8 status = inb(KEYBOARD_STATUS_PORT);

    /* 出力バッファが準備できている場合のみ処理 */
    if (!(status & KEYBOARD_STATUS_OUTPUT_BUFFER)) {
        return;
    }

    u8 scancode = inb(KEYBOARD_DATA_PORT);

    /* キーリリース（最上位ビットが1）は無視 */
    if (scancode & 0x80) {
        scancode &= 0x7F; /* リリースビットを除去 */

        /* 修飾キーのリリースを処理 */
        if (scancode == KEY_LSHIFT || scancode == KEY_RSHIFT) {
            kb_state.shift_pressed = false;
        } else if (scancode == KEY_LCTRL) {
            kb_state.ctrl_pressed = false;
        } else if (scancode == KEY_LALT) {
            kb_state.alt_pressed = false;
        }
        return;
    }

    /* 修飾キーの処理 */
    if (scancode == KEY_LSHIFT || scancode == KEY_RSHIFT) {
        kb_state.shift_pressed = true;
        return;
    } else if (scancode == KEY_LCTRL) {
        kb_state.ctrl_pressed = true;
        return;
    } else if (scancode == KEY_LALT) {
        kb_state.alt_pressed = true;
        return;
    }

    /* 通常のキーを文字に変換 */
    char ascii = 0;
    if (scancode < sizeof(keyboard_map)) {
        if (kb_state.shift_pressed && scancode < sizeof(keyboard_map_shifted)) {
            ascii = keyboard_map_shifted[scancode];
        } else {
            ascii = keyboard_map[scancode];
        }
    }

    /* 有効な文字をバッファに追加 */
    if (ascii != 0 && kb_state.count < KEYBOARD_BUFFER_SIZE - 1) {
        kb_state.buffer[kb_state.write_pos] = ascii;
        kb_state.write_pos = (kb_state.write_pos + 1) % KEYBOARD_BUFFER_SIZE;
        kb_state.count++;

        /* エコー表示（デバッグ用） */
        if (ascii == '\n') {
            kernel_printf("\n");
        } else if (ascii == '\b') {
            kernel_printf("\b \b");
        } else if (ascii >= 32 && ascii <= 126) {
            char echo[2] = {ascii, '\0'};
            kernel_printf("%s", echo);
        }
    }
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
