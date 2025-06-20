'use client';

import { useState, useEffect } from 'react';

// 型定義
interface Tenant {
  id: string;
  name: string;
  domain: string;
  plan: string;
  status: string;
  max_users: number;
  max_projects: number;
  storage_gb: number;
  api_calls_per_month: number;
  price_per_user: number;
  created_at: string;
  updated_at: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  owner_name: string;
  owner_email: string;
  task_count: number;
  completed_tasks: number;
}

interface UsageAnalysis {
  users: { current: number; limit: number; usage_percentage: number; status: string };
  projects: { current: number; limit: number; usage_percentage: number; status: string };
  storage: { current_mb: number; limit_gb: number; usage_percentage: number; status: string };
  api_calls: { current_month: number; limit_month: number; usage_percentage: number; status: string };
}

interface BillingPreview {
  base_amount: number;
  overage_amount: number;
  total_amount: number;
  predicted_monthly: number;
}

export default function MultiTenantDashboard() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [usageAnalysis, setUsageAnalysis] = useState<UsageAnalysis | null>(null);
  const [billingPreview, setBillingPreview] = useState<BillingPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // テナント一覧を取得
  const fetchTenants = async () => {
    try {
      const response = await fetch('/api/tenants');
      const data = await response.json();
      setTenants(data.tenants || []);

      // 最初のテナントを自動選択
      if (data.tenants && data.tenants.length > 0) {
        setSelectedTenant(data.tenants[0]);
      }
    } catch (err) {
      console.error('Error fetching tenants:', err);
      setError('テナント情報の取得に失敗しました。');
    }
  };

  // プロジェクト一覧を取得
  const fetchProjects = async (tenantId: string) => {
    try {
      const response = await fetch(`/api/projects?tenant_id=${tenantId}`);
      const data = await response.json();
      setProjects(data.projects || []);
    } catch (err) {
      console.error('Error fetching projects:', err);
      setError('プロジェクト情報の取得に失敗しました。');
    }
  };

  // 使用量メトリクスを取得
  const fetchUsageAnalysis = async (tenantId: string) => {
    try {
      const response = await fetch(`/api/usage/${tenantId}`);
      const data = await response.json();
      setUsageAnalysis(data.usage_analysis);
      setBillingPreview(data.billing_preview);
    } catch (err) {
      console.error('Error fetching usage analysis:', err);
      setError('使用量情報の取得に失敗しました。');
    }
  };

  // テナント選択変更
  const handleTenantChange = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setLoading(true);
  };

  // テナント選択時にデータ再取得
  useEffect(() => {
    if (selectedTenant) {
      Promise.all([
        fetchProjects(selectedTenant.id),
        fetchUsageAnalysis(selectedTenant.id)
      ]).finally(() => setLoading(false));
    }
  }, [selectedTenant]);

  // 初回マウント時
  useEffect(() => {
    fetchTenants().finally(() => setLoading(false));
  }, []);

  // 使用状況のステータス色
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'exceeded': return 'text-red-600 bg-red-100';
      case 'warning': return 'text-orange-600 bg-orange-100';
      default: return 'text-green-600 bg-green-100';
    }
  };

  // プランバッジ色
  const getPlanColor = (plan: string) => {
    switch (plan) {
      case 'enterprise': return 'bg-purple-100 text-purple-800';
      case 'professional': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading && !selectedTenant) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">マルチテナントSaaS基盤を読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Day68 - マルチテナントSaaS基盤</h1>
              <p className="text-sm text-gray-600">エンタープライズ級SaaS管理システム</p>
            </div>

            {/* テナント選択 */}
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium text-gray-700">テナント:</label>
              <select
                value={selectedTenant?.id || ''}
                onChange={(e) => {
                  const tenant = tenants.find(t => t.id === e.target.value);
                  if (tenant) handleTenantChange(tenant);
                }}
                className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name} ({tenant.plan})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        </div>
      )}

      {selectedTenant && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* テナント情報カード */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{selectedTenant.name}</h2>
                <p className="text-gray-600">{selectedTenant.domain}</p>
              </div>
              <div className="flex space-x-2">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getPlanColor(selectedTenant.plan)}`}>
                  {selectedTenant.plan.toUpperCase()}
                </span>
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                  {selectedTenant.status.toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* 使用量分析 */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">リソース使用状況</h3>

                {usageAnalysis && (
                  <div className="grid grid-cols-2 gap-6">
                    {/* ユーザー数 */}
                    <div className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-700">ユーザー数</h4>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(usageAnalysis.users.status)}`}>
                          {usageAnalysis.users.status}
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900">
                        {usageAnalysis.users.current} / {usageAnalysis.users.limit}
                      </p>
                      <p className="text-sm text-gray-500">{usageAnalysis.users.usage_percentage}% 使用中</p>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div
                          className={`h-2 rounded-full ${usageAnalysis.users.status === 'exceeded' ? 'bg-red-500' :
                              usageAnalysis.users.status === 'warning' ? 'bg-orange-500' : 'bg-green-500'
                            }`}
                          style={{ width: `${Math.min(usageAnalysis.users.usage_percentage, 100)}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* プロジェクト数 */}
                    <div className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-700">プロジェクト数</h4>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(usageAnalysis.projects.status)}`}>
                          {usageAnalysis.projects.status}
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900">
                        {usageAnalysis.projects.current} / {usageAnalysis.projects.limit}
                      </p>
                      <p className="text-sm text-gray-500">{usageAnalysis.projects.usage_percentage}% 使用中</p>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div
                          className={`h-2 rounded-full ${usageAnalysis.projects.status === 'exceeded' ? 'bg-red-500' :
                              usageAnalysis.projects.status === 'warning' ? 'bg-orange-500' : 'bg-green-500'
                            }`}
                          style={{ width: `${Math.min(usageAnalysis.projects.usage_percentage, 100)}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* ストレージ */}
                    <div className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-700">ストレージ</h4>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(usageAnalysis.storage.status)}`}>
                          {usageAnalysis.storage.status}
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900">
                        {usageAnalysis.storage.current_mb} MB / {usageAnalysis.storage.limit_gb} GB
                      </p>
                      <p className="text-sm text-gray-500">{usageAnalysis.storage.usage_percentage}% 使用中</p>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div
                          className={`h-2 rounded-full ${usageAnalysis.storage.status === 'exceeded' ? 'bg-red-500' :
                              usageAnalysis.storage.status === 'warning' ? 'bg-orange-500' : 'bg-green-500'
                            }`}
                          style={{ width: `${Math.min(usageAnalysis.storage.usage_percentage, 100)}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* API呼び出し */}
                    <div className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-700">API呼び出し（月間）</h4>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(usageAnalysis.api_calls.status)}`}>
                          {usageAnalysis.api_calls.status}
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900">
                        {usageAnalysis.api_calls.current_month} / {usageAnalysis.api_calls.limit_month}
                      </p>
                      <p className="text-sm text-gray-500">{usageAnalysis.api_calls.usage_percentage}% 使用中</p>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div
                          className={`h-2 rounded-full ${usageAnalysis.api_calls.status === 'exceeded' ? 'bg-red-500' :
                              usageAnalysis.api_calls.status === 'warning' ? 'bg-orange-500' : 'bg-green-500'
                            }`}
                          style={{ width: `${Math.min(usageAnalysis.api_calls.usage_percentage, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* プロジェクト一覧 */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">プロジェクト一覧</h3>

                {projects.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">プロジェクトがありません。</p>
                ) : (
                  <div className="space-y-4">
                    {projects.map((project) => (
                      <div key={project.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium text-gray-900">{project.name}</h4>
                            <p className="text-sm text-gray-600">{project.description}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              オーナー: {project.owner_name} ({project.owner_email})
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-sm">
                              {project.status}
                            </span>
                            <p className="text-sm text-gray-600 mt-1">
                              タスク: {project.completed_tasks}/{project.task_count}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 課金情報 */}
            <div className="space-y-8">
              {billingPreview && (
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-6">今月の課金予測</h3>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">基本料金</span>
                      <span className="font-medium">${billingPreview.base_amount}</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">超過料金</span>
                      <span className={`font-medium ${billingPreview.overage_amount > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        ${billingPreview.overage_amount}
                      </span>
                    </div>

                    <hr />

                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-gray-900">合計</span>
                      <span className="font-bold text-xl">${billingPreview.total_amount}</span>
                    </div>

                    <div className="bg-blue-50 rounded-lg p-3 mt-4">
                      <p className="text-sm text-blue-800">
                        月末予測: <strong>${billingPreview.predicted_monthly}</strong>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* テナント統計 */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">SaaS基盤統計</h3>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">総テナント数</span>
                    <span className="font-medium">{tenants.length}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-gray-600">アクティブテナント</span>
                    <span className="font-medium">
                      {tenants.filter(t => t.status === 'active').length}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-gray-600">Enterpriseプラン</span>
                    <span className="font-medium">
                      {tenants.filter(t => t.plan === 'enterprise').length}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-gray-600">Professionalプラン</span>
                    <span className="font-medium">
                      {tenants.filter(t => t.plan === 'professional').length}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-gray-600">Starterプラン</span>
                    <span className="font-medium">
                      {tenants.filter(t => t.plan === 'starter').length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
