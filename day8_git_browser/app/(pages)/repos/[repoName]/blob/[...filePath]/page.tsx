import prisma from '@/lib/db';
import { spawn } from 'child_process';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

// キャッシュを無効化し、常に動的レンダリングする
export const dynamic = 'force-dynamic';

// ファイル内容とリポジトリ情報、エラー情報を返す型
type RepoFileData = {
  repository: { id: string; name: string; path: string; createdAt: Date; updatedAt: Date; } | null;
  filePath: string;
  content: string | null;
  isMarkdown: boolean;
  error?: string; // エラーメッセージ (オプション)
}

async function getFileDataWithSpawn(repoName: string, filePathArray: string[]): Promise<RepoFileData> {
  const repository = await prisma.repository.findUnique({
    where: { name: repoName },
  });

  if (!repository) {
    return { repository: null, filePath: filePathArray.join('/'), content: null, isMarkdown: false };
  }

  const filePath = filePathArray.join('/');
  const isMarkdown = filePath.toLowerCase().endsWith('.md');
  const gitArgs = ['cat-file', 'blob', `HEAD:${filePath}`];

  console.log(`[DEBUG FileContent Spawn] Preparing to spawn: git ${gitArgs.join(' ')} in ${repository?.path}`);

  return new Promise((resolve, reject) => {
    const catFileProcess = spawn('git', gitArgs, {
        cwd: repository.path,
        env: process.env,
    });

    let stdoutData = Buffer.alloc(0);
    let stderrData = '';

    catFileProcess.stdout.on('data', (data) => {
      stdoutData = Buffer.concat([stdoutData, data]);
    });

    catFileProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    catFileProcess.on('close', (code) => {
      if (code === 0) {
        const content = stdoutData.toString('utf8');
        console.log(`[DEBUG FileContent Spawn] git cat-file successful for ${repoName}/${filePath}, length: ${content.length}`);
        resolve({ repository, filePath, content, isMarkdown });
      } else {
        const errorMessage = `Could not load file content for "${filePath}". It might not exist or there was an error reading it. (git error: ${stderrData.trim()})`;
        console.error(`[ERROR FileContent Spawn] git cat-file failed for ${repoName}/${filePath} with code ${code}: ${stderrData}`);
        resolve({ repository, filePath, content: null, isMarkdown, error: errorMessage });
      }
    });

     catFileProcess.on('error', (err) => {
      console.error(`[ERROR FileContent Spawn] Failed to spawn git cat-file for ${repoName}/${filePath}:`, err);
      reject(err);
    });
  });
}

export default async function FileContentPage({ params }: { params: { repoName: string, filePath: string[] } }) {
  // params を await する
  const resolvedParams = await params;
  const { repoName, filePath: filePathArray } = resolvedParams;
  const data = await getFileDataWithSpawn(repoName, filePathArray);

  if (!data || !data.repository) {
    notFound();
  }

  const { repository, filePath, content, isMarkdown, error } = data;

  if (content === null) {
      return (
        <div className="container mx-auto p-4">
          <nav className="mb-4 text-sm text-gray-500">
            <Link href="/" className="hover:underline">Repositories</Link> / <Link href={`/repos/${repository.name}`} className="hover:underline">{repository.name}</Link> / {filePath}
          </nav>
          <h1 className="text-xl font-bold mb-4">Error</h1>
          <p className="text-red-500">{error}</p>
        </div>
      );
  }

  return (
    <div className="container mx-auto p-4">
      <nav className="mb-4 text-sm text-gray-500">
         <Link href="/" className="hover:underline">Repositories</Link> / <Link href={`/repos/${repository.name}`} className="hover:underline">{repository.name}</Link> / {filePath}
      </nav>
      <h1 className="text-xl font-bold mb-4 break-all">{filePath}</h1>

      <div className="mt-6">
        {isMarkdown ? (
          <div className="markdown-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
            >
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap text-sm bg-gray-100 dark:bg-gray-800 p-4 rounded">{content}</pre>
        )}
      </div>
    </div>
  );
}
