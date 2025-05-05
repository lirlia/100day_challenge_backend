import { NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * DELETE /api/tasks/[taskId]/dependencies/[dependsOnTaskId]
 * Removes a specific dependency from a task.
 */
export async function DELETE(
  request: Request,
  { params }: { params: { taskId: string; dependsOnTaskId: string } },
) {
  const awaitedParams = await params;
  const taskId = parseInt(awaitedParams.taskId, 10);
  const dependsOnTaskId = parseInt(awaitedParams.dependsOnTaskId, 10);

  console.log(`[API][DELETE /api/tasks/${taskId}/dependencies/${dependsOnTaskId}] Request received.`);

  if (isNaN(taskId) || isNaN(dependsOnTaskId)) {
    console.error(`[Error][DELETE /api/tasks/${awaitedParams.taskId}/dependencies/${awaitedParams.dependsOnTaskId}] Invalid Task ID(s).`);
    return NextResponse.json({ error: 'Invalid Task ID(s)' }, { status: 400 });
  }

  try {
    const stmt = db.prepare(
      'DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?'
      );
    const info = stmt.run(taskId, dependsOnTaskId);

    if (info.changes === 0) {
      // It's possible the dependency didn't exist, which is often not an error for DELETE.
      // Or one of the tasks didn't exist.
      console.log(`[DB][TaskDependency] Dependency from task ${taskId} to task ${dependsOnTaskId} not found or already deleted.`);
      // Check if tasks exist to provide a more specific error if needed, but 404 might be suitable.
      const taskExists = db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(taskId);
      const dependsOnTaskExists = db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(dependsOnTaskId);
      if (!taskExists || !dependsOnTaskExists) {
           return NextResponse.json({ error: 'One or both tasks not found' }, { status: 404 });
      }
      // If both tasks exist but dependency didn't, return success (idempotency)
      return NextResponse.json({ message: 'Dependency not found or already deleted' }, { status: 200 });
      // return NextResponse.json({ error: 'Dependency not found' }, { status: 404 });
    }

    console.log(`[DB][TaskDependency] Deleted dependency: Task ${taskId} no longer depends on Task ${dependsOnTaskId}`);
    return NextResponse.json({ message: 'Dependency deleted successfully' }, { status: 200 });

  } catch (error) {
    console.error(`[Error][DELETE /api/tasks/${taskId}/dependencies/${dependsOnTaskId}] Failed to delete dependency:`, error);
    return NextResponse.json(
      { error: 'Failed to delete dependency' },
      { status: 500 },
    );
  }
}
