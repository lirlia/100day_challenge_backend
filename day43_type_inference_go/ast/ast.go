package ast

import "fmt"

// Expression は全ての式ノードが満たすインターフェースです。
// Pos() はトークンの開始位置を返します (participleによって自動的に設定されます)。
// String() はデバッグ用にASTノードの文字列表現を返します。
type Expression interface {
	Pos() int // participle が提供する Capture で取得される位置情報
	String() string
	// Dummy method to make this interface unique and identifiable
	// (e.g. for type switches on Expression vs other interfaces)
	sealedExpression()
}

// Program は MiniLang プログラムのルートノードです。
// 式のリストを持つことができますが、今回は単一の式を想定します。
// または、トップレベルのlet束縛の連続かもしれません。
// 簡単のため、単一の式、または `let ... in ...` が連続する形のみを許可します。
// participle の都合上、トップレベルはExpressionのポインタである必要があります。
type Program struct {
	Expression *TopLevelExpression `@@`
}

func (p *Program) Pos() int {
	if p.Expression != nil {
		return p.Expression.Pos()
	}
	return 0
}

func (p *Program) String() string {
	if p.Expression != nil {
		return p.Expression.String()
	}
	return ""
}
func (p *Program) sealedExpression() {}

// TopLevelExpression はプログラムのトップレベルで許可される式です。
// 通常のExpressionに加えて、Let式を直接含むことができます。
// participleでは、複数のルールを試すためにOR (`|`) を使いますが、
// ここでは単純化のため、Let式か、それ以外の一般の式(Term)かを区別します。
// より正確には、MiniLangでは `let x = 1 in let y = 2 in x + y` のようなものがトップレベルに来ます。
// または単に `1+2`のようなTermも可能です。
type TopLevelExpression struct {
	Let  *Let  `  @@`
	Term *Term `| @@` // Let 以外の場合
}

func (e *TopLevelExpression) Pos() int {
	if e.Let != nil {
		return e.Let.Pos()
	}
	if e.Term != nil {
		return e.Term.Pos()
	}
	return 0
}

func (e *TopLevelExpression) String() string {
	if e.Let != nil {
		return e.Let.String()
	}
	if e.Term != nil {
		return e.Term.String()
	}
	return ""
}
func (e *TopLevelExpression) sealedExpression() {}

// --- Literal Values ---

type Literal struct {
	IntVal   *int    `  @Int`
	BoolVal  *bool   `| @("true" | "false")`
	Variable *string `| @Ident` // Ident は parser側で定義するトークン名
	LParen   *string `| @"("`   // For parenthesized expressions
	SubExpr  *Term   `  @@?`    // expression inside parentheses
	RParen   *string `  @")"?`  // Closing parenthesis for SubExpr
}

func (l *Literal) Pos() int { return 0 } // participle が Capture で設定するのを期待
func (l *Literal) String() string {
	if l.IntVal != nil {
		return fmt.Sprintf("%d", *l.IntVal)
	}
	if l.BoolVal != nil {
		return fmt.Sprintf("%t", *l.BoolVal)
	}
	if l.Variable != nil {
		return *l.Variable
	}
	if l.SubExpr != nil { // Parenthesized expression
		return fmt.Sprintf("(%s)", l.SubExpr.String())
	}
	return ""
}
func (l *Literal) sealedExpression() {}

// --- Basic Terms (can be part of binary operations) ---
// Factor は Literal または Function Application です。
// Term は Factor の連続した二項演算です (例: factor op factor op factor ...)
type Factor struct {
	// Function Application は factor(term) という形。左再帰を避けるため工夫が必要。
	// fn x => x のようなラムダもFactorの一部として扱います。
	Base *BaseFactor `@@`
	Args []*Arg      `@@*` // For function application: Factor(Term, Term ...)
}

func (f *Factor) Pos() int { return f.Base.Pos() }
func (f *Factor) String() string {
	res := f.Base.String()
	for _, arg := range f.Args {
		res += arg.String()
	}
	return res
}
func (f *Factor) sealedExpression() {}

// BaseFactor は Literal, Lambda, If, Parenthesized expression など、より基本的な要素です。
type BaseFactor struct {
	Literal *Literal `  @@`
	Lambda  *Lambda  `| @@`
	If      *If      `| @@`
	// Parenthesized expressions are handled by Literal.SubExpr
}

func (bf *BaseFactor) Pos() int {
	if bf.Literal != nil {
		return bf.Literal.Pos()
	}
	if bf.Lambda != nil {
		return bf.Lambda.Pos()
	}
	if bf.If != nil {
		return bf.If.Pos()
	}
	return 0
}
func (bf *BaseFactor) String() string {
	if bf.Literal != nil {
		return bf.Literal.String()
	}
	if bf.Lambda != nil {
		return bf.Lambda.String()
	}
	if bf.If != nil {
		return bf.If.String()
	}
	return ""
}
func (bf *BaseFactor) sealedExpression() {}

// Arg は関数適用の引数部分です `(Term)`
type Arg struct {
	LParen *string `@"("`
	Arg    *Term   `@@`
	RParen *string `@")"`
}

