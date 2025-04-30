import { PrismaClient } from "../app/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // 既存データの削除
  await prisma.replication.deleteMany({});
  await prisma.cacheItem.deleteMany({});
  await prisma.clusterEvent.deleteMany({});
  await prisma.node.deleteMany({});

  // 初期ノードの作成
  const node1 = await prisma.node.create({
    data: {
      name: "Node 1",
      status: "active",
      weight: 100,
    },
  });

  const node2 = await prisma.node.create({
    data: {
      name: "Node 2",
      status: "active",
      weight: 100,
    },
  });

  const node3 = await prisma.node.create({
    data: {
      name: "Node 3",
      status: "active",
      weight: 100,
    },
  });

  // 初期イベントログの作成
  await prisma.clusterEvent.create({
    data: {
      type: "cluster_created",
      payload: JSON.stringify({
        message: "Cluster initialized with 3 nodes",
        nodeIds: [node1.id, node2.id, node3.id],
      }),
    },
  });

  // サンプルキャッシュデータの作成
  const cacheItem1 = await prisma.cacheItem.create({
    data: {
      key: "greeting",
      value: "Hello, World!",
      nodeId: node1.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1日後
    },
  });

  const cacheItem2 = await prisma.cacheItem.create({
    data: {
      key: "counter",
      value: "42",
      nodeId: node2.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1日後
    },
  });

  // レプリカの作成
  await prisma.replication.create({
    data: {
      cacheItemId: cacheItem1.id,
      nodeId: node2.id,
      version: 1,
    },
  });

  await prisma.replication.create({
    data: {
      cacheItemId: cacheItem2.id,
      nodeId: node3.id,
      version: 1,
    },
  });

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
