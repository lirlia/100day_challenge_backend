#include "usermode.h"
#include "memory.h"
#include "interrupt.h"

/* グローバルユーザーモード管理変数 */
static usermode_manager_t usermode_manager;

/* システムコール前方宣言 */
void handle_syscall(interrupt_frame_t* frame);

void usermode_init(void) {
    kernel_printf("usermode_init: Initializing user mode system...\n");

    /* ユーザーモード管理構造体の初期化 */
    memset(&usermode_manager, 0, sizeof(usermode_manager_t));

    /* Phase 9: GDTの設定を有効化 */
    kernel_printf("usermode_init: Phase 9 - Setting up GDT...\n");
    gdt_setup();

    /* Phase 9: TSSの設定を有効化 */
    kernel_printf("usermode_init: Phase 9 - Setting up TSS...\n");
    tss_setup();

    /* システムコールハンドラーの登録 */
    kernel_printf("usermode_init: Registering system call handler...\n");
    register_interrupt_handler(0x80, handle_syscall);

    usermode_manager.usermode_enabled = true;
    kernel_printf("usermode_init: User mode system initialized\n");
    kernel_printf("usermode_init: Phase 9 complete - ready for user mode execution\n");
}

void gdt_setup(void) {
    kernel_printf("gdt_setup: Setting up Global Descriptor Table...\n");

    /* GDTエントリを設定 */

    /* 0x00: NULLディスクリプタ */
    gdt_set_gate(0, 0, 0, 0, 0);

    /* 0x08: カーネルコードセグメント */
    gdt_set_gate(1, 0, 0xFFFFFFFF,
                 GDT_ACCESS_PRESENT | GDT_ACCESS_PRIVILEGE(PRIVILEGE_KERNEL) |
                 GDT_ACCESS_DESCRIPTOR | GDT_ACCESS_EXECUTABLE | GDT_ACCESS_READWRITE,
                 GDT_GRAN_4K | GDT_GRAN_32BIT | GDT_GRAN_LIMIT_HIGH(0xF));

    /* 0x10: カーネルデータセグメント */
    gdt_set_gate(2, 0, 0xFFFFFFFF,
                 GDT_ACCESS_PRESENT | GDT_ACCESS_PRIVILEGE(PRIVILEGE_KERNEL) |
                 GDT_ACCESS_DESCRIPTOR | GDT_ACCESS_READWRITE,
                 GDT_GRAN_4K | GDT_GRAN_32BIT | GDT_GRAN_LIMIT_HIGH(0xF));

    /* 0x18: ユーザーコードセグメント */
    gdt_set_gate(3, 0, 0xFFFFFFFF,
                 GDT_ACCESS_PRESENT | GDT_ACCESS_PRIVILEGE(PRIVILEGE_USER) |
                 GDT_ACCESS_DESCRIPTOR | GDT_ACCESS_EXECUTABLE | GDT_ACCESS_READWRITE,
                 GDT_GRAN_4K | GDT_GRAN_32BIT | GDT_GRAN_LIMIT_HIGH(0xF));

    /* 0x20: ユーザーデータセグメント */
    gdt_set_gate(4, 0, 0xFFFFFFFF,
                 GDT_ACCESS_PRESENT | GDT_ACCESS_PRIVILEGE(PRIVILEGE_USER) |
                 GDT_ACCESS_DESCRIPTOR | GDT_ACCESS_READWRITE,
                 GDT_GRAN_4K | GDT_GRAN_32BIT | GDT_GRAN_LIMIT_HIGH(0xF));

    /* 0x28: TSSディスクリプタ */
    gdt_set_gate(5, (u32)&usermode_manager.tss, sizeof(tss_t) - 1,
                 GDT_ACCESS_PRESENT | GDT_ACCESS_PRIVILEGE(PRIVILEGE_KERNEL) | TSS_TYPE,
                 0);

    /* GDTポインタを設定 */
    usermode_manager.gdt_ptr.limit = sizeof(gdt_entry_t) * 6 - 1;
    usermode_manager.gdt_ptr.base = (u32)&usermode_manager.gdt;

    /* GDTをロード */
    gdt_load();

    kernel_printf("gdt_setup: GDT loaded successfully\n");
}

