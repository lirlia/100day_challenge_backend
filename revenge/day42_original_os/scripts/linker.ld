ENTRY(_start)
OUTPUT_FORMAT(elf64-x86-64) /* Ensure output format is ELF64 for x86-64 */

SECTIONS
{
    . = 0xffffffff80000000; /* Base address for higher half kernel */

    _kernel_start = .;

    .text : ALIGN(4K)
    {
        _text_start = .;
        *(.text .text.*)
        _text_end = .;
    }

    .rodata : ALIGN(4K)
    {
        _rodata_start = .;
        *(.rodata .rodata.*)
        _rodata_end = .;
    }

    .data : ALIGN(4K)
    {
        _data_start = .;
        *(.data .data.*)
        _data_end = .;
    }

    /* Section for Limine requests */
    .requests : ALIGN(4K)
    {
        KEEP(*(.requests)) /* Keep all symbols in .requests section */
    }

    .bss : ALIGN(4K)
    {
        _bss_start = .;
        *(.bss .bss.*)
        *(COMMON)
        _bss_end = .;
    }

    _kernel_end = .;

    /DISCARD/ :
    {
        *(.comment)
        *(.eh_frame)
    }
}
