package ast

import "fmt"

// Expression は全ての式ノードが満たすインターフェースです。
type Expression interface {
	Pos() int
	String() string
	sealedExpression()
}

// Program は MiniLang プログラムのルートノードです。
type Program struct {
	Expression *TopLevelExpression `@@?`
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
type TopLevelExpression struct {
	Let  *Let  `  @@`
	Term *Term `| @@`
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
	// Option 1: Parenthesized Expression
	LParen  *string `  @"("`
	SubExpr *Term   `  @@`
	RParen  *string `  @")"`
	// Option 2: Integer Literal
	IntVal *int `| @Int`
	// Option 3: Boolean Literals
	TrueTag  *string `| @True`
	FalseTag *string `| @False`
	// Option 4: Variable Identifier
	Variable *string `| @Ident`
}

func (l *Literal) Pos() int {
	if l.LParen != nil && l.SubExpr != nil { // Parenthesized expression
		return l.SubExpr.Pos()
	}
	if l.IntVal != nil {
		return 0 // Placeholder
	}
	if l.TrueTag != nil || l.FalseTag != nil {
		return 0 // Placeholder
	}
	if l.Variable != nil {
		return 0 // Placeholder
	}
	return 0
}

func (l *Literal) String() string {
	if l.LParen != nil && l.SubExpr != nil && l.RParen != nil {
		return fmt.Sprintf("(%s)", l.SubExpr.String())
	}
	if l.IntVal != nil {
		return fmt.Sprintf("%d", *l.IntVal)
	}
	if l.TrueTag != nil {
		return "true"
	}
	if l.FalseTag != nil {
		return "false"
	}
	if l.Variable != nil {
		return *l.Variable
	}
	return "<invalid_literal>" // Should not happen
}

func (l *Literal) sealedExpression() {}

// --- Basic Terms ---
type Factor struct {
	UnaryMinus *string     `@"-"?`
	Base       *BaseFactor `@@`
	Args       []*Arg      `@@*` // For function application: Factor(Term, Term ...)
}

func (f *Factor) Pos() int {
	if f.UnaryMinus != nil {
		// Position of UnaryMinus or Base
	}
	if f.Base != nil {
		return f.Base.Pos()
	}
	return 0
}
func (f *Factor) String() string {
	res := ""
	if f.UnaryMinus != nil {
		res += "-"
	}
	if f.Base != nil {
		res += f.Base.String() // Append to res, don't overwrite
	}
	for _, arg := range f.Args {
		if arg != nil { // Added nil check for safety, though grammar implies args are constructed fully.
			res += arg.String()
		}
	}
	return res
}
func (f *Factor) sealedExpression() {}

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

type Arg struct {
	LParen *string `@LParen` // Argument list starts with '('
	Arg    *Term   `@@`      // The actual argument Term
	RParen *string `@RParen` // Argument list ends with ')'
}

func (a *Arg) Pos() int {
	// Position of the opening parenthesis could be a proxy.
	return 0
}
func (a *Arg) String() string {
	if a.Arg != nil {
		return fmt.Sprintf("(%s)", a.Arg.String())
	}
	return "()" // Represents an argument like `()` if that were possible, or an error state.
}
func (a *Arg) sealedExpression() {}

// --- Operator Precedence Terms ---
// Term = AddTerm ( ( "+" | "-" ) AddTerm )*
type Term struct {
	Left  *AddTerm     `@@`
	Right []*OpAddTerm `@@*`
}

func (t *Term) Pos() int {
	if t.Left != nil {
		return t.Left.Pos()
	}
	return 0
}
func (t *Term) String() string {
	if t.Left == nil {
		return ""
	} // Should not happen with `@@`
	res := t.Left.String()
	for _, opTerm := range t.Right {
		// Ensure opTerm and its AddTerm are not nil before calling String()
		if opTerm != nil && opTerm.AddTerm != nil {
			res += " " + opTerm.Operator + " " + opTerm.AddTerm.String()
		}
	}
	return res
}
func (t *Term) sealedExpression() {}

type OpAddTerm struct {
	Operator string   `@("+" | "-")`
	AddTerm  *AddTerm `@@`
}

// AddTerm = MulTerm ( ( "*" | "/" ) MulTerm )*
type AddTerm struct {
	Left  *MulTerm     `@@`
	Right []*OpMulTerm `@@*`
}

func (at *AddTerm) Pos() int {
	if at.Left != nil {
		return at.Left.Pos()
	}
	return 0
}
func (at *AddTerm) String() string {
	if at.Left == nil {
		return ""
	}
	res := at.Left.String()
	for _, opTerm := range at.Right {
		if opTerm != nil && opTerm.MulTerm != nil {
			res += " " + opTerm.Operator + " " + opTerm.MulTerm.String()
		}
	}
	return res
}
func (at *AddTerm) sealedExpression() {}

type OpMulTerm struct {
	Operator string   `@("*" | "/")`
	MulTerm  *MulTerm `@@`
}

// MulTerm = CmpTerm ( ( ">" | "<" | "==" ) CmpTerm )*
type MulTerm struct {
	Left  *CmpTerm     `@@`
	Right []*OpCmpTerm `@@*`
}

func (mt *MulTerm) Pos() int {
	if mt.Left != nil {
		return mt.Left.Pos()
	}
	return 0
}
func (mt *MulTerm) String() string {
	if mt.Left == nil {
		return ""
	}
	res := mt.Left.String()
	for _, opTerm := range mt.Right {
		if opTerm != nil && opTerm.CmpTerm != nil {
			res += " " + opTerm.Operator + " " + opTerm.CmpTerm.String()
		}
	}
	return res
}
func (mt *MulTerm) sealedExpression() {}

type OpCmpTerm struct {
	Operator string   `@(">" | "<" | Eq)` // Uses Eq token from lexer for ==
	CmpTerm  *CmpTerm `@@`
}

// CmpTerm = BoolTerm ( ( "&&" | "||" ) BoolTerm )*
type CmpTerm struct {
	Left  *BoolTerm     `@@`
	Right []*OpBoolTerm `@@*`
}

func (ct *CmpTerm) Pos() int {
	if ct.Left != nil {
		return ct.Left.Pos()
	}
	return 0
}
func (ct *CmpTerm) String() string {
	if ct.Left == nil {
		return ""
	}
	res := ct.Left.String()
	for _, opTerm := range ct.Right {
		if opTerm != nil && opTerm.BoolTerm != nil {
			res += " " + opTerm.Operator + " " + opTerm.BoolTerm.String()
		}
	}
	return res
}
func (ct *CmpTerm) sealedExpression() {}

type OpBoolTerm struct {
	Operator string    `@(LogicalAnd | LogicalOr)` // Uses tokens from lexer
	BoolTerm *BoolTerm `@@`
}

// BoolTerm = Factor
type BoolTerm struct {
	Factor *Factor `@@`
}

func (bt *BoolTerm) Pos() int {
	if bt.Factor != nil {
		return bt.Factor.Pos()
	}
	return 0
}
func (bt *BoolTerm) String() string {
	if bt.Factor != nil {
		return bt.Factor.String()
	}
	return ""
}
func (bt *BoolTerm) sealedExpression() {}

// --- Compound Expressions ---
type Let struct {
	LetKw    string              `@LetKw`  // "let"
	VarName  string              `@Ident`  // Variable name
	Eq       string              `@Assign` // "=" from lexer
	BindExpr *Term               `@@`      // Expression to bind
	InKw     string              `@InKw`   // "in"
	BodyExpr *TopLevelExpression `@@`      // Body expression
}

func (l *Let) Pos() int {
	// Position of "let" keyword might be a good proxy.
	return 0
}
func (l *Let) String() string {
	varNameStr := "<nil_var>"
	// VarName is not a pointer, so direct check for empty string.
	if l.VarName != "" {
		varNameStr = l.VarName
	}

	bindStr := "<nil_bind>"
	if l.BindExpr != nil {
		bindStr = l.BindExpr.String()
	}

	bodyStr := "<nil_body>"
	if l.BodyExpr != nil {
		bodyStr = l.BodyExpr.String()
	}
	return fmt.Sprintf("let %s = %s in %s", varNameStr, bindStr, bodyStr)
}
func (l *Let) sealedExpression() {}

type If struct {
	IfKw     string `@IfKw`   // "if"
	CondExpr *Term  `@@`      // Condition
	ThenKw   string `@ThenKw` // "then"
	ThenExpr *Term  `@@`      // Expression if true
	ElseKw   string `@ElseKw` // "else"
	ElseExpr *Term  `@@`      // Expression if false
}

func (i *If) Pos() int {
	// Position of "if" keyword.
	return 0
}
func (i *If) String() string {
	condStr := "<nil_cond>"
	if i.CondExpr != nil {
		condStr = i.CondExpr.String()
	}

	thenStr := "<nil_then>"
	if i.ThenExpr != nil {
		thenStr = i.ThenExpr.String()
	}

	elseStr := "<nil_else>"
	if i.ElseExpr != nil {
		elseStr = i.ElseExpr.String()
	}
	return fmt.Sprintf("if %s then %s else %s", condStr, thenStr, elseStr)
}
func (i *If) sealedExpression() {}

type Lambda struct {
	FnKw     string `@FnKw`  // "fn"
	Param    string `@Ident` // Parameter name
	Arrow    string `@Arrow` // "=>" from lexer
	BodyExpr *Term  `@@`     // Body expression
}

func (l *Lambda) Pos() int {
	// Position of "fn" keyword.
	return 0
}
func (l *Lambda) String() string {
	paramStr := "<nil_param>"
	if l.Param != "" {
		paramStr = l.Param
	}
	bodyStr := "<nil_body>"
	if l.BodyExpr != nil {
		bodyStr = l.BodyExpr.String()
	}
	return fmt.Sprintf("fn %s => %s", paramStr, bodyStr)
}
func (l *Lambda) sealedExpression() {}
