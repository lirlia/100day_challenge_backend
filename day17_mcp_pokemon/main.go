package main

import (
	"context"
	"fmt"
	"strings"
	"sync"

	pokego "github.com/JoshGuarino/PokeGo/pkg"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func main() {
	// Create a new MCP server
	s := server.NewMCPServer(
		"Pokemon Demo",
		"1.0.0",
		server.WithResourceCapabilities(true, true),
		server.WithLogging(),
		server.WithRecovery(),
	)
	client := pokego.NewClient()

	pokemonList, err := client.Pokemon.GetPokemonSpeciesList(150, 0)
	if err != nil {
		fmt.Printf("Error fetching Pokémon list: %v\n", err)
		return
	}

	pokemons := []string{}
	mu := sync.Mutex{}
	wg := &sync.WaitGroup{}

	wg.Add(len(pokemonList.Results))
	for _, pokemon := range pokemonList.Results {
		go func(pokemonName string) {
			species, err := client.Pokemon.GetPokemonSpecies(pokemonName)
			if err != nil {
				wg.Done()
				return
			}
			jaName := ""
			for _, n := range species.Names {
				if n.Language.Name == "ja" || n.Language.Name == "ja-Hrkt" {
					jaName = n.Name
					break
				}
			}
			if jaName == "" {
				jaName = pokemonName // fallback to English name
			}
			mu.Lock()
			pokemons = append(pokemons, jaName)
			mu.Unlock()
			wg.Done()
		}(pokemon.Name)
	}
	wg.Wait()

	pokemonTool := mcp.NewTool("pokemon",
		mcp.WithDescription("return pokemon"),
		mcp.WithString("pokemon name",
			mcp.Required(),
			mcp.Description("Name of the Pokémon"),
		),
	)

	// Add the calculator handler
	s.AddTool(pokemonTool, func(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		name := request.Params.Arguments["pokemon name"].(string)

		result := []string{}
		for _, pokemon := range pokemons {
			// 一部でも含んでいたら返す
			if strings.Contains(pokemon, name) {
				result = append(result, pokemon)
			}
		}

		return mcp.NewToolResultText(strings.Join(result, "\n")), nil
	})

	// Start the server
	if err := server.ServeStdio(s); err != nil {
		fmt.Printf("Server error: %v\n", err)
	}
}
