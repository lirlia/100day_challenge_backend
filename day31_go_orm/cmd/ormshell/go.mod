module github.com/lirlia/100day_challenge_backend/day31_go_orm/cmd/ormshell

go 1.24.2

replace github.com/lirlia/100day_challenge_backend/day31_go_orm/orm => ../../orm

require (
	github.com/lirlia/100day_challenge_backend/day31_go_orm/orm v0.0.0-00010101000000-000000000000
	github.com/mattn/go-sqlite3 v1.14.28
)

require github.com/stoewer/go-strcase v1.3.0 // indirect
