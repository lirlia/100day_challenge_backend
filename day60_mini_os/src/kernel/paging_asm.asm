; paging_asm.asm - ページング制御のアセンブリ関数

section .text

; ページディレクトリをCR3レジスタにロード
global load_page_directory
load_page_directory:
    push ebp
    mov ebp, esp

    mov eax, [esp + 8]      ; 第1引数: ページディレクトリの物理アドレス
    mov cr3, eax            ; CR3レジスタに設定

    pop ebp
    ret

; ページングを有効化（CR0のPGビットを設定）
global enable_paging
enable_paging:
    push ebp
    mov ebp, esp

    mov eax, cr0
    or eax, 0x80000000      ; PGビット（bit 31）を設定
    mov cr0, eax

    pop ebp
    ret

; ページングを無効化（CR0のPGビットをクリア）
global disable_paging
disable_paging:
    push ebp
    mov ebp, esp

    mov eax, cr0
    and eax, 0x7FFFFFFF     ; PGビット（bit 31）をクリア
    mov cr0, eax

    pop ebp
    ret

; TLB（Translation Lookaside Buffer）をフラッシュ
global flush_tlb
flush_tlb:
    push ebp
    mov ebp, esp

    mov eax, cr3
    mov cr3, eax            ; CR3に同じ値を再設定してTLBフラッシュ

    pop ebp
    ret

; CR0レジスタの値を読み取り
global read_cr0
read_cr0:
    mov eax, cr0
    ret

; CR2レジスタの値を読み取り（ページフォルト時のアドレス）
global read_cr2
read_cr2:
    mov eax, cr2
    ret

; CR3レジスタの値を読み取り（現在のページディレクトリアドレス）
global read_cr3
read_cr3:
    mov eax, cr3
    ret

; CR3レジスタに値を書き込み
global write_cr3
write_cr3:
    push ebp
    mov ebp, esp

    mov eax, [esp + 8]      ; 第1引数: 新しいページディレクトリアドレス
    mov cr3, eax

    pop ebp
    ret

; 指定したページのTLBエントリを無効化
global invalidate_page
invalidate_page:
    push ebp
    mov ebp, esp

    mov eax, [esp + 8]      ; 第1引数: 無効化するページの仮想アドレス
    invlpg [eax]            ; 指定ページのTLBエントリを無効化

    pop ebp
    ret