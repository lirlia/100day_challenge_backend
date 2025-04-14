// internal/infra/datastore/db.go
package datastore

import (
	"fmt"
	"log/slog"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// DBConfig はデータベース接続設定です。
type DBConfig struct {
	User     string
	Password string
	Host     string
	Port     string
	DBName   string
	Charset  string
	Loc      string
}

// NewDB は新しい Gorm DB 接続を確立します。
func NewDB(cfg DBConfig) (*gorm.DB, error) {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=%s&parseTime=True&loc=%s",
		cfg.User,
		cfg.Password,
		cfg.Host,
		cfg.Port,
		cfg.DBName,
		cfg.Charset,
		cfg.Loc,
	)

	slog.Info("connecting to database", "dsn", fmt.Sprintf("%s:****@tcp(%s:%s)/%s?...", cfg.User, cfg.Host, cfg.Port, cfg.DBName)) // パスワードはログに出さない

	// Gorm ロガー設定 (SQL ログを出力)
	gormLogger := logger.New(
		slog.NewLogLogger(slog.Default().Handler(), slog.LevelInfo), // slog を利用
		logger.Config{
			SlowThreshold:             time.Second, // Slow SQL threshold
			LogLevel:                  logger.Info, // Log level
			IgnoreRecordNotFoundError: true,        // Ignore ErrRecordNotFound error for logger
			Colorful:                  false,       // Disable color
		},
	)

	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger: gormLogger, // 設定したロガーを使用
	})
	if err != nil {
		slog.Error("failed to connect database", "error", err)
		return nil, fmt.Errorf("failed to connect database: %w", err)
	}

	slog.Info("database connection established")
	return db, nil
}
