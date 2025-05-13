#include "task.h"
#include "serial.h" // For debug prints
#include "main.h"   // For print_serial, print_serial_hex etc.
#include <stddef.h> // For NULL

// Global ready queue (example)
// static task_queue_t ready_queue;

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
