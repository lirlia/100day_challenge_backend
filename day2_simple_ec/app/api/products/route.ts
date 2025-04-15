import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// 商品一覧を取得
export async function GET() {
  try {
    const products = await prisma.product.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(products);
  } catch (error) {
    console.error('Failed to fetch products:', error);
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

// 新規商品を追加（管理機能として）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, price: initialPrice, imageUrl, stock } = body;

    if (!name || !description || initialPrice === undefined || !imageUrl || stock === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (typeof initialPrice !== 'number' || typeof stock !== 'number') {
       return NextResponse.json(
        { error: 'Price and stock must be numbers' },
        { status: 400 }
      );
    }

    const newProduct = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name,
          description,
          imageUrl,
          stock,
        },
      });

      await tx.productPrice.create({
        data: {
          productId: product.id,
          price: initialPrice,
        },
      });

      return product;
    });

    const responseData = {
      ...newProduct,
      price: initialPrice,
    };

    return NextResponse.json(responseData, { status: 201 });

  } catch (error) {
    console.error('Failed to create product:', error);
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}
