import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

const prisma = new PrismaClient();

/**
 * Parses the 'expand' query parameter string and builds a Prisma 'include' object.
 * Supports nested relations (e.g., "comments.author") and limits expansion depth.
 *
 * @param expandString Comma-separated string of relations to expand (e.g., "author,comments.author").
 * @param maxDepth Maximum expansion depth. Defaults to 2.
 * @returns A Prisma 'include' object or undefined if expandString is null/empty.
 */
function parseExpandString(expandString: string | null, maxDepth: number = 2): Record<string, any> | undefined {
    if (!expandString) return undefined;

    const include: Record<string, any> = {};
    // クエリパラメータ前後の空白を削除し、空の要素を除去
    const paths = expandString.split(',').map(s => s.trim()).filter(Boolean);

    paths.forEach(path => {
        const parts = path.split('.');
        let currentLevel = include;
        let depth = 0;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            depth++;

            // 深さ制限チェック
            if (depth > maxDepth) {
                console.warn(`Max depth (${maxDepth}) reached for part "${part}" in path "${path}". Skipping further expansion for this path.`);
                break; // このパスのこれ以上の展開はスキップ
            }

            const isLastPart = i === parts.length - 1;

            if (!currentLevel[part]) {
                // この部分が include オブジェクトにまだ存在しない場合
                currentLevel[part] = isLastPart ? true : { include: {} };
            } else if (currentLevel[part] === true && !isLastPart) {
                // 既に true として存在するが、さらにネストが必要な場合 (例: expand=comments,comments.author)
                currentLevel[part] = { include: {} };
            } else if (typeof currentLevel[part] === 'object' && !currentLevel[part].include && !isLastPart) {
                 // オブジェクトだが include プロパティがない場合 (他のパスによって作成された中間オブジェクトかもしれない)
                 // ネストのために include プロパティを追加
                 currentLevel[part].include = {};
            }
            // else if (typeof currentLevel[part] === 'object' && currentLevel[part].include) {
            //    // 既にネストされた include が存在する場合、何もしない (currentLevel を進めるだけ)
            // }
            // else if (currentLevel[part] === true && isLastPart) {
            //    // 既に true で、かつパスの最後なら何もしない
            // }
            // else {
                 // 予期しないケース (例えば、プリミティブ値が設定されているなど) - 基本的には発生しないはず
                 // console.warn(`Unexpected value found at ${part} in path ${path}. Skipping further expansion for this part.`);
                 // break;
            // }

            // 次のネストレベルに進む (パスの最後でなく、現在のレベルがネスト可能なオブジェクトの場合)
            if (!isLastPart && typeof currentLevel[part] === 'object' && currentLevel[part].include) {
                 currentLevel = currentLevel[part].include;
            } else if (!isLastPart) {
                 // ネストが必要だが、進めない場合 (例: true になっている、または include がないオブジェクト)
                 // このパスの処理を中断
                 console.warn(`Cannot descend further into path "${path}" at part "${part}" because it's not a valid nested include structure.`);
                 break;
            }
        }
    });

    // console.log("Generated include:", JSON.stringify(include, null, 2));
    return Object.keys(include).length > 0 ? include : undefined;
}


export async function GET(request: NextRequest) {
  // Next.js 15 Route Handler change: await params/searchParams
  const searchParams = await request.nextUrl.searchParams;

  try {
    const expand = searchParams.get('expand');
    const maxDepthParam = searchParams.get('max_depth');

    let maxDepth = 2; // デフォルトの最大深度
    if (maxDepthParam) {
      const parsedDepth = parseInt(maxDepthParam, 10);
      // NaN でなく、0以上の整数であることを確認
      if (!isNaN(parsedDepth) && parsedDepth >= 0) {
        maxDepth = parsedDepth;
      } else {
        console.warn(`Invalid max_depth parameter "${maxDepthParam}". Using default value ${maxDepth}.`);
      }
    }

    // console.log(`Received expand: ${expand}, max_depth: ${maxDepth}`);

    const include = parseExpandString(expand, maxDepth);

    // console.log("Querying Prisma with include:", JSON.stringify(include, null, 2));

    const posts = await prisma.post.findMany({
      include: include,
      orderBy: {
        createdAt: 'desc', // 作成日時で降順ソート (任意)
      },
    });

    // console.log(`Found ${posts.length} posts.`);
    return NextResponse.json(posts);

  } catch (error) {
    console.error('Failed to fetch posts:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    // Prisma が解釈できないリレーション名を expand で指定した場合のエラーハンドリング改善の余地あり
    // 例: error.code === 'P2009' (Invalid query field) など
    return NextResponse.json({ error: 'Failed to fetch posts', details: errorMessage }, { status: 500 });
  }
  // finally {
  //   await prisma.$disconnect(); // Serverless 環境ではリクエストごとに接続/切断しない方が良い場合がある
  // }
}
