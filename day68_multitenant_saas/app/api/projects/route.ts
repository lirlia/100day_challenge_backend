import { NextResponse } from 'next/server';
import db, { TenantQueryHelper, AuditLogger } from '@/lib/db';

// プロジェクト一覧取得（テナント分離）
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenant_id');

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenant_id は必須パラメータです' },
        { status: 400 }
      );
    }

    console.log(`📝 プロジェクト一覧取得中: ${tenantId}`);

    // テナント権限チェック付きクエリ
    const projects = TenantQueryHelper.executeWithTenantCheck(`
      SELECT
        p.id, p.name, p.description, p.status, p.created_at, p.updated_at,
        u.name as owner_name, u.email as owner_email,
        COUNT(t.id) as task_count,
        COUNT(CASE WHEN t.status = 'done' THEN 1 END) as completed_tasks
      FROM projects p
      LEFT JOIN users u ON p.owner_id = u.id
      LEFT JOIN tasks t ON p.id = t.project_id
      WHERE p.status != 'archived'
      GROUP BY p.id, p.name, p.description, p.status, p.created_at, p.updated_at, u.name, u.email
      ORDER BY p.created_at DESC
    `, tenantId);

    console.log(`✅ プロジェクト ${projects.length} 件を取得しました`);

    return NextResponse.json({ projects });

  } catch (error) {
    console.error('❌ プロジェクト一覧取得エラー:', error);
    return NextResponse.json(
      { error: 'プロジェクト一覧の取得に失敗しました', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// 新規プロジェクト作成（テナント分離）
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tenant_id, name, description, owner_id } = body;

    if (!tenant_id || !name || !owner_id) {
      return NextResponse.json(
        { error: 'tenant_id, name, owner_id は必須です' },
        { status: 400 }
      );
    }

    console.log(`📝 新規プロジェクト作成中: ${name} (テナント: ${tenant_id})`);

    // テナントの制限チェック
    const tenantStmt = db.prepare('SELECT max_projects FROM tenants WHERE id = ?');
    const tenant = tenantStmt.get(tenant_id) as any;

    if (!tenant) {
      return NextResponse.json(
        { error: '指定されたテナントが見つかりません' },
        { status: 404 }
      );
    }

    // 現在のプロジェクト数をチェック
    const currentProjectsStmt = db.prepare(`
      SELECT COUNT(*) as count FROM projects
      WHERE tenant_id = ? AND status = 'active'
    `);
    const currentCount = (currentProjectsStmt.get(tenant_id) as any)?.count || 0;

    if (currentCount >= tenant.max_projects) {
      return NextResponse.json(
        {
          error: `プロジェクト数の上限に達しています（最大: ${tenant.max_projects}）`,
          current_count: currentCount,
          max_allowed: tenant.max_projects
        },
        { status: 409 }
      );
    }

    // オーナーがテナントに属するかチェック
    const ownerStmt = db.prepare('SELECT id FROM users WHERE id = ? AND tenant_id = ?');
    const owner = ownerStmt.get(owner_id, tenant_id);

    if (!owner) {
      return NextResponse.json(
        { error: '指定されたオーナーがテナントに属していません' },
        { status: 400 }
      );
    }

    const projectId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // テナント権限チェック付きINSERT
    const result = TenantQueryHelper.insertWithTenant('projects', {
      id: projectId,
      name,
      description: description || null,
      owner_id
    }, tenant_id);

    // 新規作成されたプロジェクト情報を取得
    const newProject = TenantQueryHelper.getWithTenantCheck(`
      SELECT
        p.*, u.name as owner_name, u.email as owner_email
      FROM projects p
      LEFT JOIN users u ON p.owner_id = u.id
      WHERE p.id = ?
    `, tenant_id, [projectId]);

    // 監査ログ記録
    AuditLogger.log(
      tenant_id,
      owner_id,
      'CREATE',
      'project',
      projectId,
      { name, description, owner_id },
      request.headers.get('x-forwarded-for') || 'localhost',
      request.headers.get('user-agent') || 'unknown'
    );

    console.log(`✅ プロジェクト作成完了: ${projectId}`);

    return NextResponse.json({
      project: newProject,
      message: 'プロジェクトが正常に作成されました'
    }, { status: 201 });

  } catch (error) {
    console.error('❌ プロジェクト作成エラー:', error);
    return NextResponse.json(
      { error: 'プロジェクト作成に失敗しました', details: (error as Error).message },
      { status: 500 }
    );
  }
}
