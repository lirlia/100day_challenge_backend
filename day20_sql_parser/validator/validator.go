package validator

import (
	"strings"
	"fmt" // デバッグ用にインポート
	"github.com/your_username/day20_sql_parser/ast"
	"github.com/your_username/day20_sql_parser/schema"
	"github.com/your_username/day20_sql_parser/token"
)

// Visitor はASTノードを巡回するためのインターフェースです。
// 各ノードタイプに対応する Visit メソッドを定義します。
// メソッドは bool を返し、false を返すと子ノードの巡回を停止します。
type Visitor interface {
	VisitSelectStatement(node *ast.SelectStatement) bool
	VisitIdentifier(node *ast.Identifier) bool
	VisitIntegerLiteral(node *ast.IntegerLiteral) bool
	VisitStringLiteral(node *ast.StringLiteral) bool
	VisitBooleanLiteral(node *ast.BooleanLiteral) bool
	VisitPrefixExpression(node *ast.PrefixExpression) bool
	VisitInfixExpression(node *ast.InfixExpression) bool
	VisitOrderByExpression(node *ast.OrderByExpression) bool
	VisitLimitClause(node *ast.LimitClause) bool
	VisitAllColumns(node *ast.AllColumns) bool
	VisitFunctionCall(node *ast.FunctionCall) bool
	VisitAliasExpression(node *ast.AliasExpression) bool
	// TODO: 他のノードタイプに対応するVisitメソッドを追加
}

// Walk は指定されたビジターでASTノードを巡回します。
func Walk(node ast.Node, visitor Visitor) {
	if node == nil {
		return
	}
	switch node := node.(type) {
	case *ast.Program:
		for _, stmt := range node.Statements {
			if stmt != nil {
				Walk(stmt, visitor)
			}
		}

	case *ast.SelectStatement:
		if !visitor.VisitSelectStatement(node) {
			return // falseが返されたら、子要素の巡回は行わない
		}
		// FROM句を先にvisitしてcurrentTableを設定
		if node.From != nil {
			Walk(node.From, visitor)
		}
		// その他の要素をvisit
		for _, col := range node.Columns {
			Walk(col, visitor)
		}
		if node.Where != nil {
			Walk(node.Where, visitor)
		}
		// OrderBy, Limit を巡回
		for _, orderBy := range node.OrderBy {
			Walk(orderBy, visitor)
		}
		if node.Limit != nil {
			Walk(node.Limit, visitor)
		}
		// TODO: GroupBy, Having の巡回を追加

	case *ast.Identifier:
		visitor.VisitIdentifier(node)
	case *ast.IntegerLiteral:
		visitor.VisitIntegerLiteral(node)
	case *ast.StringLiteral:
		visitor.VisitStringLiteral(node)
	case *ast.BooleanLiteral:
		visitor.VisitBooleanLiteral(node)
	case *ast.PrefixExpression:
		// Prefix は右辺を先に評価してから自身を評価
		Walk(node.Right, visitor)
		if !visitor.VisitPrefixExpression(node) {
			return
		}
	case *ast.InfixExpression:
		// 中置式は左右を先に評価してから自身を評価する（型チェックのため）
		Walk(node.Left, visitor)
		Walk(node.Right, visitor)
		if !visitor.VisitInfixExpression(node) {
			return
		}
	case *ast.OrderByExpression:
		// OrderBy は式を先に評価
		Walk(node.Column, visitor)
		if !visitor.VisitOrderByExpression(node) {
			return
		}
	case *ast.LimitClause:
		// Limit は値を先に評価
		Walk(node.Value, visitor)
		if !visitor.VisitLimitClause(node) {
			return
		}
	case *ast.AllColumns:
		visitor.VisitAllColumns(node)
	case *ast.FunctionCall:
		// 関数は引数を先に評価してから自身を評価
		// Walk(node.Name, visitor) // 関数名は識別子だが、ここでVisitする必要はないかも
		for _, arg := range node.Arguments {
			Walk(arg, visitor)
		}
		if !visitor.VisitFunctionCall(node) {
			return
		}
	case *ast.AliasExpression:
		// AS は元となる式を先に評価
		Walk(node.Expression, visitor)
		if !visitor.VisitAliasExpression(node) {
			return
		}
		// Walk(node.Alias, visitor) // エイリアス名自体は識別子だが、VisitIdentifierで処理される

	// 他のノードタイプもここに追加
	}
}

