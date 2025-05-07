package benchmark

import (
	"testing"
)

// ExampleBenchmark はベンチマークテストの例です。
// 実際のテストでは、計測したい処理を b.N 回繰り返します。
func BenchmarkExample(b *testing.B) {
	for i := 0; i < b.N; i++ {
		// ここに計測対象の処理を記述
	}
}
