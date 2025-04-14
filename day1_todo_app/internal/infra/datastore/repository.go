package datastore

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"gorm.io/gorm"

	domainModel "github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/domain/model"
	domainRepo "github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/domain/repository"
	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/infra/datastore/model"
	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/infra/datastore/query" // GORM Gen query
	"github.com/m-mizutani/goerr"
)

// todoRepository は domainRepo.TodoRepository の実装です。
type todoRepository struct {
	q      *query.Query // GORM Gen が生成したクエリオブジェクト
	logger *slog.Logger
}

// userRepository は domainRepo.UserRepository の実装です。
type userRepository struct {
	q      *query.Query
	logger *slog.Logger
}

// NewTodoRepository は新しい todoRepository を生成します。
func NewTodoRepository(db *gorm.DB) domainRepo.TodoRepository {
	return &todoRepository{
		q:      query.Use(db), // DB接続からクエリオブジェクトを初期化
		logger: slog.Default().WithGroup("repository.todo"),
	}
}

// NewUserRepository は新しい userRepository を生成します。
func NewUserRepository(db *gorm.DB) domainRepo.UserRepository {
	return &userRepository{
		q:      query.Use(db),
		logger: slog.Default().WithGroup("repository.user"),
	}
}

// --- TodoRepository の実装 ---

// Update は指定された ID と UserID の ToDo を更新します。
func (repo *todoRepository) Update(ctx context.Context, id int64, userID int64, updates map[string]interface{}) error {
	repo.logger.DebugContext(ctx, "updating todo in repository", "id", id, "userID", userID, "updates", updates)

	t := repo.q.Todo
	result, err := repo.q.Todo.WithContext(ctx).Where(t.ID.Eq(id), t.UserID.Eq(userID)).Updates(updates)
	if err != nil {
		repo.logger.ErrorContext(ctx, "failed to execute update query", "error", err, "id", id, "userID", userID)
		return goerr.Wrap(err, "failed to update todo in DB").With("id", id).With("userID", userID)
	}
	if result.RowsAffected == 0 {
		// 更新対象が見つからなかった or 権限がない
		repo.logger.WarnContext(ctx, "todo not found or permission denied for update", "id", id, "userID", userID)
		// エラーを返すか、nil を返すかは要件による。今回はエラーとする。
		// TODO: Not Found エラーと Permission Denied エラーを区別する
		return goerr.New("todo not found or update permission denied").With("id", id).With("userID", userID)
	}
	repo.logger.DebugContext(ctx, "todo updated successfully in repository", "id", id, "userID", userID, "rowsAffected", result.RowsAffected)
	return nil
}

// FindByID は指定されたIDの ToDo を取得します。
func (repo *todoRepository) FindByID(ctx context.Context, id int64) (*domainModel.Todo, error) {
	repo.logger.DebugContext(ctx, "finding todo by id in repository", "id", id)

	t := repo.q.Todo
	result, err := repo.q.Todo.WithContext(ctx).Where(t.ID.Eq(id)).First()
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			repo.logger.InfoContext(ctx, "todo not found in repository", "id", id)
			// Not Found は usecase 層でハンドリングするため、ここでは nil, nil を返すか、専用エラーを返す
			// return nil, domainError.NewNotFoundError("todo not found").With("id", id)
			return nil, nil // or return nil, goerr.Wrap(domainError.ErrNotFound, "todo not found").With("id", id)
		}
		repo.logger.ErrorContext(ctx, "failed to execute find by id query", "error", err, "id", id)
		return nil, goerr.Wrap(err, "failed to find todo by id in DB").With("id", id)
	}
	repo.logger.DebugContext(ctx, "todo found successfully by id in repository", "id", id, "result", result)
	return toDomainTodo(result), nil
}