// Validator はスキーマに基づいてASTを検証します。
type Validator struct {
	dbSchema *schema.Schema
	errors   []*ValidationError

	// バリデーション中のコンテキスト情報
	currentSelect *ast.SelectStatement // 現在処理中のSELECT文
	currentTable  *schema.Table        // FROM句で特定されたテーブル
	// TODO: JOIN やサブクエリに対応するため、より複雑なスコープ管理が必要

	// 型チェック用: 式とその評価された型を一時的に保持
	// Walkの特性上、子ノードが先に評価されるので、これで親ノードが子の型を参照できる
	expressionTypes map[ast.Expression]schema.DataType
}

// NewValidator は新しい Validator を作成します。
func NewValidator(s *schema.Schema) *Validator {
	return &Validator{
		dbSchema:        s,
		expressionTypes: make(map[ast.Expression]schema.DataType),
	}
}

// Validate はASTプログラム全体を検証します。
func (v *Validator) Validate(program *ast.Program) []*ValidationError {
	v.errors = []*ValidationError{}
	v.expressionTypes = make(map[ast.Expression]schema.DataType) // エラーと型マップをリセット
	Walk(program, v)
	return v.errors
}

// evaluateType は式のデータ型を評価（または取得）します。
// すでに評価済みの場合はキャッシュから返します。
// まだ評価されていない基本的なノード（リテラル、識別子）はその場で評価します。
// 複雑な式（Infix, Prefix）は、それらをVisitする際に型が計算されマップに格納される想定です。
func (v *Validator) evaluateType(expr ast.Expression) schema.DataType {
	if expr == nil {
		fmt.Printf("[Debug EvaluateType] Input expr is nil, returning UNKNOWN\n")
		return schema.UNKNOWN
	}

	fmt.Printf("[Debug EvaluateType] Evaluating type for expression: %T %p %s\n", expr, expr, expr.String())

	// キャッシュ確認
	if dt, ok := v.expressionTypes[expr]; ok {
		fmt.Printf("[Debug EvaluateType] Cache HIT for %p (%s) -> %s\n", expr, expr.String(), dt)
		return dt
	}
	fmt.Printf("[Debug EvaluateType] Cache MISS for %p (%s)\n", expr, expr.String())

	// キャッシュになければ基本ノードを評価
	var dt schema.DataType = schema.UNKNOWN
	switch node := expr.(type) {
	case *ast.IntegerLiteral:
		dt = schema.INTEGER
	case *ast.StringLiteral:
		dt = schema.TEXT
	case *ast.BooleanLiteral:
		dt = schema.BOOLEAN
	case *ast.Identifier:
		// カラム存在チェックは VisitIdentifier で実施済みのはず
		// ここでは型を取得するだけ
		if v.currentTable != nil {
			col, err := v.currentTable.FindColumn(node.Value)
			if err == nil {
				dt = col.Type
			} else {
				// エイリアスかもしれないのでチェック
				isAlias := false
				aliasType := schema.UNKNOWN
				if v.currentSelect != nil {
					for _, colExpr := range v.currentSelect.Columns {
						if aliasExpr, ok := colExpr.(*ast.AliasExpression); ok {
							if aliasExpr.Alias.Value == node.Value {
								isAlias = true
								// エイリアスの型は元の式の型
								aliasType = v.evaluateType(aliasExpr.Expression)
								break
							}
						}
					}
				}
				if isAlias {
					dt = aliasType
				} else {
					// エラーは VisitIdentifier で追加されるのでここでは追加しない
					// UNKNOWN のままにする
				}
			}
		} else {
			// テーブルコンテキストがない場合 (通常はFROM句がないエラー)
			// エラーは VisitIdentifier で追加される
		}
	case *ast.AliasExpression:
		// エイリアス式は元の式の型を引き継ぐ
		dt = v.evaluateType(node.Expression)
	case *ast.AllColumns:
		// * は特定の型を持たない
		dt = schema.UNKNOWN
	// 他の基本ノードタイプがあればここに追加
	// default: // Infix, Prefix などはそれぞれの Visit メソッドで評価・格納される
	}

	fmt.Printf("[Debug EvaluateType] Caching type for %p (%s) -> %s\n", expr, expr.String(), dt)
	v.expressionTypes[expr] = dt // 評価結果をキャッシュ
	return dt
}

