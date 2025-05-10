.intel_syntax noprefix

.extern page_fault_c_handler // Our dedicated C handler for page faults
.extern isr_handler_c      // C language interrupt handler (was isr_c_handler in example)

// Common stub for all ISRs
.global isr_common_stub
isr_common_stub:
    // Save all general purpose registers that are not saved by the CPU
    push rax; push rbx; push rcx; push rdx
    push rsi; push rdi; push rbp
    push r8 ; push r9 ; push r10; push r11
    push r12; push r13; push r14; push r15

    mov rdi, rsp  # Pass stack pointer (which now points to struct registers) to C handler as first argument
    call isr_handler_c # Call the C handler (using existing C function name)
    # add rsp, 0x0 # This was in the example, but C handler is not expected to modify RSP before this point
                 # and the stack cleanup for args is done by the caller or by iretq itself if needed.
                 # If isr_handler_c is cdecl, it won't clean up stack. The add $16, %rsp later handles int_no/err_code.

    // Restore all saved registers
    pop r15; pop r14; pop r13; pop r12
    pop r11; pop r10; pop r9 ; pop r8
    pop rbp; pop rdi; pop rsi
    pop rdx; pop rcx; pop rbx; pop rax

    add rsp, 16 # Clean up interrupt number and error code from stack (pushed by macro or CPU+macro)

    iretq // Return from interrupt

// Macro for ISRs that do NOT push an error code
.macro ISR_NOERR n
.global isr\n
isr\n:
    push 0          # Dummy err_code
    push \n         # int_no
    jmp isr_common_stub
.endm

// Macro for ISRs that PUSH an error code (CPU pushes it)
.macro ISR_ERR n
.global isr\n
isr\n:
    # Error code is already on the stack pushed by the CPU
    push \n         # int_no (pushed on top of CPU's error code)
    jmp isr_common_stub
.endm

// Define ISRs using the macros
// Exceptions 0-31 (Intel reserved)
ISR_NOERR 0   // Divide by zero
ISR_NOERR 1   // Debug
ISR_NOERR 2   // Non-maskable Interrupt
ISR_NOERR 3   // Breakpoint
ISR_NOERR 4   // Overflow
ISR_NOERR 5   // Bound Range Exceeded
ISR_NOERR 6   // Invalid Opcode
ISR_NOERR 7   // Device Not Available (Coprocessor Not Available)
ISR_ERR   8   // Double Fault
ISR_NOERR 9   // Coprocessor Segment Overrun (Intel reserved, but some OS use it)
ISR_ERR   10  // Invalid TSS
ISR_ERR   11  // Segment Not Present
ISR_ERR   12  // Stack-Segment Fault
ISR_ERR   13  // General Protection Fault
ISR_ERR   14  // Page Fault
// ISR 15 is reserved by Intel - typically not used / should not occur.
ISR_NOERR 16  // x87 Floating-Point Exception
ISR_ERR   17  // Alignment Check
ISR_NOERR 18  // Machine Check
ISR_NOERR 19  // SIMD Floating-Point Exception
ISR_NOERR 20  // Virtualization Exception
ISR_ERR   21  // Control Protection Exception
// ISRs 22-27 are reserved
ISR_NOERR 28  // Hypervisor Injection Exception
ISR_ERR   29  // VMM Communication Exception
ISR_ERR   30  // Security Exception
// ISR 31 is reserved

// Placeholder for ISRs 32-255 (PIC/APIC IRQs)
// Example for IRQ0 (Timer) - typically mapped to ISR 32
// ISR_NOERR 32

// Note: The page_fault_c_handler is now NOT directly called from isr14.
// All interrupts, including page faults, go through isr_common_stub and then to isr_handler_c.
// The isr_handler_c in C will then need to check regs->int_no and if it's 14,
// call the specific page_fault_c_handler or handle it directly.
// This simplifies the assembly but moves dispatch logic to C.
