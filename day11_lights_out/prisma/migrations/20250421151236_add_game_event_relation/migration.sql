-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DomainEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "sequence" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DomainEvent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DomainEvent" ("createdAt", "gameId", "id", "payload", "sequence", "type") SELECT "createdAt", "gameId", "id", "payload", "sequence", "type" FROM "DomainEvent";
DROP TABLE "DomainEvent";
ALTER TABLE "new_DomainEvent" RENAME TO "DomainEvent";
CREATE INDEX "DomainEvent_gameId_sequence_idx" ON "DomainEvent"("gameId", "sequence");
CREATE UNIQUE INDEX "DomainEvent_gameId_sequence_key" ON "DomainEvent"("gameId", "sequence");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
