/* Linker script for Mini OS kernel */
/* Target: x86-64 architecture */

ENTRY(_start)

SECTIONS
{
    /* Kernel is loaded at 1MB physical address */
    . = 0x100000;

    /* Multiboot header must be early in the file */
    .multiboot ALIGN(4) : {
        *(.multiboot)
    }

    /* Text segment (code) */
    .text ALIGN(4096) : {
        *(.text)
    }

    /* Read-only data */
    .rodata ALIGN(4096) : {
        *(.rodata)
        *(.rodata.*)
    }

    /* Initialized data */
    .data ALIGN(4096) : {
        *(.data)
    }

    /* Uninitialized data (BSS) */
    .bss ALIGN(4096) : {
        *(COMMON)
        *(.bss)
        *(.bootstrap_stack)
    }

    /* Mark end of kernel */
    kernel_end = .;
}
