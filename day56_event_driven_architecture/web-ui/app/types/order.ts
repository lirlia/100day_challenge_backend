export interface OrderItem {
  id: number;
  orderId: string;
  productId: string;
  quantity: number;
  priceAtPurchase: number;
}

export interface Order {
  id: string;
  userId: string;
  status: string;
  totalAmount: number;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderRequest {
  userId: string;
  items: {
    productId: string;
    quantity: number;
    price: number;
  }[];
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
}
