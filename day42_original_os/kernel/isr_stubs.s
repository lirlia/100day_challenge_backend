.intel_syntax noprefix

.extern isr_handler_c // C language interrupt handler

// Macro for ISRs that do NOT push an error code
.macro ISR_NO_ERR_CODE int_no
.global isr\int_no
isr\int_no:
    push 0          // Push a dummy error code
    push \int_no     // Push the interrupt number
    jmp isr_common_stub
.endm

// Macro for ISRs that PUSH an error code
.macro ISR_ERR_CODE int_no
.global isr\int_no
isr\int_no:
    // Error code is already on the stack pushed by the CPU
    push \int_no     // Push the interrupt number
    jmp isr_common_stub
.endm

// Common stub for all ISRs
isr_common_stub:
    // Save all general purpose registers that are not saved by the CPU
    // (CPU saves: RIP, CS, RFLAGS, RSP (if stack change), SS)
    push rax
    push rbx
    push rcx
    push rdx
    push rsi
    push rdi
    push rbp
    push r8
    push r9
    push r10
    push r11
    push r12
    push r13
    push r14
    push r15

    mov rdi, rsp  // Pass stack pointer (which now points to struct registers) to C handler as first argument
    call isr_handler_c // Call the C handler

    // Restore all saved registers
    pop r15
    pop r14
    pop r13
    pop r12
    pop r11
    pop r10
    pop r9
    pop r8
    pop rbp
    pop rdi
    pop rsi
    pop rdx
    pop rcx
    pop rbx
    pop rax

    add rsp, 16 // Clean up interrupt number and error code from stack

    iretq // Return from interrupt

// Define ISRs using the macros
// Exceptions 0-19 (Intel reserved)
ISR_NO_ERR_CODE 0   // Divide by zero
ISR_NO_ERR_CODE 1   // Debug
ISR_NO_ERR_CODE 2   // Non-maskable Interrupt
ISR_NO_ERR_CODE 3   // Breakpoint
ISR_NO_ERR_CODE 4   // Overflow
ISR_NO_ERR_CODE 5   // Bound Range Exceeded
ISR_NO_ERR_CODE 6   // Invalid Opcode
ISR_NO_ERR_CODE 7   // Device Not Available (Coprocessor Not Available)
ISR_ERR_CODE    8   // Double Fault
ISR_NO_ERR_CODE 9   // Coprocessor Segment Overrun (Reserved)
ISR_ERR_CODE    10  // Invalid TSS
ISR_ERR_CODE    11  // Segment Not Present
ISR_ERR_CODE    12  // Stack-Segment Fault
ISR_ERR_CODE    13  // General Protection Fault
ISR_ERR_CODE    14  // Page Fault
// ISR 15 is reserved by Intel
ISR_NO_ERR_CODE 16  // x87 Floating-Point Exception
ISR_ERR_CODE    17  // Alignment Check
ISR_NO_ERR_CODE 18  // Machine Check
ISR_NO_ERR_CODE 19  // SIMD Floating-Point Exception

// Further ISRs (e.g., for IRQs 32-47) can be defined here if needed later
// For now, we are only handling the first 20 exceptions.
