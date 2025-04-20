import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import backend from 'git-http-backend';
import { PrismaClient } from '@/app/generated/prisma';
import * as fs from 'node:fs';
import { Readable, PassThrough } from 'stream';
import { ReadableStream } from 'stream/web';

const prisma = new PrismaClient();

// Node.js Readable を Web API ReadableStream に変換するヘルパー
function nodeReadableToWebReadable(nodeReadable: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeReadable.on('data', (chunk) => controller.enqueue(chunk));
      nodeReadable.on('end', () => controller.close());
      nodeReadable.on('error', (err) => controller.error(err));
    },
    cancel() {
      nodeReadable.destroy();
    },
  });
}

// git-http-backend は Readable ストリームを入力として期待するため、
// NextRequest.body を Readable ストリームに変換するヘルパー関数
async function requestToStream(request: NextRequest): Promise<Readable> {
  if (!request.body) {
    return Readable.from(new Uint8Array());
  }
  const reader = request.body.getReader();
  const nodeStream = new Readable({
    async read() {
      const { done, value } = await reader.read();
      if (done) {
        this.push(null);
      } else {
        this.push(value);
      }
    }
  });
  return nodeStream;
}

export async function GET(request: NextRequest, context: { params: { repoName: string, gitPath: string[] } }) {
  return handleGitRequest(request, context.params);
}

export async function POST(request: NextRequest, context: { params: { repoName: string, gitPath: string[] } }) {
  return handleGitRequest(request, context.params);
}

