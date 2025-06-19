import { NextResponse } from 'next/server';
import db, { AuditLogger } from '@/lib/db';

// 特定テナント情報取得
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    console.log(`📝 テナント情報取得中: ${id}`);

    const stmt = db.prepare(`
      SELECT
        id, name, domain, plan, status,
        max_users, max_projects, storage_gb, api_calls_per_month, price_per_user,
        created_at, updated_at
      FROM tenants
      WHERE id = ?
    `);

    const tenant = stmt.get(id);

    if (!tenant) {
      return NextResponse.json(
        { error: 'テナントが見つかりません' },
        { status: 404 }
      );
    }

    // テナントの使用量統計も取得
    const usageStmt = db.prepare(`
      SELECT
        COUNT(DISTINCT u.id) as current_users,
        COUNT(DISTINCT p.id) as current_projects,
        COUNT(DISTINCT t.id) as current_tasks
      FROM tenants tn
      LEFT JOIN users u ON tn.id = u.tenant_id AND u.is_active = true
      LEFT JOIN projects p ON tn.id = p.tenant_id AND p.status = 'active'
      LEFT JOIN tasks t ON tn.id = t.tenant_id
      WHERE tn.id = ?
      GROUP BY tn.id
    `);

    const usage = usageStmt.get(id) || { current_users: 0, current_projects: 0, current_tasks: 0 };

    console.log(`✅ テナント情報取得完了: ${id}`);

    return NextResponse.json({
      tenant,
      usage
    });

  } catch (error) {
    console.error('❌ テナント情報取得エラー:', error);
    return NextResponse.json(
      { error: 'テナント情報の取得に失敗しました', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// テナント情報更新
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, domain, plan, status } = body;

    console.log(`📝 テナント情報更新中: ${id}`);

    // 更新前の情報を取得（監査ログ用）
    const beforeStmt = db.prepare('SELECT * FROM tenants WHERE id = ?');
    const beforeData = beforeStmt.get(id);

    if (!beforeData) {
      return NextResponse.json(
        { error: 'テナントが見つかりません' },
        { status: 404 }
      );
    }

    // プラン変更時の設定更新
    let updateData: any = {};
    if (name) updateData.name = name;
    if (domain) updateData.domain = domain;
    if (status) updateData.status = status;

    if (plan && plan !== (beforeData as any).plan) {
      const planSettings = {
        'starter': { max_users: 5, max_projects: 3, storage_gb: 1, api_calls_per_month: 1000, price_per_user: 10.0 },
        'professional': { max_users: 15, max_projects: 10, storage_gb: 5, api_calls_per_month: 5000, price_per_user: 20.0 },
        'enterprise': { max_users: 100, max_projects: 50, storage_gb: 20, api_calls_per_month: 20000, price_per_user: 50.0 }
      };

      const settings = planSettings[plan as keyof typeof planSettings];
      if (settings) {
        updateData = { ...updateData, plan, ...settings };
      }
    }

    // updated_at を追加
    updateData.updated_at = new Date().toISOString();

    const setClause = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
    const updateStmt = db.prepare(`UPDATE tenants SET ${setClause} WHERE id = ?`);

    const result = updateStmt.run(...Object.values(updateData), id);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: 'テナント更新に失敗しました' },
        { status: 500 }
      );
    }

    // 更新後のデータを取得
    const updatedTenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);

    // 監査ログ記録
    AuditLogger.log(
      id,
      null, // システム更新時はuser_id null
      'UPDATE',
      'tenant',
      id,
      { before: beforeData, after: updatedTenant, changes: updateData },
      request.headers.get('x-forwarded-for') || 'localhost',
      request.headers.get('user-agent') || 'unknown'
    );

    console.log(`✅ テナント情報更新完了: ${id}`);

    return NextResponse.json({
      tenant: updatedTenant,
      message: 'テナント情報が正常に更新されました'
    });

  } catch (error) {
    console.error('❌ テナント情報更新エラー:', error);

    // ドメイン重複エラーの場合
    if ((error as Error).message.includes('UNIQUE constraint failed: tenants.domain')) {
      return NextResponse.json(
        { error: 'このドメインは既に使用されています' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'テナント情報の更新に失敗しました', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// テナント削除
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    console.log(`📝 テナント削除中: ${id}`);

    // 削除前の情報を取得（監査ログ用）
    const beforeStmt = db.prepare('SELECT * FROM tenants WHERE id = ?');
    const beforeData = beforeStmt.get(id);

    if (!beforeData) {
      return NextResponse.json(
        { error: 'テナントが見つかりません' },
        { status: 404 }
      );
    }

    // 関連データの件数確認
    const relatedDataStmt = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE tenant_id = ?) as users_count,
        (SELECT COUNT(*) FROM projects WHERE tenant_id = ?) as projects_count,
        (SELECT COUNT(*) FROM tasks WHERE tenant_id = ?) as tasks_count
    `);

    const relatedData = relatedDataStmt.get(id, id, id) as any;

    // CASCADE削除によりすべての関連データが削除される
    const deleteStmt = db.prepare('DELETE FROM tenants WHERE id = ?');
    const result = deleteStmt.run(id);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: 'テナント削除に失敗しました' },
        { status: 500 }
      );
    }

    // 監査ログ記録（削除後なのでtenant_idはnullのまま記録）
    const auditStmt = db.prepare(`
      INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, resource_id, details, ip_address, user_agent)
      VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?)
    `);

    const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    auditStmt.run(
      auditId,
      'DELETE',
      'tenant',
      id,
      JSON.stringify({
        deleted_tenant: beforeData,
        related_data_counts: relatedData
      }),
      request.headers.get('x-forwarded-for') || 'localhost',
      request.headers.get('user-agent') || 'unknown'
    );

    console.log(`✅ テナント削除完了: ${id}`);
    console.log(`📊 削除された関連データ: Users(${relatedData?.users_count || 0}), Projects(${relatedData?.projects_count || 0}), Tasks(${relatedData?.tasks_count || 0})`);

    return NextResponse.json({
      message: 'テナントとすべての関連データが正常に削除されました',
      deleted_counts: relatedData
    });

  } catch (error) {
    console.error('❌ テナント削除エラー:', error);
    return NextResponse.json(
      { error: 'テナント削除に失敗しました', details: (error as Error).message },
      { status: 500 }
    );
  }
}
