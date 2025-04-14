// day1_todo_app/internal/infra/datastore/gen.go
//
//go:generate go run gen.go
package datastore

import (
	"log"

	"gorm.io/driver/mysql"
	"gorm.io/gen"
	"gorm.io/gorm"
)

// GORM Generator の設定と実行

// データベース接続情報 (docker-compose.yml と合わせる)
const dsn = "user:password@tcp(127.0.0.1:3306)/todo_app_db?charset=utf8mb4&parseTime=True&loc=Local"

// 生成するモデルに対応するテーブル名
const (
	UsersTableName = "users"
	TodosTableName = "todos"
)

// カスタムカラム型マッピング (必要に応じて)
// var dataMap = map[string]func(gorm.ColumnType) (dataType string){
// 	// 例: tinyint(1) を bool にマッピング
// 	"tinyint": func(columnType gorm.ColumnType) (dataType string) {
// 		if _, ok := columnType.ColumnType(); ok {
// 			return "bool"
// 		}
// 		return "int32"
// 	},
// }

func GenerateModels() {
	// データベースに接続
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}

	// Generator の設定
	g := gen.NewGenerator(gen.Config{
		OutPath:      "./internal/infra/datastore/query", // 生成されるクエリメソッドの出力先
		ModelPkgPath: "./internal/infra/datastore/model", // 生成されるモデルの出力先

		// WithDefaultQuery と WithQueryInterface は Mode で指定する (古い指定方法だった)
		// WithDefaultQuery: true, // 基本的な CRUD クエリメソッドを生成する
		// WithQueryInterface: true, // クエリ用のインターフェースも生成する

		// FieldNullable enables generating nullable fields pointer type gen.FieldNullable(),
		FieldNullable: true, // NULL許容カラムをポインタ型にする

		// FieldCoverable enables generating coverable fields pointer type gen.FieldCoverable(),
		// FieldSignable enables generating signable fields defined in Minimalist Model Definition gen.FieldSignable(),
		FieldSignable: false, // 符号なし整数型を生成しない

		// FieldWithIndexTag enables generating index tags from database index gen.FieldWithIndexTag(),
		FieldWithIndexTag: true, // DBのインデックス情報から gorm の index タグを生成する

		// FieldWithTypeTag generates fields with given type tag. Like `type:int`
		FieldWithTypeTag: true, // DBの型情報から gorm の type タグを生成する

		Mode: gen.WithQueryInterface | gen.WithDefaultQuery, // Mode = WithDefaultQuery | WithQueryInterface
	})

	// データベース接続を Generator に設定
	g.UseDB(db)

	// カスタムカラム型マッピングを設定 (今回は未使用)
	// g.WithDataTypeMap(dataMap)

	// 生成するモデルを指定
	// テーブル名を指定して全カラムからモデルを生成
	usersModel := g.GenerateModel(UsersTableName)
	todosModel := g.GenerateModel(TodosTableName)

	// (オプション) 特定のカラムだけを選択したり、リレーションを設定したりも可能
	// usersModel := g.GenerateModel("users",
	// 	gen.FieldRelate(field.HasMany, "Todos", todosModel, &field.RelateConfig{
	// 		// RelateSlice: true,
	// 		GORMTag: "foreignKey:UserID",
	// 	}),
	// )

	// すべてのテーブルからモデルを生成 (今回はテーブル指定)
	// g.ApplyBasic(g.GenerateAllTable()...)

	// 指定したモデルを生成対象に追加
	g.ApplyBasic(usersModel, todosModel)

	// コード生成を実行
	g.Execute()

	log.Println("Gorm/Gen model generation completed.")
}
