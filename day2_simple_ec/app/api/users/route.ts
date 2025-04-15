import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// ユーザー一覧を取得
export async function GET() {
  try {
    const users = await prisma.user.findMany({
      orderBy: {
        id: 'asc',
      },
    })
    return NextResponse.json(users)
  } catch (error) {
    console.error('Failed to fetch users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

// 新規ユーザーを作成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    const user = await prisma.user.create({
      data: {
        name,
      },
    })

    return NextResponse.json(user, { status: 201 })
  } catch (error) {
    console.error('Failed to create user:', error)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
