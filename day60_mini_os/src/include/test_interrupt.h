#ifndef TEST_INTERRUPT_H
#define TEST_INTERRUPT_H

#include "kernel.h"

/* 個別テスト関数 */
void test_interrupt_frame_structure(void);
void test_stack_state(void);
void test_register_state(void);
void test_keyboard_interrupt(void);
void test_division_by_zero(void);

/* テストハンドラー */
void test_safe_keyboard_handler(interrupt_frame_t* frame);

/* メインテスト実行関数 */
void run_interrupt_tests(void);

#endif /* TEST_INTERRUPT_H */