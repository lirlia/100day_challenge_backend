import { NextResponse } from 'next/server';
import db from '@/lib/db';

interface WorkflowWithStats {
  id: number;
  name: string;
  description: string | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
  creator_name: string | null; // users.name
  total_tasks: number;
  completed_tasks: number;
}

/**
 * GET /api/workflows
 * Retrieves a list of all workflows with task statistics.
 */
export async function GET() {
  console.log('[API][GET /api/workflows] Request received.');
  try {
    const workflows = db
      .prepare(
        `
      SELECT
        w.id,
        w.name,
        w.description,
        w.created_by_user_id,
        w.created_at,
        w.updated_at,
        u.name AS creator_name,
        (SELECT COUNT(*) FROM tasks t WHERE t.workflow_id = w.id) AS total_tasks,
        (SELECT COUNT(*) FROM tasks t WHERE t.workflow_id = w.id AND t.status = 'completed') AS completed_tasks
      FROM workflows w
      LEFT JOIN users u ON w.created_by_user_id = u.id
      ORDER BY w.created_at DESC
    `,
      )
      .all() as WorkflowWithStats[];

    console.log(`[DB][Workflow] Fetched ${workflows.length} workflows with stats.`);
    return NextResponse.json(workflows);
  } catch (error) {
    console.error('[Error][GET /api/workflows] Failed to fetch workflows:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workflows' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/workflows
 * Creates a new workflow.
 * Request Body: { name: string, description?: string, created_by_user_id: number }
 */
export async function POST(request: Request) {
  console.log('[API][POST /api/workflows] Request received.');
  try {
    const body = await request.json();
    const { name, description, created_by_user_id } = body;

    if (!name || typeof name !== 'string' || !created_by_user_id || typeof created_by_user_id !== 'number') {
      console.error('[Error][POST /api/workflows] Invalid input:', body);
      return NextResponse.json(
        { error: 'Invalid input. Name and created_by_user_id are required.' },
        { status: 400 },
      );
    }

    // Check if user exists
    const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(created_by_user_id);
    if (!userExists) {
        console.error(`[Error][POST /api/workflows] User with id ${created_by_user_id} not found.`);
        return NextResponse.json({ error: 'Creator user not found' }, { status: 400 });
    }

    const stmt = db.prepare(
      'INSERT INTO workflows (name, description, created_by_user_id) VALUES (?, ?, ?)',
    );
    const info = stmt.run(name, description ?? null, created_by_user_id);

    console.log(`[DB][Workflow] Created workflow with id ${info.lastInsertRowid}`);
    return NextResponse.json({ id: info.lastInsertRowid, name, description, created_by_user_id }, { status: 201 });
  } catch (error) {
    console.error('[Error][POST /api/workflows] Failed to create workflow:', error);
    return NextResponse.json(
      { error: 'Failed to create workflow' },
      { status: 500 },
    );
  }
}
