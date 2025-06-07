#include "../include/kernel.h"
#include "../include/interrupt.h"
#include "../include/keyboard.h"

/* テスト結果を格納する構造体 */
typedef struct {
    u32 test_passed;
    u32 test_failed;
    char last_error[256];
} test_results_t;

static test_results_t test_results = {0, 0, ""};

/* テストヘルパー関数 */
static void test_assert(bool condition, const char* test_name) {
    if (condition) {
        test_results.test_passed++;
        kernel_printf("✓ PASS: %s\n", test_name);
    } else {
        test_results.test_failed++;
        kernel_printf("✗ FAIL: %s\n", test_name);
        strncpy(test_results.last_error, test_name, sizeof(test_results.last_error) - 1);
    }
}

/* テスト1: interrupt_frame_t構造体のサイズとアライメント確認 */
void test_interrupt_frame_structure(void) {
    kernel_printf("\n=== Test 1: interrupt_frame_t Structure ===\n");

    size_t expected_size = 15 * sizeof(u32);  // 15個のu32フィールド
    size_t actual_size = sizeof(interrupt_frame_t);

    kernel_printf("Expected size: %u bytes\n", expected_size);
    kernel_printf("Actual size: %u bytes\n", actual_size);

    test_assert(actual_size == expected_size, "interrupt_frame_t size check");

    /* 各フィールドのオフセット確認 */
    interrupt_frame_t* frame = (interrupt_frame_t*)0;  // オフセット計算用

    kernel_printf("Field offsets:\n");
    kernel_printf("  edi: %u\n", (u32)&frame->edi);
    kernel_printf("  esi: %u\n", (u32)&frame->esi);
    kernel_printf("  ebp: %u\n", (u32)&frame->ebp);
    kernel_printf("  orig_esp: %u\n", (u32)&frame->orig_esp);
    kernel_printf("  ebx: %u\n", (u32)&frame->ebx);
    kernel_printf("  edx: %u\n", (u32)&frame->edx);
    kernel_printf("  ecx: %u\n", (u32)&frame->ecx);
    kernel_printf("  eax: %u\n", (u32)&frame->eax);
    kernel_printf("  ds: %u\n", (u32)&frame->ds);
    kernel_printf("  err_code: %u\n", (u32)&frame->err_code);
    kernel_printf("  int_no: %u\n", (u32)&frame->int_no);
    kernel_printf("  eip: %u\n", (u32)&frame->eip);
    kernel_printf("  cs: %u\n", (u32)&frame->cs);
    kernel_printf("  eflags: %u\n", (u32)&frame->eflags);
}

/* テスト2: スタック状態テスト */
void test_stack_state(void) {
    kernel_printf("\n=== Test 2: Stack State Analysis ===\n");

    u32 current_esp;
    asm volatile("mov %%esp, %0" : "=r"(current_esp));

    kernel_printf("Current ESP: 0x%08x\n", current_esp);

    /* スタック上位アドレスの内容をダンプ */
    u32* stack_ptr = (u32*)current_esp;
    kernel_printf("Stack dump (16 entries):\n");
    for (int i = 0; i < 16; i++) {
        kernel_printf("  [ESP+%02d]: 0x%08x\n", i*4, stack_ptr[i]);
    }
}

/* テスト3: レジスタ状態テスト */
void test_register_state(void) {
    kernel_printf("\n=== Test 3: Register State ===\n");

    u32 eax, ebx, ecx, edx, esi, edi, ebp, esp;
    u16 cs, ds, es, fs, gs, ss;
    u32 eflags;

    asm volatile(
        "mov %%eax, %0\n"
        "mov %%ebx, %1\n"
        "mov %%ecx, %2\n"
        "mov %%edx, %3\n"
        "mov %%esi, %4\n"
        "mov %%edi, %5\n"
        "mov %%ebp, %6\n"
        "mov %%esp, %7\n"
        : "=m"(eax), "=m"(ebx), "=m"(ecx), "=m"(edx),
          "=m"(esi), "=m"(edi), "=m"(ebp), "=m"(esp)
    );

    asm volatile(
        "mov %%cs, %0\n"
        "mov %%ds, %1\n"
        "mov %%es, %2\n"
        "mov %%fs, %3\n"
        "mov %%gs, %4\n"
        "mov %%ss, %5\n"
        "pushf\n"
        "pop %6\n"
        : "=m"(cs), "=m"(ds), "=m"(es), "=m"(fs), "=m"(gs), "=m"(ss), "=m"(eflags)
    );

    kernel_printf("General Registers:\n");
    kernel_printf("  EAX: 0x%08x  EBX: 0x%08x\n", eax, ebx);
    kernel_printf("  ECX: 0x%08x  EDX: 0x%08x\n", ecx, edx);
    kernel_printf("  ESI: 0x%08x  EDI: 0x%08x\n", esi, edi);
    kernel_printf("  EBP: 0x%08x  ESP: 0x%08x\n", ebp, esp);

    kernel_printf("Segment Registers:\n");
    kernel_printf("  CS: 0x%04x  DS: 0x%04x  ES: 0x%04x\n", cs, ds, es);
    kernel_printf("  FS: 0x%04x  GS: 0x%04x  SS: 0x%04x\n", fs, gs, ss);
    kernel_printf("  EFLAGS: 0x%08x\n", eflags);
}

