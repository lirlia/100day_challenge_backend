package chord

import (
	"log"
	"sync"
)

// DataStore はChordノードのデータストレージを管理する
type DataStore struct {
	data map[string]string
	mu   sync.RWMutex
}

// NewDataStore は新しいデータストアを作成
func NewDataStore() *DataStore {
	return &DataStore{
		data: make(map[string]string),
	}
}

// Put はキー・バリューペアを保存する
func (ds *DataStore) Put(key, value string) {
	ds.mu.Lock()
	defer ds.mu.Unlock()
	ds.data[key] = value
	log.Printf("DataStore: PUT %s = %s", key, value)
}

// Get はキーに対応する値を取得する
func (ds *DataStore) Get(key string) (string, bool) {
	ds.mu.RLock()
	defer ds.mu.RUnlock()
	value, exists := ds.data[key]
	log.Printf("DataStore: GET %s = %s (exists: %t)", key, value, exists)
	return value, exists
}

// Delete はキーを削除する
func (ds *DataStore) Delete(key string) bool {
	ds.mu.Lock()
	defer ds.mu.Unlock()
	_, exists := ds.data[key]
	if exists {
		delete(ds.data, key)
		log.Printf("DataStore: DELETE %s (deleted: %t)", key, exists)
	}
	return exists
}

// Size はデータストア内のキー数を返す
func (ds *DataStore) Size() int {
	ds.mu.RLock()
	defer ds.mu.RUnlock()
	return len(ds.data)
}

// Keys は全てのキーを返す
func (ds *DataStore) Keys() []string {
	ds.mu.RLock()
	defer ds.mu.RUnlock()
	keys := make([]string, 0, len(ds.data))
	for key := range ds.data {
		keys = append(keys, key)
	}
	return keys
}

// ChordNodeにデータストレージ機能を追加するためのメソッド拡張
// これらのメソッドはrouting.goのChordNodeに追加されるべきですが、
// ここでは別ファイルで定義します。

// ChordNodeStorage はChordNodeにデータストレージ機能を追加
type ChordNodeStorage struct {
	*ChordNode
	dataStore *DataStore
}

// NewChordNodeWithStorage はデータストレージ機能付きのChordNodeを作成
func NewChordNodeWithStorage(address string, port int) *ChordNodeStorage {
	baseNode := NewChordNode(address, port)
	return &ChordNodeStorage{
		ChordNode: baseNode,
		dataStore: NewDataStore(),
	}
}

// Put はデータを分散ハッシュテーブルに保存する
func (cns *ChordNodeStorage) Put(key, value string) {
	keyID := HashKey(key)
	log.Printf("Node %d: PUT request for key %s (ID: %d)", cns.ID, key, keyID)

	// 自分が責任を持つキーの場合、直接保存
	if cns.isResponsibleForKey(keyID) {
		cns.dataStore.Put(key, value)
		log.Printf("Node %d: stored locally - key %s", cns.ID, key)
		return
	}

	// 他のノードが責任を持つ場合、適切なノードを見つけて転送
	// 実際の分散システムでは、ネットワーク経由で他のノードに送信する
	// ここでは簡易実装として、責任ノードが不明な場合は自分に保存
	log.Printf("Node %d: key %s should be handled by another node, storing locally for now", cns.ID, key)
	cns.dataStore.Put(key, value)
}

// Get はデータを分散ハッシュテーブルから取得する
func (cns *ChordNodeStorage) Get(key string) (string, bool) {
	keyID := HashKey(key)
	log.Printf("Node %d: GET request for key %s (ID: %d)", cns.ID, key, keyID)

	// 自分が責任を持つキーの場合、直接取得
	if cns.isResponsibleForKey(keyID) {
		value, exists := cns.dataStore.Get(key)
		log.Printf("Node %d: retrieved locally - key %s", cns.ID, key)
		return value, exists
	}

	// 他のノードが責任を持つ場合、適切なノードを見つけて問い合わせ
	// 実際の分散システムでは、ネットワーク経由で他のノードに問い合わせる
	// ここでは簡易実装として、ローカルから検索
	log.Printf("Node %d: key %s should be handled by another node, checking locally anyway", cns.ID, key)
	return cns.dataStore.Get(key)
}

// Delete はデータを分散ハッシュテーブルから削除する
func (cns *ChordNodeStorage) Delete(key string) bool {
	keyID := HashKey(key)
	log.Printf("Node %d: DELETE request for key %s (ID: %d)", cns.ID, key, keyID)

	// 自分が責任を持つキーの場合、直接削除
	if cns.isResponsibleForKey(keyID) {
		deleted := cns.dataStore.Delete(key)
		log.Printf("Node %d: deleted locally - key %s (deleted: %t)", cns.ID, key, deleted)
		return deleted
	}

	// 他のノードが責任を持つ場合、適切なノードを見つけて削除要求
	// ここでは簡易実装として、ローカルから削除
	log.Printf("Node %d: key %s should be handled by another node, trying to delete locally", cns.ID, key)
	return cns.dataStore.Delete(key)
}

// GetDataStore はデータストアを返す（テスト用）
func (cns *ChordNodeStorage) GetDataStore() *DataStore {
	return cns.dataStore
}

// isResponsibleForKey は自分がキーの責任を持つかどうかを判断する
func (cns *ChordNodeStorage) isResponsibleForKey(keyID NodeID) bool {
	// 単一ノードの場合は常に自分が責任を持つ
	if cns.successor == nil || cns.predecessor == nil {
		return true
	}

	// predecessor < keyID <= nodeID の範囲のキーに責任を持つ
	if cns.predecessor.ID == cns.ID {
		// 自分だけのリングの場合
		return true
	}

	return BetweenLeftInclusive(keyID, cns.predecessor.ID, cns.ID)
}

// GetStorageInfo はストレージの情報を返す
func (cns *ChordNodeStorage) GetStorageInfo() map[string]interface{} {
	return map[string]interface{}{
		"dataCount": cns.dataStore.Size(),
		"keys":      cns.dataStore.Keys(),
	}
}
