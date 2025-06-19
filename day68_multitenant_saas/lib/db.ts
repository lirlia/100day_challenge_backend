import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// データベースディレクトリの確保
const dbDir = path.join(process.cwd(), 'db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'dev.db');
const db = new Database(dbPath);

// 外部キー制約を有効化
db.pragma('foreign_keys = ON');

// マルチテナント対応スキーマ初期化
function initializeSchema() {
  console.log('🏗️  マルチテナントSaaSデータベーススキーマを初期化中...');

  // 1. テナント管理テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT UNIQUE,
      plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'professional', 'enterprise')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
      max_users INTEGER NOT NULL DEFAULT 5,
      max_projects INTEGER NOT NULL DEFAULT 3,
      storage_gb INTEGER NOT NULL DEFAULT 1,
      api_calls_per_month INTEGER NOT NULL DEFAULT 1000,
      price_per_user REAL NOT NULL DEFAULT 10.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. ユーザー管理テーブル (テナント関連付け)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
      is_active BOOLEAN NOT NULL DEFAULT true,
      last_login_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      UNIQUE(tenant_id, email)
    )
  `);

  // 3. プロジェクト管理テーブル (テナント分離)
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed')),
      owner_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 4. タスク管理テーブル (テナント分離)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
      assignee_id TEXT,
      creator_id TEXT NOT NULL,
      due_date DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 5. 使用量メトリクステーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_metrics (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      metric_type TEXT NOT NULL CHECK (metric_type IN ('user_count', 'storage_mb', 'api_calls', 'projects_count', 'tasks_count')),
      value REAL NOT NULL,
      recorded_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 6. 課金データテーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS billing_records (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      billing_period_start DATE NOT NULL,
      billing_period_end DATE NOT NULL,
      total_users INTEGER NOT NULL,
      total_projects INTEGER NOT NULL,
      storage_usage_gb REAL NOT NULL,
      api_calls_count INTEGER NOT NULL,
      base_amount REAL NOT NULL,
      overage_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue')),
      due_date DATE NOT NULL,
      paid_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 7. 監査ログテーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      details TEXT, -- JSON形式
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // インデックス作成 (パフォーマンス最適化)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_projects_tenant_id ON projects(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_tenant_id ON tasks(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_usage_metrics_tenant_id ON usage_metrics(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_usage_metrics_type_date ON usage_metrics(tenant_id, metric_type, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_billing_records_tenant_id ON billing_records(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
  `);

  console.log('✅ マルチテナントSaaSデータベース初期化完了');
  console.log('📊 作成されたテーブル: tenants, users, projects, tasks, usage_metrics, billing_records, audit_logs');

  // テスト用データ作成
  createSampleData();
}

