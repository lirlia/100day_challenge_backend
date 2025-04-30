import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

type Params = {
  id: string;
  width: string;
  height: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  console.log('[API] GET /api/images/[id]/[width]/[height] received');
  // NOTE: 現時点の Next.js (テンプレートのバージョン) では await 不要
  const awaitedParams = await params;
  const { id, width: widthStr, height: heightStr } = awaitedParams;
  console.log(`[API] Params: id=${id}, widthStr=${widthStr}, heightStr=${heightStr}`);

  const width = parseInt(widthStr, 10);
  const height = parseInt(heightStr, 10);
  console.log(`[API] Parsed size: width=${width}, height=${height}`);

  // バリデーション
  if (isNaN(width) || isNaN(height) || width < 1 || height < 1) {
    console.log('[API] Validation failed: Invalid width or height');
    return NextResponse.json(
      { message: 'Invalid width or height' },
      { status: 400 }
    );
  }

  // public ディレクトリからの相対パスを解決 (プロジェクトルートからの相対)
  const imagePath = path.resolve(process.cwd(), 'public/images', `${id}.jpg`);
  console.log(`[API] Resolved image path: ${imagePath}`);

  try {
    console.log('[API] Checking file existence...');
    await fs.access(imagePath);
    console.log('[API] File exists. Reading file...');

    const fileBuffer = await fs.readFile(imagePath);
    console.log(`[API] File read. Original buffer size: ${fileBuffer.byteLength}`);

    console.log('[API] Resizing image with sharp...');
    const resizedBuffer = await sharp(fileBuffer)
      .resize(width, height)
      .jpeg() // 出力形式をJPEGに指定
      .toBuffer();
    console.log(`[API] Image resized. Resized buffer size: ${resizedBuffer.byteLength}`);

    console.log('[API] Sending response with image/jpeg Content-Type...');
    const response = new NextResponse(resizedBuffer);
    response.headers.set('Content-Type', 'image/jpeg');
    return response;

  } catch (error: any) {
    console.error('[API] Error caught:', error);
    // ファイルが存在しない場合
    if (error.code === 'ENOENT') {
      console.warn(`[API] Image not found at path: ${imagePath}`);
      return NextResponse.json(
        { message: 'Image not found' },
        { status: 404 }
      );
    }

    // その他のエラー
    console.error('[API] Error processing image:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