// addError はエラーを追加します。トークン情報がない場合は 0 を設定します。
func (v *Validator) addError(tok token.Token, format string, args ...interface{}) {
	line, col := 0, 0
	// Token が初期化されているかチェック (ゼロ値でないか)
	if tok != (token.Token{}) {
		line = tok.Line
		col = tok.Column
	}
	v.errors = append(v.errors, NewValidationError(line, col, format, args...))
}

// --- Visitorの実装 --- //

func (v *Validator) VisitSelectStatement(node *ast.SelectStatement) bool {
	v.currentSelect = node
	v.currentTable = nil // Reset table context for the new SELECT

	// Check FROM clause existence (essential for context)
	if node.From == nil {
		// FROM句がない場合、致命的なのでエラーを追加し、
		// それ以上この SELECT文 の子要素の検証は行わない方が良いかもしれないが、
		// カラム参照などで追加のエラーを検出するために続行する。
		// Walkの順序を変更し、Fromを先に評価するようにしたため、ここではエラーを追加しない。
		// (VisitIdentifierが呼ばれたときにcurrentTableがnilであることでハンドリングされる)
	}

	return true // Continue visiting child nodes
}

// VisitIdentifier は識別子（テーブル名、カラム名）を検証します。
func (v *Validator) VisitIdentifier(node *ast.Identifier) bool {
	// Walk の順序変更により、From句のIdentifierはここで処理される
	if v.currentSelect != nil && v.currentSelect.From == node {
		// This is the table name in the FROM clause
		tableName := node.Value
		table, err := v.dbSchema.FindTable(tableName)
		if err != nil {
			v.addError(node.Token, "Table '%s' not found in schema", tableName)
			v.currentTable = nil // Ensure table context is nil if table not found
		} else {
			v.currentTable = table // Set the current table context
		}
	} else if v.currentTable != nil {
		// This identifier is likely a column name or an alias.
		// エイリアス定義の右辺(ast.AliasExpression.Alias)はこのチェックをスキップすべきだが、
		// Walk中にどのコンテキストでVisitIdentifierが呼ばれたかを知るのは難しい。
		// 一旦、カラムとエイリアス参照の両方の可能性をチェックする。

		_, colErr := v.currentTable.FindColumn(node.Value)

		// Check if it's a known alias from the SELECT list
		isAlias := false
		if v.currentSelect != nil {
			for _, colExpr := range v.currentSelect.Columns {
				if aliasExpr, ok := colExpr.(*ast.AliasExpression); ok {
					if aliasExpr.Alias.Value == node.Value {
						isAlias = true
						break
					}
				}
			}
		}

		// If it's not a column and not an alias, it's an error.
		if colErr != nil && !isAlias {
			v.addError(node.Token, "Column or alias '%s' not found in table '%s' or SELECT list", node.Value, v.currentTable.Name)
		}
		// Evaluate and store the type (will be UNKNOWN if not found/not alias)
		v.evaluateType(node)

	} else {
		// currentTable is nil. This identifier might be:
		// 1. A table name (handled above)
		// 2. An alias in ORDER BY/HAVING referring to a SELECT alias
		// 3. An invalid column reference because FROM is missing or invalid.

		// Check if it's a known alias from the SELECT list (needed for ORDER BY alias)
		isSelectAlias := false
		if v.currentSelect != nil {
			for _, colExpr := range v.currentSelect.Columns {
				if aliasExpr, ok := colExpr.(*ast.AliasExpression); ok {
					if aliasExpr.Alias.Value == node.Value {
						isSelectAlias = true
						break
					}
				}
			}
		}

		// If currentTable is nil AND it's not the table name itself AND it's not a known SELECT alias,
		// then it's likely an unresolved identifier due to missing FROM.
		if v.currentSelect == nil || (v.currentSelect.From != node && !isSelectAlias) {
			v.addError(node.Token, "Cannot resolve identifier '%s' without a valid FROM clause or alias definition", node.Value)
			v.expressionTypes[node] = schema.UNKNOWN // Mark as unknown type
		} else if isSelectAlias {
			// ORDER BY alias の場合、型を評価しておく
			v.evaluateType(node)
		} else {
			// その他のケース（テーブル名など）でも型評価は行う (UNKNOWNになるはず)
			v.expressionTypes[node] = schema.UNKNOWN
		}
	}
	return true
}

