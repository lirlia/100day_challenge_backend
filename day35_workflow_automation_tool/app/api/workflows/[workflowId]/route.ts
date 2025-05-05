import { NextResponse } from 'next/server';
import db from '@/lib/db';

interface Task {
  id: number;
  workflow_id: number;
  name: string;
  description: string | null;
  assigned_user_id: number | null;
  assigned_user_name: string | null;
  due_date: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'on_hold';
  order_index: number;
  created_at: string;
  updated_at: string;
}

interface TaskDependency {
  task_id: number;
  depends_on_task_id: number;
}

interface WorkflowDetail extends WorkflowWithStats {
  tasks: Task[];
  dependencies: TaskDependency[];
}

interface WorkflowWithStats {
  id: number;
  name: string;
  description: string | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
  creator_name: string | null;
  total_tasks: number;
  completed_tasks: number;
}

/**
 * GET /api/workflows/[workflowId]
 * Retrieves the details of a specific workflow, including its tasks and dependencies.
 */
export async function GET(
  request: Request,
  { params }: { params: { workflowId: string } },
) {
  const awaitedParams = await params;
  const workflowId = parseInt(awaitedParams.workflowId, 10);
  console.log(`[API][GET /api/workflows/${workflowId}] Request received.`);

  if (isNaN(workflowId)) {
    console.error(`[Error][GET /api/workflows/${awaitedParams.workflowId}] Invalid workflow ID.`);
    return NextResponse.json({ error: 'Invalid workflow ID' }, { status: 400 });
  }

  try {
    // Fetch workflow details with stats and creator name
    const workflow = db
      .prepare(
        `
        SELECT
          w.id, w.name, w.description, w.created_by_user_id, w.created_at, w.updated_at,
          u.name AS creator_name,
          (SELECT COUNT(*) FROM tasks t WHERE t.workflow_id = w.id) AS total_tasks,
          (SELECT COUNT(*) FROM tasks t WHERE t.workflow_id = w.id AND t.status = 'completed') AS completed_tasks
        FROM workflows w
        LEFT JOIN users u ON w.created_by_user_id = u.id
        WHERE w.id = ?
      `,
      )
      .get(workflowId) as WorkflowWithStats | undefined;

    if (!workflow) {
      console.log(`[DB][Workflow] Workflow with id ${workflowId} not found.`);
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    // Fetch tasks for the workflow, joining with users to get assignee name
    const tasks = db
      .prepare(
        `
        SELECT
          t.id, t.workflow_id, t.name, t.description, t.assigned_user_id,
          u.name AS assigned_user_name,
          t.due_date, t.status, t.order_index, t.created_at, t.updated_at
        FROM tasks t
        LEFT JOIN users u ON t.assigned_user_id = u.id
        WHERE t.workflow_id = ?
        ORDER BY t.order_index, t.created_at
      `,
      )
      .all(workflowId) as Task[];

    // Fetch dependencies for the tasks within this workflow
    const dependencies = db
      .prepare(
        `
        SELECT td.task_id, td.depends_on_task_id
        FROM task_dependencies td
        JOIN tasks t_from ON td.task_id = t_from.id
        JOIN tasks t_to ON td.depends_on_task_id = t_to.id
        WHERE t_from.workflow_id = ? AND t_to.workflow_id = ?
      `,
      )
      .all(workflowId, workflowId) as TaskDependency[];

    const workflowDetail: WorkflowDetail = {
      ...workflow,
      tasks,
      dependencies,
    };

    console.log(`[DB][Workflow] Fetched detail for workflow ${workflowId} with ${tasks.length} tasks and ${dependencies.length} dependencies.`);
    return NextResponse.json(workflowDetail);
  } catch (error) {
    console.error(
      `[Error][GET /api/workflows/${workflowId}] Failed to fetch workflow details:`, error
    );
    return NextResponse.json(
      { error: 'Failed to fetch workflow details' },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/workflows/[workflowId]
 * Updates a specific workflow.
 * Request Body: { name?: string, description?: string }
 */
export async function PUT(
  request: Request,
  { params }: { params: { workflowId: string } },
) {
  const awaitedParams = await params;
  const workflowId = parseInt(awaitedParams.workflowId, 10);
  console.log(`[API][PUT /api/workflows/${workflowId}] Request received.`);

  if (isNaN(workflowId)) {
    console.error(`[Error][PUT /api/workflows/${awaitedParams.workflowId}] Invalid workflow ID.`);
    return NextResponse.json({ error: 'Invalid workflow ID' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { name, description } = body;

    // At least one field must be provided for update
    if (name === undefined && description === undefined) {
        console.error(`[Error][PUT /api/workflows/${workflowId}] No fields provided for update.`);
        return NextResponse.json({ error: 'No fields provided for update' }, { status: 400 });
    }

    // Build the update query dynamically
    let updateQuery = 'UPDATE workflows SET';
    const updateParams: (string | number | null)[] = [];
    if (name !== undefined) {
        updateQuery += ' name = ?,';
        updateParams.push(name);
    }
    if (description !== undefined) {
        updateQuery += ' description = ?,';
        updateParams.push(description ?? null);
    }
    // Remove trailing comma and add WHERE clause
    updateQuery = updateQuery.slice(0, -1) + ' WHERE id = ?';
    updateParams.push(workflowId);

    const stmt = db.prepare(updateQuery);
    const info = stmt.run(...updateParams);

    if (info.changes === 0) {
      console.log(`[DB][Workflow] Workflow with id ${workflowId} not found for update.`);
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    console.log(`[DB][Workflow] Updated workflow ${workflowId}. Changes: ${info.changes}`);
    // Fetch the updated workflow to return
    const updatedWorkflow = db.prepare('SELECT id, name, description, created_by_user_id, created_at, updated_at FROM workflows WHERE id = ?').get(workflowId);
    return NextResponse.json(updatedWorkflow);

  } catch (error) {
    console.error(`[Error][PUT /api/workflows/${workflowId}] Failed to update workflow:`, error);
    return NextResponse.json(
      { error: 'Failed to update workflow' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/workflows/[workflowId]
 * Deletes a specific workflow and all its associated tasks and dependencies.
 */
export async function DELETE(
  request: Request, // Added request parameter to satisfy handler signature
  { params }: { params: { workflowId: string } },
) {
  const awaitedParams = await params;
  const workflowId = parseInt(awaitedParams.workflowId, 10);
  console.log(`[API][DELETE /api/workflows/${workflowId}] Request received.`);

  if (isNaN(workflowId)) {
    console.error(`[Error][DELETE /api/workflows/${awaitedParams.workflowId}] Invalid workflow ID.`);
    return NextResponse.json({ error: 'Invalid workflow ID' }, { status: 400 });
  }

  const deleteWorkflowTransaction = db.transaction(() => {
      // Dependencies are deleted automatically by CASCADE on tasks
      // Tasks are deleted automatically by CASCADE on workflows
      const stmt = db.prepare('DELETE FROM workflows WHERE id = ?');
      const info = stmt.run(workflowId);
      return info.changes; // Return number of deleted workflows (0 or 1)
  });

  try {
    const changes = deleteWorkflowTransaction();

    if (changes === 0) {
      console.log(`[DB][Workflow] Workflow with id ${workflowId} not found for deletion.`);
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    console.log(`[DB][Workflow] Deleted workflow ${workflowId} and associated data.`);
    return NextResponse.json({ message: 'Workflow deleted successfully' }, { status: 200 }); // Use 200 OK or 204 No Content

  } catch (error) {
    console.error(`[Error][DELETE /api/workflows/${workflowId}] Failed to delete workflow:`, error);
    return NextResponse.json(
      { error: 'Failed to delete workflow' },
      { status: 500 },
    );
  }
}
