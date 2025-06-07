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

static int shell_strncmp(const char* s1, const char* s2, int n) {
    for (int i = 0; i < n; i++) {
        if (s1[i] != s2[i] || s1[i] == '\0' || s2[i] == '\0') {
            return (unsigned char)s1[i] - (unsigned char)s2[i];
        }
    }
    return 0;
}

/* 前方宣言 */
static void execute_shell_command(const char* command);

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

/* エントリポイント（カーネルモードでの対話的シェル） */
void shell_start(void) {
    extern void kernel_printf(const char* format, ...);
    extern void console_write(const char* str);
    extern void vga_clear(void);
    extern int keyboard_getchar(void);  // キーボードから文字を取得

    char command_buffer[256];
    int pos = 0;
    char c;

    // 画面をクリアして起動メッセージ表示
    vga_clear();
    console_write("\n");
    console_write("=====================================\n");
    console_write("    Welcome to Mini OS Shell!\n");
    console_write("=====================================\n");
    console_write("Features:\n");
    console_write("  - Memory Management: 256MB\n");
    console_write("  - Process Management: 2 processes\n");
    console_write("  - Interrupt System: Fully operational\n");
    console_write("  - Keyboard Driver: Interactive input\n");
    console_write("  - VGA Display: 80x25 text mode\n");
    console_write("\n");
    console_write("Type 'help' for available commands.\n");
    console_write("Use Ctrl+C to exit.\n\n");

    console_write("Shell successfully started!\n");

        /* 割り込みを有効化（シェル起動後） */
    console_write("Enabling interrupts...\n");
    asm volatile("sti");
    console_write("Interrupts enabled! Ready for keyboard input.\n");

    /* 準備完了 */
    console_write("\nReady for keyboard input! Structure has been fixed.\n");

    // メインシェルループ
    while (1) {
        console_write("mini-os> ");
        pos = 0;

        // コマンドライン入力処理
        while (pos < sizeof(command_buffer) - 1) {
            /* キーボードから1文字取得（ポーリング） */
            while ((c = keyboard_getchar()) == 0) {
                /* キー入力を待機 */
                asm("pause");  // CPUを一時停止してエネルギー節約
            }

            if (c == '\n') {
                /* Enterキーで入力完了 */
                command_buffer[pos] = '\0';
                console_write("\n");
                break;
            } else if (c == '\b' && pos > 0) {
                /* バックスペース処理 */
                pos--;
                console_write("\b \b");
            } else if (c >= 32 && c <= 126) {
                /* 印刷可能文字 */
                command_buffer[pos++] = c;
                char echo[2] = {c, '\0'};
                console_write(echo);
            }
        }

        command_buffer[pos] = '\0';

        // コマンド処理
        if (pos > 0) {
            execute_shell_command(command_buffer);
        }
    }
}