/* テスト4: 安全な割り込みハンドラーテスト */
static volatile u32 test_interrupt_called = 0;
static volatile u32 test_scancode = 0;

void test_safe_keyboard_handler(interrupt_frame_t* frame) {
    kernel_printf("DEBUG: test_safe_keyboard_handler called\n");
    kernel_printf("DEBUG: frame pointer = %p\n", frame);

    if (frame == NULL) {
        kernel_printf("ERROR: frame is NULL!\n");
        outb(0x20, 0x20);
        return;
    }

    kernel_printf("DEBUG: frame->int_no = %u\n", frame->int_no);
    kernel_printf("DEBUG: frame->err_code = %u\n", frame->err_code);
    kernel_printf("DEBUG: frame->eip = 0x%08x\n", frame->eip);
    kernel_printf("DEBUG: frame->cs = 0x%04x\n", frame->cs);
    kernel_printf("DEBUG: frame->eflags = 0x%08x\n", frame->eflags);

    /* 安全にスキャンコードを読み取り */
    test_scancode = inb(KEYBOARD_DATA_PORT);
    test_interrupt_called++;

    kernel_printf("DEBUG: scancode = 0x%02x, call count = %u\n", test_scancode, test_interrupt_called);

    /* EOI送信 */
    outb(0x20, 0x20);

    kernel_printf("DEBUG: test_safe_keyboard_handler completed\n");
}

/* テスト5: キーボード割り込みテスト */
void test_keyboard_interrupt(void) {
    kernel_printf("\n=== Test 5: Keyboard Interrupt Test ===\n");

    /* 元のハンドラーを保存 */
    interrupt_handler_t original_handler = get_interrupt_handler(33);

    /* テスト用ハンドラーを登録 */
    register_interrupt_handler(33, test_safe_keyboard_handler);

    kernel_printf("Test keyboard handler registered\n");
    kernel_printf("Please press any key (test will wait 10 seconds)...\n");

    /* 10秒間キー入力を待つ */
    u32 start_count = test_interrupt_called;
    for (int i = 0; i < 1000; i++) {
        /* 10ms待機 */
        for (volatile int j = 0; j < 100000; j++);

        if (test_interrupt_called > start_count) {
            kernel_printf("Key detected! Scancode: 0x%02x\n", test_scancode);
            break;
        }
    }

    if (test_interrupt_called == start_count) {
        kernel_printf("No key press detected within timeout\n");
    }

    /* 元のハンドラーを復元 */
    if (original_handler) {
        register_interrupt_handler(33, original_handler);
        kernel_printf("Original handler restored\n");
    }
}

/* テスト6: Division by Zero テスト */
void test_division_by_zero(void) {
    kernel_printf("\n=== Test 6: Division by Zero Test ===\n");

    kernel_printf("Testing intentional division by zero...\n");

    /* 意図的にゼロ除算を発生させる */
    volatile u32 a = 10;
    volatile u32 b = 0;
    volatile u32 result __attribute__((unused));

    kernel_printf("About to divide %u by %u\n", a, b);

    /* この行でDivision Errorが発生するはず */
    // result = a / b;  // コメントアウトして安全にテスト

    kernel_printf("If you see this, division by zero was avoided\n");
}

/* 全テストを実行 */
void run_interrupt_tests(void) {
    kernel_printf("\n");
    kernel_printf("=====================================\n");
    kernel_printf("    Interrupt System Tests\n");
    kernel_printf("=====================================\n");

    test_results.test_passed = 0;
    test_results.test_failed = 0;

    test_interrupt_frame_structure();
    test_stack_state();
    test_register_state();
    test_keyboard_interrupt();
    test_division_by_zero();

    kernel_printf("\n=== Test Results ===\n");
    kernel_printf("Passed: %u\n", test_results.test_passed);
    kernel_printf("Failed: %u\n", test_results.test_failed);

    if (test_results.test_failed > 0) {
        kernel_printf("Last error: %s\n", test_results.last_error);
    }

    kernel_printf("=====================================\n");
}