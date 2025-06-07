; interrupt_stubs.asm - 割り込みスタブ (x86-32bit) 修正版
section .text

; 外部関数
extern interrupt_handler

; IDTフラッシュ関数
global idt_flush
idt_flush:
    mov eax, [esp+4]    ; IDTポインタ取得
    lidt [eax]          ; IDT読み込み
    ret

; 割り込みスタブマクロ（エラーコードなし）
%macro ISR_NOERRCODE 1
global isr%1
isr%1:
    cli                 ; 割り込み無効化
    push byte 0         ; ダミーエラーコード
    push byte %1        ; 割り込み番号
    jmp isr_common_stub
%endmacro

; 割り込みスタブマクロ（エラーコードあり）
%macro ISR_ERRCODE 1
global isr%1
isr%1:
    cli                 ; 割り込み無効化
    push byte %1        ; 割り込み番号
    jmp isr_common_stub
%endmacro

; IRQ割り込みスタブマクロ
%macro IRQ 2
global irq%1
irq%1:
    cli                 ; 割り込み無効化
    push byte 0         ; ダミーエラーコード
    push byte %2        ; 割り込み番号
    jmp isr_common_stub
%endmacro

; 例外ハンドラ定義（段階的実装）
ISR_NOERRCODE 0     ; 除算エラー
ISR_NOERRCODE 1     ; デバッグ
ISR_NOERRCODE 2     ; NMI
ISR_NOERRCODE 3     ; ブレークポイント
ISR_NOERRCODE 4     ; オーバーフロー
ISR_NOERRCODE 5     ; 境界範囲超過
ISR_NOERRCODE 6     ; 無効オペコード
ISR_NOERRCODE 7     ; デバイス使用不可
ISR_ERRCODE   8     ; ダブルフォルト
ISR_ERRCODE   10    ; 無効TSS
ISR_ERRCODE   11    ; セグメント不在
ISR_ERRCODE   12    ; スタックフォルト
ISR_ERRCODE   13    ; 一般保護例外
ISR_ERRCODE   14    ; ページフォルト
ISR_NOERRCODE 16    ; FPUエラー

; ハードウェア割り込み定義
IRQ 0, 32           ; タイマー（PIT）
IRQ 1, 33           ; キーボード

; システムコール
ISR_NOERRCODE 128   ; システムコール (int 0x80)

global isr_syscall
isr_syscall:
    cli
    push byte 0         ; ダミーエラーコード
    push byte 0x80      ; システムコール番号
    jmp isr_common_stub

; 共通割り込みスタブ（修正版）
isr_common_stub:
    ; データセグメント保存
    mov ax, ds
    push eax

    ; 全汎用レジスタ保存 (edi,esi,ebp,esp,ebx,edx,ecx,eax)
    pusha

    mov ax, 0x10        ; カーネルデータセグメント読み込み
    mov ds, ax
    mov es, ax
    mov fs, ax
    mov gs, ax

    ; スタックポインタをC関数の引数として渡す（interrupt_frame_t*）
    mov eax, esp        ; スタックポインタを取得
    push eax            ; 引数としてプッシュ
    call interrupt_handler  ; C言語の割り込みハンドラ呼び出し
    add esp, 4          ; 引数をスタックから除去

    ; 全汎用レジスタ復元
    popa

    ; データセグメント復元
    pop eax
    mov ds, ax
    mov es, ax
    mov fs, ax
    mov gs, ax

    add esp, 8          ; エラーコードと割り込み番号をスタックから除去
    sti                 ; 割り込み有効化
    iret                ; 割り込みから復帰