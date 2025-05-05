import { NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * Checks if all prerequisite tasks for a given task are completed.
 * @param taskId The ID of the task to check dependencies for.
 * @returns True if all prerequisites are completed, false otherwise.
 */
function checkPrerequisitesCompleted(taskId: number): boolean {
  const prerequisites = db
    .prepare(
      `
      SELECT t.status
      FROM tasks t
      JOIN task_dependencies td ON t.id = td.depends_on_task_id
      WHERE td.task_id = ?
    `,
    )
    .all(taskId) as { status: string }[];

  return prerequisites.every((prereq) => prereq.status === 'completed');
}

/**
 * PUT /api/tasks/[taskId]
 * Updates a specific task.
 * Request Body: { name?: string, description?: string, assigned_user_id?: number | null, due_date?: string | null, status?: 'pending' | 'in_progress' | 'completed' | 'on_hold', order_index?: number }
 */
export async function PUT(
  request: Request,
  { params }: { params: { taskId: string } },
) {
  const awaitedParams = await params;
  const taskId = parseInt(awaitedParams.taskId, 10);
  console.log(`[API][PUT /api/tasks/${taskId}] Request received.`);

  if (isNaN(taskId)) {
    console.error(`[Error][PUT /api/tasks/${awaitedParams.taskId}] Invalid task ID.`);
    return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const {
      name,
      description,
      assigned_user_id,
      due_date,
      status,
      order_index,
    } = body;

    // --- Validation ---
    const allowedStatuses = ['pending', 'in_progress', 'completed', 'on_hold'];
    if (status !== undefined && !allowedStatuses.includes(status)) {
        console.error(`[Error][PUT /api/tasks/${taskId}] Invalid status value: ${status}`);
        return NextResponse.json({ error: `Invalid status value. Allowed values are: ${allowedStatuses.join(', ')}` }, { status: 400 });
    }

    if (assigned_user_id !== undefined && typeof assigned_user_id !== 'number' && assigned_user_id !== null) {
        console.error(`[Error][PUT /api/tasks/${taskId}] Invalid assigned_user_id type.`);
        return NextResponse.json({ error: 'Invalid assigned_user_id type. Should be number or null.' }, { status: 400 });
    }

    if (due_date !== undefined && typeof due_date !== 'string' && due_date !== null) {
        console.error(`[Error][PUT /api/tasks/${taskId}] Invalid due_date type.`);
        return NextResponse.json({ error: 'Invalid due_date type. Should be string or null.' }, { status: 400 });
    }
    if (due_date && !/^\d{4}-\d{2}-\d{2}(\s\d{2}:\d{2}:\d{2})?$/.test(due_date)) {
        console.error(`[Error][PUT /api/tasks/${taskId}] Invalid due_date format.`);
        return NextResponse.json({ error: 'Invalid due_date format. Use YYYY-MM-DD or YYYY-MM-DD HH:MM:SS.' }, { status: 400 });
    }

    if (order_index !== undefined && typeof order_index !== 'number') {
        console.error(`[Error][PUT /api/tasks/${taskId}] Invalid order_index type.`);
        return NextResponse.json({ error: 'Invalid order_index type. Should be number.' }, { status: 400 });
    }

    // --- Dependency Check (if status is changing to non-pending) ---
    if (status && status !== 'pending') {
      const prerequisitesMet = checkPrerequisitesCompleted(taskId);
      if (!prerequisitesMet) {
        console.warn(`[Warn][PUT /api/tasks/${taskId}] Prerequisites not met for status change to ${status}.`);
        return NextResponse.json(
          { error: 'Cannot change status. Prerequisites are not completed.' },
          { status: 400 }, // Use 400 Bad Request or potentially 409 Conflict
        );
      }
      console.log(`[Info][PUT /api/tasks/${taskId}] Prerequisites met for status change to ${status}.`);
    }

    // --- Check if Assigned User Exists (if provided) ---
    if (assigned_user_id) { // Check only if it's a truthy value (a number)
        const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(assigned_user_id);
        if (!userExists) {
            console.error(`[Error][PUT /api/tasks/${taskId}] Assigned user with id ${assigned_user_id} not found.`);
            return NextResponse.json({ error: 'Assigned user not found' }, { status: 400 });
        }
    }

    // --- Build Update Query ---
    const updateFields: string[] = [];
    const updateParams: (string | number | null)[] = [];

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateParams.push(name);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateParams.push(description ?? null);
    }
    if (assigned_user_id !== undefined) {
      updateFields.push('assigned_user_id = ?');
      updateParams.push(assigned_user_id); // Can be null
    }
    if (due_date !== undefined) {
      updateFields.push('due_date = ?');
      updateParams.push(due_date); // Can be null
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateParams.push(status);
    }
    if (order_index !== undefined) {
      updateFields.push('order_index = ?');
      updateParams.push(order_index);
    }

    if (updateFields.length === 0) {
      console.warn(`[Warn][PUT /api/tasks/${taskId}] No fields provided for update.`);
      // Optionally, return the current task data or a specific message
      const currentTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
       if (!currentTask) {
         return NextResponse.json({ error: 'Task not found' }, { status: 404 });
       }
       return NextResponse.json(currentTask);
      // return NextResponse.json({ message: 'No fields provided for update' }, { status: 400 });
    }

    // Add updated_at automatically via trigger, so no need to set it here.
    const updateQuery = `UPDATE tasks SET ${updateFields.join(', ')} WHERE id = ?`;
    updateParams.push(taskId);

    // --- Execute Update ---
    const stmt = db.prepare(updateQuery);
    const info = stmt.run(...updateParams);

    if (info.changes === 0) {
      console.log(`[DB][Task] Task with id ${taskId} not found for update.`);
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    console.log(`[DB][Task] Updated task ${taskId}. Changes: ${info.changes}`);

    // --- Return Updated Task ---
    const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    return NextResponse.json(updatedTask);

  } catch (error) {
    console.error(`[Error][PUT /api/tasks/${taskId}] Failed to update task:`, error);
    return NextResponse.json(
      { error: 'Failed to update task' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/tasks/[taskId]
 * Deletes a specific task and its associated dependencies.
 */
export async function DELETE(
  request: Request, // Added request parameter to satisfy handler signature
  { params }: { params: { taskId: string } },
) {
  const awaitedParams = await params;
  const taskId = parseInt(awaitedParams.taskId, 10);
  console.log(`[API][DELETE /api/tasks/${taskId}] Request received.`);

  if (isNaN(taskId)) {
    console.error(`[Error][DELETE /api/tasks/${awaitedParams.taskId}] Invalid task ID.`);
    return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
  }

  const deleteTaskTransaction = db.transaction(() => {
      // Dependencies are deleted automatically by CASCADE constraint
      const stmt = db.prepare('DELETE FROM tasks WHERE id = ?');
      const info = stmt.run(taskId);
      return info.changes; // Return number of deleted tasks (0 or 1)
  });

  try {
    const changes = deleteTaskTransaction();

    if (changes === 0) {
      console.log(`[DB][Task] Task with id ${taskId} not found for deletion.`);
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    console.log(`[DB][Task] Deleted task ${taskId} and associated dependencies.`);
    return NextResponse.json({ message: 'Task deleted successfully' }, { status: 200 });

  } catch (error) {
    console.error(`[Error][DELETE /api/tasks/${taskId}] Failed to delete task:`, error);
    return NextResponse.json(
      { error: 'Failed to delete task' },
      { status: 500 },
    );
  }
}
