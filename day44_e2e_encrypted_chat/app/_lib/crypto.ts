// Helper functions for ArrayBuffer and Base64 conversion
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

export function strToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(str).buffer;
}

export function arrayBufferToStr(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder();
  return decoder.decode(buffer);
}


export const RSA_OAEP_ALGORITHM = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([0x01, 0x00, 0x01]), // 65537
  hash: "SHA-256",
};

export const RSA_PSS_ALGORITHM = {
  name: "RSA-PSS",
  modulusLength: 2048,
  publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
  hash: "SHA-256",
  saltLength: 32, // (modulusLength / 8) - HASH_OUTPUT_SIZE - 2
};

export const AES_GCM_ALGORITHM = {
  name: "AES-GCM",
  length: 256, // Can be 128, 192, or 256
};

export interface UserKeys {
  encryptKeyPair: CryptoKeyPair;
  signKeyPair: CryptoKeyPair;
}

// 鍵ペアを生成 (暗号化用RSA-OAEP と 署名用RSA-PSS)
export async function generateUserKeys(): Promise<UserKeys> {
  const encryptKeyPair = await window.crypto.subtle.generateKey(
    RSA_OAEP_ALGORITHM,
    true, // extractable
    ["encrypt", "decrypt"]
  );

  const signKeyPair = await window.crypto.subtle.generateKey(
    RSA_PSS_ALGORITHM,
    true, // extractable
    ["sign", "verify"]
  );
  return { encryptKeyPair, signKeyPair };
}

// CryptoKeyをエクスポート可能な形式 (SPKI/PKCS8) に変換し、Base64エンコード
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey("spki", key);
  return arrayBufferToBase64(exported);
}

async function exportPrivateKey(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey("pkcs8", key);
  return arrayBufferToBase64(exported);
}

// Base64エンコードされた鍵データをインポート
export async function importPublicKey(base64Key: string, algorithm: RsaHashedKeyGenParams | EcKeyGenParams, usages: KeyUsage[]): Promise<CryptoKey> {
  const arrayBufferKey = base64ToArrayBuffer(base64Key);
  return window.crypto.subtle.importKey(
    "spki",
    arrayBufferKey,
    algorithm,
    true, // extractable (念のためtrueにしておくが、公開鍵の再エクスポートは通常不要)
    usages
  );
}

async function importPrivateKey(base64Key: string, algorithm: RsaHashedKeyGenParams | EcKeyGenParams, usages: KeyUsage[]): Promise<CryptoKey> {
  const arrayBufferKey = base64ToArrayBuffer(base64Key);
  return window.crypto.subtle.importKey(
    "pkcs8",
    arrayBufferKey,
    algorithm,
    true, // extractable
    usages
  );
}


// ユーザーの秘密鍵をlocalStorageに保存
export async function savePrivateKeysToLocalStorage(username: string, keys: UserKeys): Promise<void> {
  const exportedEncryptPriv = await exportPrivateKey(keys.encryptKeyPair.privateKey);
  const exportedSignPriv = await exportPrivateKey(keys.signKeyPair.privateKey);
  localStorage.setItem(`${username}_encryptPrivateKey`, exportedEncryptPriv);
  localStorage.setItem(`${username}_signPrivateKey`, exportedSignPriv);
}

// ユーザーの秘密鍵をlocalStorageから読み込み
export async function loadPrivateKeysFromLocalStorage(username: string): Promise<Partial<UserKeys>> {
  const storedEncryptPriv = localStorage.getItem(`${username}_encryptPrivateKey`);
  const storedSignPriv = localStorage.getItem(`${username}_signPrivateKey`);

  let encryptKeyPair: CryptoKeyPair | undefined;
  let signKeyPair: CryptoKeyPair | undefined;

  if (storedEncryptPriv) {
    const privateKey = await importPrivateKey(storedEncryptPriv, RSA_OAEP_ALGORITHM, ["decrypt"]);
    // Note: We\'d typically get this from a server.
    // For simplicity in this demo, we might not reconstruct the full CryptoKeyPair if only private key operations are needed.
    // Or, we would also store/retrieve public keys if needed for local operations not involving a server.
    // However, for decryption, only private key is needed.
    // To make a full CryptoKeyPair, we would need the public key part.
    // For now, let's assume we only need the private key for decryption.
    // This means the loaded "encryptKeyPair" will only have its .privateKey populated for decryption.
    encryptKeyPair = { privateKey } as CryptoKeyPair;
  }

  if (storedSignPriv) {
    const privateKey = await importPrivateKey(storedSignPriv, RSA_PSS_ALGORITHM, ["sign"]);
    // Similar to encryption, for signing, only private key is needed.
    signKeyPair = { privateKey } as CryptoKeyPair;
  }

  const loadedKeys: Partial<UserKeys> = {};
  if (encryptKeyPair) loadedKeys.encryptKeyPair = encryptKeyPair;
  if (signKeyPair) loadedKeys.signKeyPair = signKeyPair;

  return loadedKeys;
}