func (a *Arg) Pos() int { return 0 } // LParen の位置
func (a *Arg) String() string {
	return fmt.Sprintf("(%s)", a.Arg.String())
}
func (a *Arg) sealedExpression() {}

// Term は演算子の優先順位を考慮した式です。
// ここでは簡単化のため、加減算と乗除算の優先順位のみを考慮します。
// Term = AddTerm ( ( "+" | "-" ) AddTerm )*
// AddTerm = MulTerm ( ( "*" | "/" ) MulTerm )*
// MulTerm = CmpTerm ( ( ">" | "<" | "==" ) CmpTerm )*
// CmpTerm = BoolTerm ( ( "&&" | "||" ) BoolTerm )*
// BoolTerm = Factor
// このような左再帰的な定義は participle では直接扱いにくいため、フラットなリストで演算を保持します。
type Term struct {
	Left  *AddTerm     `@@`
	Right []*OpAddTerm `@@*`
}

func (t *Term) Pos() int { return t.Left.Pos() }
func (t *Term) String() string {
	res := t.Left.String()
	for _, opTerm := range t.Right {
		res += " " + opTerm.Operator + " " + opTerm.AddTerm.String()
	}
	return res
}
func (t *Term) sealedExpression() {}

type OpAddTerm struct {
	Operator string   `@("+" | "-")`
	AddTerm  *AddTerm `@@`
}

type AddTerm struct {
	Left  *MulTerm     `@@`
	Right []*OpMulTerm `@@*`
}

func (at *AddTerm) Pos() int { return at.Left.Pos() }
func (at *AddTerm) String() string {
	res := at.Left.String()
	for _, opTerm := range at.Right {
		res += " " + opTerm.Operator + " " + opTerm.MulTerm.String()
	}
	return res
}
func (at *AddTerm) sealedExpression() {}

type OpMulTerm struct {
	Operator string   `@("*" | "/")`
	MulTerm  *MulTerm `@@`
}

type MulTerm struct {
	Left  *CmpTerm     `@@`
	Right []*OpCmpTerm `@@*`
}

func (mt *MulTerm) Pos() int { return mt.Left.Pos() }
func (mt *MulTerm) String() string {
	res := mt.Left.String()
	for _, opTerm := range mt.Right {
		res += " " + opTerm.Operator + " " + opTerm.CmpTerm.String()
	}
	return res
}
func (mt *MulTerm) sealedExpression() {}

type OpCmpTerm struct {
	Operator string   `@(">" | "<" | "==")`
	CmpTerm  *CmpTerm `@@`
}

type CmpTerm struct {
	Left  *BoolTerm     `@@`
	Right []*OpBoolTerm `@@*`
}

func (ct *CmpTerm) Pos() int { return ct.Left.Pos() }
func (ct *CmpTerm) String() string {
	res := ct.Left.String()
	for _, opTerm := range ct.Right {
		res += " " + opTerm.Operator + " " + opTerm.BoolTerm.String()
	}
	return res
}
func (ct *CmpTerm) sealedExpression() {}

type OpBoolTerm struct {
	Operator string    `@("&&" | "||")`
	BoolTerm *BoolTerm `@@`
}

type BoolTerm struct {
	Factor *Factor `@@` // Factor には Literal, Lambda, If, FuncApp が含まれる
}

func (bt *BoolTerm) Pos() int          { return bt.Factor.Pos() }
func (bt *BoolTerm) String() string    { return bt.Factor.String() }
func (bt *BoolTerm) sealedExpression() {}

// --- Compound Expressions ---

type Let struct {
	LetKw    string              `@"let"`
	VarName  string              `@Ident`
	Eq       string              `@"="`
	BindExpr *Term               `@@` // 束縛される式
	InKw     string              `@"in"`
	BodyExpr *TopLevelExpression `@@` // let ... in (body)  本体は TopLevelExpression (LetまたはTermを含む可能性あり)
}

func (l *Let) Pos() int { return 0 } // "let" keyword position
func (l *Let) String() string {
	return fmt.Sprintf("let %s = %s in %s", l.VarName, l.BindExpr.String(), l.BodyExpr.String())
}
func (l *Let) sealedExpression() {}

type If struct {
	IfKw     string `@"if"`
	CondExpr *Term  `@@`
	ThenKw   string `@"then"`
	ThenExpr *Term  `@@`
	ElseKw   string `@"else"`
	ElseExpr *Term  `@@`
}

func (i *If) Pos() int { return 0 } // "if" keyword position
func (i *If) String() string {
	return fmt.Sprintf("if %s then %s else %s", i.CondExpr.String(), i.ThenExpr.String(), i.ElseExpr.String())
}
func (i *If) sealedExpression() {}

type Lambda struct {
	FnKw     string `@"fn"`
	Param    string `@Ident`
	Arrow    string `@"=>"`
	BodyExpr *Term  `@@`
}

func (l *Lambda) Pos() int { return 0 } // "fn" keyword position
func (l *Lambda) String() string {
	return fmt.Sprintf("fn %s => %s", l.Param, l.BodyExpr.String())
}
func (l *Lambda) sealedExpression() {}
