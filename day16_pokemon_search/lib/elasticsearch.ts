import { Client } from "@elastic/elasticsearch";

const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL || "http://localhost:9200";

let client: Client | null = null;

export function getElasticClient(): Client {
  if (!client) {
    console.log("Initializing Elasticsearch client...");
    client = new Client({ node: ELASTICSEARCH_URL });
  }
  return client;
}
