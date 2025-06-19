import { NextResponse } from 'next/server';
import db, { UsageTracker, AuditLogger } from '@/lib/db';

// テナント使用量メトリクス取得
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30'; // デフォルト30日間

    console.log(`📊 使用量メトリクス取得中: ${tenantId} (${period}日間)`);

    // テナントの存在確認
    const tenantStmt = db.prepare('SELECT * FROM tenants WHERE id = ?');
    const tenant = tenantStmt.get(tenantId) as any;

    if (!tenant) {
      return NextResponse.json(
        { error: 'テナントが見つかりません' },
        { status: 404 }
      );
    }

    // 期間の計算
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - parseInt(period));

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // リアルタイム使用量取得
    const currentUsageStmt = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE tenant_id = ? AND is_active = true) as current_users,
        (SELECT COUNT(*) FROM projects WHERE tenant_id = ? AND status = 'active') as current_projects,
        (SELECT COUNT(*) FROM tasks WHERE tenant_id = ?) as current_tasks,
        (SELECT COUNT(*) FROM audit_logs WHERE tenant_id = ? AND created_at >= date('now', '-30 days')) as api_calls_30_days
    `);

    const currentUsage = currentUsageStmt.get(tenantId, tenantId, tenantId, tenantId) as any;

    // ストレージ使用量計算（概算）
    const storageStmt = db.prepare(`
      SELECT
        COUNT(*) * 0.001 + -- プロジェクト数 * 1KB
        (SELECT COUNT(*) FROM tasks WHERE tenant_id = ?) * 0.002 + -- タスク数 * 2KB
        (SELECT COUNT(*) FROM audit_logs WHERE tenant_id = ?) * 0.0005 as storage_mb -- ログ * 0.5KB
      FROM projects WHERE tenant_id = ?
    `);

    const storageUsage = (storageStmt.get(tenantId, tenantId, tenantId) as any)?.storage_mb || 0;

    // 過去の使用量トレンド取得
    const trendData = UsageTracker.getUsageForPeriod(tenantId, startDateStr, endDateStr);

    // プラン制限と比較
    const usageAnalysis = {
      users: {
        current: currentUsage.current_users,
        limit: tenant.max_users,
        usage_percentage: Math.round((currentUsage.current_users / tenant.max_users) * 100),
        status: currentUsage.current_users >= tenant.max_users ? 'exceeded' :
                currentUsage.current_users > tenant.max_users * 0.8 ? 'warning' : 'normal'
      },
      projects: {
        current: currentUsage.current_projects,
        limit: tenant.max_projects,
        usage_percentage: Math.round((currentUsage.current_projects / tenant.max_projects) * 100),
        status: currentUsage.current_projects >= tenant.max_projects ? 'exceeded' :
                currentUsage.current_projects > tenant.max_projects * 0.8 ? 'warning' : 'normal'
      },
      storage: {
        current_mb: Math.round(storageUsage * 100) / 100,
        limit_gb: tenant.storage_gb,
        limit_mb: tenant.storage_gb * 1024,
        usage_percentage: Math.round((storageUsage / (tenant.storage_gb * 1024)) * 100),
        status: storageUsage >= (tenant.storage_gb * 1024) ? 'exceeded' :
                storageUsage > (tenant.storage_gb * 1024) * 0.8 ? 'warning' : 'normal'
      },
      api_calls: {
        current_month: currentUsage.api_calls_30_days,
        limit_month: tenant.api_calls_per_month,
        usage_percentage: Math.round((currentUsage.api_calls_30_days / tenant.api_calls_per_month) * 100),
        status: currentUsage.api_calls_30_days >= tenant.api_calls_per_month ? 'exceeded' :
                currentUsage.api_calls_30_days > tenant.api_calls_per_month * 0.8 ? 'warning' : 'normal'
      }
    };

    // 今月の課金予測
    const daysInMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate();
    const daysPassed = endDate.getDate();
    const predictedUsers = Math.max(currentUsage.current_users, 1);
    const baseAmount = predictedUsers * tenant.price_per_user;

    // 超過料金計算
    let overageAmount = 0;
    if (usageAnalysis.users.status === 'exceeded') {
      overageAmount += (currentUsage.current_users - tenant.max_users) * tenant.price_per_user * 1.5;
    }
    if (usageAnalysis.storage.status === 'exceeded') {
      const excessGB = Math.ceil(storageUsage / 1024) - tenant.storage_gb;
      overageAmount += excessGB * 5; // GB当たり$5
    }

    const billing = {
      base_amount: baseAmount,
      overage_amount: overageAmount,
      total_amount: baseAmount + overageAmount,
      predicted_monthly: Math.round(((baseAmount + overageAmount) / daysPassed) * daysInMonth * 100) / 100
    };

    // 使用量メトリクス記録
    UsageTracker.recordMetric(tenantId, 'user_count', currentUsage.current_users);
    UsageTracker.recordMetric(tenantId, 'projects_count', currentUsage.current_projects);
    UsageTracker.recordMetric(tenantId, 'tasks_count', currentUsage.current_tasks);
    UsageTracker.recordMetric(tenantId, 'storage_mb', storageUsage);
    UsageTracker.recordMetric(tenantId, 'api_calls', currentUsage.api_calls_30_days);

    console.log(`✅ 使用量メトリクス取得完了: ${tenantId}`);

    return NextResponse.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan,
        status: tenant.status
      },
      period: {
        days: parseInt(period),
        start_date: startDateStr,
        end_date: endDateStr
      },
      usage_analysis: usageAnalysis,
      billing_preview: billing,
      trend_data: trendData,
      last_updated: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 使用量メトリクス取得エラー:', error);
    return NextResponse.json(
      { error: '使用量メトリクスの取得に失敗しました', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// 使用量制限チェック（プロジェクト作成前などに使用）
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;
    const body = await request.json();
    const { resource_type, action } = body; // 'projects', 'users', 'storage'

    console.log(`🔍 使用量制限チェック: ${tenantId} - ${resource_type}:${action}`);

    // テナント情報取得
    const tenantStmt = db.prepare('SELECT * FROM tenants WHERE id = ?');
    const tenant = tenantStmt.get(tenantId) as any;

    if (!tenant) {
      return NextResponse.json(
        { error: 'テナントが見つかりません' },
        { status: 404 }
      );
    }

    let allowed = true;
    let reason = '';
    let current = 0;
    let limit = 0;

    switch (resource_type) {
      case 'projects':
        const projectCountStmt = db.prepare(`
          SELECT COUNT(*) as count FROM projects
          WHERE tenant_id = ? AND status = 'active'
        `);
        current = (projectCountStmt.get(tenantId) as any)?.count || 0;
        limit = tenant.max_projects;

        if (action === 'create' && current >= limit) {
          allowed = false;
          reason = `プロジェクト数の上限に達しています（${current}/${limit}）`;
        }
        break;

      case 'users':
        const userCountStmt = db.prepare(`
          SELECT COUNT(*) as count FROM users
          WHERE tenant_id = ? AND is_active = true
        `);
        current = (userCountStmt.get(tenantId) as any)?.count || 0;
        limit = tenant.max_users;

        if (action === 'create' && current >= limit) {
          allowed = false;
          reason = `ユーザー数の上限に達しています（${current}/${limit}）`;
        }
        break;

      case 'storage':
        // 簡易ストレージ計算
        const storageStmt = db.prepare(`
          SELECT COUNT(*) * 0.001 +
                 (SELECT COUNT(*) FROM tasks WHERE tenant_id = ?) * 0.002 +
                 (SELECT COUNT(*) FROM audit_logs WHERE tenant_id = ?) * 0.0005 as storage_mb
          FROM projects WHERE tenant_id = ?
        `);
        const currentStorageMB = (storageStmt.get(tenantId, tenantId, tenantId) as any)?.storage_mb || 0;
        current = Math.round(currentStorageMB);
        limit = tenant.storage_gb * 1024;

        if (currentStorageMB >= limit) {
          allowed = false;
          reason = `ストレージ容量の上限に達しています（${Math.round(currentStorageMB)}MB/${tenant.storage_gb}GB）`;
        }
        break;

      default:
        return NextResponse.json(
          { error: '未知のリソースタイプです' },
          { status: 400 }
        );
    }

    // 監査ログ記録
    AuditLogger.log(
      tenantId,
      null,
      'CHECK',
      'usage_limit',
      resource_type,
      { action, allowed, reason, current, limit },
      request.headers.get('x-forwarded-for') || 'localhost',
      request.headers.get('user-agent') || 'unknown'
    );

    return NextResponse.json({
      allowed,
      reason,
      current_usage: current,
      limit,
      resource_type,
      action,
      tenant_plan: tenant.plan
    });

  } catch (error) {
    console.error('❌ 使用量制限チェックエラー:', error);
    return NextResponse.json(
      { error: '使用量制限チェックに失敗しました', details: (error as Error).message },
      { status: 500 }
    );
  }
}
