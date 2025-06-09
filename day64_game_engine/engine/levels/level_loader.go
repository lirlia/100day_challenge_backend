package levels

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
)

// Level レベルデータ構造
type Level struct {
	ID         int    `json:"id"`
	Name       string `json:"name"`
	Width      int    `json:"width"`
	Height     int    `json:"height"`
	Data       string `json:"data"`
	CreatedAt  string `json:"created_at"`
}

// LevelData レベル内のオブジェクトデータ
type LevelData struct {
	Platforms   []Platform `json:"platforms"`
	Enemies     []Enemy    `json:"enemies"`
	Items       []Item     `json:"items"`
	PlayerStart PlayerPos  `json:"playerStart"`
}

// Platform プラットフォームデータ
type Platform struct {
	ID     string  `json:"id"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
	Type   string  `json:"type"`
}

// Enemy 敵データ
type Enemy struct {
	ID             string  `json:"id"`
	X              float64 `json:"x"`
	Y              float64 `json:"y"`
	PatrolDistance float64 `json:"patrolDistance"`
}

// Item アイテムデータ
type Item struct {
	ID   string  `json:"id"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Type string  `json:"type"`
}

// PlayerPos プレイヤー開始位置
type PlayerPos struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// LevelLoader レベルローダー
type LevelLoader struct {
	dbPath string
	db     *sql.DB
}

// NewLevelLoader レベルローダーを作成
func NewLevelLoader() (*LevelLoader, error) {
	dbPath := filepath.Join("db", "dev.db")

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %v", err)
	}

	return &LevelLoader{
		dbPath: dbPath,
		db:     db,
	}, nil
}

// Close データベース接続を閉じる
func (ll *LevelLoader) Close() error {
	if ll.db != nil {
		return ll.db.Close()
	}
	return nil
}

// GetAllLevels すべてのレベルを取得
func (ll *LevelLoader) GetAllLevels() ([]Level, error) {
	query := `SELECT id, name, width, height, data, created_at FROM levels ORDER BY created_at DESC`

	rows, err := ll.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to query levels: %v", err)
	}
	defer rows.Close()

	var levels []Level
	for rows.Next() {
		var level Level
		err := rows.Scan(&level.ID, &level.Name, &level.Width, &level.Height, &level.Data, &level.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan level: %v", err)
		}
		levels = append(levels, level)
	}

	return levels, nil
}

// GetLevelByID IDでレベルを取得
func (ll *LevelLoader) GetLevelByID(id int) (*Level, error) {
	query := `SELECT id, name, width, height, data, created_at FROM levels WHERE id = ?`

	var level Level
	err := ll.db.QueryRow(query, id).Scan(&level.ID, &level.Name, &level.Width, &level.Height, &level.Data, &level.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("level with ID %d not found", id)
		}
		return nil, fmt.Errorf("failed to query level: %v", err)
	}

	return &level, nil
}

// GetLatestLevel 最新のレベルを取得
func (ll *LevelLoader) GetLatestLevel() (*Level, error) {
	query := `SELECT id, name, width, height, data, created_at FROM levels ORDER BY created_at DESC LIMIT 1`

	var level Level
	err := ll.db.QueryRow(query).Scan(&level.ID, &level.Name, &level.Width, &level.Height, &level.Data, &level.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("no levels found")
		}
		return nil, fmt.Errorf("failed to query latest level: %v", err)
	}

	return &level, nil
}

// ParseLevelData レベルデータをパース
func (ll *LevelLoader) ParseLevelData(level *Level) (*LevelData, error) {
	var levelData LevelData
	err := json.Unmarshal([]byte(level.Data), &levelData)
	if err != nil {
		return nil, fmt.Errorf("failed to parse level data: %v", err)
	}

	return &levelData, nil
}

// LoadLatestLevelData 最新のレベルデータを読み込んで返す
func (ll *LevelLoader) LoadLatestLevelData() (*LevelData, *Level, error) {
	level, err := ll.GetLatestLevel()
	if err != nil {
		log.Printf("Failed to get latest level: %v", err)
		// フォールバック: デフォルトレベル
		return ll.getDefaultLevelData(), nil, nil
	}

	levelData, err := ll.ParseLevelData(level)
	if err != nil {
		log.Printf("Failed to parse level data: %v", err)
		// フォールバック: デフォルトレベル
		return ll.getDefaultLevelData(), level, nil
	}

	log.Printf("Loaded level: %s (ID: %d)", level.Name, level.ID)
	return levelData, level, nil
}

// getDefaultLevelData デフォルトレベルデータを返す
func (ll *LevelLoader) getDefaultLevelData() *LevelData {
	return &LevelData{
		Platforms: []Platform{
			{ID: "ground1", X: 0, Y: 568, Width: 1200, Height: 32, Type: "ground"},
			{ID: "platform1", X: 300, Y: 450, Width: 128, Height: 32, Type: "platform"},
			{ID: "platform2", X: 500, Y: 350, Width: 128, Height: 32, Type: "platform"},
			{ID: "platform3", X: 700, Y: 250, Width: 128, Height: 32, Type: "platform"},
			{ID: "platform4", X: 900, Y: 400, Width: 128, Height: 32, Type: "platform"},
		},
		Enemies: []Enemy{
			{ID: "enemy1", X: 400, Y: 400, PatrolDistance: 100},
			{ID: "enemy2", X: 600, Y: 300, PatrolDistance: 100},
			{ID: "enemy3", X: 800, Y: 200, PatrolDistance: 100},
		},
		Items: []Item{
			{ID: "coin1", X: 350, Y: 420, Type: "coin"},
			{ID: "coin2", X: 550, Y: 320, Type: "coin"},
			{ID: "coin3", X: 750, Y: 220, Type: "coin"},
			{ID: "coin4", X: 950, Y: 370, Type: "coin"},
			{ID: "coin5", X: 200, Y: 500, Type: "coin"},
			{ID: "goal1", X: 1100, Y: 500, Type: "goal"},
		},
		PlayerStart: PlayerPos{X: 100, Y: 536},
	}
}