func (v *Validator) VisitIntegerLiteral(node *ast.IntegerLiteral) bool {
	v.expressionTypes[node] = schema.INTEGER
	return true
}

func (v *Validator) VisitStringLiteral(node *ast.StringLiteral) bool {
	v.expressionTypes[node] = schema.TEXT
	return true
}

func (v *Validator) VisitBooleanLiteral(node *ast.BooleanLiteral) bool {
	v.expressionTypes[node] = schema.BOOLEAN
	return true
}

func (v *Validator) VisitPrefixExpression(node *ast.PrefixExpression) bool {
	rightType := v.evaluateType(node.Right)
	var resultType schema.DataType = schema.UNKNOWN

	switch node.Operator {
	case "NOT":
		if rightType != schema.BOOLEAN && rightType != schema.UNKNOWN {
			v.addError(node.Token, "Operator NOT requires a BOOLEAN expression, got %s", rightType)
		}
		resultType = schema.BOOLEAN // NOT always results in BOOLEAN
	case "-":
		if rightType != schema.INTEGER && rightType != schema.UNKNOWN {
			v.addError(node.Token, "Unary operator '-' requires an INTEGER expression, got %s", rightType)
		}
		resultType = schema.INTEGER // Minus results in INTEGER
	default:
		v.addError(node.Token, "Unknown prefix operator: %s", node.Operator)
	}
	v.expressionTypes[node] = resultType
	return true
}

