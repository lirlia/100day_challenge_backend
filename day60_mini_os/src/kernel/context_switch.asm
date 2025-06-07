; context_switch.asm - x86-32bit コンテキストスイッチ実装 (完全修正版)
section .text
global context_switch

; void context_switch(cpu_context_t* old_context, cpu_context_t* new_context)
;
; cpu_context_t 構造体レイアウト:
; +0:  eax    +4:  ebx    +8:  ecx    +12: edx
; +16: esp    +20: ebp    +24: esi    +28: edi
; +32: eip    +36: eflags +40: cs     +44: ds
; +48: es     +52: fs     +56: gs     +60: ss

context_switch:
    ; 全レジスタをスタックに退避 (順番重要)
    pushad                  ; eax,ecx,edx,ebx,esp,ebp,esi,edi を一括保存
    pushfd                  ; フラグレジスタ保存

    ; 引数取得 (スタック上の位置が変わっているので調整)
    ; pushad(8*4=32bytes) + pushfd(4bytes) = 36bytes 分スタックが伸びている
    mov esi, [esp+40]       ; old_context (元の[esp+4] + 36)
    mov edi, [esp+44]       ; new_context (元の[esp+8] + 36)

    ; 現在のコンテキストを保存 (old_context が NULL でない場合)
    test esi, esi
    jz .restore_context

    ; スタックからレジスタ値を取得してコンテキストに保存
    ; スタックレイアウト: [esp] = eflags, [esp+4] = edi, [esp+8] = esi, ...
    ; pushad の順番: eax, ecx, edx, ebx, esp, ebp, esi, edi

    mov eax, [esp+32]       ; eax (スタック上の値)
    mov [esi+0], eax        ; context->eax

    mov eax, [esp+20]       ; ebx
    mov [esi+4], eax        ; context->ebx

    mov eax, [esp+28]       ; ecx
    mov [esi+8], eax        ; context->ecx

    mov eax, [esp+24]       ; edx
    mov [esi+12], eax       ; context->edx

    ; esp は現在のスタック位置 + pushad/pushfd のオフセット
    mov eax, esp
    add eax, 40             ; pushad(32) + pushfd(4) + 2つの引数(8) = 44, でも戻りアドレス考慮で40
    mov [esi+16], eax       ; context->esp

    mov eax, [esp+12]       ; ebp
    mov [esi+20], eax       ; context->ebp

    mov eax, [esp+8]        ; esi
    mov [esi+24], eax       ; context->esi

    mov eax, [esp+4]        ; edi
    mov [esi+28], eax       ; context->edi

    ; 戻りアドレス (eip) - 関数の戻り先
    mov eax, [esp+36]       ; return address (pushad/pushfd を考慮)
    mov [esi+32], eax       ; context->eip

    ; フラグレジスタ
    mov eax, [esp]          ; eflags (スタックトップ)
    mov [esi+36], eax       ; context->eflags

    ; セグメントレジスタ
    mov eax, cs
    mov [esi+40], eax       ; context->cs
    mov eax, ds
    mov [esi+44], eax       ; context->ds
    mov eax, es
    mov [esi+48], eax       ; context->es
    mov eax, fs
    mov [esi+52], eax       ; context->fs
    mov eax, gs
    mov [esi+56], eax       ; context->gs
    mov eax, ss
    mov [esi+60], eax       ; context->ss

.restore_context:
    ; 新しいコンテキストを復元 (new_context が NULL でない場合)
    test edi, edi
    jz .cleanup_and_return

    ; セグメントレジスタ復元 (慎重に)
    mov eax, [edi+44]       ; ds
    mov ds, ax
    mov eax, [edi+48]       ; es
    mov es, ax
    mov eax, [edi+52]       ; fs
    mov fs, ax
    mov eax, [edi+56]       ; gs
    mov gs, ax
    ; cs, ss は特別なので変更しない

    ; スタックを新しいコンテキストのものに切り替え
    mov esp, [edi+16]       ; new esp

    ; 新しいコンテキストの戻りアドレスをスタックに設定
    mov eax, [edi+32]       ; eip
    push eax                ; 戻りアドレスとして設定

    ; フラグレジスタ復元
    mov eax, [edi+36]       ; eflags
    push eax
    popfd

    ; 汎用レジスタ復元
    mov eax, [edi+0]        ; eax
    mov ebx, [edi+4]        ; ebx
    mov ecx, [edi+8]        ; ecx
    mov edx, [edi+12]       ; edx
    mov ebp, [edi+20]       ; ebp
    mov esi, [edi+24]       ; esi
    mov edi, [edi+28]       ; edi (最後に復元)

    ; 新しいプロセスにジャンプ
    ret

.cleanup_and_return:
    ; old_context のみ保存して元のプロセスに戻る
    popfd                   ; フラグ復元
    popad                   ; 全レジスタ復元
    ret