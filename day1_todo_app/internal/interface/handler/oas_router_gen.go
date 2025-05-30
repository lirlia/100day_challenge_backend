// Code generated by ogen, DO NOT EDIT.

package handler

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/ogen-go/ogen/uri"
)

func (s *Server) cutPrefix(path string) (string, bool) {
	prefix := s.cfg.Prefix
	if prefix == "" {
		return path, true
	}
	if !strings.HasPrefix(path, prefix) {
		// Prefix doesn't match.
		return "", false
	}
	// Cut prefix from the path.
	return strings.TrimPrefix(path, prefix), true
}

// ServeHTTP serves http request as defined by OpenAPI v3 specification,
// calling handler that matches the path or returning not found error.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	elem := r.URL.Path
	elemIsEscaped := false
	if rawPath := r.URL.RawPath; rawPath != "" {
		if normalized, ok := uri.NormalizeEscapedPath(rawPath); ok {
			elem = normalized
			elemIsEscaped = strings.ContainsRune(elem, '%')
		}
	}

	elem, ok := s.cutPrefix(elem)
	if !ok || len(elem) == 0 {
		s.notFound(w, r)
		return
	}
	args := [1]string{}

	// Static code generated router with unwrapped path search.
	switch {
	default:
		if len(elem) == 0 {
			break
		}
		switch elem[0] {
		case '/': // Prefix: "/"

			if l := len("/"); len(elem) >= l && elem[0:l] == "/" {
				elem = elem[l:]
			} else {
				break
			}

			if len(elem) == 0 {
				break
			}
			switch elem[0] {
			case 's': // Prefix: "session"

				if l := len("session"); len(elem) >= l && elem[0:l] == "session" {
					elem = elem[l:]
				} else {
					break
				}

				if len(elem) == 0 {
					// Leaf node.
					switch r.Method {
					case "POST":
						s.handleSetSessionRequest([0]string{}, elemIsEscaped, w, r)
					default:
						s.notAllowed(w, r, "POST")
					}

					return
				}

			case 't': // Prefix: "todos"

				if l := len("todos"); len(elem) >= l && elem[0:l] == "todos" {
					elem = elem[l:]
				} else {
					break
				}

				if len(elem) == 0 {
					switch r.Method {
					case "GET":
						s.handleGetTodosRequest([0]string{}, elemIsEscaped, w, r)
					case "POST":
						s.handleCreateTodoRequest([0]string{}, elemIsEscaped, w, r)
					default:
						s.notAllowed(w, r, "GET,POST")
					}

					return
				}
				switch elem[0] {
				case '/': // Prefix: "/"

					if l := len("/"); len(elem) >= l && elem[0:l] == "/" {
						elem = elem[l:]
					} else {
						break
					}

					if len(elem) == 0 {
						break
					}
					switch elem[0] {
					case 'a': // Prefix: "archived"
						origElem := elem
						if l := len("archived"); len(elem) >= l && elem[0:l] == "archived" {
							elem = elem[l:]
						} else {
							break
						}

						if len(elem) == 0 {
							// Leaf node.
							switch r.Method {
							case "GET":
								s.handleGetArchivedTodosRequest([0]string{}, elemIsEscaped, w, r)
							default:
								s.notAllowed(w, r, "GET")
							}

							return
						}

						elem = origElem
					case 'o': // Prefix: "order"
						origElem := elem
						if l := len("order"); len(elem) >= l && elem[0:l] == "order" {
							elem = elem[l:]
						} else {
							break
						}

						if len(elem) == 0 {
							// Leaf node.
							switch r.Method {
							case "PATCH":
								s.handleUpdateTodoOrderRequest([0]string{}, elemIsEscaped, w, r)
							default:
								s.notAllowed(w, r, "PATCH")
							}

							return
						}

						elem = origElem
					}
					// Param: "todoId"
					// Match until "/"
					idx := strings.IndexByte(elem, '/')
					if idx < 0 {
						idx = len(elem)
					}
					args[0] = elem[:idx]
					elem = elem[idx:]

					if len(elem) == 0 {
						switch r.Method {
						case "DELETE":
							s.handleArchiveTodoRequest([1]string{
								args[0],
							}, elemIsEscaped, w, r)
						case "PUT":
							s.handleUpdateTodoRequest([1]string{
								args[0],
							}, elemIsEscaped, w, r)
						default:
							s.notAllowed(w, r, "DELETE,PUT")
						}

						return
					}
					switch elem[0] {
					case '/': // Prefix: "/"

						if l := len("/"); len(elem) >= l && elem[0:l] == "/" {
							elem = elem[l:]
						} else {
							break
						}

						if len(elem) == 0 {
							break
						}
						switch elem[0] {
						case 's': // Prefix: "status"

							if l := len("status"); len(elem) >= l && elem[0:l] == "status" {
								elem = elem[l:]
							} else {
								break
							}

							if len(elem) == 0 {
								// Leaf node.
								switch r.Method {
								case "PATCH":
									s.handleUpdateTodoStatusRequest([1]string{
										args[0],
									}, elemIsEscaped, w, r)
								default:
									s.notAllowed(w, r, "PATCH")
								}

								return
							}

						case 'u': // Prefix: "unarchive"

							if l := len("unarchive"); len(elem) >= l && elem[0:l] == "unarchive" {
								elem = elem[l:]
							} else {
								break
							}

							if len(elem) == 0 {
								// Leaf node.
								switch r.Method {
								case "PATCH":
									s.handleUnarchiveTodoRequest([1]string{
										args[0],
									}, elemIsEscaped, w, r)
								default:
									s.notAllowed(w, r, "PATCH")
								}

								return
							}

						}

					}

				}

			case 'u': // Prefix: "users"

				if l := len("users"); len(elem) >= l && elem[0:l] == "users" {
					elem = elem[l:]
				} else {
					break
				}

				if len(elem) == 0 {
					// Leaf node.
					switch r.Method {
					case "GET":
						s.handleGetUsersRequest([0]string{}, elemIsEscaped, w, r)
					default:
						s.notAllowed(w, r, "GET")
					}

					return
				}

			}

		}
	}
	s.notFound(w, r)
}

