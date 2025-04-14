package domain

import (
	"fmt"
	"runtime"
)

var (
	ErrNotFound = NewError("not found")
)

type Error struct {
	message string
	stack   []string
}

func NewError(message string) *Error {
	return &Error{
		message: message,
		stack:   getStack(),
	}
}

func (e *Error) Error() string {
	return e.message
}

func (e *Error) Stack() []string {
	return e.stack
}

func getStack() []string {
	var stack []string
	for i := 2; ; i++ {
		pc, file, line, ok := runtime.Caller(i)
		if !ok {
			break
		}
		fn := runtime.FuncForPC(pc)
		stack = append(stack, fmt.Sprintf("%s:%d %s", file, line, fn.Name()))
	}
	return stack
}

func WrapError(err error, message string) error {
	if err == nil {
		return nil
	}
	if e, ok := err.(*Error); ok {
		return &Error{
			message: fmt.Sprintf("%s: %s", message, e.message),
			stack:   e.stack,
		}
	}
	return &Error{
		message: fmt.Sprintf("%s: %s", message, err.Error()),
		stack:   getStack(),
	}
}