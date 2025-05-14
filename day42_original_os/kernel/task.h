#ifndef KERNEL_TASK_H
#define KERNEL_TASK_H

#include <stdint.h>
#include "idt.h" // For struct registers
#include "paging.h" // For CR3 (though it's part of registers for now, might be separate)

// Task states
typedef enum {
    TASK_STATE_READY,      // Ready to run
    TASK_STATE_RUNNING,    // Currently running
    TASK_STATE_WAITING,    // Waiting for an event
    TASK_STATE_TERMINATED  // Terminated, to be cleaned up
} task_state_t;

// Process Control Block (PCB)
typedef struct task {
    uint64_t pid;                 // Process ID
    task_state_t state;           // Current state of the task
    struct registers context;     // Saved registers (includes rip, rsp, rflags, general purpose regs, cs, ss)
                                  // rsp in context is the user/kernel stack pointer when switched out
                                  // cr3 is also in struct registers from idt.h if we use that directly.

    uint64_t kernel_stack_top;    // Top of the kernel stack for this task (when switching to kernel mode)
                                  // TSS.RSP0 will be set to this when this task is scheduled.

    // uint64_t cr3; // Physical address of the PML4 table for this task if not using context.cr3
                      // For now, context.cr3 (saved by interrupt frame) should suffice for simplicity.

    struct task *next;            // Pointer to the next task in the ready queue (for scheduler)
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

#endif // KERNEL_TASK_H
