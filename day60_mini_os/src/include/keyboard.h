#ifndef KEYBOARD_H
#define KEYBOARD_H

#include "kernel.h"
#include "interrupt.h"

/* キーボードポートとステータス */
#define KEYBOARD_DATA_PORT    0x60
#define KEYBOARD_STATUS_PORT  0x64
#define KEYBOARD_COMMAND_PORT 0x64

/* キーボードステータスビット */
#define KEYBOARD_STATUS_OUTPUT_BUFFER  0x01
#define KEYBOARD_STATUS_INPUT_BUFFER   0x02

/* スペシャルキー */
#define KEY_ESCAPE     0x01
#define KEY_BACKSPACE  0x0E
#define KEY_TAB        0x0F
#define KEY_ENTER      0x1C
#define KEY_LSHIFT     0x2A
#define KEY_RSHIFT     0x36
#define KEY_LCTRL      0x1D
#define KEY_LALT       0x38
#define KEY_SPACE      0x39
#define KEY_CAPSLOCK   0x3A

/* キーボード入力バッファ */
#define KEYBOARD_BUFFER_SIZE 256

typedef struct {
    char buffer[KEYBOARD_BUFFER_SIZE];
    u32 read_pos;
    u32 write_pos;
    u32 count;
    bool shift_pressed;
    bool ctrl_pressed;
    bool alt_pressed;
} keyboard_state_t;

/* 関数プロトタイプ */
void keyboard_init(void);
void keyboard_handler(interrupt_frame_t* frame);
char keyboard_get_char(void);
int keyboard_getchar(void);
bool keyboard_has_input(void);
void keyboard_print_status(void);

/* キーマップ */
extern const char keyboard_map[];
extern const char keyboard_map_shifted[];

#endif /* KEYBOARD_H */