func (v *Validator) VisitInfixExpression(node *ast.InfixExpression) bool {
	// 子ノードのWalkが完了しているので、expressionTypesに型情報があるはず
	leftType := v.evaluateType(node.Left)
	rightType := v.evaluateType(node.Right)

	fmt.Printf("[Debug VisitInfix] Operator: '%s', Left Expr: %T %p (%s), Left Type: %s, Right Expr: %T %p (%s), Right Type: %s\n",
		node.Operator, node.Left, node.Left, node.Left.String(), leftType, node.Right, node.Right, node.Right.String(), rightType)

	// オペランドのどちらかの型が不明な場合はエラー（ただし、すでにaddErrorされている可能性あり）
	// if leftType == schema.UNKNOWN || rightType == schema.UNKNOWN {
	//     // ここでエラーを追加すると重複する可能性があるため、一旦コメントアウト
	//     // v.addError(node.Token, "Could not determine type for one or both operands of %s", node.Operator)
	//     v.expressionTypes[node] = schema.UNKNOWN // 結果もUNKNOWN
	//     return true // 検証は続行
	// }

	var resultType schema.DataType = schema.UNKNOWN
	operator := strings.ToUpper(node.Operator) // 演算子を大文字に変換して比較

	switch operator { // 比較対象を大文字にした演算子に変更
	// --- 算術演算子 ---
	case "+", "-", "*", "/":
		if leftType != schema.INTEGER && leftType != schema.FLOAT { // 簡単のためFLOATも許容
			v.addError(node.Token, "Left operand for '%s' must be numeric, got %s", node.Operator, leftType)
		}
		if rightType != schema.INTEGER && rightType != schema.FLOAT {
			v.addError(node.Token, "Right operand for '%s' must be numeric, got %s", node.Operator, rightType)
		}
		// 簡単のため、結果は常に INTEGER とする (本来は FLOAT になる場合もある)
		resultType = schema.INTEGER // ここでは簡単化

	// --- 比較演算子 ---
	case "=", "!=", "<", ">", "<=", ">=", "<>": // <> も追加
		// 型比較: 基本的に同じ型同士での比較を想定
		compatible := false
		if leftType == rightType {
			compatible = true
		} else if (leftType == schema.INTEGER && rightType == schema.FLOAT) || (leftType == schema.FLOAT && rightType == schema.INTEGER) {
			compatible = true // 数値型同士はOK
		} // 他の互換性ルールがあれば追加

		if !compatible && leftType != schema.UNKNOWN && rightType != schema.UNKNOWN { // 型が不明でない場合のみ互換性エラーを出す
			// 互換性のない型の比較はエラー
			v.addError(node.Token, "Cannot compare values of type %s and %s using '%s'", leftType, rightType, node.Operator)
		}
		// 比較演算子の結果は常に BOOLEAN
		resultType = schema.BOOLEAN

	// --- 論理演算子 ---
	case "AND", "OR":
		if leftType != schema.BOOLEAN && leftType != schema.UNKNOWN { // UNKNOWN を許容（エラーはオペランド側で報告される）
			v.addError(node.Token, "Left operand for '%s' must be boolean, got %s", node.Operator, leftType)
		}
		if rightType != schema.BOOLEAN && rightType != schema.UNKNOWN { // UNKNOWN を許容
			v.addError(node.Token, "Right operand for '%s' must be boolean, got %s", node.Operator, rightType)
		}
		// 論理演算子の結果は BOOLEAN
		resultType = schema.BOOLEAN


	// --- その他の演算子 (LIKE, IN など) ---
	// case "LIKE": // LIKE は特殊な文字列比較
	// 	if leftType != schema.TEXT {
	// 		v.addError(node.Token, "Left operand for 'LIKE' must be TEXT, got %s", leftType)
	// 	}
	// 	if rightType != schema.TEXT { // パターンも TEXT
	// 		v.addError(node.Token, "Right operand (pattern) for 'LIKE' must be TEXT, got %s", rightType)
	// 	}
	// 	resultType = schema.BOOLEAN
	// case "IN":
	// 	// IN (value1, value2, ...)
	// 	// 右辺がリストまたはサブクエリになる。パーサーが対応していないため、ここでは未実装。
	// 	// 右辺が TupleExpression のようなノードになると仮定すると...
	// 	// if tupleExpr, ok := node.Right.(*ast.TupleExpression); ok {
	// 	// 	for _, elem := range tupleExpr.Elements {
	// 	// 		elemType := v.evaluateType(elem)
	// 	// 		if elemType != leftType {
	// 	// 			// エラー: INリスト内の型が左辺と不一致
	// 	// 		}
	// 	// 	}
	// 	// } else {
	// 	// 	// エラー: IN の右辺がリスト形式ではない
	// 	// }
	// 	// resultType = schema.BOOLEAN
	// 	v.addError(node.Token, "'IN' operator validation is not yet implemented") // 未実装

	default:
		v.addError(node.Token, "Unknown infix operator: %s", node.Operator)
	}

	// このInfixExpression自体の型を記録
	v.expressionTypes[node] = resultType

	return true // 子要素の巡回は Walk 関数で制御されるため、常に true を返す
}