// テスト用サンプルデータ作成
function createSampleData() {
  console.log('🔧 テスト用マルチテナントデータを作成中...');

  // サンプルテナント作成
  const sampleTenants = [
    {
      id: 'tenant_acme',
      name: 'Acme Corporation',
      domain: 'acme.example.com',
      plan: 'professional',
      max_users: 15,
      max_projects: 10,
      storage_gb: 5,
      api_calls_per_month: 5000,
      price_per_user: 20.0
    },
    {
      id: 'tenant_startup',
      name: 'Startup Inc',
      domain: 'startup.example.com',
      plan: 'starter',
      max_users: 5,
      max_projects: 3,
      storage_gb: 1,
      api_calls_per_month: 1000,
      price_per_user: 10.0
    },
    {
      id: 'tenant_enterprise',
      name: 'Enterprise Solutions Ltd',
      domain: 'enterprise.example.com',
      plan: 'enterprise',
      max_users: 100,
      max_projects: 50,
      storage_gb: 20,
      api_calls_per_month: 20000,
      price_per_user: 50.0
    }
  ];

  const insertTenant = db.prepare(`
    INSERT OR REPLACE INTO tenants (id, name, domain, plan, max_users, max_projects, storage_gb, api_calls_per_month, price_per_user)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  sampleTenants.forEach(tenant => {
    insertTenant.run(
      tenant.id, tenant.name, tenant.domain, tenant.plan,
      tenant.max_users, tenant.max_projects, tenant.storage_gb,
      tenant.api_calls_per_month, tenant.price_per_user
    );
  });

  // サンプルユーザー作成
  const sampleUsers = [
    // Acme Corporation
    { id: 'user_acme_admin', tenant_id: 'tenant_acme', email: 'admin@acme.example.com', name: 'John Smith', role: 'admin' },
    { id: 'user_acme_dev1', tenant_id: 'tenant_acme', email: 'dev1@acme.example.com', name: 'Alice Johnson', role: 'member' },
    { id: 'user_acme_dev2', tenant_id: 'tenant_acme', email: 'dev2@acme.example.com', name: 'Bob Wilson', role: 'member' },

    // Startup Inc
    { id: 'user_startup_admin', tenant_id: 'tenant_startup', email: 'founder@startup.example.com', name: 'Sarah Davis', role: 'admin' },
    { id: 'user_startup_dev', tenant_id: 'tenant_startup', email: 'dev@startup.example.com', name: 'Mike Chen', role: 'member' },

    // Enterprise Solutions
    { id: 'user_enterprise_admin', tenant_id: 'tenant_enterprise', email: 'admin@enterprise.example.com', name: 'David Brown', role: 'admin' },
    { id: 'user_enterprise_pm', tenant_id: 'tenant_enterprise', email: 'pm@enterprise.example.com', name: 'Emma Taylor', role: 'member' }
  ];

  const insertUser = db.prepare(`
    INSERT OR REPLACE INTO users (id, tenant_id, email, name, role)
    VALUES (?, ?, ?, ?, ?)
  `);

  sampleUsers.forEach(user => {
    insertUser.run(user.id, user.tenant_id, user.email, user.name, user.role);
  });

  // サンプルプロジェクト作成
  const sampleProjects = [
    // Acme Corporation
    { id: 'proj_acme_web', tenant_id: 'tenant_acme', name: 'Website Redesign', description: 'Complete overhaul of company website', owner_id: 'user_acme_admin' },
    { id: 'proj_acme_mobile', tenant_id: 'tenant_acme', name: 'Mobile App', description: 'iOS and Android app development', owner_id: 'user_acme_dev1' },

    // Startup Inc
    { id: 'proj_startup_mvp', tenant_id: 'tenant_startup', name: 'MVP Development', description: 'Minimum viable product', owner_id: 'user_startup_admin' },

    // Enterprise Solutions
    { id: 'proj_enterprise_crm', tenant_id: 'tenant_enterprise', name: 'CRM System', description: 'Customer relationship management system', owner_id: 'user_enterprise_pm' }
  ];

  const insertProject = db.prepare(`
    INSERT OR REPLACE INTO projects (id, tenant_id, name, description, owner_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  sampleProjects.forEach(project => {
    insertProject.run(project.id, project.tenant_id, project.name, project.description, project.owner_id);
  });

  // サンプルタスク作成
  const sampleTasks = [
    // Acme Corporation - Website Redesign
    { id: 'task_acme_1', tenant_id: 'tenant_acme', project_id: 'proj_acme_web', title: 'Design wireframes', status: 'done', assignee_id: 'user_acme_dev1', creator_id: 'user_acme_admin' },
    { id: 'task_acme_2', tenant_id: 'tenant_acme', project_id: 'proj_acme_web', title: 'Implement responsive layout', status: 'in_progress', assignee_id: 'user_acme_dev2', creator_id: 'user_acme_admin' },

    // Startup Inc - MVP
    { id: 'task_startup_1', tenant_id: 'tenant_startup', project_id: 'proj_startup_mvp', title: 'User authentication', status: 'todo', assignee_id: 'user_startup_dev', creator_id: 'user_startup_admin' },
    { id: 'task_startup_2', tenant_id: 'tenant_startup', project_id: 'proj_startup_mvp', title: 'Database design', status: 'in_progress', assignee_id: 'user_startup_dev', creator_id: 'user_startup_admin' }
  ];

  const insertTask = db.prepare(`
    INSERT OR REPLACE INTO tasks (id, tenant_id, project_id, title, status, assignee_id, creator_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  sampleTasks.forEach(task => {
    insertTask.run(task.id, task.tenant_id, task.project_id, task.title, task.status, task.assignee_id, task.creator_id);
  });

  console.log('✅ テスト用マルチテナントデータ作成完了');
  console.log('🏢 テナント数: 3 (Acme, Startup, Enterprise)');
  console.log('👥 ユーザー数: 7');
  console.log('📁 プロジェクト数: 4');
  console.log('📋 タスク数: 4');
}

// データベース初期化実行
try {
  initializeSchema();
} catch (error) {
  console.error('❌ データベース初期化エラー:', error);
  throw error;
}

export default db;

// テナント分離用ヘルパー関数
export class TenantQueryHelper {
    // テナント権限チェック付きクエリ実行
  static executeWithTenantCheck(query: string, tenantId: string, params: any[] = []) {
    // tenant_id条件を自動追加してRow-level securityを実現
    // メインテーブルのエイリアスを推測 (FROM xxx p の形式から)
    const fromMatch = query.match(/FROM\s+(\w+)\s+(\w+)/i);
    const tableAlias = fromMatch ? fromMatch[2] : null;

    const tenantIdColumn = tableAlias ? `${tableAlias}.tenant_id` : 'tenant_id';

    const tenantSafeQuery = query.includes('WHERE')
      ? query.replace('WHERE', `WHERE ${tenantIdColumn} = ? AND`)
      : query + ` WHERE ${tenantIdColumn} = ?`;

    return db.prepare(tenantSafeQuery).all(tenantId, ...params);
  }

    // テナント権限チェック付き単一行取得
  static getWithTenantCheck(query: string, tenantId: string, params: any[] = []) {
    // メインテーブルのエイリアスを推測 (FROM xxx p の形式から)
    const fromMatch = query.match(/FROM\s+(\w+)\s+(\w+)/i);
    const tableAlias = fromMatch ? fromMatch[2] : null;

    const tenantIdColumn = tableAlias ? `${tableAlias}.tenant_id` : 'tenant_id';

    const tenantSafeQuery = query.includes('WHERE')
      ? query.replace('WHERE', `WHERE ${tenantIdColumn} = ? AND`)
      : query + ` WHERE ${tenantIdColumn} = ?`;

    return db.prepare(tenantSafeQuery).get(tenantId, ...params);
  }

  // テナント権限チェック付きINSERT
  static insertWithTenant(table: string, data: Record<string, any>, tenantId: string) {
    const dataWithTenant = { ...data, tenant_id: tenantId };
    const columns = Object.keys(dataWithTenant);
    const placeholders = columns.map(() => '?').join(', ');
    const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

    return db.prepare(query).run(...Object.values(dataWithTenant));
  }

  // テナント権限チェック付きUPDATE
  static updateWithTenantCheck(table: string, data: Record<string, any>, tenantId: string, whereClause: string, whereParams: any[] = []) {
    const setClause = Object.keys(data).map(key => `${key} = ?`).join(', ');
    const query = `UPDATE ${table} SET ${setClause} WHERE tenant_id = ? AND ${whereClause}`;

    return db.prepare(query).run(...Object.values(data), tenantId, ...whereParams);
  }

  // テナント権限チェック付きDELETE
  static deleteWithTenantCheck(table: string, tenantId: string, whereClause: string, whereParams: any[] = []) {
    const query = `DELETE FROM ${table} WHERE tenant_id = ? AND ${whereClause}`;

    return db.prepare(query).run(tenantId, ...whereParams);
  }
}

// 使用量メトリクス記録ヘルパー
export class UsageTracker {
  static recordMetric(tenantId: string, metricType: 'user_count' | 'storage_mb' | 'api_calls' | 'projects_count' | 'tasks_count', value: number) {
    const id = `metric_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const query = `
      INSERT INTO usage_metrics (id, tenant_id, metric_type, value, recorded_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    return db.prepare(query).run(id, tenantId, metricType, value);
  }

  static getUsageForPeriod(tenantId: string, startDate: string, endDate: string) {
    const query = `
      SELECT metric_type, AVG(value) as avg_value, MAX(value) as peak_value, COUNT(*) as data_points
      FROM usage_metrics
      WHERE tenant_id = ? AND recorded_at BETWEEN ? AND ?
      GROUP BY metric_type
      ORDER BY metric_type
    `;

    return db.prepare(query).all(tenantId, startDate, endDate);
  }
}

// 監査ログ記録ヘルパー
export class AuditLogger {
  static log(tenantId: string, userId: string | null, action: string, resourceType: string, resourceId?: string, details?: object, ipAddress?: string, userAgent?: string) {
    const id = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const query = `
      INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, resource_id, details, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    return db.prepare(query).run(
      id, tenantId, userId, action, resourceType,
      resourceId || null,
      details ? JSON.stringify(details) : null,
      ipAddress || null,
      userAgent || null
    );
  }

  static getAuditTrail(tenantId: string, limit: number = 100) {
    const query = `
      SELECT al.*, u.name as user_name, u.email as user_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.tenant_id = ?
      ORDER BY al.created_at DESC
      LIMIT ?
    `;

    return db.prepare(query).all(tenantId, limit);
  }
}
