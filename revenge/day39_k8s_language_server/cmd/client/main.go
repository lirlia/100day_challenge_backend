package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"time"
)

func send(stdin io.Writer, msg map[string]interface{}) {
	data, _ := json.Marshal(msg)
	header := fmt.Sprintf("Content-Length: %d\r\n\r\n", len(data))
	stdin.Write([]byte(header))
	stdin.Write(data)
}

func read(stdout io.Reader) {
	reader := bufio.NewReader(stdout)
	for {
		header := ""
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				return
			}
			if line == "\r\n" {
				break
			}
			header += line
		}

		var length int
		fmt.Sscanf(header, "Content-Length: %d", &length)
		body := make([]byte, length)
		io.ReadFull(reader, body)
		fmt.Println("[RECV]", string(body))
	}
}

func main() {
	cmd := exec.Command("go", "run", "./cmd/kls/main.go")
	stdin, _ := cmd.StdinPipe()
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()
	cmd.Start()

	go read(stdout)
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			fmt.Println("[STDOUT]", scanner.Text())
		}
	}()

	time.Sleep(500 * time.Millisecond)

	send(stdin, map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "initialize",
		"params": map[string]interface{}{
			"processId":    nil,
			"rootUri":      nil,
			"capabilities": map[string]interface{}{},
		},
	})

	time.Sleep(300 * time.Millisecond)

	send(stdin, map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "initialized",
		"params":  map[string]interface{}{},
	})

	time.Sleep(300 * time.Millisecond)

	yaml := strings.TrimSpace(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: my-container

`)

	send(stdin, map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "textDocument/didOpen",
		"params": map[string]interface{}{
			"textDocument": map[string]interface{}{
				"uri":        "file://deployment.yaml",
				"languageId": "yaml",
				"version":    1,
				"text":       yaml,
			},
		},
	})

	time.Sleep(3 * time.Second)
}