// Find は指定されたユーザーの ToDo を検索します。
func (repo *todoRepository) Find(ctx context.Context, params domainRepo.FindTodosParams) ([]*domainModel.Todo, error) {
	repo.logger.DebugContext(ctx, "finding todos in repository", "params", params)

	t := repo.q.Todo
	query := repo.q.Todo.WithContext(ctx).Where(t.UserID.Eq(params.UserID))

	// アーカイブ済みを含まない場合、 archived_at IS NULL を条件に追加
	if !params.IncludeArchived {
		query = query.Where(t.ArchivedAt.IsNull())
	}

	// ページネーション
	if params.Limit > 0 {
		query = query.Limit(params.Limit)
	}
	if params.Page > 0 {
		// 1-indexed page to 0-indexed offset
		offset := (params.Page - 1) * params.Limit
		query = query.Offset(offset)
	}

	// ソート順: sort_order 昇順, created_at 降順 (仮)
	// TODO: デフォルトソート順を UseCase/Domain 層で決定できるようにする
	query = query.Order(t.SortOrder.Asc(), t.CreatedAt.Desc())

	results, err := query.Find()
	if err != nil {
		repo.logger.ErrorContext(ctx, "failed to execute find query", "error", err, "params", params)
		return nil, goerr.Wrap(err, "failed to find todos in DB").With("params", params)
	}
	repo.logger.DebugContext(ctx, "found todos successfully in repository", "count", len(results))
	return toDomainTodos(results), nil
}

// Create は新しい ToDo を作成します。
func (repo *todoRepository) Create(ctx context.Context, todo *domainModel.Todo) error {
	repo.logger.DebugContext(ctx, "creating todo in repository", "userID", todo.UserID, "title", todo.Title)

	gormTodo := toGormTodo(todo)
	if gormTodo == nil {
		return goerr.New("cannot create nil todo")
	}

	// GORM Gen の Create を使用
	err := repo.q.Todo.WithContext(ctx).Create(gormTodo)
	if err != nil {
		repo.logger.ErrorContext(ctx, "failed to execute create query", "error", err, "input", gormTodo)
		return goerr.Wrap(err, "failed to create todo in DB")
	}

	// GORM は Create 後、引数のオブジェクトに ID などを設定してくれる
	todo.ID = gormTodo.ID
	// CreatedAt も DB 側で設定された値で更新した方が正確かも (gormTodo.CreatedAt を todo.CreatedAt に反映)
	if gormTodo.CreatedAt != nil {
		todo.CreatedAt = *gormTodo.CreatedAt
	}
	repo.logger.DebugContext(ctx, "todo created successfully in repository", "id", todo.ID)
	return nil
}

// Archive は ToDo をアーカイブします (論理削除)。
func (repo *todoRepository) Archive(ctx context.Context, id int64) error {
	repo.logger.DebugContext(ctx, "archiving todo in repository", "id", id)

	t := repo.q.Todo
	now := time.Now()
	result, err := repo.q.Todo.WithContext(ctx).Where(t.ID.Eq(id), t.ArchivedAt.IsNull()). // まだアーカイブされていないもののみ対象
												Update(t.ArchivedAt, &now) // ArchivedAt に現在時刻を設定
	if err != nil {
		repo.logger.ErrorContext(ctx, "failed to execute archive query", "error", err, "id", id)
		return goerr.Wrap(err, "failed to archive todo in DB").With("id", id)
	}
	if result.RowsAffected == 0 {
		// 更新対象が見つからなかった (存在しない or すでにアーカイブ済み)
		repo.logger.WarnContext(ctx, "todo not found or already archived", "id", id)
		// 冪等性を考慮し、エラーは返さない (usecase 層で確認済みのはず)
		return nil
	}
	repo.logger.DebugContext(ctx, "todo archived successfully in repository", "id", id, "rowsAffected", result.RowsAffected)
	return nil
}

// Unarchive はアーカイブされた ToDo を元に戻します。
func (repo *todoRepository) Unarchive(ctx context.Context, id int64) error {
	repo.logger.DebugContext(ctx, "unarchiving todo in repository", "id", id)

	t := repo.q.Todo
	result, err := repo.q.Todo.WithContext(ctx).Where(t.ID.Eq(id), t.ArchivedAt.IsNotNull()). // アーカイブ済みのもののみ対象
													Update(t.ArchivedAt, nil) // ArchivedAt に NULL を設定
	if err != nil {
		repo.logger.ErrorContext(ctx, "failed to execute unarchive query", "error", err, "id", id)
		return goerr.Wrap(err, "failed to unarchive todo in DB").With("id", id)
	}
	if result.RowsAffected == 0 {
		// 更新対象が見つからなかった (存在しない or アーカイブされていない)
		repo.logger.WarnContext(ctx, "todo not found or not archived", "id", id)
		// 冪等性を考慮し、エラーは返さない (usecase 層で確認済みのはず)
		return nil
	}
	repo.logger.DebugContext(ctx, "todo unarchived successfully in repository", "id", id, "rowsAffected", result.RowsAffected)
	return nil
}