async function handleGitRequest(request: NextRequest, params: { repoName: string, gitPath: string[] }) {
  const resolvedParams = await params;
  const { repoName, gitPath } = resolvedParams;
  const gitServicePath = gitPath.join('/');
  const urlForBackend = `/${repoName}.git/${gitServicePath}${request.nextUrl.search}`;
  console.log(`Handling Git request for URL: ${urlForBackend}`);

  try {
    const repository = await prisma.repository.findUnique({
      where: { name: repoName },
    });

    if (!repository) {
      return new NextResponse('Repository not found', { status: 404 });
    }
    const repoPath = repository.path;

    try {
      await fs.promises.access(repoPath);
    } catch (error) {
      console.error(`Repository path not found on filesystem: ${repoPath}`);
      return new NextResponse('Repository not found on filesystem', { status: 404 });
    }

    const reqStream = await requestToStream(request);
    const gitBackend = backend as any;
    const responseHeaders = new Headers();

    // --- Content-Type と spawn するコマンドを URL から事前に判断 ---
    const requestPath = request.nextUrl.pathname;
    const serviceParam = request.nextUrl.searchParams.get('service');
    // ログ追加
    console.log(`[DEBUG] Determining service: Path=${requestPath}, ServiceParam=${serviceParam}`);

    let gitCommand = '';
    let contentType = '';
    const spawnEnv = { ...process.env }; // 現在の環境変数をコピー

    // --- 修正: パス末尾を優先して判定 ---
    if (requestPath.endsWith('/git-upload-pack')) {
        contentType = 'application/x-git-upload-pack-result';
        gitCommand = 'git-upload-pack';
    } else if (requestPath.endsWith('/git-receive-pack')) {
        contentType = 'application/x-git-receive-pack-result';
        gitCommand = 'git-receive-pack';
        spawnEnv['GIT_HTTP_RECEIVE_PACK'] = 'true';
    } else if (requestPath.endsWith('/info/refs')) {
        // /info/refs の場合のみ service パラメータを見る
        if (serviceParam === 'git-upload-pack') {
            contentType = 'application/x-git-upload-pack-advertisement';
            gitCommand = 'git-upload-pack';
        } else if (serviceParam === 'git-receive-pack') {
            contentType = 'application/x-git-receive-pack-advertisement';
            gitCommand = 'git-receive-pack';
            spawnEnv['GIT_HTTP_RECEIVE_PACK'] = 'true';
        }
    }
    // --- 修正ここまで ---

    if (!gitCommand || !contentType) {
        console.warn(`[DEBUG] Could not determine Git command/Content-Type from URL: ${requestPath}?${serviceParam}`);
        // 不明なリクエストはエラーにする
        return new NextResponse('Bad Request: Unknown Git service or path', { status: 400 });
    }

    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Cache-Control', 'no-cache, max-age=0, must-revalidate');
    console.log(`[DEBUG] Determined git command: ${gitCommand}, Content-Type: ${contentType}`);
    // ---

    // backendStream は Duplex (Readable & Writable)
    const backendStream = gitBackend(urlForBackend, (err: Error | null, service: any) => {
      if (err) {
        console.error('git-http-backend service determination error:', err);
        responseStreamPassThrough.destroy(err);
        return;
      }
      console.log(`Git service: ${service.action}, Repo: ${repoName}`);

      // --- spawn するコマンドと環境変数を事前に決定したものに差し替え ---
      // Note: service.cmd, service.args は git-http-backend (npm) が解析したもの。
      // 本来はこれを使うべきだが、Content-Type 同様、コールバック内での情報が遅い/不確実なため、
      // 事前に URL から判定した gitCommand を使う。
      // 引数 (service.args) は git-http-backend の解析結果を流用する。
      if (!service.args) { // args がない場合はエラー
           console.error('git-http-backend did not provide service.args');
           responseStreamPassThrough.destroy(new Error('Internal Server Error: Missing service args'));
           return;
      }
      const gitProcess = spawn(gitCommand, service.args.concat(repoPath), { env: spawnEnv });
      console.log(`Spawning git process: ${gitCommand} ${service.args.concat(repoPath).join(' ')} with env GIT_HTTP_RECEIVE_PACK=${spawnEnv['GIT_HTTP_RECEIVE_PACK']}`);
      // --- ここまで ---

      // エラーログ用
      gitProcess.stderr.on('data', (data) => {
        console.error(`Git process stderr: ${data.toString()}`);
      });
      gitProcess.on('exit', (code) => {
        console.log(`Git process exited with code ${code}`);
      });
      gitProcess.on('error', (spawnError) => {
        console.error('Git process spawn error:', spawnError);
        service.createStream().destroy(spawnError); // service ストリームも閉じる
        responseStreamPassThrough.destroy(spawnError); // レスポンスストリームも閉じる
      });

      // service.createStream() は Duplex? これに git プロセスの stdio を接続
      const serviceStream = service.createStream(); // This stream handles IO for git process
      gitProcess.stdout.pipe(serviceStream).pipe(gitProcess.stdin);

      // serviceStreamのエラーハンドリング
      serviceStream.on('error', (serviceStreamError: Error) => {
         console.error('Git service stream error:', serviceStreamError);
         // responseStreamPassThrough.destroy(serviceStreamError);
         // gitProcess.kill(); // プロセスも停止させる
      });
    });

    // backendStream の出力 (クライアントへのレスポンス) を PassThrough で受け取る
    const responseStreamPassThrough = new PassThrough();

    // --- ログ追加: backendStream の最初のデータチャンクを確認 ---
    let isFirstChunk = true;
    const loggingPassThrough = new PassThrough();
    loggingPassThrough.on('data', (chunk) => {
        if (isFirstChunk) {
            console.log('[DEBUG] First chunk from backendStream (Buffer):', chunk);
            console.log(`[DEBUG] First chunk from backendStream (String): ${chunk.toString().slice(0, 100)}...`); // 先頭100文字
            isFirstChunk = false;
        }
    });
    backendStream.pipe(loggingPassThrough).pipe(responseStreamPassThrough);
    // --- ログ追加ここまで ---

    // backendStream自体のエラー (サービス特定前のエラーなど)
    backendStream.on('error', (backendError: Error) => {
        console.error('[ERROR] Backend stream error:', backendError);
        responseStreamPassThrough.destroy(backendError);
    });

    // リクエストストリームを backendStream に入力
    reqStream.pipe(backendStream);
    reqStream.on('error', (reqError) => {
        console.error('[ERROR] Request stream error:', reqError);
        backendStream.destroy(reqError);
    });

    // PassThrough ストリーム (Node.js Readable) を Web ReadableStream に変換してレスポンスボディとする
    const webReadableStream = nodeReadableToWebReadable(responseStreamPassThrough);

    // --- ログ追加: 最終的なレスポンスヘッダーを確認 ---
    // ここでログ出力しても、ストリームが流れ始める前の状態なので注意
    console.log('[DEBUG] Final Response Headers (immediately before return):', Object.fromEntries(responseHeaders.entries()));

    // Note: Headers might need refinement based on backendStream events
    // or service properties if Content-Type isn't set early enough.
    // NextResponse のボディに渡す際に any キャストを追加
    return new NextResponse(webReadableStream as any, { status: 200, headers: responseHeaders });

  } catch (error) {
    console.error('[ERROR] Failed to handle git request:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  } finally {
    // Prisma disconnect is not needed here
  }
}
