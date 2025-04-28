/*
  Warnings:

  - You are about to drop the column `log` on the `JobHistory` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_JobHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL,
    "output" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobHistory_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_JobHistory" ("createdAt", "finishedAt", "id", "jobId", "startedAt", "status") SELECT "createdAt", "finishedAt", "id", "jobId", "startedAt", "status" FROM "JobHistory";
DROP TABLE "JobHistory";
ALTER TABLE "new_JobHistory" RENAME TO "JobHistory";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
