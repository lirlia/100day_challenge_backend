import * as fs from 'node:fs';
import * as path from 'node:path';
import git from 'isomorphic-git';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import prisma from '@/lib/db';

async function getFileData(repoName: string, filePathArray: string[]) {
  const repository = await prisma.repository.findUnique({
    where: { name: repoName },
  });

  if (!repository) {
    return null;
  }

  const filePath = filePathArray.join('/');

  try {
    const headOid = await git.resolveRef({ fs: fs.promises, dir: repository.path, ref: 'HEAD' });
    const commit = await git.readCommit({ fs: fs.promises, dir: repository.path, oid: headOid });
    const treeOid = commit.commit.tree;

    const blobStat = await git.readObject({
      fs: fs.promises,
      dir: repository.path,
      oid: treeOid,
      filepath: filePath,
    });

    if (!blobStat || blobStat.type !== 'blob') {
        console.error(`Object at path ${filePath} is not a blob or not found.`);
        return { repository, filePath, content: null, isMarkdown: false };
    }

    const { blob } = await git.readBlob({ fs: fs.promises, dir: repository.path, oid: blobStat.oid });
    const content = Buffer.from(blob).toString('utf8');

    const isMarkdown = filePath.toLowerCase().endsWith('.md');

    return { repository, filePath, content, isMarkdown };

  } catch (error) {
    console.error(`Failed to read file data for ${repoName}/${filePath}:`, error);
    return { repository, filePath, content: null, isMarkdown: false };
  }
}

export default async function FileContentPage({ params }: { params: { repoName: string, filePath: string[] } }) {
  const { repoName, filePath: filePathArray } = params;
  const data = await getFileData(repoName, filePathArray);

  if (!data || !data.repository) {
    notFound();
  }

  const { repository, filePath, content, isMarkdown } = data;

  if (content === null) {
      return (
        <div className="container mx-auto p-4">
          <nav className="mb-4 text-sm text-gray-500">
            <Link href="/" className="hover:underline">Repositories</Link> / <Link href={`/repos/${repository.name}`} className="hover:underline">{repository.name}</Link> / {filePath}
          </nav>
          <h1 className="text-xl font-bold mb-4">Error</h1>
          <p className="text-red-500">Could not load file content for "{filePath}". It might not exist or there was an error reading it.</p>
        </div>
      );
  }

  return (
    <div className="container mx-auto p-4">
      <nav className="mb-4 text-sm text-gray-500">
         <Link href="/" className="hover:underline">Repositories</Link> / <Link href={`/repos/${repository.name}`} className="hover:underline">{repository.name}</Link> / {filePath}
      </nav>
      <h1 className="text-xl font-bold mb-4 break-all">{filePath}</h1>

      <div className="border rounded p-4 bg-white dark:bg-gray-800">
        {isMarkdown ? (
          <div className="prose dark:prose-invert max-w-none">
            <ReactMarkdown>
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap text-sm">{content}</pre>
        )}
      </div>
    </div>
  );
}
