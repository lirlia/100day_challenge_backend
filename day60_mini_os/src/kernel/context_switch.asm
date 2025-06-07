; context_switch.asm - x86-32bit コンテキストスイッチ実装
section .text
global context_switch

; void context_switch(cpu_context_t* old_context, cpu_context_t* new_context)
;
; スタックレイアウト:
; [esp+8]  = new_context (cpu_context_t*)
; [esp+4]  = old_context (cpu_context_t*)
; [esp]    = return address
;
; cpu_context_t 構造体レイアウト (memory.hと一致させる):
; +0:  eax
; +4:  ebx
; +8:  ecx
; +12: edx
; +16: esp
; +20: ebp
; +24: esi
; +28: edi
; +32: eip
; +36: eflags
; +40: cs
; +44: ds
; +48: es
; +52: fs
; +56: gs
; +60: ss

context_switch:
    ; 引数取得
    mov eax, [esp+4]        ; old_context
    mov edx, [esp+8]        ; new_context

    ; 現在のプロセスのコンテキストを保存
    test eax, eax           ; old_context がNULLでないかチェック
    jz .restore_context     ; NULLなら保存をスキップ

    ; 汎用レジスタ保存
    mov [eax+0], eax        ; eax (ただし、この時点でeaxは破壊されている)
    mov [eax+4], ebx        ; ebx
    mov [eax+8], ecx        ; ecx
    mov [eax+12], edx       ; edx (ただし、この時点でedxは破壊されている)

    ; 正しいeax, edxを保存 (引数から再取得)
    push eax                ; old_context を保存
    push edx                ; new_context を保存
    mov eax, [esp+12]       ; 元のeax (old_context)
    mov edx, [esp+16]       ; 元のedx (new_context)
    mov ecx, [esp+4]        ; new_context
    mov ebx, [esp+8]        ; old_context
    mov [ebx+0], eax        ; 正しいeaxを保存
    mov [ebx+12], edx       ; 正しいedxを保存
    pop edx                 ; new_context復元
    pop eax                 ; old_context復元

    ; スタックポインタ保存 (現在のesp)
    mov [eax+16], esp

    ; ベースポインタ保存
    mov [eax+20], ebp

    ; インデックスレジスタ保存
    mov [eax+24], esi
    mov [eax+28], edi

    ; 戻りアドレス保存 (次回実行時のeip)
    mov ebx, [esp]          ; return address
    mov [eax+32], ebx       ; eip

    ; フラグレジスタ保存
    pushfd                  ; eflagsをスタックにプッシュ
    pop ebx                 ; eflagsをebxに取得
    mov [eax+36], ebx       ; eflags保存

    ; セグメントレジスタ保存
    mov ebx, cs
    mov [eax+40], ebx       ; cs
    mov ebx, ds
    mov [eax+44], ebx       ; ds
    mov ebx, es
    mov [eax+48], ebx       ; es
    mov ebx, fs
    mov [eax+52], ebx       ; fs
    mov ebx, gs
    mov [eax+56], ebx       ; gs
    mov ebx, ss
    mov [eax+60], ebx       ; ss

.restore_context:
    ; 新しいプロセスのコンテキストを復元
    test edx, edx           ; new_context がNULLでないかチェック
    jz .done                ; NULLなら何もしない

    ; セグメントレジスタ復元
    mov eax, [edx+44]       ; ds
    mov ds, ax
    mov eax, [edx+48]       ; es
    mov es, ax
    mov eax, [edx+52]       ; fs
    mov fs, ax
    mov eax, [edx+56]       ; gs
    mov gs, ax
    mov eax, [edx+60]       ; ss
    mov ss, ax

    ; スタックポインタ復元
    mov esp, [edx+16]       ; esp

    ; ベースポインタ復元
    mov ebp, [edx+20]       ; ebp

    ; インデックスレジスタ復元
    mov esi, [edx+24]       ; esi
    mov edi, [edx+28]       ; edi

    ; フラグレジスタ復元
    mov eax, [edx+36]       ; eflags
    push eax
    popfd                   ; eflagsを復元

    ; 汎用レジスタ復元 (eax, edxは最後)
    mov ebx, [edx+4]        ; ebx
    mov ecx, [edx+8]        ; ecx

    ; 実行アドレス設定
    mov eax, [edx+32]       ; eip
    push eax                ; 戻りアドレスとしてスタックにプッシュ

    ; 残りの汎用レジスタ復元
    mov eax, [edx+0]        ; eax
    mov edx, [edx+12]       ; edx (最後に復元)

    ; 新しいプロセスに実行を移す
    ret                     ; eipで指定されたアドレスにジャンプ

.done:
    ret

; デバッグ用: レジスタダンプ関数
global dump_registers
dump_registers:
    ; この関数は呼び出された時点でのレジスタ値を出力する
    ; (実装は後で追加)
    ret