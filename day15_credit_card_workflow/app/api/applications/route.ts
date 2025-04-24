import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { ApplicationStatus, Prisma } from '../../generated/prisma';

// GET /api/applications - 全申請一覧を取得
export async function GET() {
  try {
    const applications = await prisma.creditCardApplication.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
    return NextResponse.json(applications);
  } catch (error) {
    console.error("[API_APPLICATIONS_GET]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

// POST /api/applications - 新規申請を作成
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { applicantName } = body;

    if (!applicantName) {
      return new NextResponse("Name is required", { status: 400 });
    }

    // 最初の状態遷移履歴も同時に作成する
    const newApplication = await prisma.creditCardApplication.create({
      data: {
        applicantName,
        status: ApplicationStatus.APPLIED, // 初期状態
        histories: {
          create: [
            {
              fromStatus: null, // 初期状態からの遷移なので from は null
              toStatus: ApplicationStatus.APPLIED,
              notes: 'Application submitted',
            },
          ],
        },
      },
      include: {
        histories: true, // 作成した履歴もレスポンスに含める
      },
    });

    return NextResponse.json(newApplication, { status: 201 });
  } catch (error: any) {
    console.error("[API_APPLICATIONS_POST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
