#include "task.h"
#include "serial.h" // For debug prints
#include "main.h"   // For print_serial, print_serial_hex etc.
#include "gdt.h"    // ADD THIS LINE for tss_set_rsp0
#include <stddef.h> // For NULL
#include "pmm.h"    // For pmm_alloc_page
#include "paging.h" // For hhdm_offset, PAGE_SIZE

// Global ready queue (example)
// static task_queue_t ready_queue;

task_t *current_task = NULL; // ADD THIS LINE
task_queue_t ready_queue; // ADD THIS LINE
static uint64_t next_pid = 1; // For assigning PIDs

#define KERNEL_TASK_STACK_PAGES 1 // Number of pages for a task's kernel stack

// Simple string copy, ensure null termination
static void strncpy_local(char *dest, const char *src, size_t n) {
    size_t i;
    for (i = 0; i < n - 1 && src[i] != '\0'; i++) {
        dest[i] = src[i];
    }
    dest[i] = '\0';
}

void init_task_queue(task_queue_t *queue) {
    if (!queue) return;
    queue->head = 0;
    queue->tail = 0;
    queue->count = 0;
    for (int i = 0; i < MAX_TASKS; i++) {
        queue->tasks[i] = NULL;
    }
    // print_serial_str("Task queue initialized.\n");
}

int enqueue_task(task_queue_t *queue, task_t *task) {
    if (!queue || !task) return -1; // Error: null queue or task

    if (is_task_queue_full(queue)) {
        // print_serial_str("Error: Task queue full! Cannot enqueue PID: ");
        // print_serial_hex(task->pid);
        // print_serial_char('\n');
        return -2; // Error: queue full
    }

    queue->tasks[queue->tail] = task;
    queue->tail = (queue->tail + 1) % MAX_TASKS;
    queue->count++;
    // print_serial_str("Enqueued task PID: ");
    // print_serial_hex(task->pid);
    // print_serial_char('\n');
    return 0; // Success
}

task_t* dequeue_task(task_queue_t *queue) {
    if (!queue) return NULL;

    if (is_task_queue_empty(queue)) {
        // print_serial_str("Task queue empty! Cannot dequeue.\n");
        return NULL; // Queue empty
    }

    task_t *task = queue->tasks[queue->head];
    queue->tasks[queue->head] = NULL; // Optional: clear the slot
    queue->head = (queue->head + 1) % MAX_TASKS;
    queue->count--;
    // print_serial_str("Dequeued task PID: ");
    // if (task) print_serial_hex(task->pid);
    // else print_serial_str("NULL_TASK");
    // print_serial_char('\n');
    return task;
}

int is_task_queue_empty(task_queue_t *queue) {
    if (!queue) return 1; // Consider null queue as empty or an error state
    return queue->count == 0;
}

int is_task_queue_full(task_queue_t *queue) {
    if (!queue) return 0; // Or handle as an error
    return queue->count == MAX_TASKS;
}

// Example of a global ready queue, could be initialized in kernel_main
// void init_global_ready_queue() {
//     init_task_queue(&ready_queue);
// }

// task_t* get_next_ready_task() {
//     return dequeue_task(&ready_queue);
// }

// void add_to_ready_queue(task_t* task) {
//     enqueue_task(&ready_queue, task);
// }

void schedule(void) {
    // Temporarily disable interrupts during critical scheduler operations
    // This is a very basic approach; a more robust solution would involve specific lock types
    asm volatile ("cli");

    task_t *prev_task = current_task;
    task_t *next_task = NULL;

    // If there was a running task, set its state to READY and add it back to the queue
    if (prev_task != NULL) {
        if (prev_task->state == TASK_STATE_RUNNING) { // Only re-queue if it was running
            prev_task->state = TASK_STATE_READY;
            if (enqueue_task(&ready_queue, prev_task) != 0) {
                // Failed to enqueue, potentially because queue is full.
                // Handle this error appropriately, e.g. log, panic, or special handling.
                // For now, we might lose the task or it remains current_task if next_task is NULL.
                print_serial(SERIAL_COM1_BASE, "Schedule: Failed to re-enqueue task PID: ");
                print_serial_hex(SERIAL_COM1_BASE, prev_task->pid);
                write_serial_char(SERIAL_COM1_BASE, '\n');
            }
        }
        // If prev_task was not RUNNING (e.g. WAITING, TERMINATED), it shouldn't be auto-re-queued here.
        // It should have been moved to a different list or handled by another mechanism.
    }

    // Dequeue the next task
    next_task = dequeue_task(&ready_queue);

    if (next_task != NULL) {
        current_task = next_task;
        current_task->state = TASK_STATE_RUNNING;

        // Restore essential context for the new task before iretq
        // For now, only RSP0 is critical for kernel->kernel switches if stacks differ,
        // or for future user->kernel transitions.
        tss_set_rsp0(current_task->kernel_stack_top);

        // Future: load_cr3 if tasks have different address spaces
        // if (current_task->pml4_phys != 0 && get_current_cr3() != current_task->pml4_phys) {
        //     load_cr3(current_task->pml4_phys);
        // }

        // The actual loading of registers (RIP, RSP, GPRs etc.) from current_task->context
        // will be handled by the assembly stub that called schedule() via iretq.
    } else if (prev_task != NULL && prev_task->state != TASK_STATE_TERMINATED) {
        // No other task to run, continue with the previous task if it wasn't re-queued and isn't terminated.
        // This can happen if the ready queue was empty or re-queue failed.
        current_task = prev_task;
        if(current_task->state != TASK_STATE_RUNNING) current_task->state = TASK_STATE_RUNNING; // Ensure it's marked running
    } else {
        // No task to run and no previous task to continue (or it was terminated/successfully re-queued)
        // This is where an idle task would run.
        // For now, current_task might become NULL or remain the prev_task if re-queue failed.
        current_task = NULL; // Explicitly set to NULL if no task is available
        print_serial(SERIAL_COM1_BASE, "Schedule: No task to run, current_task is NULL.\n");
        // TODO: Implement idle task or proper halt mechanism when no tasks are ready.
        // For now, we might just re-enable interrupts and let the system hlt in the timer handler loop,
        // or if current_task is NULL, the context switch part will be skipped.
    }

    // Re-enable interrupts before returning or switching context
    // The actual context switch (iretq) will happen after schedule() returns, in the assembly stub.
    asm volatile ("sti");
}

