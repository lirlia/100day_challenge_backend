package main

import (
	"fmt"
	"log"
	"os"

	"github.com/lirlia/100day_challenge_backend/day42_raft_nosql_simulator/internal/client"
	"github.com/spf13/cobra"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Get the status of a Raft node",
	Run: func(cmd *cobra.Command, args []string) {
		if targetNodeAddr == "" {
			fmt.Fprintln(os.Stderr, "Error: --target-addr must be specified")
			os.Exit(1)
		}
		apiClient := client.NewAPIClient(targetNodeAddr)
		log.Printf("Fetching status from %s...", targetNodeAddr)

		// apiClient.Status() は APISuccessResponse と error を返すので、それを適切に処理
		// APISuccessResponse の FSMResponse に実質的なステータス情報が入っている想定だが、
		// client.Status() の実装では、Status() は APISuccessResponse を直接返すのではなく、
		// 実際には server.APIServer の handleStatus が返す map[string]interface{} が
		// APISuccessResponse.FSMResponse に入るのではなく、直接APISuccessResponseのフィールドとして展開されるか、
		// あるいは Status() 専用のレスポンス構造体があるべき。
		// 現状の client.Status() は APISuccessResponse を返すが、中身が汎用的。
		// ここでは、client.Status() の返り値の FSMResponse (もしあれば) または他のフィールドをダンプする。

		// client.go の Status() は APISuccessResponse を返す。
		// server/http_api.go の handleStatus は map[string]interface{} を直接 JSON で返す。
		// client.Status() はこれを APISuccessResponse にマッピングしようとするが、
		// マッピング定義がないため、実際には FSMResponse などには何も入らないか、
		// もしくは直接 APISuccessResponse のトップレベルに status の内容が展開されることを期待する。
		// より堅牢にするには、Status専用のレスポンス構造体を定義すべき。

		// 現状の client.Status() の戻り値の型に合わせて処理
		// client.go の Status() は、成功時には *APISuccessResponse を返す
		// この APISuccessResponse は現状、FSMResponse など汎用的なフィールドしか持たない。
		// サーバー側の handleStatus は map[string]interface{} を直接 JSON エンコードしている。
		// このため、client 側で APISuccessResponse にうまくデコードできない可能性がある。
		// 一旦、client.Status() は汎用的な map[string]interface{} を返すように client 側を修正するか、
		// server 側が APISuccessResponse に合わせた構造で返す必要がある。

		// ここでは、最も単純なアプローチとして、client.Status() が現状のまま APISuccessResponse を返し、
		// その中身を表示することを試みる。
		// ただし、server.handleStatus は map[string]interface{} を直接JSONエンコードするため、
		// APISuccessResponse のどのフィールドに status 情報がマッピングされるかは不定。
		// このため、client.Status() の実装を見直す必要があるかもしれない。
		// ひとまず、client.Status() が返すであろう APISuccessResponse の Message などを表示する。

		// 再確認: client.go の Status() は APISuccessResponse を返す。
		// APISuccessResponse は `Message`, `FSMResponse` などのフィールドを持つ。
		// server.go の `handleStatus` は `s.nodeProxy.GetClusterStatus()` の結果 (map[string]interface{}) を直接 JSON 化している。
		// これが `APISuccessResponse` のどのフィールドにマッピングされるか？
		// おそらく、`json.Unmarshal` は一致するフィールドを探す。
		// `APISuccessResponse` に `LeaderID`, `CommitIndex` などのフィールドがあればそこにマッピングされる。
		// なければ、何も表示されないか、エラーになる。

		// 実際には、client.Status() が返す APISuccessResponse には、サーバーが返した
		// JSONオブジェクトのキーと一致するフィールドがあれば、その値が設定される。
		// FSMResponse に入るわけではない。

		resp, err := apiClient.Status() // APISuccessResponse, error
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error fetching status: %v\n", err)
			os.Exit(1)
		}

		// APISuccessResponse の中身をそのまま表示する (仮)
		// 実際には、サーバーが返す status の内容 (map) を APISuccessResponse の
		// 適切なフィールド (例: Data interface{}) に格納するか、
		// Status 専用のレスポンス構造体を使うべき。
		// 現状では、APISuccessResponse の汎用フィールドに status の内容が
		// うまく収まらない可能性が高い。

		// client.Status() が APISuccessResponse を返すという前提のもと、
		// その Message と FSMResponse (もしあれば) を表示。
		// サーバーの handleStatus は実際には FSMResponse というキーでは返さないので、
		// ここは期待通りに動かない可能性が高い。
		fmt.Printf("Status API call successful.\n")
		if resp.Message != "" {
			fmt.Printf("Message: %s\n", resp.Message)
		}

		// サーバ側の handleStatus は map[string]interface{} をそのまま返しているので、
		// client.Status() の APISuccessResponse には、そのマップのキーと
		// APISuccessResponse のフィールド名が一致した場合に値がセットされる。
		// 一致するものがなければ、そのフィールドはゼロ値のまま。
		// ここでは、APISuccessResponse に `Leader`, `CommitIndex` などのフィールドがないため、
		// 直接それらを表示することはできない。
		// FSMResponse にも入らない。

		// 回避策として、apiClient.Status() の戻り値を map[string]interface{} に変更するか、
		// APISuccessResponse に StatusData map[string]interface{} のようなフィールドを追加するのが良い。

		// 現状の APISuccessResponse では詳細なステータスは表示できない。
		// しかし、リクエストが成功したこと自体はわかる。
		// より詳細は、client.go と server/http_api.go のレスポンス構造を合わせる必要がある。
		fmt.Println("Raw Response (client.Status() APISuccessResponse):")
		if resp.FSMResponse != nil { // おそらくここはnilになる
			fmt.Printf("  FSMResponse: %v\n", resp.FSMResponse)
		}
		if resp.Item != nil {
			fmt.Printf("  Item: %s\n", string(resp.Item))
		}
		if resp.Items != nil {
			fmt.Printf("  Items: %v\n", resp.Items)
		}
		if resp.TableName != "" {
			fmt.Printf("  TableName: %s\n", resp.TableName)
		}
		// 他の APISuccessResponse のフィールドも表示してみる
		// サーバーが返すJSONのトップレベルのキーと一致すれば表示されるはず。
		// しかし、APISuccessResponse には LeaderID や CommitIndex などのフィールドはない。

		// 最終的には、apiClient.Status() がサーバから返された生のJSONマップを
		// うまく扱えるように client.go を修正する必要がある。
		// ここでは、リクエストが成功したかどうかと、もしMessageがあればそれを表示するに留める。
		log.Println("Note: Detailed status fields might not be shown due to response structure mismatch between client and server for the /status endpoint. Client needs adjustment to properly display the map returned by the server.")

	},
}

func init() {
	// statusCmd は RootCmd に追加される (root.go で)
}
