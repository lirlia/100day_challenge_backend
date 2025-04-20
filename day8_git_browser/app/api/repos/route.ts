import { NextResponse } from 'next/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import git from 'isomorphic-git';
import { PrismaClient } from '@/app/generated/prisma';

const prisma = new PrismaClient();

// リポジトリを保存するベースディレクトリ
const REPOS_BASE_DIR = path.resolve(process.cwd(), 'repositories');

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const repoName = body.name;

    if (!repoName || typeof repoName !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(repoName)) {
      return NextResponse.json({ error: 'Invalid repository name. Use only alphanumeric characters, hyphens, and underscores.' }, { status: 400 });
    }

    const repoPath = path.join(REPOS_BASE_DIR, `${repoName}.git`);

    // ディレクトリが存在しない場合は作成
    await fs.promises.mkdir(REPOS_BASE_DIR, { recursive: true });

    // リポジトリ名が既にDBに存在するか確認
    const existingRepoByName = await prisma.repository.findUnique({
      where: { name: repoName },
    });
    if (existingRepoByName) {
      return NextResponse.json({ error: 'Repository name already exists.' }, { status: 409 });
    }

    // ファイルシステム上に既に同名のディレクトリ/ファイルが存在するか確認
    try {
      await fs.promises.access(repoPath);
      // 存在する場合 (DBにはないがファイルシステムにはある場合)
      console.error(`Directory or file already exists at ${repoPath} but not in DB.`);
      return NextResponse.json({ error: 'Repository path already exists on filesystem.' }, { status: 409 });
    } catch (error: any) {
      // access がエラーを throw する = 存在しないので、正常系
      if (error.code !== 'ENOENT') {
        throw error; // ENOENT 以外のエラーは想定外
      }
    }

    // isomorphic-gitでbareリポジトリを初期化
    await git.init({
      fs: fs.promises,
      dir: repoPath,
      bare: true,
    });

    console.log(`Initialized bare repository at: ${repoPath}`);

    // --- 初期コミットを追加 ---
    try {
      // 1. HEAD を先に作成し、main ブランチを指すようにする (シンボリック参照)
       await git.writeRef({
        fs: fs.promises,
        dir: repoPath,
        ref: 'HEAD',
        value: 'refs/heads/main', // シンボリック参照の値
        force: true, // 念のため上書き許可
        symbolic: true, // シンボリック参照であることを指定
      });
      console.log(`Created HEAD symbolically pointing to refs/heads/main`);

      // 2. コミットオブジェクトを作成 (HEAD が存在するので成功するはず)
      //    isomorphic-git が HEAD の指す refs/heads/main も自動で作成/更新してくれる
      const initialCommitOid = await git.commit({
        fs: fs.promises,
        dir: repoPath,
        message: 'Initial commit',
        author: {
          name: 'System',
          email: 'system@example.com',
        },
        tree: '4b825dc642cb6eb9a060e54bf8d69288fbee4904', // 空のツリー
      });
      console.log(`Created initial commit: ${initialCommitOid} and updated refs/heads/main`);

    } catch (commitError) {
        console.error('Failed to create initial commit:', commitError);
        // 初期コミットに失敗した場合でもリポジトリ自体は作成されている可能性があるため、
        // DB登録は行うが、エラーを返すかログに留めるかは検討。
        // ここではエラーをログに出力するに留める。
    }
    // --- 初期コミット追加ここまで ---

    // Prismaでデータベースに保存
    const newRepository = await prisma.repository.create({
      data: {
        name: repoName,
        path: repoPath, // 保存するパス (絶対パス or ワークスペースからの相対パス)
      },
    });

    return NextResponse.json(newRepository, { status: 201 });

  } catch (error) {
    console.error('Failed to create repository:', error);
    // エラーの種類に応じてより詳細なハンドリングが可能
    if (error instanceof Error && error.message.includes('exists')) {
        // git.init が失敗した場合など (稀だが念のため)
        return NextResponse.json({ error: 'Failed to initialize repository, path might exist.' }, { status: 500 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
