import { NextResponse } from "next/server";
import { getElasticClient } from "@/lib/elasticsearch";
import { PrismaClient } from "@/app/generated/prisma";

const INDEX_NAME = "pokemons";
const PAGE_SIZE = 20;

export async function GET(request: Request) {
  const client = getElasticClient();
  const { searchParams } = new URL(request.url);

  const page = parseInt(searchParams.get("page") || "1");
  const size = parseInt(searchParams.get("size") || PAGE_SIZE.toString());
  const from = (page - 1) * size;

  console.log(`Pokemons List API called with page: ${page}, size: ${size}, from: ${from}`);

  try {
    const result = await client.search({
      index: INDEX_NAME,
      from: from,
      size: size,
      sort: [
        { id: { order: "asc" } }
      ],
      query: {
        match_all: {}
      }
    });

    const pokemons = result.hits.hits.map((hit) => hit._source);
    const total = typeof result.hits.total === 'number' ? result.hits.total : result.hits.total?.value ?? 0;

    console.log(`Pokemons List API returned ${pokemons.length} results (total: ${total}).`);

    return NextResponse.json({
      pokemons,
      total,
      page,
      size,
      totalPages: Math.ceil(total / size),
    });

  } catch (error: any) {
    console.error("Error fetching Pokemon list from Elasticsearch:", error.meta?.body || error);
    return NextResponse.json(
      { error: "Failed to fetch Pokemon list", details: error.message },
      { status: 500 }
    );
  }
}