// UpdateSortOrders は複数の ToDo の sort_order を一括で更新します。
func (repo *todoRepository) UpdateSortOrders(ctx context.Context, userID int64, orders []domainRepo.UpdateTodoOrderParams) error {
	repo.logger.DebugContext(ctx, "updating todo sort orders in repository", "userID", userID, "orderCount", len(orders))

	if len(orders) == 0 {
		return nil // 更新対象がない場合は何もしない
	}

	// トランザクション内で実行
	err := repo.q.Transaction(func(tx *query.Query) error {
		t := tx.Todo
		for _, order := range orders {
			// 所有権を確認しつつ更新
			result, err := tx.Todo.WithContext(ctx).Where(t.ID.Eq(order.ID), t.UserID.Eq(userID)).
				Update(t.SortOrder, order.SortOrder)
			if err != nil {
				repo.logger.ErrorContext(ctx, "failed to update sort order in transaction", "error", err, "todoID", order.ID, "userID", userID)
				return goerr.Wrap(err, "failed to update sort order").With("todoID", order.ID)
			}
			if result.RowsAffected == 0 {
				// 更新対象が見つからない or 権限がない -> トランザクションをロールバック
				repo.logger.WarnContext(ctx, "todo not found or permission denied for sort order update", "todoID", order.ID, "userID", userID)
				return goerr.New("todo not found or permission denied for sort order update").With("todoID", order.ID).With("userID", userID)
			}
		}
		return nil // トランザクション成功
	})

	if err != nil {
		// トランザクションエラー
		repo.logger.ErrorContext(ctx, "transaction failed for updating sort orders", "error", err, "userID", userID)
		// エラーはラップされているのでそのまま返す
		return err
	}

	repo.logger.DebugContext(ctx, "todo sort orders updated successfully in repository", "userID", userID, "orderCount", len(orders))
	return nil
}

// --- UserRepository の実装 ---

// FindAll はすべてのユーザーを取得します。
func (repo *userRepository) FindAll(ctx context.Context) ([]*domainModel.User, error) {
	repo.logger.DebugContext(ctx, "finding all users in repository")

	results, err := repo.q.User.WithContext(ctx).Find()
	if err != nil {
		repo.logger.ErrorContext(ctx, "failed to execute find all users query", "error", err)
		return nil, goerr.Wrap(err, "failed to find all users in DB")
	}
	repo.logger.DebugContext(ctx, "found all users successfully in repository", "count", len(results))
	return toDomainUsers(results), nil
}

// FindByID は指定されたIDのユーザーを取得します。
func (repo *userRepository) FindByID(ctx context.Context, id int64) (*domainModel.User, error) {
	repo.logger.DebugContext(ctx, "finding user by id in repository", "id", id)

	u := repo.q.User
	result, err := repo.q.User.WithContext(ctx).Where(u.ID.Eq(id)).First()
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			repo.logger.InfoContext(ctx, "user not found in repository", "id", id)
			// return nil, domainError.NewNotFoundError("user not found").With("id", id)
			return nil, nil // or return nil, goerr.Wrap(domainError.ErrNotFound, "user not found").With("id", id)
		}
		repo.logger.ErrorContext(ctx, "failed to execute find user by id query", "error", err, "id", id)
		return nil, goerr.Wrap(err, "failed to find user by id in DB").With("id", id)
	}
	repo.logger.DebugContext(ctx, "user found successfully by id in repository", "id", id, "result", result)
	return toDomainUser(result), nil
}

