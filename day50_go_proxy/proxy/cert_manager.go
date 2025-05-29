package proxy

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"log"
	"math/big"
	"net"
	"os"
	"sync"
	"time"
// 	"crypto" // crypto パッケージは直接型としては使わない
)

// CertManager は証明書の生成とキャッシュを管理します。
type CertManager struct {
	caCert       *x509.Certificate
	caKey        any // crypto.PrivateKey から any に変更 (crypto.Signer や rsa.PrivateKey など具体的な型が underlying)
	certCache    map[string]*tls.Certificate
	cacheMutex   sync.Mutex
	certValidity time.Duration
}

// NewCertManager は新しい CertManager を初期化して返します。
// caCertPath と caKeyPath は、PEMエンコードされたCA証明書と秘密鍵ファイルへのパスです。
func NewCertManager(caCertPath, caKeyPath string) (*CertManager, error) {
	caCertPEM, err := os.ReadFile(caCertPath)
	if err != nil {
		return nil, fmt.Errorf("CA証明書ファイル %s の読み込みに失敗しました: %w", caCertPath, err)
	}
	caKeyPEM, err := os.ReadFile(caKeyPath)
	if err != nil {
		return nil, fmt.Errorf("CA秘密鍵ファイル %s の読み込みに失敗しました: %w", caKeyPath, err)
	}

	caCertBlock, _ := pem.Decode(caCertPEM)
	if caCertBlock == nil || caCertBlock.Type != "CERTIFICATE" {
		return nil, fmt.Errorf("CA証明書ファイル %s のデコードに失敗しました", caCertPath)
	}
	parsedCaCert, err := x509.ParseCertificate(caCertBlock.Bytes)
	if err != nil {
		return nil, fmt.Errorf("CA証明書 %s のパースに失敗しました: %w", caCertPath, err)
	}

	caKeyBlock, _ := pem.Decode(caKeyPEM)
	if caKeyBlock == nil {
		return nil, fmt.Errorf("CA秘密鍵ファイル %s のデコードに失敗しました (ブロックが見つかりません)", caKeyPath)
	}

	var parsedCaKey any // crypto.PrivateKey から any に変更
	if caKeyBlock.Type == "PRIVATE KEY" { // PKCS#8 (一般的な形式)
		parsedCaKey, err = x509.ParsePKCS8PrivateKey(caKeyBlock.Bytes)
	} else if caKeyBlock.Type == "RSA PRIVATE KEY" { // PKCS#1 (RSA専用の古い形式)
		parsedCaKey, err = x509.ParsePKCS1PrivateKey(caKeyBlock.Bytes)
	} else {
		return nil, fmt.Errorf("サポートされていないCA秘密鍵のタイプです: %s (期待: PRIVATE KEY or RSA PRIVATE KEY)", caKeyBlock.Type)
	}
	if err != nil {
		return nil, fmt.Errorf("CA秘密鍵 %s のパースに失敗しました: %w", caKeyPath, err)
	}

	return &CertManager{
		caCert:       parsedCaCert,
		caKey:        parsedCaKey,
		certCache:    make(map[string]*tls.Certificate),
		certValidity: 365 * 24 * time.Hour, // 証明書の有効期間: 1年
	}, nil
}

