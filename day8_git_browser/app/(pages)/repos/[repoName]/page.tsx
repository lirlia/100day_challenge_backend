import { PrismaClient } from '@/app/generated/prisma';
import * as fs from 'node:fs';
import * as nodePath from 'node:path'; // path -> nodePath に変更
import git from 'isomorphic-git';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import prisma from '@/lib/db'; // default import に修正
import CloneRepo from '@/components/CloneRepo'; // 新しいコンポーネントをインポート

// const prisma = new PrismaClient();

// GitEntry 型の type と mode を修正
type GitEntry = {
    oid: string;
    type: 'blob' | 'tree' | 'commit' | 'tag' | 'special'; // 'special' を追加
    path: string;
    mode: number; // string -> number に変更
}

async function getRepoData(repoName: string) {
  const repository = await prisma.repository.findUnique({
    where: { name: repoName },
  });

  if (!repository) {
    return null;
  }

  try {
    // デフォルトブランチ (main) の最新コミットを取得
    const headOid = await git.resolveRef({ fs: fs.promises, dir: repository.path, ref: 'HEAD' });
    const commit = await git.readCommit({ fs: fs.promises, dir: repository.path, oid: headOid });
    const treeOid = commit.commit.tree;

    // --- git.walk を使ってルートツリーのエントリを取得 ---
    const entries: GitEntry[] = [];
    await git.walk({
        fs: fs.promises,
        dir: repository.path,
        trees: [git.TREE({ oid: treeOid } as any)],
        map: async (filepath, [root]) => {
            // filepath はファイル/ディレクトリへのパス (ルートからの相対)
            // root は TreeEntry オブジェクト (null になる場合もあるのでチェック)
            if (filepath === '.' || !root) return null; // ルート自体や null はスキップ

            // walk は再帰的に潜るが、今回はルート直下のみ欲しいので階層チェック
            if (filepath.includes('/')) return null;

            entries.push({
                oid: await root.oid(),
                type: await root.type() as GitEntry['type'],
                path: filepath,
                mode: await root.mode(),
            });
            return true; // 何か返さないと walk が止まる可能性がある
        },
    });
    // --- ここまで ---

    return { repository, entries };

  } catch (error) {
    console.error(`Failed to read repository data for ${repoName}:`, error);
    // HEAD がない、コミットがない等の場合もエラーになる
    return { repository, entries: [] }; // エラーでもリポジトリ情報だけ返す (クローンURL表示のため)
  }
}

export default async function RepoDetailPage({ params }: { params: { repoName: string } }) {
  // params を await する
  const resolvedParams = await params;
  const repoName = resolvedParams.repoName;
  const data = await getRepoData(repoName);

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
