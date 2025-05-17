.intel_syntax noprefix
.section .text

.extern page_fault_c_handler // Our dedicated C handler for page faults
.extern isr_handler_c      // C language interrupt handler (was isr_c_handler in example)

// Common C handler for ISRs (CPU exceptions)
.extern isr_handler_c

// Common C handler for IRQs (Hardware interrupts)
.extern irq_handler_c

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

// Macro to create an ISR stub that does NOT push an error code
// It pushes a dummy error code 0 for consistent stack frame.
.macro ISR_NO_ERR_CODE num
.global isr\num
isr\num:
    cli                         // Disable interrupts
    push 0                      // Dummy error code
    push \num                   // Push interrupt number
    jmp isr_common_stub
.endm

// Macro to create an ISR stub that DOES push an error code (CPU does)
.macro ISR_ERR_CODE num
.global isr\num
isr\num:
    cli                         // Disable interrupts
    // Error code is already on stack pushed by CPU
    push \num                   // Push interrupt number
    jmp isr_common_stub
.endm

// Define ISRs using the macros
// Exceptions 0-31 (Intel reserved)
ISR_NO_ERR_CODE 0   // Divide by zero
ISR_NO_ERR_CODE 1   // Debug
ISR_NO_ERR_CODE 2   // Non-maskable Interrupt
ISR_NO_ERR_CODE 3   // Breakpoint
ISR_NO_ERR_CODE 4   // Overflow
ISR_NO_ERR_CODE 5   // Bound Range Exceeded
ISR_NO_ERR_CODE 6   // Invalid Opcode
ISR_NO_ERR_CODE 7   // Device Not Available (Coprocessor Not Available)
ISR_ERR_CODE   8   // Double Fault
ISR_NO_ERR_CODE 9   // Coprocessor Segment Overrun (Intel reserved, but some OS use it)
ISR_ERR_CODE   10  // Invalid TSS
ISR_ERR_CODE   11  // Segment Not Present
ISR_ERR_CODE   12  // Stack-Segment Fault
ISR_ERR_CODE   13  // General Protection Fault
ISR_ERR_CODE   14  // Page Fault
// ISR 15 is reserved by Intel - typically not used / should not occur.
ISR_NO_ERR_CODE 16  // x87 Floating-Point Exception
ISR_ERR_CODE   17  // Alignment Check
ISR_NO_ERR_CODE 18  // Machine Check
ISR_NO_ERR_CODE 19  // SIMD Floating-Point Exception
ISR_NO_ERR_CODE 20  // Virtualization Exception
ISR_ERR_CODE   21  // Control Protection Exception
// ISRs 22-27 are reserved
ISR_NO_ERR_CODE 28  // Hypervisor Injection Exception
ISR_ERR_CODE   29  // VMM Communication Exception
ISR_ERR_CODE   30  // Security Exception
// ISR 31 is reserved

// Placeholder for ISRs 32-255 (PIC/APIC IRQs)
// Example for IRQ0 (Timer) - typically mapped to ISR 32
// ISR_NO_ERR_CODE 32

// Note: The page_fault_c_handler is now NOT directly called from isr14.
// All interrupts, including page faults, go through isr_common_stub and then to isr_handler_c.
// The isr_handler_c in C will then need to check regs->int_no and if it's 14,
// call the specific page_fault_c_handler or handle it directly.
// This simplifies the assembly but moves dispatch logic to C.

// Macro to create an IRQ stub (Hardware Interrupt)
// These do not push an error code from the CPU side.
// We push a dummy error code 0 for consistency with ISRs.
.macro IRQ_STUB num, vector
.global irq\num
irq\num:
    cli                         // Disable interrupts
    push 0                      // Dummy error code (for struct registers consistency)
    push \vector                // Push the vector number
    jmp irq_common_stub
.endm

// Common stub for IRQs
irq_common_stub:
    // Save all general purpose registers not saved by CPU
    push r15
    push r14
    push r13
    push r12
    push r11
    push r10
    push r9
    push r8
    push rdi
    push rsi
    push rbp
    push rdx
    push rcx
    push rbx
    push rax

    mov rdi, rsp      // Pass stack pointer (struct registers) as first arg to C handler
    call irq_handler_c

    // Restore registers
    pop rax
    pop rbx
    pop rcx
    pop rdx
    pop rbp
    pop rsi
    pop rdi
    pop r8
    pop r9
    pop r10
    pop r11
    pop r12
    pop r13
    pop r14
    pop r15

    add rsp, 16       // Clean up vector number and dummy error code from stack
    sti                         // Re-enable interrupts (IF SET BEFORE THIS INTERRUPT)
    iretq                       // Return from interrupt

// --- IRQs (Hardware Interrupts) ---
// IRQ numbers 0-15 are typically mapped to interrupt vectors 32-47.
// The first argument to IRQ_STUB is the IRQ number (for irqX name),
// the second is the actual vector number pushed to stack.
IRQ_STUB 0, 32      // Timer (Vector 32)
IRQ_STUB 1, 33      // Keyboard (Vector 33, example)
// Add other IRQ stubs as needed for IRQ 2-15 (Vectors 34-47)
IRQ_STUB 2, 34
IRQ_STUB 3, 35
IRQ_STUB 4, 36
IRQ_STUB 5, 37
IRQ_STUB 6, 38
IRQ_STUB 7, 39
IRQ_STUB 8, 40
IRQ_STUB 9, 41
IRQ_STUB 10, 42
IRQ_STUB 11, 43
IRQ_STUB 12, 44
IRQ_STUB 13, 45
IRQ_STUB 14, 46
IRQ_STUB 15, 47
