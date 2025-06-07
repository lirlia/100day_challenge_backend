; usermode_asm.asm - ユーザーモード制御のアセンブリ関数

section .text

; 外部関数の宣言
extern handle_syscall

; GDTをロード
global gdt_flush
gdt_flush:
    push ebp
    mov ebp, esp

    mov eax, [esp + 8]      ; 第1引数: GDTポインタのアドレス
    lgdt [eax]              ; GDTをロード

    ; セグメントレジスタを再ロード
    mov ax, 0x10            ; カーネルデータセグメント
    mov ds, ax
    mov es, ax
    mov fs, ax
    mov gs, ax
    mov ss, ax

    ; コードセグメントを再ロード（ファージャンプ）
    jmp 0x08:gdt_flush_complete

gdt_flush_complete:
    pop ebp
    ret

; TSSをロード
global tss_flush
tss_flush:
    mov ax, 0x28            ; TSSセレクタ
    ltr ax                  ; TSSをロード
    ret

; ユーザーモードに切り替え
global switch_to_user_mode_asm
switch_to_user_mode_asm:
    push ebp
    mov ebp, esp

    ; 引数を取得
    mov eax, [esp + 8]      ; 第1引数: ユーザースタックアドレス
    mov ebx, [esp + 12]     ; 第2引数: ユーザーコードアドレス

    ; セグメントレジスタを設定
    mov cx, 0x20 | 3        ; ユーザーデータセグメント（RPL=3）
    mov ds, cx
    mov es, cx
    mov fs, cx
    mov gs, cx

    ; ユーザーモードスタックを設定
    push 0x20 | 3           ; ユーザーデータセグメント（SS）
    push eax                ; ユーザースタックポインタ（ESP）

    ; EFLAGSを設定（割り込み有効）
    pushf
    pop eax
    or eax, 0x200           ; IFビットを設定
    push eax                ; EFLAGS

    ; ユーザーコードセグメントとEIPを設定
    push 0x18 | 3           ; ユーザーコードセグメント（CS、RPL=3）
    push ebx                ; ユーザーコードアドレス（EIP）

    ; ユーザーモードに切り替え
    iretd                   ; Ring 3に切り替えて実行開始

    ; ここには戻ってこない
    pop ebp
    ret

; 現在のCSレジスタを取得
global get_cs
get_cs:
    mov eax, cs
    ret

; 現在のDSレジスタを取得
global get_ds
get_ds:
    mov eax, ds
    ret

; カーネルスタックポインタを取得
global get_kernel_stack
get_kernel_stack:
    mov eax, esp
    ret

; 特権レベルを確認
global get_privilege_level
get_privilege_level:
    mov eax, cs
    and eax, 3              ; RPL（Request Privilege Level）を取得
    ret

; システムコール用エントリポイント（int 0x80から呼び出される）
global syscall_entry
syscall_entry:
    ; レジスタを保存
    pushad
    push ds
    push es
    push fs
    push gs

    ; カーネルセグメントに切り替え
    mov ax, 0x10            ; カーネルデータセグメント
    mov ds, ax
    mov es, ax
    mov fs, ax
    mov gs, ax

    ; システムコール番号はEAXに格納されている
    ; システムコールハンドラーを呼び出し（C関数）
    push esp                ; スタックポインタを引数として渡す
    call handle_syscall     ; C関数を呼び出し
    add esp, 4              ; スタックを調整

    ; レジスタを復元
    pop gs
    pop fs
    pop es
    pop ds
    popad

    ; ユーザーモードに戻る
    iretd

; ユーザーモードからカーネルモードに強制復帰
global force_return_to_kernel
force_return_to_kernel:
    ; 割り込みを無効化
    cli

    ; カーネルセグメントに切り替え
    mov ax, 0x10
    mov ds, ax
    mov es, ax
    mov fs, ax
    mov gs, ax
    mov ss, ax

    ; カーネルスタックに戻る
    mov esp, [kernel_stack_backup]

    ; 割り込みを有効化
    sti
    ret

section .bss
kernel_stack_backup: resd 1  ; カーネルスタックバックアップ用