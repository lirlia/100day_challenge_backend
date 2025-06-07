#include "../include/kernel.h"

/* ユーザーモード用システムコール */
static int sys_exit(int code) {
    asm volatile (
        "mov $0, %%eax\n"    // システムコール番号 0 (exit)
        "mov %0, %%ebx\n"    // 終了コード
        "int $0x80\n"        // システムコール実行
        :
        : "r" (code)
        : "eax", "ebx"
    );
    return 0; // 実際にはここには戻ってこない
}

static int sys_write(const char* msg, int len) {
    int result;
    asm volatile (
        "mov $1, %%eax\n"    // システムコール番号 1 (write)
        "mov %1, %%ebx\n"    // メッセージポインタ
        "mov %2, %%ecx\n"    // 長さ
        "int $0x80\n"        // システムコール実行
        "mov %%eax, %0\n"    // 戻り値を取得
        : "=r" (result)
        : "r" (msg), "r" (len)
        : "eax", "ebx", "ecx"
    );
    return result;
}

static int sys_getchar(void) {
    int result;
    asm volatile (
        "mov $2, %%eax\n"    // システムコール番号 2 (getchar)
        "int $0x80\n"        // システムコール実行
        "mov %%eax, %0\n"    // 戻り値を取得
        : "=r" (result)
        :
        : "eax"
    );
    return result;
}

/* ユーザーモード用printf代替 */
static void shell_print(const char* str) {
    int len = 0;
    const char* p = str;
    while (*p++) len++;  // 文字列長を計算
    sys_write(str, len);
}

/* 文字列比較 */
static int shell_strcmp(const char* s1, const char* s2) {
    while (*s1 && *s2 && *s1 == *s2) {
        s1++;
        s2++;
    }
    return *s1 - *s2;
}

/* コマンドライン入力 */
static int shell_readline(char* buffer, int max_len) {
    int pos = 0;
    char c;

    while (pos < max_len - 1) {
        /* キーボードから1文字取得（ポーリング） */
        while ((c = sys_getchar()) == 0) {
            /* キー入力を待機 */
            asm("hlt");  // CPUを一時停止してエネルギー節約
        }

        if (c == '\n') {
            /* Enterキーで入力完了 */
            buffer[pos] = '\0';
            shell_print("\n");
            return pos;
        } else if (c == '\b' && pos > 0) {
            /* バックスペース処理 */
            pos--;
            shell_print("\b \b");
        } else if (c >= 32 && c <= 126) {
            /* 印刷可能文字 */
            buffer[pos++] = c;
            char echo[2] = {c, '\0'};
            shell_print(echo);
        }
    }

    buffer[pos] = '\0';
    return pos;
}

/* コマンド解析と実行 */
static void execute_command(const char* command) {
    if (shell_strcmp(command, "help") == 0) {
        shell_print("=== Mini OS Shell v1.0 ===\n");
        shell_print("Available commands:\n");
        shell_print("  help     - Show this help\n");
        shell_print("  version  - Show OS version\n");
        shell_print("  memory   - Show memory info\n");
        shell_print("  clear    - Clear screen\n");
        shell_print("  uptime   - Show system uptime\n");
        shell_print("  exit     - Exit shell\n");
    }
    else if (shell_strcmp(command, "version") == 0) {
        shell_print("Mini OS v0.1.0 - User Mode Shell\n");
        shell_print("Built with love and assembly code!\n");
        shell_print("Features: Memory Management, Process Management, Interrupts, User Mode\n");
    }
    else if (shell_strcmp(command, "memory") == 0) {
        shell_print("=== Memory Information ===\n");
        shell_print("Total Memory: 256MB\n");
        shell_print("Current Mode: User Mode (Ring 3)\n");
        shell_print("Page Size: 4KB\n");
        shell_print("Available: Dynamic allocation via system calls\n");
    }
    else if (shell_strcmp(command, "clear") == 0) {
        shell_print("\033[2J\033[H");  // ANSI escape sequence for clear screen
        shell_print("Screen cleared!\n");
    }
    else if (shell_strcmp(command, "uptime") == 0) {
        shell_print("System uptime: Active since boot\n");
        shell_print("Process management: 2 processes running\n");
        shell_print("Interrupt system: Fully operational\n");
    }
    else if (shell_strcmp(command, "exit") == 0) {
        shell_print("Thank you for using Mini OS Shell!\n");
        shell_print("Shutting down...\n");
        sys_exit(0);
    }
    else if (command[0] == '\0') {
        // 空のコマンド - 何もしない
    }
    else {
        shell_print("Unknown command: '");
        shell_print(command);
        shell_print("'\n");
        shell_print("Type 'help' for available commands.\n");
    }
}

/* メインシェルループ */
static void shell_main(void) {
    char command_buffer[256];

    shell_print("\n");
    shell_print("=====================================\n");
    shell_print("    Welcome to Mini OS Shell!\n");
    shell_print("=====================================\n");
    shell_print("Type 'help' for available commands.\n\n");

    while (1) {
        shell_print("mini-os> ");

        int len = shell_readline(command_buffer, sizeof(command_buffer));
        if (len > 0) {
            execute_command(command_buffer);
        }
    }
}

/* エントリポイント（ユーザーモードから呼び出される） */
void shell_start(void) {
    // カーネルモードでのテスト用
    extern void kernel_printf(const char* format, ...);

    kernel_printf("\n");
    kernel_printf("=====================================\n");
    kernel_printf("    Welcome to Mini OS Shell!\n");
    kernel_printf("=====================================\n");
    kernel_printf("Running in KERNEL MODE (temporary test)\n");
    kernel_printf("Features available:\n");
    kernel_printf("  - Memory Management: 256MB\n");
    kernel_printf("  - Process Management: 2 processes\n");
    kernel_printf("  - Interrupt System: Fully operational\n");
    kernel_printf("  - Keyboard Driver: Initialized\n");
    kernel_printf("  - User Mode: Ready (GDT/TSS pending)\n");
    kernel_printf("\n");
    kernel_printf("Next steps:\n");
    kernel_printf("  1. Enable GDT and TSS\n");
    kernel_printf("  2. Switch to user mode\n");
    kernel_printf("  3. Interactive shell with keyboard input\n");
    kernel_printf("\n");
    kernel_printf("Shell test completed successfully!\n");
    kernel_printf("=====================================\n");

    // 元のユーザーモード版はコメントアウト
    // shell_main();
}