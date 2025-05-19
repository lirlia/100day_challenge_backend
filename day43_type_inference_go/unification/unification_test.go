package unification

import (
	"reflect"
	"testing"

	"github.com/lirlia/100day_challenge_backend/day43_type_inference_go/types"
)

// Helper to create type variables for tests
var (
	t0    = types.TVar{Name: "t0"}
	t1    = types.TVar{Name: "t1"}
	t2    = types.TVar{Name: "t2"}
	tint  = types.TInt{}
	tbool = types.TBool{}
)

func TestApply(t *testing.T) {
	tests := []struct {
		name     string
		sub      Substitution
		ty       types.Type
		expected types.Type
	}{
		{"Apply to TInt", Substitution{"t0": tint}, tint, tint},
		{"Apply to TBool", Substitution{"t0": tint}, tbool, tbool},
		{"Apply to TVar (hit)", Substitution{"t0": tint}, t0, tint},
		{"Apply to TVar (miss)", Substitution{"t0": tint}, t1, t1},
		{"Apply to TVar (chain)", Substitution{"t0": t1, "t1": tint}, t0, tint},
		{"Apply to TVar (cycle - should be resolved by Apply)", Substitution{"t0": t1, "t1": t0}, t0, t0},
		{
			"Apply to TFunc",
			Substitution{"t0": tint, "t1": tbool},
			types.TFunc{ArgType: t0, ReturnType: t1},
			types.TFunc{ArgType: tint, ReturnType: tbool},
		},
		{
			"Apply to TFunc (nested)",
			Substitution{"t0": tint, "t1": tbool, "t2": t0}, // t2 -> t0 -> int
			types.TFunc{ArgType: t2, ReturnType: types.TFunc{ArgType: t1, ReturnType: t2}},
			types.TFunc{ArgType: tint, ReturnType: types.TFunc{ArgType: tbool, ReturnType: tint}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Apply(tt.sub, tt.ty)
			if !reflect.DeepEqual(got, tt.expected) {
				t.Errorf("Apply(%v, %s) = %s, want %s", tt.sub, tt.ty.String(), got.String(), tt.expected.String())
			}
		})
	}
}

func TestCompose(t *testing.T) {
	tests := []struct {
		name     string
		s1       Substitution
		s2       Substitution
		expected Substitution
	}{
		{
			"s1 empty, s2 empty",
			EmptySubstitution(), EmptySubstitution(), EmptySubstitution(),
		},
		{
			"s1 empty, s2 non-empty",
			EmptySubstitution(), Substitution{"t0": tint}, Substitution{"t0": tint},
		},
		{
			"s1 non-empty, s2 empty",
			Substitution{"t0": tint}, EmptySubstitution(), Substitution{"t0": tint},
		},
		{
			"Simple composition (s1 . s2 where s2 maps to var in s1)",
			Substitution{"t1": tint}, // s1
			Substitution{"t0": t1},   // s2
			Substitution{"t0": tint, "t1": tint},
		},
		{
			"Composition with overlap (s2 value takes precedence, s1 applied to it)",
			Substitution{"t0": tint},  // s1
			Substitution{"t0": tbool}, // s2
			Substitution{"t0": tbool}, // expected: Apply(s1, s2[t0]) = Apply({t0:int}, bool) = bool
		},
		{
			"More complex composition",
			Substitution{"t0": t1, "t1": tint},  // s1
			Substitution{"t2": t0, "t1": tbool}, // s2
			// s2[t2]=t0 => res[t2] = Apply(s1, t0) = Apply({t0:t1,t1:int}, t0) -> Apply({t0:t1,t1:int}, t1) -> int.
			// s2[t1]=tbool => res[t1] = Apply(s1, tbool) = tbool.
			// s1[t0]=t1 (not in s2's domain for keys, but t0 is value in s2). s1[t0] is added.
			// Expected: {t2:tint, t1:tbool, t0:t1}
			Substitution{"t2": tint, "t1": tbool, "t0": t1},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.s1.Compose(tt.s2)
			if !reflect.DeepEqual(got, tt.expected) {
				// For debugging map differences
				expectedMap := make(map[string]string)
				gotMap := make(map[string]string)
				for k, v := range tt.expected {
					expectedMap[k] = v.String()
				}
				for k, v := range got {
					gotMap[k] = v.String()
				}
				t.Errorf("Compose():\ns1 = %v\ns2 = %v\ngot  = %v (map: %v)\nwant = %v (map: %v)", tt.s1, tt.s2, got, gotMap, tt.expected, expectedMap)
			}
		})
	}
}
