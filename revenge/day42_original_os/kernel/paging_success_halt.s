.section .text
.global switch_to_kernel_higher_half_and_run

// Args from C:
// rdi: pml4_phys (physical address of new PML4 table)
// rsi: new_rsp_virt (virtual address for new stack pointer)
// rdx: kernel_entry_virt (virtual address of kernel_main_after_paging)
// rcx: fb_for_kernel_main_virt (virtual address of framebuffer struct to pass)

switch_to_kernel_higher_half_and_run:
    // Load the new PML4 physical address into CR3
    movq %rdi, %cr3 // Use movq, AT&T syntax: movq src, dst

    // At this point, paging is fully active with the new page tables.
    // The HHDM is available. Old stack might still be temporarily mapped.

    // It is crucial that the new stack (pointed to by new_rsp_virt)
    // is correctly mapped in the new page tables BEFORE this switch.
    // Also, the kernel_entry_virt and fb_for_kernel_main_virt must be valid
    // virtual addresses in the new address space.

    // Set up the new stack pointer
    movq %rsi, %rsp // Use movq

    // Arguments for kernel_main_after_paging(fb_info, new_rsp):
    // RDI: fb_for_kernel_main_virt (originally in RCX)
    // RSI: new_rsp_virt (current RSP, after movq %rsi, %rsp)
    movq %rcx, %rdi // Use movq
    // RSI already holds the correct new_rsp_virt (now current RSP) due to 'movq %rsi, %rsp'
    // We need to pass the *value* of the new stack pointer as the second arg.
    // The current RSP is already new_rsp_virt. So movq %rsp, %rsi is correct for the second argument.
    movq %rsp, %rsi // current RSP (which is new_rsp_virt) -> RSI for the 2nd arg

    // Jump to the higher-half kernel entry point
    jmp *%rdx       // Jump to kernel_entry_virt. Use * for indirect jump in AT&T syntax.

    // Should not be reached
    hlt