// Route is route object.
type Route struct {
	name        string
	summary     string
	operationID string
	pathPattern string
	count       int
	args        [1]string
}

// Name returns ogen operation name.
//
// It is guaranteed to be unique and not empty.
func (r Route) Name() string {
	return r.name
}

// Summary returns OpenAPI summary.
func (r Route) Summary() string {
	return r.summary
}

// OperationID returns OpenAPI operationId.
func (r Route) OperationID() string {
	return r.operationID
}

// PathPattern returns OpenAPI path.
func (r Route) PathPattern() string {
	return r.pathPattern
}

// Args returns parsed arguments.
func (r Route) Args() []string {
	return r.args[:r.count]
}

// FindRoute finds Route for given method and path.
//
// Note: this method does not unescape path or handle reserved characters in path properly. Use FindPath instead.
func (s *Server) FindRoute(method, path string) (Route, bool) {
	return s.FindPath(method, &url.URL{Path: path})
}

// FindPath finds Route for given method and URL.
func (s *Server) FindPath(method string, u *url.URL) (r Route, _ bool) {
	var (
		elem = u.Path
		args = r.args
	)
	if rawPath := u.RawPath; rawPath != "" {
		if normalized, ok := uri.NormalizeEscapedPath(rawPath); ok {
			elem = normalized
		}
		defer func() {
			for i, arg := range r.args[:r.count] {
				if unescaped, err := url.PathUnescape(arg); err == nil {
					r.args[i] = unescaped
				}
			}
		}()
	}

	elem, ok := s.cutPrefix(elem)
	if !ok {
		return r, false
	}

	// Static code generated router with unwrapped path search.
	switch {
	default:
		if len(elem) == 0 {
			break
		}
		switch elem[0] {
		case '/': // Prefix: "/"

			if l := len("/"); len(elem) >= l && elem[0:l] == "/" {
				elem = elem[l:]
			} else {
				break
			}

			if len(elem) == 0 {
				break
			}
			switch elem[0] {
			case 's': // Prefix: "session"

				if l := len("session"); len(elem) >= l && elem[0:l] == "session" {
					elem = elem[l:]
				} else {
					break
				}

				if len(elem) == 0 {
					// Leaf node.
					switch method {
					case "POST":
						r.name = SetSessionOperation
						r.summary = "Set current user session"
						r.operationID = "setSession"
						r.pathPattern = "/session"
						r.args = args
						r.count = 0
						return r, true
					default:
						return
					}
				}

			case 't': // Prefix: "todos"

				if l := len("todos"); len(elem) >= l && elem[0:l] == "todos" {
					elem = elem[l:]
				} else {
					break
				}

				if len(elem) == 0 {
					switch method {
					case "GET":
						r.name = GetTodosOperation
						r.summary = "Get list of ToDos for the current user"
						r.operationID = "getTodos"
						r.pathPattern = "/todos"
						r.args = args
						r.count = 0
						return r, true
					case "POST":
						r.name = CreateTodoOperation
						r.summary = "Create a new ToDo"
						r.operationID = "createTodo"
						r.pathPattern = "/todos"
						r.args = args
						r.count = 0
						return r, true
					default:
						return
					}
				}
				switch elem[0] {
				case '/': // Prefix: "/"

					if l := len("/"); len(elem) >= l && elem[0:l] == "/" {
						elem = elem[l:]
					} else {
						break
					}

					if len(elem) == 0 {
						break
					}
					switch elem[0] {
					case 'a': // Prefix: "archived"
						origElem := elem
						if l := len("archived"); len(elem) >= l && elem[0:l] == "archived" {
							elem = elem[l:]
						} else {
							break
						}

						if len(elem) == 0 {
							// Leaf node.
							switch method {
							case "GET":
								r.name = GetArchivedTodosOperation
								r.summary = "Get list of archived ToDos for the current user"
								r.operationID = "getArchivedTodos"
								r.pathPattern = "/todos/archived"
								r.args = args
								r.count = 0
								return r, true
							default:
								return
							}
						}

						elem = origElem
					case 'o': // Prefix: "order"
						origElem := elem
						if l := len("order"); len(elem) >= l && elem[0:l] == "order" {
							elem = elem[l:]
						} else {
							break
						}

						if len(elem) == 0 {
							// Leaf node.
							switch method {
							case "PATCH":
								r.name = UpdateTodoOrderOperation
								r.summary = "Update the sort order of multiple ToDos"
								r.operationID = "updateTodoOrder"
								r.pathPattern = "/todos/order"
								r.args = args
								r.count = 0
								return r, true
							default:
								return
							}
						}

						elem = origElem
					}
					// Param: "todoId"
					// Match until "/"
					idx := strings.IndexByte(elem, '/')
					if idx < 0 {
						idx = len(elem)
					}
					args[0] = elem[:idx]
					elem = elem[idx:]

					if len(elem) == 0 {
						switch method {
						case "DELETE":
							r.name = ArchiveTodoOperation
							r.summary = "Archive a ToDo"
							r.operationID = "archiveTodo"
							r.pathPattern = "/todos/{todoId}"
							r.args = args
							r.count = 1
							return r, true
						case "PUT":
							r.name = UpdateTodoOperation
							r.summary = "Update an existing ToDo"
							r.operationID = "updateTodo"
							r.pathPattern = "/todos/{todoId}"
							r.args = args
							r.count = 1
							return r, true
						default:
							return
						}
					}
					switch elem[0] {
					case '/': // Prefix: "/"

						if l := len("/"); len(elem) >= l && elem[0:l] == "/" {
							elem = elem[l:]
						} else {
							break
						}

						if len(elem) == 0 {
							break
						}
						switch elem[0] {
						case 's': // Prefix: "status"

							if l := len("status"); len(elem) >= l && elem[0:l] == "status" {
								elem = elem[l:]
							} else {
								break
							}

							if len(elem) == 0 {
								// Leaf node.
								switch method {
								case "PATCH":
									r.name = UpdateTodoStatusOperation
									r.summary = "Update the status of a ToDo"
									r.operationID = "updateTodoStatus"
									r.pathPattern = "/todos/{todoId}/status"
									r.args = args
									r.count = 1
									return r, true
								default:
									return
								}
							}

						case 'u': // Prefix: "unarchive"

							if l := len("unarchive"); len(elem) >= l && elem[0:l] == "unarchive" {
								elem = elem[l:]
							} else {
								break
							}

							if len(elem) == 0 {
								// Leaf node.
								switch method {
								case "PATCH":
									r.name = UnarchiveTodoOperation
									r.summary = "Unarchive a ToDo"
									r.operationID = "unarchiveTodo"
									r.pathPattern = "/todos/{todoId}/unarchive"
									r.args = args
									r.count = 1
									return r, true
								default:
									return
								}
							}

						}

					}

				}

			case 'u': // Prefix: "users"

				if l := len("users"); len(elem) >= l && elem[0:l] == "users" {
					elem = elem[l:]
				} else {
					break
				}

				if len(elem) == 0 {
					// Leaf node.
					switch method {
					case "GET":
						r.name = GetUsersOperation
						r.summary = "Get list of users"
						r.operationID = "getUsers"
						r.pathPattern = "/users"
						r.args = args
						r.count = 0
						return r, true
					default:
						return
					}
				}

			}

		}
	}
	return r, false
}
