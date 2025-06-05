import { Order, CreateOrderRequest, Product } from '@/app/types/order';

const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:8080';

class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  try {
    const response = await fetch(`${ORDER_SERVICE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new ApiError(`API request failed: ${response.statusText}`, response.status);
    }

    return await response.json();
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
}

export const orderApi = {
  // 注文一覧を取得
  async getOrders(userId?: string): Promise<Order[]> {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return apiRequest<Order[]>(`/api/orders${query}`);
  },

  // 注文詳細を取得
  async getOrder(orderId: string): Promise<Order> {
    return apiRequest<Order>(`/api/orders/${orderId}`);
  },

  // 新しい注文を作成
  async createOrder(orderData: CreateOrderRequest): Promise<{ id: string }> {
    return apiRequest<{ id: string }>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(orderData),
    });
  },

  // 商品一覧を取得（注文作成時に使用）
  async getProducts(): Promise<Product[]> {
    // 実際のAPIエンドポイントが無い場合はダミーデータを返す
    return [
      { id: 'keyboard', name: 'キーボード', description: '高品質なメカニカルキーボード', price: 15000, stock: 10 },
      { id: 'mouse', name: 'マウス', description: 'エルゴノミクスマウス', price: 8000, stock: 5 },
      { id: 'monitor', name: 'モニター', description: '27インチ 4Kモニター', price: 45000, stock: 3 },
      { id: 'headset', name: 'ヘッドセット', description: 'ゲーミングヘッドセット', price: 12000, stock: 7 },
    ];
  },
};
