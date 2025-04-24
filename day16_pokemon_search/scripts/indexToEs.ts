import { Client } from "@elastic/elasticsearch";
import { PrismaClient } from "../app/generated/prisma";
// import dotenv from 'dotenv'; // dotenv 関連削除
// import path from 'path';

// dotenv.config({ path: path.resolve(__dirname, '../.env') });

// console.log('ELASTICSEARCH_URL after dotenv.config():', process.env.ELASTICSEARCH_URL);

const prisma = new PrismaClient();

// .env ファイルから Elasticsearch の URL を読み込む
// const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL;
const ELASTICSEARCH_URL = "http://localhost:9200"; // URL を直接指定

if (!ELASTICSEARCH_URL) {
  console.error(
    "Elasticsearch URL not found. Please set ELASTICSEARCH_URL in your .env file."
  );
  process.exit(1);
}

const client = new Client({ node: ELASTICSEARCH_URL });
const INDEX_NAME = "pokemons";

async function main() {
  console.log("Indexing data to Elasticsearch...");

  // インデックスが存在しない場合に作成する関数 (main 内に移動)
  async function createIndexIfNotExists() {
    const indexExists = await client.indices.exists({ index: INDEX_NAME });

    if (!indexExists) {
      console.log(`Index '${INDEX_NAME}' does not exist. Creating...`);
      await client.indices.create({
        index: INDEX_NAME,
        settings: {
          analysis: {
            analyzer: {
              kuromoji_analyzer: {
                type: "custom",
                tokenizer: "kuromoji_tokenizer",
                filter: [
                  "kuromoji_baseform",
                  "kuromoji_part_of_speech",
                  "cjk_width",
                  "kuromoji_stemmer",
                  "lowercase",
                ],
              },
              ngram_analyzer: {
                type: "custom",
                tokenizer: "ngram_tokenizer",
                filter: ["lowercase"]
              },
            },
            tokenizer: {
              ngram_tokenizer: {
                type: "ngram",
                min_gram: 2,
                max_gram: 2,
                token_chars: ["letter", "digit", "punctuation", "symbol", "custom"],
                custom_token_chars: "ー",
              },
            },
          },
        },
        mappings: {
          properties: {
            id: { type: "integer" },
            name: { type: "keyword" },
            nameJa: {
              type: "text",
              analyzer: "ngram_analyzer",
              fields: {
                keyword: {
                  type: "keyword",
                  ignore_above: 256
                }
              }
            },
            types: { type: "keyword" },
            abilities: { type: "keyword" },
            typesJa: { type: "keyword" },
            abilitiesJa: { type: "keyword" },
            imageUrl: { type: "keyword", index: false },
            height: { type: "integer" },
            weight: { type: "integer" },
          },
        },
      });
      console.log(`Index '${INDEX_NAME}' created.`);
    } else {
      console.log(`Index '${INDEX_NAME}' already exists.`);
    }
  }

  // Bulk API でポケモンデータを投入する関数 (main 内に移動)
  // biome-ignore lint/suspicious/noExplicitAny: Prisma の型推論を使うため引数の型を any に
  async function bulkIndexPokemons(pokemons: any[]) {
    console.log(`Bulk indexing ${pokemons.length} Pokemon...`);

    const operations = pokemons.flatMap((doc) => [
      { index: { _index: INDEX_NAME, _id: doc.id.toString() } },
      {
        ...doc,
        types: typeof doc.types === 'string' ? JSON.parse(doc.types) : doc.types,
        abilities: typeof doc.abilities === 'string' ? JSON.parse(doc.abilities) : doc.abilities,
        typesJa: doc.typesJa && typeof doc.typesJa === 'string' ? JSON.parse(doc.typesJa) : doc.typesJa,
        abilitiesJa: doc.abilitiesJa && typeof doc.abilitiesJa === 'string' ? JSON.parse(doc.abilitiesJa) : doc.abilitiesJa,
      },
    ]);

    const bulkResponse = await client.bulk({ refresh: true, operations });

    if (bulkResponse.errors) {
      const erroredDocuments: { status: number, error: any, operation: any, document: any }[] = [];
      // biome-ignore lint/complexity/noForEach: エラー処理
      bulkResponse.items.forEach((action: any, i: number) => {
        const operation = Object.keys(action)[0] as keyof typeof action;
        if (action[operation]?.error) {
          erroredDocuments.push({
            status: action[operation]?.status ?? 0,
            error: action[operation]?.error,
            operation: operations[i * 2],
            document: operations[i * 2 + 1],
          });
        }
      });
      console.error("Bulk indexing failed for some documents:", JSON.stringify(erroredDocuments, null, 2));
    } else {
      console.log(`Successfully indexed ${pokemons.length} Pokemon.`);
    }

    const count = await client.count({ index: INDEX_NAME });
    console.log(`Total documents in index '${INDEX_NAME}': ${count.count}`);
  }

  try {
    // 1. インデックス存在チェックと作成
    await createIndexIfNotExists();

    // 2. SQLite からデータ取得
    console.log("Fetching data from SQLite...");
    const pokemons = await prisma.pokemon.findMany();
    console.log(`Fetched ${pokemons.length} Pokemon from SQLite.`);

    if (pokemons.length === 0) {
      console.log("No Pokemon data found in SQLite. Run `npm run seed` first.");
      return;
    }

    // 3. Elasticsearch へ Bulk Index
    await bulkIndexPokemons(pokemons);

    console.log("Indexing finished.");
  } catch (error) {
    console.error("Error during indexing:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
