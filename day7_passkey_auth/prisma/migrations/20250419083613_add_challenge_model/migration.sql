-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "challenge" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Challenge_challenge_key" ON "Challenge"("challenge");

-- CreateIndex
CREATE INDEX "Challenge_expiresAt_idx" ON "Challenge"("expiresAt");

-- CreateIndex
CREATE INDEX "Challenge_userId_type_idx" ON "Challenge"("userId", "type");