// 公開鍵のみをエクスポートする (サーバー保存用)
export async function exportPublicKeys(keys: UserKeys): Promise<{ encryptPubKey: string, signPubKey: string }> {
    const encryptPubKey = await exportPublicKey(keys.encryptKeyPair.publicKey);
    const signPubKey = await exportPublicKey(keys.signKeyPair.publicKey);
    return { encryptPubKey, signPubKey };
}

// 暗号化 (AES-GCM共通鍵 + RSA-OAEP公開鍵暗号)
export async function encryptMessage(
  plaintext: string,
  recipientEncryptPublicKey: CryptoKey
): Promise<{ encryptedSymmetricKey: ArrayBuffer, iv: Uint8Array, encryptedData: ArrayBuffer }> {
  const dataBuffer = strToArrayBuffer(plaintext);

  // 1. Generate a new symmetric key (AES-GCM) for this message
  const symmetricKey = await window.crypto.subtle.generateKey(
    AES_GCM_ALGORITHM,
    true, // extractable
    ["encrypt", "decrypt"]
  );

  // 2. Encrypt the symmetric key with the recipient\'s RSA public key
  const exportedSymmetricKey = await window.crypto.subtle.exportKey("raw", symmetricKey);
  const encryptedSymmetricKey = await window.crypto.subtle.encrypt(
    RSA_OAEP_ALGORITHM,
    recipientEncryptPublicKey,
    exportedSymmetricKey
  );

  // 3. Encrypt the actual message data with the symmetric key (AES-GCM)
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // Recommended IV size for AES-GCM is 12 bytes
  const encryptedData = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    symmetricKey,
    dataBuffer
  );

  return { encryptedSymmetricKey, iv, encryptedData };
}

// 復号
export async function decryptMessage(
  encryptedSymmetricKey: ArrayBuffer,
  iv: Uint8Array,
  encryptedData: ArrayBuffer,
  myEncryptPrivateKey: CryptoKey
): Promise<string> {
  // 1. Decrypt the symmetric key with a private RSA key
  const decryptedSymmetricKeyBuffer = await window.crypto.subtle.decrypt(
    RSA_OAEP_ALGORITHM,
    myEncryptPrivateKey,
    encryptedSymmetricKey
  );

  // 2. Import the decrypted symmetric key
  const symmetricKey = await window.crypto.subtle.importKey(
    "raw",
    decryptedSymmetricKeyBuffer,
    AES_GCM_ALGORITHM,
    false, // not extractable
    ["decrypt"]
  );

  // 3. Decrypt the message data with the symmetric key
  const decryptedDataBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    symmetricKey,
    encryptedData
  );

  return arrayBufferToStr(decryptedDataBuffer);
}

// 署名
export async function signData(data: ArrayBuffer, signingPrivateKey: CryptoKey): Promise<ArrayBuffer> {
  return window.crypto.subtle.sign(
    RSA_PSS_ALGORITHM,
    signingPrivateKey,
    data
  );
}

// 署名検証
export async function verifySignature(
  signature: ArrayBuffer,
  data: ArrayBuffer,
  senderSigningPublicKey: CryptoKey
): Promise<boolean> {
  return window.crypto.subtle.verify(
    RSA_PSS_ALGORITHM,
    senderSigningPublicKey,
    signature,
    data
  );
}

// 複合データ (暗号化された共通鍵 + 暗号化メッセージ + IV) のハッシュ値に署名するための準備
// 署名はメッセージ全体に対して行うのが一般的だが、ここでは構成要素を結合して署名対象とする
export function prepareDataForSigning(
    encryptedSymmetricKey: ArrayBuffer,
    iv: Uint8Array,
    encryptedData: ArrayBuffer
): ArrayBuffer {
    const keyBufferView = new Uint8Array(encryptedSymmetricKey);
    const dataBufferView = new Uint8Array(encryptedData);

    const combined = new Uint8Array(keyBufferView.length + iv.length + dataBufferView.length);
    combined.set(keyBufferView, 0);
    combined.set(iv, keyBufferView.length);
    combined.set(dataBufferView, keyBufferView.length + iv.length);

    return combined.slice().buffer;
}
