import { NextRequest, NextResponse } from "next/server";
import { getElasticClient } from "@/lib/elasticsearch";
// import type { SearchHit } from "@elastic/elasticsearch/lib/api/types"; // パス変更のためコメントアウト
// import type { SearchHit } from "@elastic/elasticsearch"; // 型インポート削除

const INDEX_NAME = "pokemons";

export async function GET(request: NextRequest) {
  const client = getElasticClient();
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") || ""; // 検索キーワード
  const typeFilter = searchParams.get("type"); // タイプ絞り込み

  console.log(`Search API called with query: '${query}', type: '${typeFilter || 'N/A'}'`);

  // biome-ignore lint/suspicious/noExplicitAny: ESクエリは複雑になりがち
  const esQuery: any = {
    bool: {
      must: [], // AND 条件
      should: [], // OR 条件 (スコアに影響)
      filter: [], // AND 条件 (スコアに影響しない)
      minimum_should_match: 1,
    },
  };

  // キーワード検索条件
  if (query) {
    esQuery.bool.should.push(
      {
        match: {
          name: {
            query: query,
            boost: 1, // 英語名は boost 1
          },
        },
      },
      {
        match: {
          nameJa: {
            query: query,
            boost: 2 // 日本語名は boost 2
          },
        },
      },
      {
        term: {
          types: {
            value: query,
          },
        },
      },
      {
        term: {
          abilities: {
            value: query,
          },
        },
      }
      // TODO: typesJa, abilitiesJa も検索対象に含めるか検討
    );
  } else {
    // クエリがない場合は minimum_should_match を 0 にして filter のみ有効にするか、
    // もしくは should を空にする (タイプ絞り込みのみの場合)
    esQuery.bool.minimum_should_match = 0; // タイプ絞り込みのみの場合は filter が機能するように
  }

  // タイプ絞り込み条件
  if (typeFilter) {
    esQuery.bool.filter.push({
      term: {
        types: typeFilter,
      },
    });
  }

  // 最終的なクエリを組み立て
  let finalQuery;
  if (esQuery.bool.must.length === 0 && esQuery.bool.filter.length === 0 && esQuery.bool.should.length === 0) {
    // 条件が何もない場合は全件検索
    finalQuery = { match_all: {} };
  } else {
    finalQuery = esQuery;
  }

  console.log("Executing ES Query:", JSON.stringify(finalQuery, null, 2)); // デバッグログ追加

  try {
    const result = await client.search({
      index: INDEX_NAME,
      query: finalQuery, // 修正したクエリを使用
      size: 100,
      sort: [
        { _score: { order: "desc" } },
        { id: { order: "asc" } },
      ],
    });

    // _source のみを抽出して返す
    // biome-ignore lint/suspicious/noExplicitAny: SearchHit の型推論のため -> 不要に
    const hits = result.hits.hits.map((hit) => hit._source); // 型注釈を削除して推論させる

    console.log(`Search API returned ${hits.length} results.`);
    return NextResponse.json(hits);
  } catch (error: any) {
    console.error("Error searching Elasticsearch:", error.meta?.body || error);
    return NextResponse.json(
      { error: "Failed to search Pokemon data", details: error.message },
      { status: 500 }
    );
  }
}
