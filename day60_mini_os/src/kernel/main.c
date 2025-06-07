#include "kernel.h"
#include "memory.h"
#include "process.h"  // プロセス管理を有効化
#include "interrupt.h" // 割り込み処理を追加
#include "paging.h"
#include "usermode.h" // ユーザーモード管理を追加
#include "keyboard.h" // キーボードドライバを追加

/* Global kernel printf function */
void kernel_printf(const char* format, ...) {
    __builtin_va_list args;
    __builtin_va_start(args, format);

    /* For now, redirect to serial output */
    char buffer[1024];
    int i = 0;

    while (*format && i < sizeof(buffer) - 1) {
        if (*format == '%') {
            format++;
            switch (*format) {
                case 's': {
                    const char* str = __builtin_va_arg(args, const char*);
                    if (str) {
                        while (*str && i < sizeof(buffer) - 1) {
                            buffer[i++] = *str++;
                        }
                    } else {
                        const char* null_str = "(null)";
                        while (*null_str && i < sizeof(buffer) - 1) {
                            buffer[i++] = *null_str++;
                        }
                    }
                    break;
                }
                case 'd': {
                    int num = __builtin_va_arg(args, int);
                    char num_buffer[32];
                    int num_len = 0;

                    if (num < 0) {
                        if (i < sizeof(buffer) - 1) buffer[i++] = '-';
                        num = -num;
                    }

                    if (num == 0) {
                        if (i < sizeof(buffer) - 1) buffer[i++] = '0';
                    } else {
                        while (num > 0) {
                            num_buffer[num_len++] = '0' + (num % 10);
                            num /= 10;
                        }
                        for (int j = num_len - 1; j >= 0 && i < sizeof(buffer) - 1; j--) {
                            buffer[i++] = num_buffer[j];
                        }
                    }
                    break;
                }
                case 'l': { // long (for llx)
                    format++;
                    if (*format == 'l' && *(format+1) == 'x') {
                        format++;
                        unsigned long long num = __builtin_va_arg(args, unsigned long long);
                        unsigned int high = num >> 32;
                        unsigned int low = num & 0xFFFFFFFF;

                        // Simple hex print for high and low parts
                        char temp_buf[17];
                        int to_hex(unsigned int n, char* buf) {
                            if (n == 0) { buf[0] = '0'; buf[1] = 0; return 1; }
                            char* p = buf;
                            int len = 0;
                            while(n > 0) {
                                *p++ = "0123456789abcdef"[n & 0xF];
                                n >>= 4;
                                len++;
                            }
                            *p = 0;
                            // reverse
                            char* p1 = buf;
                            char* p2 = p - 1;
                            while(p1 < p2) {
                                char tmp = *p1;
                                *p1++ = *p2;
                                *p2-- = tmp;
                            }
                            return len;
                        }

                        if (high > 0) {
                            to_hex(high, temp_buf);
                            for(char* c = temp_buf; *c; ++c) if (i < sizeof(buffer) -1) buffer[i++] = *c;

                            // pad with zeros for the low part
                            int low_len = to_hex(low, temp_buf);
                            for(int k=0; k < 8-low_len; ++k) if (i < sizeof(buffer) -1) buffer[i++] = '0';

                        }
                        to_hex(low, temp_buf);
                        for(char* c = temp_buf; *c; ++c) if (i < sizeof(buffer) -1) buffer[i++] = *c;

                    } else if (*format == 'l' && *(format+1) == 'u') {
                         format++;
                        unsigned long long num = __builtin_va_arg(args, unsigned long long);
                        if (num == 0) {
                            if (i < sizeof(buffer) - 1) buffer[i++] = '0';
                        } else {
                            char num_buffer[21] = {0}; // max 20 digits for u64
                            char* p = num_buffer + 20;
                            while(num > 0) {
                                // Custom u64 div/mod 10
                                unsigned long long rem = 0;
                                unsigned long long temp = 0;
                                for(int k=0; k<64; ++k) {
                                    rem = (rem << 1) | ((num >> (63-k)) & 1);
                                    if (rem >= 10) {
                                        rem -= 10;
                                        temp |= (1ULL << (63-k));
                                    }
                                }
                                *--p = '0' + rem;
                                num = temp;
                            }
                            while(*p) {
                                if (i < sizeof(buffer) - 1) buffer[i++] = *p++;
                                else break;
                            }
                        }
                    }
                    break;
                }
                case 'u': {
                    unsigned int num = __builtin_va_arg(args, unsigned int);
                    char num_buffer[32];
                    int num_len = 0;

                    if (num == 0) {
                        if (i < sizeof(buffer) - 1) buffer[i++] = '0';
                    } else {
                        while (num > 0) {
                            num_buffer[num_len++] = '0' + (num % 10);
                            num /= 10;
                        }
                        for (int j = num_len - 1; j >= 0 && i < sizeof(buffer) - 1; j--) {
                            buffer[i++] = num_buffer[j];
                        }
                    }
                    break;
                }
                case 'x': {
                    unsigned int num = __builtin_va_arg(args, unsigned int);
                    char digits[] = "0123456789abcdef";
                    char num_buffer[32];
                    int num_len = 0;

                    if (num == 0) {
                        if (i < sizeof(buffer) - 1) buffer[i++] = '0';
                    } else {
                        while (num > 0) {
                            num_buffer[num_len++] = digits[num % 16];
                            num /= 16;
                        }
                        for (int j = num_len - 1; j >= 0 && i < sizeof(buffer) - 1; j--) {
                            buffer[i++] = num_buffer[j];
                        }
                    }
                    break;
                }
                case '%': {
                    if (i < sizeof(buffer) - 1) buffer[i++] = '%';
                    break;
                }
                default: {
                    if (i < sizeof(buffer) - 1) buffer[i++] = '%';
                    if (i < sizeof(buffer) - 1) buffer[i++] = *format;
                    break;
                }
            }
        } else {
            buffer[i++] = *format;
        }
        format++;
    }

    buffer[i] = '\0';
    serial_write(buffer);

    __builtin_va_end(args);
}