void tss_setup(void) {
    kernel_printf("tss_setup: Setting up Task State Segment...\n");

    /* TSSを初期化 */
    kernel_printf("tss_setup: Clearing TSS structure...\n");
    memset(&usermode_manager.tss, 0, sizeof(tss_t));
    kernel_printf("tss_setup: TSS structure cleared\n");

    /* カーネルスタックを設定（既存のスタックを使用） */
    kernel_printf("tss_setup: Setting up kernel stack...\n");
    u32 kernel_stack = 0x200000; // 2MB位置を仮のカーネルスタックとして使用

    usermode_manager.kernel_stack_top = kernel_stack + PAGE_SIZE;
    usermode_manager.tss.ss0 = KERNEL_DATA_SELECTOR;
    usermode_manager.tss.esp0 = usermode_manager.kernel_stack_top;
    kernel_printf("tss_setup: Kernel stack configured\n");

    /* I/Oマップベースを設定 */
    kernel_printf("tss_setup: Setting I/O map base...\n");
    usermode_manager.tss.iomap_base = sizeof(tss_t);
    kernel_printf("tss_setup: I/O map base set\n");

    /* TSSをロード（段階的デバッグ） */
    kernel_printf("tss_setup: TSS configuration complete\n");
    // 一時的にTSS flushをスキップしてデバッグ
    // tss_flush();

    kernel_printf("tss_setup: TSS loaded successfully (kernel stack: %u)\n",
                  usermode_manager.kernel_stack_top);
    kernel_printf("tss_setup: TSS setup completed\n");
}

void gdt_set_gate(int num, u32 base, u32 limit, u8 access, u8 gran) {
    usermode_manager.gdt[num].base_low = (base & 0xFFFF);
    usermode_manager.gdt[num].base_middle = (base >> 16) & 0xFF;
    usermode_manager.gdt[num].base_high = (base >> 24) & 0xFF;

    usermode_manager.gdt[num].limit_low = (limit & 0xFFFF);
    usermode_manager.gdt[num].granularity = (limit >> 16) & 0x0F;
    usermode_manager.gdt[num].granularity |= gran & 0xF0;

    usermode_manager.gdt[num].access = access;
}

void gdt_load(void) {
    gdt_flush((u32)&usermode_manager.gdt_ptr);
}

void tss_set_kernel_stack(u32 stack_top) {
    usermode_manager.tss.esp0 = stack_top;
    usermode_manager.kernel_stack_top = stack_top;
}

int create_user_process(const char* name, void* code, u32 code_size, u32 entry_point) {
    kernel_printf("create_user_process: Creating user process '%s'...\n", name);

    /* ユーザースタックを割り当て */
    u32 user_stack_physical = alloc_page();
    if (user_stack_physical == 0) {
        kernel_printf("create_user_process: Failed to allocate user stack\n");
        return -1;
    }

    /* ユーザーコード領域を割り当て */
    u32 user_code_physical = alloc_page();
    if (user_code_physical == 0) {
        kernel_printf("create_user_process: Failed to allocate user code\n");
        free_page(user_stack_physical);
        return -1;
    }

    /* コードをコピー */
    memcpy((void*)user_code_physical, code, code_size);

    /* プロセス作成 */
    process_t* proc = kernel_process_create(name, (void*)entry_point);
    if (!proc) {
        kernel_printf("create_user_process: Failed to create process\n");
        free_page(user_stack_physical);
        free_page(user_code_physical);
        return -1;
    }

    /* ユーザープロセス情報を設定 */
    proc->user_stack_base = user_stack_physical;
    proc->user_stack_size = PAGE_SIZE;
    proc->code_base = user_code_physical;
    proc->code_size = code_size;

    kernel_printf("create_user_process: User process '%s' created (PID=%u)\n",
                  name, proc->pid);
    return proc->pid;
}

void execute_user_function(void (*func)(void)) {
    kernel_printf("execute_user_function: Executing user function at 0x%x\n", (u32)func);

    /* ユーザースタックを割り当て（固定アドレス使用） */
    // u32 user_stack = alloc_page();
    // if (user_stack == 0) {
    //     kernel_printf("execute_user_function: Failed to allocate user stack\n");
    //     return;
    // }

    // 一時的に固定アドレスを使用（デバッグ用）
    u32 user_stack = 0x300000; // 3MB位置を仮のユーザースタックとして使用

    u32 user_stack_top = user_stack + PAGE_SIZE - 4; /* スタック頂上 */

    /* ユーザーモードに切り替えて実行 */
    kernel_printf("execute_user_function: Switching to user mode...\n");
    jump_to_user_mode((u32)func, user_stack_top);

    /* ここには戻ってこない */
    kernel_printf("execute_user_function: Returned from user mode\n");
    // free_page(user_stack);
}