// FindByName は指定された名前のユーザーを取得します。
func (repo *userRepository) FindByName(ctx context.Context, name string) (*domainModel.User, error) {
	repo.logger.DebugContext(ctx, "finding user by name in repository", "name", name)

	u := repo.q.User
	result, err := repo.q.User.WithContext(ctx).Where(u.Name.Eq(name)).First()
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			repo.logger.InfoContext(ctx, "user not found by name in repository", "name", name)
			return nil, nil // or return nil, goerr.Wrap(domainError.ErrNotFound, "user not found").With("name", name)
		}
		repo.logger.ErrorContext(ctx, "failed to execute find user by name query", "error", err, "name", name)
		return nil, goerr.Wrap(err, "failed to find user by name in DB").With("name", name)
	}
	repo.logger.DebugContext(ctx, "user found successfully by name in repository", "name", name, "result", result)
	return toDomainUser(result), nil
}

// --- ヘルパー関数 ---

// toDomainTodo は GORM Gen モデルをドメインモデルに変換します。
func toDomainTodo(m *model.Todo) *domainModel.Todo {
	if m == nil {
		return nil
	}
	// Status の変換 (string -> domainModel.TodoStatus)
	// GORM モデルの Status は string 型と想定
	var status domainModel.TodoStatus
	if m.Status != "" { // GORM モデルの Status が空でない場合
		status = domainModel.TodoStatus(m.Status)
		if !status.IsValid() {
			// log or return error?
			slog.Error("invalid status value from DB", "value", m.Status, "todoID", m.ID)
			// 不正な値の場合はデフォルト値を返すか、エラーとする。今回はデフォルト (空) になる。
			status = "" // あるいは特定のエラーステータス
		}
	}

	var description string
	if m.Description != nil {
		description = *m.Description
	}
	var createdAt time.Time
	if m.CreatedAt != nil {
		createdAt = *m.CreatedAt
	}

	return &domainModel.Todo{
		ID:          m.ID,
		UserID:      m.UserID,
		Title:       m.Title,
		Description: description,
		Status:      status, // 変換した Status を設定
		SortOrder:   m.SortOrder,
		CreatedAt:   createdAt,
		ArchivedAt:  m.ArchivedAt,
	}
}

// toGormTodo はドメインモデルを GORM Gen モデルに変換します。
func toGormTodo(d *domainModel.Todo) *model.Todo {
	if d == nil {
		return nil
	}
	// Status の変換 (domainModel.TodoStatus -> string)
	var status string
	if d.Status != "" {
		status = string(d.Status)
	}

	var description *string
	if d.Description != "" {
		desc := d.Description
		description = &desc
	}
	var createdAt *time.Time
	if !d.CreatedAt.IsZero() {
		ct := d.CreatedAt
		createdAt = &ct
	}

	return &model.Todo{
		ID:          d.ID,
		UserID:      d.UserID,
		Title:       d.Title,
		Description: description,
		Status:      status, // 変換した Status (string) を設定
		SortOrder:   d.SortOrder,
		CreatedAt:   createdAt,
		ArchivedAt:  d.ArchivedAt,
	}
}

// toDomainTodos は GORM Gen モデルのスライスをドメインモデルのスライスに変換します。
func toDomainTodos(ms []*model.Todo) []*domainModel.Todo {
	if ms == nil {
		return nil // or return []*domainModel.Todo{}
	}
	ds := make([]*domainModel.Todo, 0, len(ms))
	for _, m := range ms {
		d := toDomainTodo(m)
		if d != nil { // toDomainTodo が nil を返す可能性を考慮
			ds = append(ds, d)
		}
	}
	return ds
}

// toDomainUser は GORM Gen の User モデルをドメインモデルに変換します。
func toDomainUser(m *model.User) *domainModel.User {
	if m == nil {
		return nil
	}
	// Name は string 型なのでポインタチェックは不要
	return &domainModel.User{
		ID:   m.ID,
		Name: m.Name,
	}
}

// toDomainUsers は GORM Gen の User モデルのスライスをドメインモデルのスライスに変換します。
func toDomainUsers(ms []*model.User) []*domainModel.User {
	if ms == nil {
		return nil
	}
	ds := make([]*domainModel.User, 0, len(ms))
	for _, m := range ms {
		d := toDomainUser(m)
		if d != nil {
			ds = append(ds, d)
		}
	}
	return ds
}

// (この後、 toDomainUser, toDomainUsers などを実装)
