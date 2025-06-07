package services

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"database/sql"
	"encoding/base64"
	"encoding/pem"
	"log"

	"github.com/google/uuid"
	"github.com/lirlia/100day_challenge_backend/day59_oauth_provider/internal/database"
)

// KeyPair represents an RSA key pair
type KeyPair struct {
	ID         string `json:"id"`
	PrivateKey string `json:"private_key"`
	PublicKey  string `json:"public_key"`
	Kid        string `json:"kid"` // Key ID
	Algorithm  string `json:"algorithm"`
	IsActive   bool   `json:"is_active"`
}

// JWK represents a JSON Web Key
type JWK struct {
	Kty string `json:"kty"`
	Use string `json:"use"`
	Kid string `json:"kid"`
	N   string `json:"n"`
	E   string `json:"e"`
}

// JWKS represents a JSON Web Key Set
type JWKS struct {
	Keys []JWK `json:"keys"`
}

var (
	currentKeyPair *KeyPair
	rsaPrivateKey  *rsa.PrivateKey
	rsaPublicKey   *rsa.PublicKey
)

// InitializeKeys initializes RSA key pairs for JWT signing
func InitializeKeys() error {
	// 既存のアクティブな鍵を確認
	keyPair, err := getActiveKeyPair()
	if err != nil && err != sql.ErrNoRows {
		return err
	}

	if keyPair == nil {
		// 鍵が存在しない場合は新しく生成
		log.Println("Generating new RSA key pair...")
		keyPair, err = generateAndSaveKeyPair()
		if err != nil {
			return err
		}
	}

	// メモリ上でRSA鍵を読み込み
	err = loadKeyPairIntoMemory(keyPair)
	if err != nil {
		return err
	}

	currentKeyPair = keyPair
	log.Printf("RSA key pair loaded successfully (Kid: %s)", keyPair.Kid)
	return nil
}

// generateAndSaveKeyPair generates a new RSA key pair and saves it to database
func generateAndSaveKeyPair() (*KeyPair, error) {
	// RSA鍵ペア生成（2048bit）
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, err
	}

	// 秘密鍵をPEM形式に変換
	privateKeyPEM := &pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(privateKey),
	}
	privateKeyBytes := pem.EncodeToMemory(privateKeyPEM)

	// 公開鍵をPEM形式に変換
	publicKeyDER, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	if err != nil {
		return nil, err
	}
	publicKeyPEM := &pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: publicKeyDER,
	}
	publicKeyBytes := pem.EncodeToMemory(publicKeyPEM)

	// データベースに保存
	keyPair := &KeyPair{
		ID:         uuid.New().String(),
		PrivateKey: string(privateKeyBytes),
		PublicKey:  string(publicKeyBytes),
		Kid:        uuid.New().String(),
		Algorithm:  "RS256",
		IsActive:   true,
	}

	query := `INSERT INTO key_pairs (id, private_key, public_key, kid, algorithm, is_active)
			  VALUES (?, ?, ?, ?, ?, ?)`

	_, err = database.DB.Exec(query, keyPair.ID, keyPair.PrivateKey, keyPair.PublicKey,
		keyPair.Kid, keyPair.Algorithm, keyPair.IsActive)
	if err != nil {
		return nil, err
	}

	return keyPair, nil
}

// getActiveKeyPair retrieves the active key pair from database
func getActiveKeyPair() (*KeyPair, error) {
	query := `SELECT id, private_key, public_key, kid, algorithm, is_active
			  FROM key_pairs WHERE is_active = true LIMIT 1`

	var keyPair KeyPair
	err := database.DB.QueryRow(query).Scan(
		&keyPair.ID, &keyPair.PrivateKey, &keyPair.PublicKey,
		&keyPair.Kid, &keyPair.Algorithm, &keyPair.IsActive,
	)
	if err != nil {
		return nil, err
	}

	return &keyPair, nil
}

// loadKeyPairIntoMemory loads the key pair into memory for signing/verification
func loadKeyPairIntoMemory(keyPair *KeyPair) error {
	// 秘密鍵を読み込み
	privateKeyBlock, _ := pem.Decode([]byte(keyPair.PrivateKey))
	if privateKeyBlock == nil {
		return nil
	}

	privateKey, err := x509.ParsePKCS1PrivateKey(privateKeyBlock.Bytes)
	if err != nil {
		return err
	}

	// 公開鍵を読み込み
	publicKeyBlock, _ := pem.Decode([]byte(keyPair.PublicKey))
	if publicKeyBlock == nil {
		return nil
	}

	publicKeyInterface, err := x509.ParsePKIXPublicKey(publicKeyBlock.Bytes)
	if err != nil {
		return err
	}

	publicKey, ok := publicKeyInterface.(*rsa.PublicKey)
	if !ok {
		return nil
	}

	rsaPrivateKey = privateKey
	rsaPublicKey = publicKey

	return nil
}

// GetCurrentKeyPair returns the current active key pair
func GetCurrentKeyPair() *KeyPair {
	return currentKeyPair
}

// GetPrivateKey returns the current RSA private key
func GetPrivateKey() *rsa.PrivateKey {
	return rsaPrivateKey
}

// GetPublicKey returns the current RSA public key
func GetPublicKey() *rsa.PublicKey {
	return rsaPublicKey
}

// GetJWKS returns the JSON Web Key Set for the /.well-known/jwks.json endpoint
func GetJWKS() (*JWKS, error) {
	if currentKeyPair == nil {
		return nil, nil
	}

	// RSA公開鍵からJWKを生成
	n := rsaPublicKey.N.Bytes()
	e := make([]byte, 4)
	e[0] = byte(rsaPublicKey.E >> 24)
	e[1] = byte(rsaPublicKey.E >> 16)
	e[2] = byte(rsaPublicKey.E >> 8)
	e[3] = byte(rsaPublicKey.E)

	// Base64 URL エンコード（パディングなし）
	nBase64 := base64URLEncode(n)
	eBase64 := base64URLEncode(e)

	jwk := JWK{
		Kty: "RSA",
		Use: "sig",
		Kid: currentKeyPair.Kid,
		N:   nBase64,
		E:   eBase64,
	}

	jwks := &JWKS{
		Keys: []JWK{jwk},
	}

	return jwks, nil
}

// base64URLEncode encodes bytes to base64 URL encoding without padding
func base64URLEncode(data []byte) string {
	return base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(data)
}
