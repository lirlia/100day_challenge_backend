ENTRY(_start)
OUTPUT_FORMAT(elf64-x86-64) /* Ensure output format is ELF64 for x86-64 */

SECTIONS
{
    . = 0xffffffff80000000; /* Base address for higher half kernel */

    .text : ALIGN(4K)
    {
        *(.text .text.*)
    }

    .rodata : ALIGN(4K)
    {
        *(.rodata .rodata.*)
    }

    .data : ALIGN(4K)
    {
        *(.data .data.*)
    }

    /* Section for Limine requests */
    .requests : ALIGN(4K)
    {
        KEEP(*(.requests)) /* Keep all symbols in .requests section */
    }

    .bss : ALIGN(4K)
    {
        *(.bss .bss.*)
        *(COMMON)
    }

    /DISCARD/ :
    {
        *(.comment)
        *(.eh_frame)
    }
}
