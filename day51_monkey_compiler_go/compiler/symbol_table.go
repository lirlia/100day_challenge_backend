package compiler

// SymbolScope はシンボルのスコープを表す
type SymbolScope string

const (
	GlobalScope SymbolScope = "GLOBAL"
	// LocalScope  SymbolScope = "LOCAL" // 簡略版では未使用
	// BuiltinScope SymbolScope = "BUILTIN" // 簡略版では未使用
)

// Symbol はシンボルテーブル内の各エントリを表す
type Symbol struct {
	Name  string
	Scope SymbolScope
	Index int // そのスコープ内でのインデックス
}

// SymbolTable はシンボルとその情報を格納する
// 簡略版ではグローバルスコープのみを扱う
type SymbolTable struct {
	store          map[string]Symbol
	numDefinitions int
	// outer *SymbolTable // 簡略版では未使用 (ローカルスコープ用)
}

func NewSymbolTable() *SymbolTable {
	s := make(map[string]Symbol)
	return &SymbolTable{store: s}
}

// Define は新しいシンボルを定義する
// 簡略版では常にグローバルスコープとして定義する
func (s *SymbolTable) Define(name string) Symbol {
	symbol := Symbol{Name: name, Index: s.numDefinitions, Scope: GlobalScope}
	s.store[name] = symbol
	s.numDefinitions++
	return symbol
}

// Resolve は指定された名前のシンボルを解決する
func (s *SymbolTable) Resolve(name string) (Symbol, bool) {
	obj, ok := s.store[name]
	return obj, ok
}
