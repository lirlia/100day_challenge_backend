package main

import (
	"log"

	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/infra/datastore"
)

func main() {
	log.Println("Running Gorm/Gen model generation...")
	// datastore パッケージの GenerateModels 関数を呼び出す
	datastore.GenerateModels()
	log.Println("Model generation finished by cmd/gen.")
}
