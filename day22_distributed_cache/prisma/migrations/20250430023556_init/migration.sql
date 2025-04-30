-- CreateTable
CREATE TABLE "Node" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "weight" INTEGER NOT NULL DEFAULT 100,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CacheItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CacheItem_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Replication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cacheItemId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Replication_cacheItemId_fkey" FOREIGN KEY ("cacheItemId") REFERENCES "CacheItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Replication_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClusterEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "CacheItem_key_idx" ON "CacheItem"("key");

-- CreateIndex
CREATE INDEX "CacheItem_expiresAt_idx" ON "CacheItem"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CacheItem_nodeId_key_key" ON "CacheItem"("nodeId", "key");

-- CreateIndex
CREATE INDEX "Replication_nodeId_idx" ON "Replication"("nodeId");

-- CreateIndex
CREATE INDEX "Replication_cacheItemId_idx" ON "Replication"("cacheItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Replication_nodeId_cacheItemId_key" ON "Replication"("nodeId", "cacheItemId");

-- CreateIndex
CREATE INDEX "ClusterEvent_type_idx" ON "ClusterEvent"("type");

-- CreateIndex
CREATE INDEX "ClusterEvent_createdAt_idx" ON "ClusterEvent"("createdAt");
