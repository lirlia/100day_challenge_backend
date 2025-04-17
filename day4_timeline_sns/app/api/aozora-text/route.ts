import { NextResponse } from 'next/server';
import { TextDecoder } from 'util'; // Node.jsのTextDecoderを使用

// 青空文庫のHTMLから本文テキストを抽出するヘルパー関数
function extractMainText(html: string): string {
  // ルビ関連のタグを除去 (<rp>と<rt>タグとその内容)
  let text = html.replace(/<rp>.*?<\/rp>/g, '').replace(/<rt>.*?<\/rt>/g, '');
  // その他のHTMLタグを除去 (簡易的な方法)
  text = text.replace(/<[^>]*>/g, '');
  // 連続する空白や改行を整理
  text = text.replace(/\s+/g, ' ').trim();
  // 「本文」が含まれる箇所を簡易的に抽出（実際の青空文庫HTML構造に依存）
  // より堅牢にするにはDOMパーサーが必要だが、今回は簡易的に行う
  const mainTextMarker = '底本：'; // 本文が終わる目安
  const mainTextStartIndex = text.indexOf('［＃ここから本文］') + '［＃ここから本文］'.length; // 本文開始の目安
  let mainTextEndIndex = text.indexOf(mainTextMarker);
  if (mainTextEndIndex === -1) {
    mainTextEndIndex = text.length; // マーカーが見つからない場合は最後まで
  }

  if (mainTextStartIndex < '［＃ここから本文］'.length) {
      // 開始マーカーが見つからない場合、ヘッダー後の最初の意味のあるテキストを探すなど、
      // より複雑なロジックが必要になるが、今回はエラーとして扱うか、全体を返す。
      // ここでは簡易的に特定の位置から取得してみる。
      const fallbackStartIndex = html.indexOf('<div class="main_text">');
      if (fallbackStartIndex !== -1) {
          const roughText = html.substring(fallbackStartIndex);
          text = roughText.replace(/<rp>.*?<\/rp>/g, '').replace(/<rt>.*?<\/rt>/g, '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
          mainTextEndIndex = text.indexOf(mainTextMarker);
           if (mainTextEndIndex === -1) mainTextEndIndex = text.length;
           return text.substring(0, mainTextEndIndex).trim();
      } else {
          return ''; // 抽出失敗
      }
  }
  return text.substring(mainTextStartIndex, mainTextEndIndex).trim();
}


export async function GET() {
  const url = 'https://www.aozora.gr.jp/cards/000081/files/456_15050.html';
  try {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) {
      throw new Error(`Failed to fetch Aozora Bunko HTML (${response.status})`);
    }

    // レスポンスボディをArrayBufferとして取得
    const buffer = await response.arrayBuffer();
    // Shift_JISとしてデコード
    const decoder = new TextDecoder('shift-jis');
    const html = decoder.decode(buffer);

    // デコードされたHTMLから本文を抽出
    const mainText = extractMainText(html);

    if (!mainText) {
        throw new Error('Failed to extract main text from Aozora Bunko HTML');
    }

    // Content-Type を text/plain; charset=utf-8 として返す
    return new NextResponse(mainText, {
        status: 200,
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
        },
    });

  } catch (error: any) {
    console.error('Error fetching or parsing Aozora Bunko text:', error);
    return NextResponse.json({ error: error.message || 'Failed to get source text' }, { status: 500 });
  }
}
