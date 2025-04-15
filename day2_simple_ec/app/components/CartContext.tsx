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
    imageUrl: string;
    stock: number;
    description: string;
  };
  currentPrice: number; // 最新の価格
  addedPrice: number; // ★ カート投入時の価格を追加
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
  priceChangedItems: Set<number>;
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
  priceChangedItems: new Set<number>(),
});

// カートコンテキストのカスタムフック
export const useCart = () => useContext(CartContext);

// カートプロバイダーコンポーネント
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceChangedItems, setPriceChangedItems] = useState<Set<number>>(new Set());
  const { currentUser } = useUser();

  // 合計金額を計算
  const totalAmount = cartItems.reduce(
    (sum, item) => sum + item.currentPrice * item.quantity,
    0
  );

  // 合計アイテム数を計算
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // ユーザーのカートを取得
  useEffect(() => {
    const fetchCart = async () => {
      if (!currentUser) {
        setCartItems([]);
        setPriceChangedItems(new Set());
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/cart?userId=${currentUser.id}`);
        if (!response.ok) throw new Error('Failed to fetch cart');

        // ★ APIから取得するデータ (addedPrice, currentPrice を含む)
        const newCartData: CartItem[] = await response.json();

        // ★ 価格変動チェック（addedPrice と currentPrice を比較）
        const changedItems = new Set<number>();
        newCartData.forEach(newItem => {
          // addedPrice が存在し、currentPrice と異なる場合に Set に追加
          // (addedPrice はDBから来るので undefined チェックは本来不要だが念のため)
          if (newItem.addedPrice !== undefined && newItem.addedPrice !== newItem.currentPrice) {
            changedItems.add(newItem.id);
          }
        });
        setPriceChangedItems(changedItems);
        // ★ チェックここまで

        setCartItems(newCartData);
      } catch (error) {
        console.error('Error fetching cart:', error);
        setError('カートの取得に失敗しました');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // 価格変更セットからも削除
      setPriceChangedItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(cartItemId);
        return newSet;
      });

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
    setPriceChangedItems(new Set());
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
        priceChangedItems,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
