import { NextResponse } from "next/server";
import { getElasticClient } from "@/lib/elasticsearch";
// import type { SearchHit } from "@elastic/elasticsearch/lib/api/types"; // パス変更のためコメントアウト
// import type { SearchHit } from "@elastic/elasticsearch"; // 型インポート削除

const INDEX_NAME = "pokemons";

export async function GET(request: Request) {
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
    },
  };

  // キーワード検索条件
  if (query) {
    // bool クエリの should 句で各フィールドに対する match クエリを OR 条件で指定
    esQuery.bool.should = [
      { match:  { name:   { query: query } } }, // 英語名 (boost 削除)
      { match:  { nameJa: { query: query, boost: 2 } } }, // 日本語名 (match クエリ, boost=2)
      { term:   { types:  { value: query } } },
      { term:   { abilities: { value: query } } },
      { term:   { typesJa: { value: query } } },
      { term:   { abilitiesJa: { value: query } } }
    ];
    // should 句のいずれか一つにマッチすればよいため、minimum_should_match を 1 に設定
    esQuery.bool.minimum_should_match = 1;
  } else {
    // キーワードがない場合は should 句は空
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
