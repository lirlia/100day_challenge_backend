import { NextResponse } from 'next/server';
import db from '@/lib/db';

interface TaskBasic {
    id: number;
    workflow_id: number;
}

/**
 * Checks for circular dependencies if a new dependency is added.
 * Performs a Depth-First Search (DFS) starting from the dependent task.
 * @param taskId The task that will depend on another task.
 * @param dependsOnTaskId The task that `taskId` will depend on.
 * @returns True if adding the dependency would create a cycle, false otherwise.
 */
function detectCircularDependency(taskId: number, dependsOnTaskId: number): boolean {
    // Simple case: Self-dependency
    if (taskId === dependsOnTaskId) {
        return true;
    }

    const visited = new Set<number>();
    const recursionStack = new Set<number>();

    // Get all existing dependencies for the workflow to perform the check
    const task = db.prepare('SELECT workflow_id FROM tasks WHERE id = ?').get(taskId) as TaskBasic | undefined;
    if (!task) return false; // Task not found, cannot create cycle

    const allDependencies = db.prepare(
        `SELECT td.task_id, td.depends_on_task_id
         FROM task_dependencies td
         JOIN tasks t_from ON td.task_id = t_from.id
         WHERE t_from.workflow_id = ?`
        ).all(task.workflow_id) as { task_id: number; depends_on_task_id: number }[];

    // Build adjacency list representing the dependency graph (dependents point to prerequisites)
    const adj = new Map<number, number[]>();
    allDependencies.forEach(dep => {
        const list = adj.get(dep.depends_on_task_id) || [];
        list.push(dep.task_id);
        adj.set(dep.depends_on_task_id, list);
    });

    // Temporarily add the new dependency to the graph for checking
    const tempList = adj.get(dependsOnTaskId) || [];
    tempList.push(taskId);
    adj.set(dependsOnTaskId, tempList);

    function dfs(node: number): boolean {
        visited.add(node);
        recursionStack.add(node);

        const neighbors = adj.get(node) || [];
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                if (dfs(neighbor)) {
                    return true; // Cycle detected deeper
                }
            } else if (recursionStack.has(neighbor)) {
                return true; // Cycle detected directly
            }
        }

        recursionStack.delete(node);
        return false;
    }

    // Check for cycles starting from the newly dependent task (`taskId`)
    // and also from the task it depends on (`dependsOnTaskId`)
    // We need to check the entire graph component affected by the new edge.
    // A simpler approach might be just checking if dependsOnTaskId can reach taskId *before* adding the edge,
    // but the full DFS after adding the edge is safer.
    const workflowTasks = db.prepare('SELECT id FROM tasks WHERE workflow_id = ?').all(task.workflow_id) as {id: number}[];
    for(const t of workflowTasks) {
        if (!visited.has(t.id)) {
            if (dfs(t.id)) {
                return true; // Cycle detected in this component
            }
        }
    }

    return false; // No cycle detected
}


/**
 * POST /api/tasks/[taskId]/dependencies
 * Adds a dependency to a specific task.
 * Request Body: { depends_on_task_id: number }
 */
export async function POST(
  request: Request,
  { params }: { params: { taskId: string } },
) {
  const awaitedParams = await params;
  const taskId = parseInt(awaitedParams.taskId, 10);
  console.log(`[API][POST /api/tasks/${taskId}/dependencies] Request received.`);

  if (isNaN(taskId)) {
    console.error(`[Error][POST /api/tasks/${awaitedParams.taskId}/dependencies] Invalid task ID.`);
    return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { depends_on_task_id } = body;

    if (!depends_on_task_id || typeof depends_on_task_id !== 'number') {
      console.error(`[Error][POST /api/tasks/${taskId}/dependencies] Invalid input: depends_on_task_id is required and must be a number.`, body);
      return NextResponse.json({ error: 'Invalid input: depends_on_task_id is required and must be a number.' }, { status: 400 });
    }

    if (taskId === depends_on_task_id) {
         console.error(`[Error][POST /api/tasks/${taskId}/dependencies] Task cannot depend on itself.`);
        return NextResponse.json({ error: 'Task cannot depend on itself.'}, { status: 400 });
    }

    // Check if both tasks exist and belong to the same workflow
    const taskInfoStmt = db.prepare('SELECT id, workflow_id FROM tasks WHERE id IN (?, ?)');
    const taskInfos = taskInfoStmt.all(taskId, depends_on_task_id) as TaskBasic[];

    if (taskInfos.length !== 2) {
        console.error(`[Error][POST /api/tasks/${taskId}/dependencies] One or both tasks not found.`);
        return NextResponse.json({ error: 'One or both tasks not found' }, { status: 404 });
    }

    const taskWorkflowId = taskInfos.find(t => t.id === taskId)?.workflow_id;
    const dependsOnTaskWorkflowId = taskInfos.find(t => t.id === depends_on_task_id)?.workflow_id;

    if (taskWorkflowId !== dependsOnTaskWorkflowId) {
        console.error(`[Error][POST /api/tasks/${taskId}/dependencies] Tasks belong to different workflows.`);
        return NextResponse.json({ error: 'Tasks must belong to the same workflow.' }, { status: 400 });
    }

    // Check for existing dependency
    const existingDep = db.prepare(
        'SELECT 1 FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?'
        ).get(taskId, depends_on_task_id);
    if (existingDep) {
        console.warn(`[Warn][POST /api/tasks/${taskId}/dependencies] Dependency already exists.`);
        // Return 200 OK or 204 No Content as the state is already achieved
        return NextResponse.json({ message: 'Dependency already exists' }, { status: 200 });
    }

    // Check for circular dependency
    if (detectCircularDependency(taskId, depends_on_task_id)) {
        console.error(`[Error][POST /api/tasks/${taskId}/dependencies] Adding this dependency would create a cycle.`);
        return NextResponse.json({ error: 'Adding this dependency would create a circular dependency.' }, { status: 400 });
    }

    // Add the dependency
    const stmt = db.prepare('INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)');
    const info = stmt.run(taskId, depends_on_task_id);

    console.log(`[DB][TaskDependency] Added dependency: Task ${taskId} now depends on Task ${depends_on_task_id}`);
    return NextResponse.json({ task_id: taskId, depends_on_task_id: depends_on_task_id }, { status: 201 });

  } catch (error) {
     // Catch potential UNIQUE constraint violation if somehow inserted concurrently
     if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
         console.warn(`[Warn][POST /api/tasks/${taskId}/dependencies] Concurrent dependency creation detected.`);
         return NextResponse.json({ message: 'Dependency already exists' }, { status: 200 });
     }
    console.error(`[Error][POST /api/tasks/${taskId}/dependencies] Failed to add dependency:`, error);
    return NextResponse.json(
      { error: 'Failed to add dependency' },
      { status: 500 },
    );
  }
}
