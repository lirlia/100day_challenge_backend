import { PrismaClient } from '@/app/generated/prisma';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import prisma from '@/lib/db';
import { spawn } from 'child_process';

// キャッシュを無効化し、常に動的レンダリングする
export const dynamic = 'force-dynamic';

// GitEntry 型
type GitEntry = {
  oid: string;
  type: 'blob' | 'tree' | 'commit' | 'tag' | 'special';
  path: string;
  mode: string;
}

async function getRepoDirectoryContents(repoName: string, dirPath: string[]): Promise<{ repository: { id: string; name: string; path: string; createdAt: Date; updatedAt: Date; } | null; entries: GitEntry[]; currentPath: string }> {
  const repository = await prisma.repository.findUnique({
    where: { name: repoName },
  });

  if (!repository) {
    return { repository: null, entries: [], currentPath: '' };
  }

  // ディレクトリパスを結合（空の場合はルートディレクトリ）
  const currentPath = dirPath.join('/');

  return new Promise((resolve, reject) => {
    // git ls-tree コマンドを実行して指定ディレクトリの内容を取得
    const gitCommand = ['ls-tree', '-z'];
    if (currentPath) {
      // HEAD:path の形式でディレクトリの中身を取得
      gitCommand.push(`HEAD:${currentPath}`);
    } else {
      gitCommand.push('HEAD');
    }

    console.log(`[DEBUG TreePage Spawn] Executing: git ${gitCommand.join(' ')} in ${repository.path}`);

    const lsTreeProcess = spawn('git', gitCommand, {
      cwd: repository.path,
      env: process.env,
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
        console.log(`[DEBUG TreePage Spawn] git ls-tree successful for ${repoName}:${currentPath}`);
        const entries: GitEntry[] = [];
        // NUL区切りで分割し、各行をパース
        const lines = stdoutData.split('\0').filter(line => line.trim() !== '');
        lines.forEach(line => {
          // フォーマット: <mode> SP <type> SP <oid> TAB <path>
          const parts = line.split(/[ \t]/);
          if (parts.length >= 4) {
            const mode = parts[0];
            const type = parts[1] as GitEntry['type'];
            const oid = parts[2];
            // パスのフルパスを取得
            const fullPath = parts.slice(3).join(' ');
            console.log(`[DEBUG TreePage Spawn] Parsed entry: mode=${mode}, type=${type}, oid=${oid}, fullPath=${fullPath}`);

            entries.push({
              mode,
              type,
              oid,
              path: fullPath // フルパスを保存
            });
          }
        });

        console.log(`[DEBUG TreePage Spawn] Found ${entries.length} entries in directory ${currentPath}`);
        resolve({ repository, entries, currentPath });
      } else {
        console.error(`[ERROR TreePage Spawn] git ls-tree failed for ${repoName}:${currentPath} with code ${code}: ${stderrData}`);
        resolve({ repository, entries: [], currentPath });
      }
    });

    lsTreeProcess.on('error', (err) => {
      console.error(`[ERROR TreePage Spawn] Failed to spawn git ls-tree for ${repoName}:${currentPath}:`, err);
      reject(err);
    });
  });
}

export default async function DirectoryTreePage({ params }: { params: { repoName: string; dirPath: string[] } }) {
  const resolvedParams = await params;
  const { repoName, dirPath } = resolvedParams;

  const data = await getRepoDirectoryContents(repoName, dirPath);

  if (!data || !data.repository) {
    notFound(); // リポジトリがDBに存在しない場合は404
  }

  const { repository, entries, currentPath } = data;

  // パンくずリスト用のパス階層を構築
  const pathSegments = currentPath ? currentPath.split('/') : [];
  const breadcrumbs = [
    { name: 'Repositories', path: '/' },
    { name: repository.name, path: `/repos/${repository.name}` },
  ];

  // 現在のパスまでの各階層をパンくずに追加
  let cumulativePath = '';
  pathSegments.forEach((segment, index) => {
    cumulativePath += (index > 0 ? '/' : '') + segment;
    breadcrumbs.push({
      name: segment,
      path: `/repos/${repository.name}/tree/${cumulativePath}`
    });
  });

  return (
    <div className="container mx-auto p-4">
      {/* パンくずリスト */}
      <nav className="mb-4 text-sm text-gray-500">
        {breadcrumbs.map((crumb, index) => (
          <span key={crumb.path}>
            {index > 0 && ' / '}
            {index === breadcrumbs.length - 1 ? (
              <span>{crumb.name}</span>
            ) : (
              <Link href={crumb.path} className="hover:underline">
                {crumb.name}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <h1 className="text-2xl font-bold mb-2">{repository.name}</h1>
      {currentPath && (
        <h2 className="text-xl mb-4">
          Directory: {currentPath}
        </h2>
      )}

      <div className="border rounded">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Name</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  This directory is empty or an error occurred while reading its content.
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const displayName = entry.path; // ls-tree の結果は相対パスなので、そのまま表示名にする
                // 現在のパスと entry.path を結合してフルパスを作成
                const fullEntryPath = currentPath ? `${currentPath}/${entry.path}` : entry.path;
                const blobHref = `/repos/${repository.name}/blob/${fullEntryPath}`;
                const treeHref = `/repos/${repository.name}/tree/${fullEntryPath}`;
                console.log(`[DEBUG TreePage Link] CurrentPath=${currentPath}, Entry path=${entry.path}, FullEntryPath=${fullEntryPath}, DisplayName=${displayName}, BlobHref=${blobHref}, TreeHref=${treeHref}`); // ログ修正
                return (
                  <tr key={entry.path}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {entry.type === 'tree' ? (
                        <Link href={treeHref}>
                          <span className="text-blue-600 hover:underline">{displayName}</span>
                        </Link>
                      ) : (
                        <Link href={blobHref}>
                          <span className="text-gray-900 dark:text-gray-100 hover:underline">{displayName}</span>
                        </Link>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {entry.type}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}