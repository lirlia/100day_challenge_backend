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

extern page_fault_handler_c

// ISR stubs for exceptions that push an error code
isr_stub_8: // Double Fault
    pushq $0 // Dummy error code
    jmp common_isr_stub_ec
isr_stub_10: // Invalid TSS
    jmp common_isr_stub_ec
isr_stub_11: // Segment Not Present
    jmp common_isr_stub_ec
isr_stub_12: // Stack-Segment Fault
    jmp common_isr_stub_ec
isr_stub_13: // General Protection Fault
    jmp common_isr_stub_ec
isr_stub_14: // Page Fault
    // Error code is already on stack by CPU
    // We need to pass error_code and cr2 (faulting_address)
    // RDI: error_code, RSI: cr2
    movq %cr2, %rsi       // Second argument: faulting address (CR2)
    movq 8(%rsp), %rdi    // First argument: error code (already on stack, need to adjust for return address)
                          // The error code is below the return address pushed by the interrupt.
                          // So, if RSP points to return address, RSP+8 is error code.
    pushq %rax // Save rax (caller-saved, but good practice)
    pushq %rbx
    pushq %rcx
    pushq %rdx
    pushq %rsi
    pushq %rdi
    pushq %rbp
    pushq %r8
    pushq %r9
    pushq %r10
    pushq %r11
    pushq %r12
    pushq %r13
    pushq %r14
    pushq %r15

    call page_fault_handler_c

    popq %r15
    popq %r14
    popq %r13
    popq %r12
    popq %r11
    popq %r10
    popq %r9
    popq %r8
    popq %rbp
    popq %rdi
    popq %rsi
    popq %rdx
    popq %rcx
    popq %rbx
    popq %rax

    addq $8, %rsp // Pop error code
    iretq

// ISR stubs for exceptions that do not push an error code
%macro ISR_NO_EC 1
    isr_stub_%1:
        pushq $0 // Dummy error code for common_isr_stub_ec, though page_fault_handler_c won't use it if called directly
                 // Or, more simply, have a common stub that doesn't expect an error code on stack initially
        pushq %rax // Save rax (caller-saved)
        movq %cr2, %rax // Get faulting address for page fault, if this stub is misused for PF
                      // This is more for a generic handler. PF needs its own handling for error code.
        // For non-PF, CR2 is irrelevant. We'd pass interrupt number.
        movq $%1, %rdi // Arg1: interrupt_number
        // We need to decide if we want a generic handler or specific ones.
        // For now, let's stick to the plan of specific stub for PF.
        // So this macro should just call a generic C handler for non-EC exceptions.
        call common_interrupt_handler_c // Assuming such a C handler exists, taking (int_no)
        popq %rax
        iretq
%endmacro

// Common ISR stub for exceptions that push an error code (or a dummy one)
// It expects the error code to be on the stack *below* the return address.
// And the interrupt number to be in RDI (passed by specific stubs above if they call this).
// This common_isr_stub_ec is not directly used by the new isr_stub_14 yet.
common_isr_stub_ec:
    // Current stack: RSP -> return_address, RSP+8 -> error_code
    // We want to call a C function: void generic_exception_handler_ec(uint64_t int_no, uint64_t error_code, uint64_t rip, uint64_t cs, uint64_t rflags);
    // Or simpler: void generic_exception_handler_ec(uint64_t error_code, uint64_t int_no_passed_in_rdi_by_caller);

    // For now, let's assume the individual stubs (like isr_stub_13) directly call their C handlers
    // or that common_isr_stub_ec is designed to be called with int_no in RDI and error_code already on stack.

    // This common stub needs to save all registers, then call a C handler.
    pushq %rax
    // ... push other general purpose regs ...
    movq %rsp, %rbp // Establish stack frame for C call if needed, or pass directly

    // Let's assume C handler is: void some_c_handler(uint64_t error_code_from_stack, uint64_t int_num_from_rdi);
    // movq 16+REGS_SIZE(%rsp), %rdi // Error code (adjust offset for saved regs)
    // movq RDI_SAVED_SOMEWHERE, %rsi // Interrupt number (if RDI was saved and is now used for error code)
    // For simplicity, the current stubs (10,11,12,13) just jump here after error code is on stack.
    // They are missing passing the interrupt number if common_isr_stub_ec expects it.

    // This part is becoming complex because common_isr_stub_ec definition is unclear.
    // Let's simplify: the existing isr_stub_8, 10-13 will just call a generic C handler for now
    // passing their interrupt number via RDI and expecting error code to be handled by C side if it looks at stack.
    // The page fault stub is now custom.

    // Simplified common stub for GPF etc. (will need C handler like general_protection_fault_handler_c(error_code) )
    // This part is not being modified for the page fault task.
    // ... existing code for common_isr_stub_ec ...
    popq %rax
    addq $8, %rsp // Pop error code
    iretq

// ... existing ISR_NO_EC macro and its uses ...
ISR_NO_EC 0  // Divide by Zero
ISR_NO_EC 1  // Debug
// ... (other ISR_NO_EC uses)
ISR_NO_EC 16 // x87 Floating-Point Exception
// ... (more ISR_NO_EC uses up to 31)

.global isr_stub_0
.global isr_stub_1
// ... (other .global declarations for stubs 0-7)
.global isr_stub_8
// ... (other .global declarations for stubs 9-13)
.global isr_stub_14
.global isr_stub_16
// ... (other .global declarations for stubs up to 31)
.global isr_stub_timer // For APIC timer
.global isr_stub_32 // For APIC timer (if using IRQ 0 from APIC mapped to IDT 32)

// Timer ISR stub (IRQ 0 from APIC, usually mapped to IDT 32 or another vector)
// Ensure this matches what's set in idt.c and apic.c
isr_stub_timer: // This label should match what is used in idt_set_gate for the timer
    pushq %rax
    pushq %rbx
    // ... save all other general purpose registers ...
    pushq %rcx
    pushq %rdx
    pushq %rsi
    pushq %rdi
    pushq %rbp
    pushq %r8
    pushq %r9
    pushq %r10
    pushq %r11
    pushq %r12
    pushq %r13
    pushq %r14
    pushq %r15

    call timer_interrupt_handler_c // Call C handler

    // Restore registers
    popq %r15
    // ... pop all other general purpose registers ...
    popq %rax

    // Send EOI to local APIC
    // This should be done by the C handler or here after C handler returns.
    // movl $0, (%GS_BASE_MSR + APIC_EOI_REGISTER_OFFSET) // Example, actual EOI needs correct APIC base and register
    // For now, assume C handler does EOI.

    iretq

// Similar stub for IRQ 0 if mapped to IDT 32 (often the case for PIT or first APIC timer)
// This is redundant if isr_stub_timer is correctly configured and used.
// For now, we assume isr_stub_timer is the one used.
// isr_stub_32:
//    pushq %rax ... call timer_interrupt_handler_c ... popq %rax ... iretq

.section .text.entry
.global paging_success_halt
paging_success_halt:
    movl $0x12345678, %eax
    // Output "Paging works!" to serial for testing
    movq $paging_works_msg, %rsi
    movq $SERIAL_COM1_BASE, %rdi
    call print_serial_string
    hlt

paging_works_msg:
    .asciz "Paging works!\n"
