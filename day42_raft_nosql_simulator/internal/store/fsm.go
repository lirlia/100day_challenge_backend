package store

import (
	"io"

	"github.com/hashicorp/raft"
)

// FSM は Raft のステートマシンです。
// 実際には、データベース操作を適用します。
type FSM struct {
	// (TODO: データベースハンドルや状態を保持するフィールドを追加)
}

// NewFSM は新しい FSM インスタンスを作成します。
func NewFSM() *FSM {
	return &FSM{}
}

// Apply は Raft ログエントリをステートマシンに適用します。
// これは Raft 合意が得られた後に呼び出されます。
func (f *FSM) Apply(log *raft.Log) interface{} {
	// (TODO: log.Data の内容に基づいて状態を変更する処理を実装)
	// 例: コマンドの種類を判別し、対応するDB操作を実行
	// 戻り値はアプリケーション固有のレスポンスなど
	return nil
}

// Snapshot は現在のステートマシンのスナップショットを生成します。
// Raft は定期的にスナップショットを取得し、ログを切り詰めます。
func (f *FSM) Snapshot() (raft.FSMSnapshot, error) {
	// (TODO: 現在の状態を永続化し、スナップショットとして返す処理を実装)
	return &snapshotNoop{}, nil // 初期実装は No-op
}

// Restore はスナップショットからステートマシンを復元します。
// ノード起動時やリーダーからのインストール時に呼び出されます。
func (f *FSM) Restore(rc io.ReadCloser) error {
	// (TODO: rc から読み取ったデータで状態を復元する処理を実装)
	return rc.Close() // 初期実装は No-op
}

// snapshotNoop は何もしない FSMSnapshot の実装です。
// 初期開発段階や、スナップショットが不要な場合に使用します。
type snapshotNoop struct{}

func (s *snapshotNoop) Persist(sink raft.SnapshotSink) error {
	return sink.Close()
}

func (s *snapshotNoop) Release() {}