void jump_to_user_mode(u32 code_addr, u32 stack_addr) {
    kernel_printf("jump_to_user_mode: Jumping to user mode (code=0x%x, stack=0x%x)\n",
                  code_addr, stack_addr);

    /* アセンブリ関数でユーザーモードに切り替え */
    switch_to_user_mode_asm(stack_addr, code_addr);
}

/* システムコールハンドラ */
void handle_syscall(interrupt_frame_t* frame) {
    u32 syscall_num = frame->eax;

    switch (syscall_num) {
        case 0: /* sys_exit */
            {
                u32 exit_code = frame->ebx;
                kernel_printf("handle_syscall: Process exit with code %u\n", exit_code);
                frame->eax = 0; /* 成功 */
                /* プロセス終了処理（簡易版） */
                kernel_printf("System call exit - halting system\n");
                while (1) {
                    asm("cli; hlt");
                }
            }
            break;

        case 1: /* sys_write */
            {
                const char* msg = (const char*)frame->ebx;
                u32 len = frame->ecx;
                kernel_printf("handle_syscall: Write request - len=%u\n", len);

                /* 簡易的な文字列出力（長さチェック付き） */
                if (len > 0 && len < 1024) { /* 安全性チェック */
                    for (u32 i = 0; i < len && msg[i] != '\0'; i++) {
                        char c = msg[i];
                        if (c >= 32 && c <= 126) {
                            /* 印刷可能文字 */
                            char output[2] = {c, '\0'};
                            kernel_printf("%s", output);
                        } else if (c == '\n') {
                            kernel_printf("\n");
                        } else if (c == '\t') {
                            kernel_printf("\t");
                        } else if (c == '\b') {
                            kernel_printf("\b");
                        }
                    }
                }

                frame->eax = len; /* 書き込んだバイト数を返す */
            }
            break;

        case 2: /* sys_getchar */
            {
                /* キーボード入力を取得 */
                extern bool keyboard_has_input(void);
                extern char keyboard_get_char(void);

                if (keyboard_has_input()) {
                    char c = keyboard_get_char();
                    frame->eax = (u32)c; /* 文字を返す */
                    kernel_printf("handle_syscall: getchar returned '%c' (0x%x)\n",
                                  (c >= 32 && c <= 126) ? c : '?', (u32)c);
                } else {
                    frame->eax = 0; /* 入力がない場合は0を返す */
                }
            }
            break;

        default:
            kernel_printf("handle_syscall: Unknown system call %u\n", syscall_num);
            frame->eax = -1; /* エラー */
            break;
    }
}

void usermode_print_info(void) {
    kernel_printf("\n--- User Mode Status ---\n");
    kernel_printf("User Mode Enabled: %s\n", usermode_manager.usermode_enabled ? "Yes" : "No");
    // kernel_printf("Kernel Stack Top: 0x%x\n", usermode_manager.kernel_stack_top);
    // kernel_printf("Current CS: 0x%x\n", get_cs());
    // kernel_printf("Current DS: 0x%x\n", get_ds());
    // kernel_printf("Current Privilege: Ring %u\n", get_current_privilege_level());
    // kernel_printf("GDT Base: 0x%x\n", usermode_manager.gdt_ptr.base);
    // kernel_printf("GDT Limit: %u\n", usermode_manager.gdt_ptr.limit);
    // kernel_printf("TSS ESP0: 0x%x\n", usermode_manager.tss.esp0);
    kernel_printf("Basic user mode structures initialized\n");
    kernel_printf("-----------------------\n");

    // デバッグ用: ここで一時停止
    kernel_printf("usermode_print_info completed successfully\n");
}

bool is_usermode_enabled(void) {
    return usermode_manager.usermode_enabled;
}

u32 get_current_privilege_level(void) {
    return get_cs() & 3; /* CPL（Current Privilege Level）を取得 */
}

/* 追加のアセンブリ関数宣言 */
extern u32 get_privilege_level(void);