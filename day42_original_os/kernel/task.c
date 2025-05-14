#include "task.h"
#include "serial.h" // For debug prints
#include "main.h"   // For print_serial, print_serial_hex etc.
#include "gdt.h"    // ADD THIS LINE for tss_set_rsp0
#include <stddef.h> // For NULL

// Global ready queue (example)
// static task_queue_t ready_queue;

task_t *current_task = NULL; // ADD THIS LINE
task_queue_t ready_queue; // ADD THIS LINE

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