void kernel_log(const char* level, const char* format, ...) {
    __builtin_va_list args;
    __builtin_va_start(args, format);

    /* Print timestamp placeholder and level */
    kernel_printf("[%s] ", level);

    /* Print the actual message */
    char buffer[1024];
    int i = 0;

    while (*format && i < sizeof(buffer) - 1) {
        if (*format == '%') {
            format++;
            switch (*format) {
                case 's': {
                    const char* str = __builtin_va_arg(args, const char*);
                    if (str) {
                        while (*str && i < sizeof(buffer) - 1) {
                            buffer[i++] = *str++;
                        }
                    }
                    break;
                }
                case 'd': {
                    int num = __builtin_va_arg(args, int);
                    char num_buffer[32];
                    int num_len = 0;

                    if (num < 0) {
                        if (i < sizeof(buffer) - 1) buffer[i++] = '-';
                        num = -num;
                    }

                    if (num == 0) {
                        if (i < sizeof(buffer) - 1) buffer[i++] = '0';
                    } else {
                        while (num > 0) {
                            num_buffer[num_len++] = '0' + (num % 10);
                            num /= 10;
                        }
                        for (int j = num_len - 1; j >= 0 && i < sizeof(buffer) - 1; j--) {
                            buffer[i++] = num_buffer[j];
                        }
                    }
                    break;
                }
                default: {
                    if (i < sizeof(buffer) - 1) buffer[i++] = *format;
                    break;
                }
            }
        } else {
            buffer[i++] = *format;
        }
        format++;
    }

    buffer[i] = '\0';
    serial_write(buffer);
    serial_write("\n");

    __builtin_va_end(args);
}

void kernel_panic(const char* message) {
    disable_interrupts();

    kernel_printf("\n\n");
    kernel_printf("=====================================\n");
    kernel_printf("        KERNEL PANIC\n");
    kernel_printf("=====================================\n");
    kernel_printf("Message: %s\n", message);
    kernel_printf("System halted.\n");
    kernel_printf("=====================================\n");

    while (1) {
        halt();
    }
}

// Test function without arguments
void test_function_call(void) {
    kernel_printf("test_function_call: This function was called successfully\n");
}

void test_memory_allocator(void) {
    kernel_printf("\n=== Memory Allocator Test ===\n");

    // Test page allocation
    kernel_printf("Testing page allocation...\n");
    u32 page1 = alloc_page();
    kernel_printf("Allocated page 1: %u\n", page1);

    u32 page2 = alloc_page();
    kernel_printf("Allocated page 2: %u\n", page2);

    u32 page3 = alloc_page();
    kernel_printf("Allocated page 3: %u\n", page3);

    // Print memory status after allocation
    memory_print_info();

    // Test page deallocation
    kernel_printf("Testing page deallocation...\n");
    free_page(page2);
    kernel_printf("Freed page 2: %u\n", page2);

    // Print memory status after deallocation
    memory_print_info();

    // Test reallocating freed page
    u32 page4 = alloc_page();
    kernel_printf("Allocated page 4: %u\n", page4);

    // Final memory status
    memory_print_info();

    kernel_printf("=== Memory Test Complete ===\n\n");
}

