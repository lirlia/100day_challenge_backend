package jwks

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"os"

	"github.com/google/uuid"
)

// JWK (JSON Web Key) structure for public key
type JWK struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Use string `json:"use"`
	Alg string `json:"alg"`
	N   string `json:"n"`
	E   string `json:"e"`
}

// JWKS (JSON Web Key Set) structure
type JWKS struct {
	Keys []JWK `json:"keys"`
}

var (
	privateKey *rsa.PrivateKey
	publicKey  *rsa.PublicKey
	jwks       JWKS
	keyID      string
)

// LoadKeys loads RSA private and public keys from PEM files.
func LoadKeys(privateKeyPath string) error {
	privPem, err := os.ReadFile(privateKeyPath)
	if err != nil {
		return fmt.Errorf("failed to read private key file: %w", err)
	}

	privBlock, _ := pem.Decode(privPem)
	if privBlock == nil || privBlock.Type != "PRIVATE KEY" {
		// Try decoding as RSA PRIVATE KEY for older formats
		privBlock, _ = pem.Decode(privPem)
		if privBlock == nil || privBlock.Type != "RSA PRIVATE KEY" {
			return fmt.Errorf("failed to decode PEM block containing private key")
		}
		pk, err := x509.ParsePKCS1PrivateKey(privBlock.Bytes)
		if err != nil {
			return fmt.Errorf("failed to parse PKCS1 private key: %w", err)
		}
		privateKey = pk
	} else {
		// Try PKCS8
		pk, err := x509.ParsePKCS8PrivateKey(privBlock.Bytes)
		if err != nil {
			return fmt.Errorf("failed to parse PKCS8 private key: %w", err)
		}
		rsaPrivKey, ok := pk.(*rsa.PrivateKey)
		if !ok {
			return fmt.Errorf("private key is not an RSA key")
		}
		privateKey = rsaPrivKey
	}

	publicKey = &privateKey.PublicKey
	keyID = generateKeyID(publicKey) // Generate a stable Key ID

	// Generate JWKS
	jwk := JWK{
		Kty: "RSA",
		Kid: keyID,
		Use: "sig", // Signature
		Alg: "RS256",
		N:   base64URLEncode(publicKey.N.Bytes()),
		E:   base64URLEncode(bigIntToBytes(publicKey.E)),
	}
	jwks = JWKS{Keys: []JWK{jwk}}

	return nil
}

// GetPrivateKey returns the loaded private key.
func GetPrivateKey() *rsa.PrivateKey {
	return privateKey
}

// GetPublicKey returns the loaded public key.
func GetPublicKey() *rsa.PublicKey {
	return publicKey
}

// GetKeyID returns the generated key ID.
func GetKeyID() string {
	return keyID
}

// Handler returns an HTTP handler that serves the JWKS.
func Handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=3600") // Cache for 1 hour
	if err := json.NewEncoder(w).Encode(jwks); err != nil {
		// Log error
		http.Error(w, "Failed to encode JWKS", http.StatusInternalServerError)
	}
}

// --- Helper functions ---

func generateKeyID(pub *rsa.PublicKey) string {
	// A simple way to generate a somewhat stable key ID (could use thumbprint)
	// For simplicity, use a fixed UUID or a hash of the public key modulus
	// Here, we use a fixed UUID for simplicity in this example.
	// In production, consider using RFC 7638 JWK Thumbprint.
	// For now, let's use a simple fixed ID.
	// Or generate one based on the key material if needed to be stable
	// return fmt.Sprintf("%x", sha256.Sum256(pub.N.Bytes()))[:16]
	return uuid.NewString()[:8] // Simple unique ID for this run
}

func base64URLEncode(data []byte) string {
	// Use standard library's Base64 URL encoding without padding
	return base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(data)
}

func bigIntToBytes(i int) []byte {
	b := make([]byte, 4)
	b[0] = byte(i >> 24)
	b[1] = byte(i >> 16)
	b[2] = byte(i >> 8)
	b[3] = byte(i)
	// Remove leading zeros
	for len(b) > 1 && b[0] == 0 {
		b = b[1:]
	}
	return b
}
