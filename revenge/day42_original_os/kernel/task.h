#ifndef KERNEL_TASK_H
#define KERNEL_TASK_H

#include <stdint.h>
#include "idt.h"    // For struct registers (which defines the GPR layout)
#include "paging.h" // For CR3 related definitions if any, and for get_current_cr3()

// Task states
typedef enum {
    TASK_STATE_READY,      // Ready to run
    TASK_STATE_RUNNING,    // Currently running
    TASK_STATE_WAITING,    // Waiting for an event
    TASK_STATE_TERMINATED  // Terminated, to be cleaned up
} task_state_t;

// Full context saved for a task.
// This structure holds all the state necessary to resume a task.
typedef struct full_context {
    // General Purpose Registers.
    // This layout *must* match 'struct registers' from idt.h if using memcpy.
    // Based on isr_stubs.s, the 'regs' pointer passed to C handlers points
    // to the location on stack where r15 was pushed.
    uint64_t r15;
    uint64_t r14;
    uint64_t r13;
    uint64_t r12;
    uint64_t r11;
    uint64_t r10;
    uint64_t r9;
    uint64_t r8;
    uint64_t rbp;
    uint64_t rdi; // Matches field name in idt.h's struct registers
    uint64_t rsi; // Matches field name in idt.h's struct registers
    uint64_t rdx; // Matches field name in idt.h's struct registers
    uint64_t rcx; // Matches field name in idt.h's struct registers
    uint64_t rbx; // Matches field name in idt.h's struct registers
    uint64_t rax; // Matches field name in idt.h's struct registers

    // Interrupt number and error code.
    // These are on the stack just above the GPRs (i.e., at higher addresses
    // than the GPRs if stack grows down, but accessed via negative offset
    // from 'regs' pointer if 'regs' points to the highest address GPR like r15).
    // Assuming 'regs' points to r15, int_no is at ((uint64_t*)regs - 1), err_code at ((uint64_t*)regs - 2).
    uint64_t int_no;
    uint64_t err_code;

    // iretq frame (CPU-pushed interrupt/exception state).
    // These are above int_no/err_code on the stack.
    uint64_t rip;
    uint64_t cs;
    uint64_t rflags;
    uint64_t rsp_user; // User-mode RSP (if privilege change occurred)
    uint64_t ss;       // Stack Segment selector for the new context (usually kernel data segment for kernel tasks)
    uint64_t ss_user;  // User-mode SS (if privilege change occurred)

    // CR3 register (page table base).
    // To be used when tasks have separate address spaces.
    uint64_t cr3;
} full_context_t;

// Process Control Block (PCB)
typedef struct task {
    uint64_t pid;                 // Process ID
    task_state_t state;           // Current state of the task
    full_context_t context;       // MODIFIED: Stores the full context for task switching.

    uint64_t kernel_stack_top;    // Top of the kernel stack for this task (TSS.RSP0)
    uint64_t kernel_stack_bottom; // Bottom of the kernel stack for this task
    char name[32];                // Task name
    int has_run_once;             // Flag to check if the task has run at least once (0 = false, 1 = true)

    struct task *next;            // Pointer to the next task in the ready queue
    struct task *prev;            // Pointer to the previous task in the ready queue

    // Add more fields as needed:
    // - priority
    // - execution_time_slices
    // - parent_pid
    // - children_pids
    // - open_files
    // - memory_mappings (if more granular than just cr3)
    // - signal_handlers
    // - exit_code
} task_t;

#define MAX_TASKS 16 // Maximum number of tasks the queue can hold

// Task Queue (simple ring buffer)
typedef struct task_queue {
    task_t* tasks[MAX_TASKS];
    int head;
    int tail;
    int count;
} task_queue_t;

extern task_t *current_task;
extern task_queue_t ready_queue;

// Task queue operations
void init_task_queue(task_queue_t *queue);
int enqueue_task(task_queue_t *queue, task_t *task);
task_t* dequeue_task(task_queue_t *queue);
int is_task_queue_empty(task_queue_t *queue);
int is_task_queue_full(task_queue_t *queue);

// Scheduler function
void schedule(void);

// Task entry point function type
typedef void (*task_entry_point_t)(void);

// Create a new task
// pml4_phys_addr is the physical address of the PML4 table for the new task's address space.
// For kernel tasks, this will typically be the kernel's PML4.
task_t *create_task(const char *name, task_entry_point_t entry_point, uint64_t pml4_phys_addr);

#endif // KERNEL_TASK_H
