import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

// DBファイルへのパスを解決
const dbPath = path.resolve('db');
const dbFile = path.join(dbPath, 'dev.db');

// DBディレクトリが存在しない場合は作成
if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath, { recursive: true });
}

let db: Database.Database;
try {
  db = new Database(dbFile);
  // Node.jsプロセス終了時にDB接続を閉じる
  process.on('exit', () => db.close());
} catch (error) {
  console.error('Failed to connect to the database:', error);
  process.exit(1); // 接続失敗時はプロセス終了
}

// 初期スキーマ作成関数
function initializeSchema() {
  // テーブルが存在しない場合のみ作成
  db.exec(`
    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist TEXT,
      bpm REAL,
      easyNotesId INTEGER,
      hardNotesId INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (easyNotesId) REFERENCES notes(id),
      FOREIGN KEY (hardNotesId) REFERENCES notes(id)
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notesData TEXT NOT NULL, -- JSON string containing note information
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL, -- Simple user identifier (e.g., 'user1', 'user2')
      songId INTEGER NOT NULL,
      score INTEGER NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (songId) REFERENCES songs(id)
    );
  `);

  // --- Initial Data Insertion ---
  const songCountStmt = db.prepare('SELECT COUNT(*) as count FROM songs');
  const { count: songCount } = songCountStmt.get() as { count: number };

  if (songCount === 0) {
    console.log('Inserting initial song and notes data...');

    // Helper function to generate notes
    const generateNotes = (durationSeconds: number, bpm: number, lanes: number): { time: number, lane: number }[] => {
      const notes = [];
      const beatsPerSecond = bpm / 60;
      const eighthNoteInterval = 1 / (beatsPerSecond * 2); // Interval for 8th notes
      let currentTime = 1.5; // Start notes slightly after the beginning

      while (currentTime < durationSeconds) {
        notes.push({
          time: currentTime,
          lane: Math.floor(Math.random() * lanes) + 1 // Random lane (1-based)
        });
        currentTime += eighthNoteInterval;
      }
      return notes;
    };

    // Generate notes data (approx 30 seconds)
    const easyLanes = 3;
    const hardLanes = 6;
    const bpm = 60;
    const duration = 30;

    const easyNotes = generateNotes(duration, bpm, easyLanes);
    const hardNotes = generateNotes(duration, bpm, hardLanes);

    const easyNotesData = JSON.stringify({ totalNotes: easyNotes.length, notes: easyNotes });
    const hardNotesData = JSON.stringify({ totalNotes: hardNotes.length, notes: hardNotes });

    // Insert notes into notes table
    const insertNoteStmt = db.prepare('INSERT INTO notes (notesData) VALUES (?)');
    const easyNotesResult = insertNoteStmt.run(easyNotesData);
    const hardNotesResult = insertNoteStmt.run(hardNotesData);

    const easyNotesId = easyNotesResult.lastInsertRowid;
    const hardNotesId = hardNotesResult.lastInsertRowid;

    // Insert song referencing the notes
    const insertSongStmt = db.prepare(`
      INSERT INTO songs (title, artist, bpm, easyNotesId, hardNotesId)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertSongStmt.run('Test Song', 'Composer', bpm, easyNotesId, hardNotesId);

    console.log('Initial data inserted.');
  } else {
    console.log('Songs table already has data, skipping initial data insertion.');
  }

  console.log('Database schema initialized.');
}

// データベースの初期化を実行
initializeSchema();

// function insertInitialData() {
//    ...
// }

// Call the function to insert data
// insertInitialData();

export default db;
