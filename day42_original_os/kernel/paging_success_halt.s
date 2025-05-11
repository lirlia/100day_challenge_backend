.section .text
.global paging_success_halt
paging_success_halt:
    cli
    hlt
    jmp paging_success_halt