func (v *Validator) VisitOrderByExpression(node *ast.OrderByExpression) bool {
	// ORDER BY 対象のカラム/式の型を取得 (存在チェックはVisitIdentifier等で行われる)
	colType := v.evaluateType(node.Column)
	if colType == schema.UNKNOWN {
		// エラーは他の場所で報告されているはずなので、ここでは追加しない
		// (ただし、カラムが見つからない場合などのエラーメッセージが必要)
		// VisitIdentifier でカラムが見つからないエラーは出るはず
	} else if colType == schema.BOOLEAN {
		// BOOLEANでのソートは意味がないことが多いので警告またはエラー
		v.addError(node.TokenLiteral(), "Ordering by BOOLEAN expression ('%s') is not allowed or recommended", node.Column.String())
	}
	// Direction ("ASC"/"DESC") は構文レベルで検証済みとみなす
	return true
}

// VisitLimitClause は LIMIT 句の値を検証します。
func (v *Validator) VisitLimitClause(node *ast.LimitClause) bool {
	// LIMIT の値は整数リテラルである必要がある
	if _, ok := node.Value.(*ast.IntegerLiteral); !ok {
		// 整数リテラルでない場合でも、評価された型が INTEGER かどうかを確認
		limitType := v.evaluateType(node.Value)
		if limitType != schema.INTEGER {
			v.addError(node.TokenLiteral(), "LIMIT clause requires a non-negative integer value, got %s ('%s')", limitType, node.Value.String())
		}
		// TODO: 値が負でないかのチェックも追加可能
	}
	// 値が IntegerLiteral の場合は型は正しい
	// TODO: 値が負でないかのチェックを追加可能 (node.Value.(*ast.IntegerLiteral).Value < 0)

	return true
}

func (v *Validator) VisitAllColumns(node *ast.AllColumns) bool {
	// AllColumns 自体は型チェック不要
	// ただし、FROM句がない場合に * が使われたらエラーにすべきかもしれない
	if v.currentTable == nil && v.currentSelect != nil && v.currentSelect.From == nil {
		v.addError(node.TokenLiteral(), "Cannot use '*' without a FROM clause")
	}
	return true
}

func (v *Validator) VisitFunctionCall(node *ast.FunctionCall) bool {
	// TODO: 関数存在チェック、引数の数と型チェック
	// 例: COUNT(*) -> INTEGER, SUBSTR(TEXT, INTEGER, INTEGER) -> TEXT
	funcName := node.Name.Value

	// 簡易的な COUNT のハンドリング (大文字小文字区別しない)
	// TODO: 実際のDBのように Function Registry を持つのが望ましい
	if strings.ToUpper(node.Name.Value) == "COUNT" { // SQL標準では大文字小文字区別しない
		if len(node.Arguments) == 1 {
			// COUNT(*) の * は AllColumns ノード
			if _, ok := node.Arguments[0].(*ast.AllColumns); ok {
				v.expressionTypes[node] = schema.INTEGER
				return true
			}
			// COUNT(column) もINTEGER
			argType := v.evaluateType(node.Arguments[0])
			if argType != schema.UNKNOWN {
				// COUNT は基本的にどの型のカラムでも受け入れる
				v.expressionTypes[node] = schema.INTEGER
				return true
			} else {
				// 引数の型が不明な場合 (存在しないカラムなど)
				// エラーは引数の評価時に出ているはずなので、ここではUNKNOWNのまま
				v.expressionTypes[node] = schema.UNKNOWN
				return true
			}
		}
		v.addError(node.Token, "Invalid number of arguments for function COUNT (expected 1)")
		v.expressionTypes[node] = schema.UNKNOWN
	} else {
		v.addError(node.Token, "Unknown function: %s", funcName)
		v.expressionTypes[node] = schema.UNKNOWN
	}

	return true
}

func (v *Validator) VisitAliasExpression(node *ast.AliasExpression) bool {
	// 元の式の型は evaluateType で評価・キャッシュされる
	// ここではエイリアス式自体の型を、元の式の型としてキャッシュする
	originalType := v.evaluateType(node.Expression)
	v.expressionTypes[node] = originalType

	// エイリアス名が既存のカラム名と衝突しないか？などのチェックも可能だが、今回は省略
	return true
}
