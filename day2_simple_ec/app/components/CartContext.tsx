'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { useUser } from './UserSwitcher';

// カート内アイテムの型定義
export type CartItem = {
  id: number;
  productId: number;
  userId: number;
  quantity: number;
  product: {
    id: number;
    name: string;
    price: number;
    imageUrl: string;
    stock: number;
    description: string;
  };
};

// カートコンテキストの型定義
type CartContextType = {
  cartItems: CartItem[];
  addToCart: (productId: number, quantity: number) => Promise<void>;
  updateCartItem: (cartItemId: number, quantity: number) => Promise<void>;
  removeFromCart: (cartItemId: number) => Promise<void>;
  clearCart: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
  totalAmount: number;
  itemCount: number;
};

// カートコンテキストの作成
const CartContext = createContext<CartContextType>({
  cartItems: [],
  addToCart: async () => {},
  updateCartItem: async () => {},
  removeFromCart: async () => {},
  clearCart: async () => {},
  isLoading: false,
  error: null,
  totalAmount: 0,
  itemCount: 0,
});

// カートコンテキストのカスタムフック
export const useCart = () => useContext(CartContext);

// カートプロバイダーコンポーネント
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { currentUser } = useUser();

  // 合計金額を計算
  const totalAmount = cartItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  // 合計アイテム数を計算
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // ユーザーのカートを取得
  useEffect(() => {
    const fetchCart = async () => {
      if (!currentUser) {
        setCartItems([]);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/cart?userId=${currentUser.id}`);
        if (!response.ok) throw new Error('Failed to fetch cart');

        const data = await response.json();
        setCartItems(data);
      } catch (error) {
        console.error('Error fetching cart:', error);
        setError('カートの取得に失敗しました');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCart();
  }, [currentUser]);

  // カートに商品を追加
  const addToCart = async (productId: number, quantity: number) => {
    if (!currentUser) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: currentUser.id,
          productId,
          quantity,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add to cart');
      }

      const newCartItem = await response.json();

      setCartItems((prev) => {
        const existingItemIndex = prev.findIndex((item) => item.id === newCartItem.id);
        if (existingItemIndex >= 0) {
          const updatedItems = [...prev];
          updatedItems[existingItemIndex] = newCartItem;
          return updatedItems;
        } else {
          return [...prev, newCartItem];
        }
      });
    } catch (error) {
      console.error('Error adding to cart:', error);
      setError(error instanceof Error ? error.message : 'カートへの追加に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  // カート内商品の数量を更新
  const updateCartItem = async (cartItemId: number, quantity: number) => {
    if (!currentUser) return;
    if (quantity <= 0) {
      return removeFromCart(cartItemId);
    }

    setIsLoading(true);
    setError(null);

    try {
      const cartItem = cartItems.find((item) => item.id === cartItemId);
      if (!cartItem) throw new Error('カートアイテムが見つかりません');

      const response = await fetch('/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: currentUser.id,
          productId: cartItem.productId,
          quantity,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update cart');
      }

      const updatedCartItem = await response.json();

      setCartItems((prev) =>
        prev.map((item) => (item.id === cartItemId ? updatedCartItem : item))
      );
    } catch (error) {
      console.error('Error updating cart:', error);
      setError(error instanceof Error ? error.message : 'カートの更新に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  // カートから商品を削除
  const removeFromCart = async (cartItemId: number) => {
    if (!currentUser) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/cart?id=${cartItemId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to remove from cart');

      setCartItems((prev) => prev.filter((item) => item.id !== cartItemId));
    } catch (error) {
      console.error('Error removing from cart:', error);
      setError('カートからの削除に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  // カートを空にする（注文完了後などに使用）
  const clearCart = async () => {
    if (!currentUser) return;

    setCartItems([]);
  };

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        updateCartItem,
        removeFromCart,
        clearCart,
        isLoading,
        error,
        totalAmount,
        itemCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
