import { NextResponse } from 'next/server';
import db, { TenantQueryHelper, AuditLogger } from '@/lib/db';

// テナント一覧取得
export async function GET() {
  try {
    console.log('📝 テナント一覧を取得中...');

    const stmt = db.prepare(`
      SELECT
        id, name, domain, plan, status,
        max_users, max_projects, storage_gb, api_calls_per_month, price_per_user,
        created_at, updated_at
      FROM tenants
      ORDER BY created_at DESC
    `);

    const tenants = stmt.all();
    console.log(`✅ テナント ${tenants.length} 件を取得しました`);

    return NextResponse.json({ tenants });
  } catch (error) {
    console.error('❌ テナント一覧取得エラー:', error);
    return NextResponse.json(
      { error: 'テナント一覧の取得に失敗しました', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// 新規テナント作成
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, domain, plan = 'starter' } = body;

    if (!name || !domain) {
      return NextResponse.json(
        { error: 'テナント名とドメインは必須です' },
        { status: 400 }
      );
    }

    console.log(`📝 新規テナント作成中: ${name} (${domain})`);

    // プラン設定
    const planSettings = {
      'starter': { max_users: 5, max_projects: 3, storage_gb: 1, api_calls_per_month: 1000, price_per_user: 10.0 },
      'professional': { max_users: 15, max_projects: 10, storage_gb: 5, api_calls_per_month: 5000, price_per_user: 20.0 },
      'enterprise': { max_users: 100, max_projects: 50, storage_gb: 20, api_calls_per_month: 20000, price_per_user: 50.0 }
    };

    const settings = planSettings[plan as keyof typeof planSettings] || planSettings.starter;
    const tenantId = `tenant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const stmt = db.prepare(`
      INSERT INTO tenants (
        id, name, domain, plan, max_users, max_projects,
        storage_gb, api_calls_per_month, price_per_user
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      tenantId, name, domain, plan,
      settings.max_users, settings.max_projects, settings.storage_gb,
      settings.api_calls_per_month, settings.price_per_user
    );

    // 新規作成されたテナント情報を取得
    const newTenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);

    // 監査ログ記録
    AuditLogger.log(
      tenantId,
      null, // システム作成時はuser_id null
      'CREATE',
      'tenant',
      tenantId,
      { name, domain, plan },
      request.headers.get('x-forwarded-for') || 'localhost',
      request.headers.get('user-agent') || 'unknown'
    );

    console.log(`✅ テナント作成完了: ${tenantId}`);

    return NextResponse.json({
      tenant: newTenant,
      message: 'テナントが正常に作成されました'
    }, { status: 201 });

  } catch (error) {
    console.error('❌ テナント作成エラー:', error);

    // ドメイン重複エラーの場合
    if ((error as Error).message.includes('UNIQUE constraint failed: tenants.domain')) {
      return NextResponse.json(
        { error: 'このドメインは既に使用されています' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'テナント作成に失敗しました', details: (error as Error).message },
      { status: 500 }
    );
  }
}