task_t *create_task(const char *name, task_entry_point_t entry_point, uint64_t pml4_phys_addr) {
    // 1. Allocate memory for the task_t structure itself
    task_t *task = (task_t *)pmm_alloc_page(); // Using a full page for PCB for simplicity, could be optimized
    if (!task) {
        print_serial(SERIAL_COM1_BASE, "create_task: Failed to allocate memory for PCB\n");
        return NULL;
    }
    // Zero out the task_t structure
    // NOTE: A proper memset would be better, but for now, critical fields are set manually.
    // A simple loop-based memset:
    uint8_t* task_ptr_byte = (uint8_t*)task;
    for(size_t i = 0; i < sizeof(task_t); ++i) {
        task_ptr_byte[i] = 0;
    }


    // 2. Initialize PCB fields
    task->pid = next_pid++;
    strncpy_local(task->name, name, sizeof(task->name));
    task->state = TASK_STATE_READY;
    task->has_run_once = 0; // false

    // 3. Allocate kernel stack
    uint64_t stack_phys_bottom = 0;
    for (int i = 0; i < KERNEL_TASK_STACK_PAGES; ++i) { // Allocate contiguous pages if KERNEL_TASK_STACK_PAGES > 1
        uint64_t page = (uint64_t)pmm_alloc_page();
        if (!page) {
            print_serial(SERIAL_COM1_BASE, "create_task: Failed to allocate kernel stack page for PID: ");
            print_serial_hex(SERIAL_COM1_BASE, task->pid);
            write_serial_char(SERIAL_COM1_BASE, '\n');
            pmm_free_page(task); // Free the PCB page
            return NULL;
        }
        if (i == 0) {
            stack_phys_bottom = page;
        }
        // For KERNEL_TASK_STACK_PAGES > 1, ensure pages are contiguous or handle non-contiguous.
        // For KERNEL_TASK_STACK_PAGES = 1, this loop runs once.
    }

    task->kernel_stack_bottom = stack_phys_bottom + hhdm_offset; // Virtual address of the bottom
    // Stack grows downwards, so top is bottom + size. RSP0 points to the very top.
    task->kernel_stack_top = task->kernel_stack_bottom + (KERNEL_TASK_STACK_PAGES * PAGE_SIZE);

    // 4. Initialize context (full_context_t)
    // Zero out the context first
    uint8_t* ctx_ptr_byte = (uint8_t*)&(task->context);
    for(size_t i = 0; i < sizeof(full_context_t); ++i) {
        ctx_ptr_byte[i] = 0;
    }

    task->context.rip = (uint64_t)entry_point;
    task->context.cs = 0x08; // Kernel Code Segment selector
    task->context.rflags = 0x202; // Interrupts enabled
    task->context.rsp_user = task->kernel_stack_top; // Initial stack pointer for the task (kernel mode)
    task->context.ss = 0x10; // Kernel Data Segment selector
    // task->context.ss_user should be 0 or a user data selector if switching to user mode
    task->context.cr3 = pml4_phys_addr;

    // These are set as if the task was interrupted by timer (vector 32)
    // This allows the first context switch *into* this task to use the same iretq logic
    task->context.int_no = 32; // Timer interrupt vector
    task->context.err_code = 0; // No error code for timer

    // Initialize other GPRs to 0 (done by the memset-like loop above)
    // task->context.r15 = 0; ... task->context.rax = 0; etc.

    print_serial(SERIAL_COM1_BASE, "Task created: ");
    print_serial(SERIAL_COM1_BASE, task->name);
    print_serial(SERIAL_COM1_BASE, " (PID: ");
    print_serial_hex(SERIAL_COM1_BASE, task->pid);
    print_serial(SERIAL_COM1_BASE, "), Stack VTop: ");
    print_serial_hex(SERIAL_COM1_BASE, task->kernel_stack_top);
    print_serial(SERIAL_COM1_BASE, ", RIP: ");
    print_serial_hex(SERIAL_COM1_BASE, task->context.rip);
    write_serial_char(SERIAL_COM1_BASE, '\n');

    return task;
}
