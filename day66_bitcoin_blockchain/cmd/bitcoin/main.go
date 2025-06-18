package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/internal/engine"
	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/internal/server"
)

func main() {
	var (
		dbPath = flag.String("db", "./data/blockchain.db", "データベースファイルのパス")
		port   = flag.Int("port", 8080, "APIサーバーのポート番号")
		help   = flag.Bool("help", false, "ヘルプを表示")
	)
	flag.Parse()

	if *help {
		showHelp()
		return
	}

	log.Printf("🔗 Bitcoin Blockchain Go Implementation")
	log.Printf("📂 データベース: %s", *dbPath)
	log.Printf("🌐 APIサーバー: http://localhost:%d", *port)

	// ブロックチェーンエンジンを初期化
	engine, err := engine.NewBlockchainEngine(*dbPath)
	if err != nil {
		log.Fatalf("❌ エンジン初期化エラー: %v", err)
	}
	defer engine.Close()

	// APIサーバーを作成
	apiServer := server.NewAPIServer(engine, *port)

	// グレースフルシャットダウンの設定
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// APIサーバーを別ゴルーチンで開始
	go func() {
		if err := apiServer.Start(); err != nil {
			log.Printf("❌ APIサーバーエラー: %v", err)
		}
	}()

	// 初期設定
	log.Printf("🔧 初期設定を実行中...")
	if err := performInitialSetup(engine); err != nil {
		log.Printf("⚠️  初期設定警告: %v", err)
	}

	// システム情報を表示
	if err := showSystemInfo(engine); err != nil {
		log.Printf("⚠️  システム情報取得エラー: %v", err)
	}

	log.Printf("✅ システムが準備完了しました")
	log.Printf("🌐 Web UI: http://localhost:%d", *port)
	log.Printf("📊 API Docs: http://localhost:%d/api/info", *port)
	log.Printf("🛑 終了するには Ctrl+C を押してください")

	// シャットダウンシグナルを待機
	<-ctx.Done()

	log.Printf("🛑 シャットダウンシグナルを受信...")

	// APIサーバーを停止
	if err := apiServer.Stop(); err != nil {
		log.Printf("❌ APIサーバー停止エラー: %v", err)
	}

	log.Printf("✅ アプリケーションが正常に終了しました")
}

// performInitialSetup 初期設定を実行
func performInitialSetup(engine *engine.BlockchainEngine) error {
	// ウォレットが存在しない場合は作成
	wallets := engine.GetWallets()
	if len(wallets) == 0 {
		log.Printf("💳 初期ウォレットを作成中...")
		address, err := engine.CreateWallet()
		if err != nil {
			return fmt.Errorf("初期ウォレット作成エラー: %w", err)
		}
		log.Printf("✅ 初期ウォレットを作成: %s", address)
	}

	// チェーンの整合性を検証
	log.Printf("🔍 ブロックチェーンの整合性を検証中...")
	if err := engine.ValidateChain(); err != nil {
		return fmt.Errorf("チェーン検証エラー: %w", err)
	}
	log.Printf("✅ ブロックチェーンの整合性確認完了")

	return nil
}

// showSystemInfo システム情報を表示
func showSystemInfo(engine *engine.BlockchainEngine) error {
	info, err := engine.GetBlockchainInfo()
	if err != nil {
		return fmt.Errorf("システム情報取得エラー: %w", err)
	}

	log.Printf("📊 === システム情報 ===")
	log.Printf("   📦 ブロック高: %d", info.Height)
	log.Printf("   🧱 総ブロック数: %d", info.TotalBlocks)
	log.Printf("   💸 総トランザクション数: %d", info.TotalTransactions)
	log.Printf("   💰 総UTXO数: %d", info.TotalUTXOs)
	log.Printf("   💎 総価値: %d satoshi", info.TotalValue)
	log.Printf("   📏 平均ブロックサイズ: %.2f bytes", info.AverageBlockSize)
	log.Printf("   💾 チェーンサイズ: %d bytes", info.ChainSize)
	log.Printf("   📝 メンプールサイズ: %d", info.MempoolSize)
	log.Printf("   ⚙️  難易度: %d", info.Difficulty)

	// ウォレット情報を表示
	wallets := engine.GetWallets()
	log.Printf("   💳 ウォレット数: %d", len(wallets))

	if len(wallets) > 0 {
		log.Printf("📊 === ウォレット情報 ===")
		for i, address := range wallets {
			balance, err := engine.GetBalance(address)
			if err != nil {
				log.Printf("   %d. %s (残高取得エラー)", i+1, address[:16]+"...")
				continue
			}
			log.Printf("   %d. %s... (残高: %d satoshi)", i+1, address[:16], balance)
		}
	}

	return nil
}

// showHelp ヘルプを表示
func showHelp() {
	fmt.Printf(`
Bitcoin Blockchain Go Implementation

使用方法:
  %s [オプション]

オプション:
  -db string    データベースファイルのパス (デフォルト: "./data/blockchain.db")
  -port int     APIサーバーのポート番号 (デフォルト: 8080)
  -help         このヘルプを表示

例:
  %s                              # デフォルト設定で実行
  %s -port 3000                   # ポート3000で実行
  %s -db /path/to/custom.db       # カスタムDBパスで実行

API エンドポイント:
  GET    /api/info                # ブロックチェーン情報
  GET    /api/blocks              # ブロック一覧
  GET    /api/blocks/{hash}       # ブロック詳細
  GET    /api/blocks/height/{n}   # 高さでブロック取得
  GET    /api/wallets             # ウォレット一覧
  POST   /api/wallets/create      # ウォレット作成
  GET    /api/wallets/{address}   # ウォレット詳細
  POST   /api/transactions/send   # トランザクション送信
  POST   /api/mining/mine         # ブロックマイニング
  POST   /api/mining/start        # 自動マイニング開始
  POST   /api/mining/stop         # 自動マイニング停止
  POST   /api/validate            # チェーン検証

Web UI:
  http://localhost:{port}/        # ブラウザでアクセス

`, os.Args[0], os.Args[0], os.Args[0], os.Args[0])
}
