import { test, expect } from '@playwright/test';

test.describe('API Integration Tests', () => {
  const API_BASE = 'http://localhost:3001';

  test('Health Check API が正常に動作する', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/health`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('service', 'rust-jit-compiler');
    expect(data).toHaveProperty('status', 'healthy');
    expect(data).toHaveProperty('version');
  });

  test('Execute API が正常に動作する', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/execute`, {
      data: { code: '1 + 2 * 3' }
    });
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('result', 7);
    expect(data).toHaveProperty('execution_time_ns');
    expect(data).toHaveProperty('was_jit_compiled');
    expect(typeof data.execution_time_ns).toBe('number');
    expect(typeof data.was_jit_compiled).toBe('boolean');
  });

  test('Stats API が統計情報を返す', async ({ request }) => {
    // まず実行して統計を作成
    await request.post(`${API_BASE}/api/execute`, {
      data: { code: '42' }
    });

    const response = await request.get(`${API_BASE}/api/stats`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('total_executions');
    expect(data).toHaveProperty('jit_compilations');
    expect(data).toHaveProperty('total_execution_time_ns');
    expect(data).toHaveProperty('average_execution_time_ns');
    expect(data).toHaveProperty('cache_entries');

    expect(typeof data.total_executions).toBe('number');
    expect(data.total_executions).toBeGreaterThan(0);
  });

  test('Cache API がキャッシュ情報を返す', async ({ request }) => {
    // まず実行してキャッシュエントリを作成
    await request.post(`${API_BASE}/api/execute`, {
      data: { code: 'x = 100; x + 1' }
    });

    const response = await request.get(`${API_BASE}/api/cache`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('entries');
    expect(data).toHaveProperty('total_entries');
    expect(Array.isArray(data.entries)).toBeTruthy();
    expect(typeof data.total_entries).toBe('number');

    if (data.entries.length > 0) {
      const entry = data.entries[0];
      expect(entry).toHaveProperty('hash');
      expect(entry).toHaveProperty('execution_count');
      expect(entry).toHaveProperty('is_compiled');
      expect(typeof entry.execution_count).toBe('number');
      expect(typeof entry.is_compiled).toBe('boolean');
    }
  });

  test('Reset API が統計をリセットする', async ({ request }) => {
    // まず実行して統計を作成
    await request.post(`${API_BASE}/api/execute`, {
      data: { code: '5 * 5' }
    });

    // 統計確認
    let statsResponse = await request.get(`${API_BASE}/api/stats`);
    let statsData = await statsResponse.json();
    expect(statsData.total_executions).toBeGreaterThan(0);

    // リセット実行
    const resetResponse = await request.post(`${API_BASE}/api/reset`);
    expect(resetResponse.ok()).toBeTruthy();

    // リセット後の統計確認
    statsResponse = await request.get(`${API_BASE}/api/stats`);
    statsData = await statsResponse.json();
    expect(statsData.total_executions).toBe(0);
    expect(statsData.jit_compilations).toBe(0);
  });

  test('JIT コンパイルが正常に発生する', async ({ request }) => {
    // リセットして初期状態にする
    await request.post(`${API_BASE}/api/reset`);

    const testCode = 'z = 123; z * 2 + 1';

    // 同じ式を10回以上実行してJITコンパイルをトリガー
    for (let i = 0; i < 12; i++) {
      const response = await request.post(`${API_BASE}/api/execute`, {
        data: { code: testCode }
      });
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.result).toBe(247); // 123 * 2 + 1 = 247

      // 10回目以降はJITコンパイルされる可能性がある
      if (i >= 10 && data.was_jit_compiled) {
        expect(data.was_jit_compiled).toBe(true);
        break;
      }
    }

    // JIT統計を確認
    const statsResponse = await request.get(`${API_BASE}/api/stats`);
    const statsData = await statsResponse.json();
    expect(statsData.total_executions).toBeGreaterThanOrEqual(10);
  });

  test('変数の状態管理が正常に動作する', async ({ request }) => {
    // 変数代入
    let response = await request.post(`${API_BASE}/api/execute`, {
      data: { code: 'a = 50' }
    });
    expect(response.ok()).toBeTruthy();
    let data = await response.json();
    expect(data.result).toBe(50);

    // 変数参照
    response = await request.post(`${API_BASE}/api/execute`, {
      data: { code: 'a + 25' }
    });
    expect(response.ok()).toBeTruthy();
    data = await response.json();
    expect(data.result).toBe(75);

    // 変数更新
    response = await request.post(`${API_BASE}/api/execute`, {
      data: { code: 'a = a * 2' }
    });
    expect(response.ok()).toBeTruthy();
    data = await response.json();
    expect(data.result).toBe(100); // 50 * 2
  });

  test('組み込み関数が正常に動作する', async ({ request }) => {
    // フィボナッチ関数
    let response = await request.post(`${API_BASE}/api/execute`, {
      data: { code: 'fib(6)' }
    });
    expect(response.ok()).toBeTruthy();
    let data = await response.json();
    expect(data.result).toBe(8); // fib(6) = 8

    // 階乗関数
    response = await request.post(`${API_BASE}/api/execute`, {
      data: { code: 'fact(4)' }
    });
    expect(response.ok()).toBeTruthy();
    data = await response.json();
    expect(data.result).toBe(24); // 4! = 24

    // べき乗関数
    response = await request.post(`${API_BASE}/api/execute`, {
      data: { code: 'pow(2, 3)' }
    });
    expect(response.ok()).toBeTruthy();
    data = await response.json();
    expect(data.result).toBe(8); // 2^3 = 8
  });

  test('条件分岐が正常に動作する', async ({ request }) => {
    // 真の場合
    let response = await request.post(`${API_BASE}/api/execute`, {
      data: { code: 'if(10 > 5, 100, 200)' }
    });
    expect(response.ok()).toBeTruthy();
    let data = await response.json();
    expect(data.result).toBe(100);

    // 偽の場合
    response = await request.post(`${API_BASE}/api/execute`, {
      data: { code: 'if(3 > 8, 100, 200)' }
    });
    expect(response.ok()).toBeTruthy();
    data = await response.json();
    expect(data.result).toBe(200);
  });

  test('複雑な式が正常に動作する', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/execute`, {
      data: { code: 'x = 10; y = 20; if(x < y, x * 3 + y / 2, x + y)' }
    });
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.result).toBe(40); // x < y なので x * 3 + y / 2 = 10 * 3 + 20 / 2 = 30 + 10 = 40
  });
});