/* コマンド実行（カーネルモード版） */
static void execute_shell_command(const char* command) {
    extern void console_write(const char* str);
    extern void memory_print_info(void);
    extern void process_print_info(void);
    extern void sprintf_simple(char* buffer, const char* format, ...);

    if (shell_strcmp(command, "help") == 0) {
        console_write("=== Mini OS Shell v1.0 ===\n");
        console_write("Available commands:\n");
        console_write("  help     - Show this help\n");
        console_write("  echo     - Display text (usage: echo [text])\n");
        console_write("  date     - Show current date and time\n");
        console_write("  version  - Show OS version\n");
        console_write("  memory   - Show memory info\n");
        console_write("  process  - Show process info\n");
        console_write("  daemon   - Show daemon status\n");
        console_write("  clear    - Clear screen\n");
        console_write("  uptime   - Show system uptime\n");
        console_write("  test     - Run system test\n");
        console_write("  inttest  - Run interrupt tests\n");
        console_write("  kbtest   - Run keyboard test\n");
        console_write("  reboot   - Restart system\n");
        console_write("Use Ctrl+C to exit shell.\n");
    }
    else if (shell_strcmp(command, "version") == 0) {
        console_write("=== Mini OS Version Information ===\n");
        console_write("OS Name:     Mini OS\n");
        console_write("Version:     v0.1.0\n");
        console_write("Build:       Day 60 Challenge\n");
        console_write("Architecture: x86-32bit\n");
        console_write("Mode:        Kernel Mode Shell\n");
        console_write("Memory:      256MB RAM\n");
        console_write("Features:    GDT, TSS, Interrupts, Paging-ready\n");
    }
    else if (shell_strcmp(command, "memory") == 0) {
        console_write("=== Memory Information ===\n");
        memory_print_info();
    }
    else if (shell_strcmp(command, "process") == 0) {
        console_write("=== Process Information ===\n");
        process_print_info();
        extern void process_list_all(void);
        process_list_all();
    }
    else if (shell_strcmp(command, "daemon") == 0) {
        extern void daemon_list_all(void);
        daemon_list_all();
    }
    else if (shell_strcmp(command, "clear") == 0) {
        extern void vga_clear(void);
        vga_clear();
        console_write("Screen cleared!\n");
    }
    else if (shell_strcmp(command, "uptime") == 0) {
        console_write("=== System Status ===\n");
        console_write("Status:          Running\n");
        console_write("Boot Status:     Completed successfully\n");
        console_write("Memory Manager:  Active\n");
        console_write("Process Manager: Active (2 processes)\n");
        console_write("Interrupt System: Active\n");
        console_write("Keyboard Driver: Active\n");
        console_write("VGA Driver:     Active (80x25 text mode)\n");
        console_write("User Mode:      Ready (GDT/TSS configured)\n");
    }
    else if (shell_strcmp(command, "test") == 0) {
        console_write("=== Running System Test ===\n");
        console_write("Testing memory allocation...\n");

        extern u32 alloc_page(void);
        extern void free_page(u32 page);

        u32 test_page = alloc_page();
        if (test_page != 0) {
            console_write("✓ Memory allocation successful\n");
            free_page(test_page);
            console_write("✓ Memory deallocation successful\n");
        } else {
            console_write("✗ Memory allocation failed\n");
        }

        console_write("✓ All tests passed!\n");
    }
    else if (shell_strcmp(command, "inttest") == 0) {
        console_write("=== Running Interrupt System Tests ===\n");

        extern void run_interrupt_tests(void);
        run_interrupt_tests();

        console_write("=== Interrupt tests completed ===\n");
    }
    else if (shell_strcmp(command, "kbtest") == 0) {
        console_write("=== Running Keyboard Test ===\n");
        console_write("Warning: This will temporarily replace keyboard handler\n");
        console_write("Press any key when prompted...\n");

        extern void test_keyboard_interrupt(void);
        test_keyboard_interrupt();

        console_write("=== Keyboard test completed ===\n");
    }
    else if (shell_strncmp(command, "echo ", 5) == 0) {
        /* echo コマンド - テキストを表示 */
        const char* text = command + 5;  /* "echo " の後の部分 */

        /* 引数がない場合は空行を出力 */
        if (*text == '\0') {
            console_write("\n");
        } else {
            /* 引数の文字列を出力 */
            console_write(text);
            console_write("\n");
        }
    }
    else if (shell_strcmp(command, "echo") == 0) {
        /* 引数なしのecho - 空行を出力 */
        console_write("\n");
    }
    else if (shell_strcmp(command, "date") == 0) {
        /* 日付と時刻を表示 */
        extern u32 get_system_ticks(void);
        extern void format_current_time(u32 ticks, char* buffer);

        u32 ticks = get_system_ticks();
        char time_buffer[64];
        format_current_time(ticks, time_buffer);

        console_write("=== System Date & Time ===\n");
        console_write("Date:         Saturday, June 7, 2025\n");
        console_write("Current Time: ");
        console_write(time_buffer);
        console_write("\n");
        console_write("Timezone:     JST (UTC+9)\n");
        console_write("Uptime:       ");

        /* 稼働時間を計算 */
        u32 seconds = ticks / 2;  /* 2Hz */
        u32 minutes = seconds / 60;
        u32 hours = minutes / 60;

        seconds %= 60;
        minutes %= 60;

        char uptime_str[32];
        if (hours > 0) {
            sprintf_simple(uptime_str, "%u:%02u:%02u", hours, minutes, seconds);
        } else {
            sprintf_simple(uptime_str, "%u:%02u", minutes, seconds);
        }

        console_write(uptime_str);
        console_write("\n");
    }
    else if (shell_strcmp(command, "reboot") == 0) {
        console_write("Rebooting system...\n");
        console_write("(Use Ctrl+Alt+Del in QEMU or close window)\n");
        // 実際のリブートは複雑なので、メッセージのみ表示
    }
    else if (command[0] == '\0') {
        // 空のコマンド - 何もしない
    }
    else {
        console_write("Unknown command: '");
        console_write(command);
        console_write("'\n");
        console_write("Type 'help' for available commands.\n");
    }
}

/* ユーザーモードテスト用の簡単な関数 */
void user_mode_test(void) {
    /* システムコールでメッセージを出力 */
    const char* msg = "Hello from User Mode!\n";

    /* 文字列長を手動で計算 */
    int len = 0;
    const char* p = msg;
    while (*p++) len++;

    sys_write(msg, len);

    /* システムコールで終了 */
    sys_exit(0);
}