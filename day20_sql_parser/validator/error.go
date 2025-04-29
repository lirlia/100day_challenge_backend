package validator

import "fmt"

// ValidationError はバリデーションエラーを表します。
type ValidationError struct {
	Message  string
	Line     int // エラーが発生した元のSQLの行番号 (Tokenから取得)
	Column   int // エラーが発生した元のSQLの列番号 (Tokenから取得)
}

// Error は error インターフェースを実装します。
func (e *ValidationError) Error() string {
	return fmt.Sprintf("[L%d:%d] %s", e.Line, e.Column, e.Message)
}

// NewValidationError は新しいバリデーションエラーを作成します。
func NewValidationError(line, column int, format string, args ...interface{}) *ValidationError {
	return &ValidationError{
		Message: fmt.Sprintf(format, args...),
		Line:    line,
		Column:  column,
	}
}