// GetCertificate は指定されたホスト名に対するTLS証明書を返します。
// キャッシュに存在すればそれを返し、なければ新しく生成・署名してキャッシュに保存します。
func (cm *CertManager) GetCertificate(hello *tls.ClientHelloInfo) (*tls.Certificate, error) {
	hostname := hello.ServerName
	if hostname == "" {
		// SNIが提供されていない場合、デフォルトの証明書を返すかエラーとする
		// ここではエラーとするか、固定の証明書を返すか、実装方針による
		// return nil, fmt.Errorf("クライアントからのSNI (Server Name Indication) がありません")
		// SNIがない場合、IPアドレスで試みる (もしhello.Connがnet.Connなら)
		if conn := hello.Conn; conn != nil {
			remoteAddr := conn.RemoteAddr().String()
			host, _, err := net.SplitHostPort(remoteAddr)
			if err == nil && host != "" {
				// log.Printf("[CertManager] SNIが見つかりません。リモートIP %s をホスト名として使用します。", host)
				// hostname = host // IPアドレスをホスト名として使用するのは一般的ではないため注意
			}
		}
		// それでもホスト名がなければエラー
		if hostname == "" {
			log.Printf("[CertManager] 警告: SNIが提供されていません。クライアントIP: %s", hello.Conn.RemoteAddr().String())
			// localhost やダミーの証明書を返すことも検討できるが、ここではエラーとする
			 return nil, fmt.Errorf("SNI (Server Name Indication) がクライアントから提供されていません。証明書を発行できません。")
		}
	}


	cm.cacheMutex.Lock()
	cachedCert, found := cm.certCache[hostname]
	cm.cacheMutex.Unlock()

	if found {
		// キャッシュされた証明書の有効期限をチェック (オプション)
		// x509Cert, err := x509.ParseCertificate(cachedCert.Certificate[0])
		// if err == nil && time.Now().Before(x509Cert.NotAfter.Add(-1*time.Hour)) { // 有効期限の1時間前までOKなど
		//    log.Printf("[CertManager] ホスト %s の証明書をキャッシュから提供します。", hostname)
		//	  return cachedCert, nil
		// }
		// log.Printf("[CertManager] ホスト %s のキャッシュされた証明書は期限切れまたは無効です。", hostname)
		// キャッシュから削除する処理を追加してもよい
		log.Printf("[CertManager] ホスト %s の証明書をキャッシュから提供します。", hostname)
		return cachedCert, nil
	}

	log.Printf("[CertManager] ホスト %s の証明書を新規に生成します...", hostname)
	newCert, err := cm.generateAndSignCert(hostname)
	if err != nil {
		return nil, fmt.Errorf("ホスト %s の証明書生成に失敗しました: %w", hostname, err)
	}

	cm.cacheMutex.Lock()
	cm.certCache[hostname] = newCert
	cm.cacheMutex.Unlock()
	log.Printf("[CertManager] ホスト %s の証明書をキャッシュに保存しました。", hostname)

	return newCert, nil
}

func (cm *CertManager) generateAndSignCert(hostname string) (*tls.Certificate, error) {
	privKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, fmt.Errorf("サーバー証明書用の秘密鍵生成に失敗しました: %w", err)
	}

	serialNumberLimit := new(big.Int).Lsh(big.NewInt(1), 128)
	serialNumber, err := rand.Int(rand.Reader, serialNumberLimit)
	if err != nil {
		return nil, fmt.Errorf("シリアル番号の生成に失敗しました: %w", err)
	}

	notBefore := time.Now()
	notAfter := notBefore.Add(cm.certValidity)

	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			Organization: []string{"My Proxy Self-Signed Cert"},
			CommonName:   hostname, // CN にホスト名を設定
		},
		NotBefore: notBefore,
		NotAfter:  notAfter,

		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}

	// ホスト名がIPアドレスかドメイン名かでSANsを設定
	if ip := net.ParseIP(hostname); ip != nil {
		template.IPAddresses = []net.IP{ip}
	} else {
		template.DNSNames = []string{hostname}
	}

	// 証明書をCAで署名
	derBytes, err := x509.CreateCertificate(rand.Reader, &template, cm.caCert, &privKey.PublicKey, cm.caKey)
	if err != nil {
		return nil, fmt.Errorf("証明書の署名に失敗しました: %w", err)
	}

	// tls.Certificate 構造体を作成
	cert := &tls.Certificate{
		Certificate: [][]byte{derBytes},
		PrivateKey:  privKey,
		Leaf:        &template, // Leaf を設定すると tls ライブラリがパースする手間を省ける場合がある
	}
	// Leaf の再パースを試みる (より確実にするため)
	leaf, err := x509.ParseCertificate(derBytes)
	if err == nil {
		cert.Leaf = leaf
	}


	return cert, nil
}

// (オプション) キャッシュをクリアする関数や、有効期限切れのキャッシュを掃除するバックグラウンド処理など