// プロセス管理の基本的なテスト関数 (段階的に有効化)
void test_process_management(void) {
    kernel_printf("\n=== Process Management Test ===\n");

    // 段階1: プロセス管理初期化のみ
    kernel_printf("About to call process_init...\n");
    process_init();
    kernel_printf("process_init completed successfully\n");

    // 段階2: プロセス作成テスト
    kernel_printf("Testing process creation...\n");

    // アイドルプロセス作成
    process_t* idle_proc = kernel_process_create("idle", idle_process);
    if (idle_proc) {
        kernel_printf("Created idle process (PID=%u)\n", idle_proc->pid);
    } else {
        kernel_printf("ERROR: Failed to create idle process\n");
    }

    // テストプロセスA作成
    process_t* test_proc_a = kernel_process_create("test_a", test_process_a);
    if (test_proc_a) {
        kernel_printf("Created test process A (PID=%u)\n", test_proc_a->pid);
    } else {
        kernel_printf("ERROR: Failed to create test process A\n");
    }

    // プロセス情報表示
    process_print_info();
    process_list_all();

    // 段階3: プロセス関数の直接実行テスト (コンテキストスイッチなし)
    kernel_printf("Testing process function execution (direct call)...\n");

    // テストプロセスAの関数を直接呼び出し
    kernel_printf("Calling test_process_a function directly...\n");
    test_process_a();
    kernel_printf("test_process_a function completed\n");

    kernel_printf("=== Process Management Test Complete ===\n\n");
}

// 割り込み処理の基本的なテスト関数
void test_interrupt_system(void) {
    kernel_printf("\n=== Interrupt System Test ===\n");

    // 段階1: 割り込み初期化のみ
    kernel_printf("About to call interrupt_init...\n");
    interrupt_init();
    kernel_printf("interrupt_init completed successfully\n");

    // 段階2: 割り込み無効状態でのテスト
    kernel_printf("Testing interrupt system (no timer)...\n");

    // NOTE: 除算エラーテストを削除
    // kernel_printf("Testing division by zero exception...\n");
    // volatile int a = 10;
    // volatile int b = 0;
    // volatile int c = a / b;  // この行でDivision Errorが発生する

    kernel_printf("Basic interrupt system test completed\n");

    kernel_printf("=== Interrupt System Test Complete ===\n\n");
}

// ページング（仮想メモリ）の基本的なテスト関数
void test_paging_system(void) {
    kernel_printf("\n=== Paging System Test ===\n");

    // 段階1: ページング初期化のみ（簡略化）
    kernel_printf("About to call paging_init...\n");

    // 一時的にページング初期化をスキップ
    kernel_printf("Skipping paging_init for now (debugging)\n");

    // paging_init();
    // kernel_printf("paging_init completed successfully\n");

    // 段階2: ページング情報の表示（スキップ）
    // paging_print_info();

    kernel_printf("=== Paging System Test Complete ===\n\n");
}

// ユーザーモード（特権レベル分離）の基本的なテスト関数
void test_usermode_system(void) {
    kernel_printf("\n=== User Mode System Test ===\n");

    // 段階1: ユーザーモード初期化
    kernel_printf("About to call usermode_init...\n");
    usermode_init();
    kernel_printf("usermode_init completed successfully\n");

    // 段階2: ユーザーモード情報表示
    usermode_print_info();

    // 段階3: キーボード初期化
    kernel_printf("About to call keyboard_init...\n");
    keyboard_init();
    kernel_printf("keyboard_init completed successfully\n");

    // 段階4: シェルプログラムをユーザーモードで実行
    extern void shell_start(void); // シェルのエントリポイント
    kernel_printf("About to execute shell in user mode...\n");

    // ユーザーモードでシェル関数を実行（一時的にスキップ）
    // execute_user_function((void(*)(void))shell_start);

    // 一時的にカーネルモードでシェルをテスト
    kernel_printf("Testing shell in kernel mode (temporary)...\n");
    shell_start();

    // ここには戻ってこないはず
    kernel_printf("Returned from shell execution\n");

    kernel_printf("=== User Mode System Test Complete ===\n\n");
}

void kmain(void) {
    /* Initialize serial port for logging */
    serial_init();

    kernel_printf("\n=====================================\n");
    kernel_printf("       Mini OS v0.1.0\n");
    kernel_printf("=====================================\n\n");

    kernel_printf("About to call test function...\n");
    test_function_call();
    kernel_printf("test function returned successfully\n");

    // Initialize memory manager
    kernel_printf("About to call memory_init with NULL...\n");
    memory_init(NULL);
    kernel_printf("memory_init returned successfully\n");

    // Test memory allocator
    test_memory_allocator();

    // Test process management (段階的に有効化)
    test_process_management();

    // Test interrupt system
    test_interrupt_system();

    // Test paging system
    test_paging_system();

    // Test user mode system
    test_usermode_system();

    kernel_printf("All tests completed successfully. Halting.\n");

    /* Halt the system */
    for (;;) {
        asm("hlt");
    }
}
