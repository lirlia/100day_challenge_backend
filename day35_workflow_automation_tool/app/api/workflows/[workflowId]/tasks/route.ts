import { NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * POST /api/workflows/[workflowId]/tasks
 * Adds a new task to a specific workflow.
 * Request Body: { name: string, description?: string, assigned_user_id?: number, due_date?: string, order_index?: number }
 */
export async function POST(
  request: Request,
  { params }: { params: { workflowId: string } },
) {
  const awaitedParams = await params;
  const workflowId = parseInt(awaitedParams.workflowId, 10);
  console.log(`[API][POST /api/workflows/${workflowId}/tasks] Request received.`);

  if (isNaN(workflowId)) {
    console.error(`[Error][POST /api/workflows/${awaitedParams.workflowId}/tasks] Invalid workflow ID.`);
    return NextResponse.json({ error: 'Invalid workflow ID' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { name, description, assigned_user_id, due_date, order_index } = body;

    if (!name || typeof name !== 'string') {
      console.error(`[Error][POST /api/workflows/${workflowId}/tasks] Invalid input: Name is required.`, body);
      return NextResponse.json({ error: 'Invalid input: Name is required.' }, { status: 400 });
    }

    // Check if workflow exists
    const workflowExists = db.prepare('SELECT id FROM workflows WHERE id = ?').get(workflowId);
    if (!workflowExists) {
        console.error(`[Error][POST /api/workflows/${workflowId}/tasks] Workflow not found.`);
        return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    // Check if assigned user exists (if provided)
    if (assigned_user_id !== undefined && assigned_user_id !== null) {
        if (typeof assigned_user_id !== 'number') {
            console.error(`[Error][POST /api/workflows/${workflowId}/tasks] Invalid assigned_user_id type.`, body);
            return NextResponse.json({ error: 'Invalid assigned_user_id type.' }, { status: 400 });
        }
        const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(assigned_user_id);
        if (!userExists) {
            console.error(`[Error][POST /api/workflows/${workflowId}/tasks] Assigned user with id ${assigned_user_id} not found.`);
            return NextResponse.json({ error: 'Assigned user not found' }, { status: 400 });
        }
    }

    // Validate due_date format if provided (simple check for YYYY-MM-DD HH:MM:SS or YYYY-MM-DD)
    if (due_date !== undefined && due_date !== null) {
        if (typeof due_date !== 'string' || !/^\d{4}-\d{2}-\d{2}(\s\d{2}:\d{2}:\d{2})?$/.test(due_date)) {
            console.error(`[Error][POST /api/workflows/${workflowId}/tasks] Invalid due_date format.`, body);
            return NextResponse.json({ error: 'Invalid due_date format. Use YYYY-MM-DD or YYYY-MM-DD HH:MM:SS.' }, { status: 400 });
        }
    }

    const finalOrderIndex = (typeof order_index === 'number' && Number.isInteger(order_index)) ? order_index : 0;

    const stmt = db.prepare(
      `INSERT INTO tasks (workflow_id, name, description, assigned_user_id, due_date, order_index)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const info = stmt.run(
        workflowId,
        name,
        description ?? null,
        assigned_user_id ?? null,
        due_date ?? null,
        finalOrderIndex
    );

    const newTaskId = info.lastInsertRowid;
    console.log(`[DB][Task] Created task with id ${newTaskId} for workflow ${workflowId}`);

    // Fetch the created task to return
    const newTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(newTaskId);

    return NextResponse.json(newTask, { status: 201 });

  } catch (error) {
    console.error(`[Error][POST /api/workflows/${workflowId}/tasks] Failed to create task:`, error);
    return NextResponse.json(
      { error: 'Failed to create task' },
      { status: 500 },
    );
  }
}
