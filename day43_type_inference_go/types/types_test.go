package types

import "testing"

func TestTypeString(t *testing.T) {
	// Reset type var counter for predictable TVar names in tests
	nextTypeVarID = 0
	tv0 := NewTypeVar() // t0
	tv1 := NewTypeVar() // t1
	nextTypeVarID = 0   // Reset again for other tests if they use NewTypeVar indirectly

	tests := []struct {
		name     string
		ty       Type
		expected string
	}{
		{"TInt", TInt{}, "int"},
		{"TBool", TBool{}, "bool"},
		{"TVar t0", tv0, "t0"},
		{"TVar t1", tv1, "t1"},
		{"TFunc int -> bool", TFunc{TInt{}, TBool{}}, "int -> bool"},
		{"TFunc (int -> bool) -> int", TFunc{TFunc{TInt{}, TBool{}}, TInt{}}, "(int -> bool) -> int"},
		{"TFunc t0 -> t1", TFunc{tv0, tv1}, "t0 -> t1"},
		{"TFunc (t0 -> t1) -> bool", TFunc{TFunc{tv0, tv1}, TBool{}}, "(t0 -> t1) -> bool"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.ty.String(); got != tt.expected {
				t.Errorf("String() = %q, want %q", got, tt.expected)
			}
		})
	}
}

func TestNewTypeVar(t *testing.T) {
	nextTypeVarID = 0 // Reset for this test
	v0 := NewTypeVar()
	v1 := NewTypeVar()
	v2 := NewTypeVar()

	if v0.Name != "t0" {
		t.Errorf("Expected first TVar to be \"t0\", got %q", v0.Name)
	}
	if v1.Name != "t1" {
		t.Errorf("Expected second TVar to be \"t1\", got %q", v1.Name)
	}
	if v2.Name != "t2" {
		t.Errorf("Expected third TVar to be \"t2\", got %q", v2.Name)
	}
	if v0.Name == v1.Name || v1.Name == v2.Name || v0.Name == v2.Name {
		t.Errorf("Expected unique type variable names, got %q, %q, %q", v0.Name, v1.Name, v2.Name)
	}
}

func TestTSchemeString(t *testing.T) {
	nextTypeVarID = 0 // Reset for this test, though explicit vars are used below

	// It's better to use explicit TVar for clarity in TScheme tests
	varA := TVar{Name: "a"}
	varB := TVar{Name: "b"}

	tests := []struct {
		name     string
		ts       TScheme
		expected string
	}{
		{
			"No quantified vars",
			TScheme{nil, TInt{}},
			"int",
		},
		{
			"One quantified var (a. a -> int)",
			TScheme{[]TVar{varA}, TFunc{varA, TInt{}}},
			"forall a. a -> int",
		},
		{
			"Two quantified vars (a b. (a -> b) -> a)",
			TScheme{[]TVar{varA, varB}, TFunc{TFunc{varA, varB}, varA}},
			"forall a b. (a -> b) -> a",
		},
		{
			"forall a b. (a -> b) -> (a -> b)", // Test case name adjusted
			TScheme{
				QuantifiedVars: []TVar{varA, varB},
				BodyType: TFunc{
					ArgType:    TFunc{varA, varB},
					ReturnType: TFunc{varA, varB},
				},
			},
			"forall a b. (a -> b) -> (a -> b)",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.ts.String(); got != tt.expected {
				t.Errorf("String() = %q, want %q", got, tt.expected)
			}
		})
	}
}
