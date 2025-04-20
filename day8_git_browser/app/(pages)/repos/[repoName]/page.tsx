import { PrismaClient } from '@/app/generated/prisma';
import * as fs from 'node:fs';
import * as nodePath from 'node:path'; // path -> nodePath に変更
import git from 'isomorphic-git'; // walk のために残すが、読み取りは spawn に変更
import Link from 'next/link';
import { notFound } from 'next/navigation';
import prisma from '@/lib/db'; // default import に修正
import CloneRepo from '@/components/CloneRepo'; // 新しいコンポーネントをインポート
import { spawn } from 'child_process'; // spawn をインポート
import { promisify } from 'util'; // exec を Promise 化するために使う (今回は spawn なので不要かも)

// const prisma = new PrismaClient();

// キャッシュを無効化し、常に動的レンダリングする
export const dynamic = 'force-dynamic';

// GitEntry 型の type と mode を修正
type GitEntry = {
    oid: string;
    type: 'blob' | 'tree' | 'commit' | 'tag' | 'special'; // 'special' を追加
    path: string;
    mode: string; // ls-tree の出力に合わせて string に戻す
}

async function getRepoDataWithSpawn(repoName: string): Promise<{ repository: { id: string; name: string; path: string; createdAt: Date; updatedAt: Date; } | null; entries: GitEntry[] }> {
  const repository = await prisma.repository.findUnique({
    where: { name: repoName },
  });

  if (!repository) {
    return { repository: null, entries: [] };
  }

  return new Promise((resolve, reject) => {
    // git ls-tree コマンドを実行してルートツリーの内容を取得
    // -z オプションで NUL 区切り、--full-tree は不要 (HEAD 指定のため)
    const lsTreeProcess = spawn('git', ['ls-tree', '-z', 'HEAD'], {
        cwd: repository.path, // bare リポジトリ内で実行
        env: process.env, // 環境変数を引き継ぐ
    });

    let stdoutData = '';
    let stderrData = '';

    lsTreeProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    lsTreeProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    lsTreeProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`[DEBUG RepoDetail Spawn] git ls-tree HEAD successful for ${repoName}`);
        const entries: GitEntry[] = [];
        // NUL 区切りで分割し、各行をパース
        const lines = stdoutData.split('\0').filter(line => line.trim() !== '');
        lines.forEach(line => {
          // フォーマット: <mode> SP <type> SP <oid> TAB <path>
          const parts = line.split(/[ \t]/);
          if (parts.length >= 4) {
            const mode = parts[0];
            const type = parts[1] as GitEntry['type']; // 型アサーション
            const oid = parts[2];
            const path = parts.slice(3).join(' '); // ファイル名にスペースが含まれる場合を考慮
            entries.push({ mode, type, oid, path });
          }
        });
        console.log(`[DEBUG RepoDetail Spawn] Found ${entries.length} entries in root tree:`, entries.map(e => e.path));
        resolve({ repository, entries });
      } else {
        console.error(`[ERROR RepoDetail Spawn] git ls-tree failed for ${repoName} with code ${code}: ${stderrData}`);
        // エラーでもリポジトリ情報だけ返す
        resolve({ repository, entries: [] });
      }
    });

    lsTreeProcess.on('error', (err) => {
      console.error(`[ERROR RepoDetail Spawn] Failed to spawn git ls-tree for ${repoName}:`, err);
      reject(err); // spawn 自体のエラーは reject
    });
  });
}

export default async function RepoDetailPage({ params }: { params: { repoName: string } }) {
  // params を await する
  const resolvedParams = await params;
  const repoName = resolvedParams.repoName;
  const data = await getRepoDataWithSpawn(repoName);

  if (!data || !data.repository) {
    notFound(); // リポジトリがDBに存在しない場合は 404
  }

  const { repository, entries } = data;

  // クローンURLのベース部分 (環境変数などから取得するのが望ましい)
  const apiUrlBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/repos';

  return (
    <div className="container mx-auto p-4">
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/" className="hover:underline">Repositories</Link> / {repository.name}
      </nav>
      <h1 className="text-2xl font-bold mb-2">{repository.name}</h1>

      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-2">Clone this repository</h2>
        <CloneRepo repoName={repository.name} apiUrlBase={apiUrlBase} />
      </div>

      <div className="border rounded">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Name</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
              {/* 必要なら他の情報 (Last commit, etc.) も表示 */}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  This repository is empty or an error occurred while reading its content.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.path}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {entry.type === 'tree' ? (
                      <span className="text-blue-600">{entry.path}</span> // ディレクトリ (今回はリンクなし)
                    ) : (
                      <Link href={`/repos/${repository.name}/blob/${entry.path}`}>
                        <span className="text-gray-900 dark:text-gray-100 hover:underline">{entry.path}</span>
                      </Link>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {entry.type}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
