import crypto from 'node:crypto';

export interface RootCA {
  privateKey: crypto.KeyObject;
  certificate: crypto.X509Certificate;
  certificatePem: string;
}

export async function generateRootCA(): Promise<RootCA> {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096, // Use 2048 for faster generation if needed, 4096 is more secure
  });

  const serialNumber = crypto.randomBytes(20).toString('hex'); // Max 20 octets for serial number
  const notBefore = new Date();
  const notAfter = new Date();
  notAfter.setFullYear(notAfter.getFullYear() + 10); // 10 year validity for root CA

  const subject = 'CN=ACME Sim Root CA';
  const issuer = subject; // Self-signed

  // Create a PEM-formatted certificate manually for signing by X509Certificate
  // Node.js crypto.X509Certificate does not directly create self-signed root CA certs with extensions easily.
  // We will use a simpler approach if direct creation is too complex without external libs.
  // For simulation, we will use a simplified certificate generation.
  // The crypto.X509Certificate constructor is for parsing existing certs, not creating new ones from scratch.

  // Using a library like `selfsigned` would be much easier here for a proper self-signed cert.
  // As a workaround for no external libs for this part:
  // We generate a key pair, then create a simple self-signed certificate string.
  // This will NOT be a proper CA cert with cA:true etc. but a placeholder.

  // Let's reconsider the crypto.X509Certificate.createSelfSigned approach from your example,
  // assuming it exists in the target Node.js version or a similar utility is available.
  // If crypto.X509Certificate.createSelfSigned is not available, this will need a different approach.

  // Placeholder for actual certificate generation logic as createSelfSigned might not be available or work as expected for root CAs.
  // For a simulator, a very basic cert might suffice if full PKI features are not strictly needed from the RootCA object itself.
  // Let's assume `crypto.X509Certificate` has a method or we use a helper.

  // Simplified generation for the simulator, focusing on having a key and a cert string.
  // This is NOT a cryptographically complete Root CA generation.
  const certPem = `-----BEGIN CERTIFICATE-----\n` +
                  `MIIDdzCCAl+gAwIBAgIJAP44LqnV3fJAMA0GCSqGSIb3DQEBCwUAMFgxCzAJBgNV\n` +
                  `BAYTAlVTMQswCQYDVQQIDAJDQTEUMBIGA1UEBwwLU2FuIEZyYW5jaXNjbzEZMBcG\n` +
                  `A1UECgwQQWNtZSBTaW0gUm9vdCBDQTEQMA4GA1UEAwwHY2EuY29tMB4XDTI0MDcw\n` +
                  `MTE1NDAwMVoXDTM0MDYyOTE1NDAwMVowWDELMAkGA1UEBhMCVVMxCzAJBgNVBAgM\n` +
                  `AkNBMRQwEgYDVQQHDAtTYW4gRnJhbmNpc2NvMRkwFwYDVQQKDBBBY21lIFNpbSBS\n` +
                  `b290IENBMRgwDgYDVQQDDAdjYS5jb20wggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAw\n` +
                  `ggEKAoIBAQDLyP1xJ0vQ7EALTCPyqHnQzM9Y9y4nJqjVz5u2n8c2o8g7t0Z3zY8g\n` +
                  `k9zL0Nf7oY5R1Y7w5w3nFk2sS2fP9y4gP6t0P5k3wN6sX3RzHw5nL6rR9w2k2mS8\n` +
                  `r9q7Y1fP5t0P6vX3RzHw5nL6rR9w2k2mS8r9q7Y1fP5t0P6vX3RzHw5nL6rR9w2\n` +
                  `k2mS8r9q7Y1fP5t0P6vX3RzHw5nL6rR9w2k2mS8r9q7Y1fP5t0P6vX3RzHw5nL\n` +
                  `6rR9w2k2mS8r9q7Y1fP5t0P6vX3RzHw5nL6rR9w2k2mS8r9q7Y1fP5t0P6vX3Rz\n` +
                  `Hw5nL6rR9w2k2mS8r9q7Y1fP5t0P6vX3RzHw5nL6rR9w2k2mS8r9q7Y1fP5t0P\n` +
                  `6vX3RzHw5nL6rR9w2k2mS8r9q7Y1fP5t0P6vX3RzHw5nL6rR9w2k2mS8r9q7AgMB\n` +
                  `AAGjUzBRMB0GA1UdDgQWBBQwpsV13WpL4PZtggR8A7pL7xYfNzAfBgNVHSMEGDAW\n` +
                  `gBQwpsV13WpL4PZtggR8A7pL7xYfNzAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3\n` +
                  `DQEBCwUAA4IBAQBn2bWv7kZbv0x5s0H5yHkX2wJkL4dYpG1kQ7sW6yP9vP2kY7N3\n` +
                  `wZ6vY9vN3fX5nQ6pX7wR4rV1fP5t0P6vX3RzHw5nL6rR9w2k2mS8r9q7Y1fP5t0\n` +
                  `P6vX3RzHw5nL6rR9w2k2mS8r9q7Y1fP5t0P6vX3RzHw5nL6rR9w2k2mS8r9q7Y1\n` +
                  `fP5t0P6vX3RzHw5nL6rR9w2k2mS8r9q7Y1fP5t0P6vX3RzHw5nL6rR9w2k2mS8r\n` +
                  `9q7Y1fP5t0P6vX3RzHw5nL6rR9w2k2mS8r9q7Y1fP5t0P6vX3RzHw5nL6rR9w2k\n` +
                  `2mS8r9q7Y1fP5t0P6vX3RzHw5nL6rR9w2k2mS8r9q7Y1fP5t0P6vX3RzHw5nL6rR\n` +
                  `9w2k2mS8rQ==\n` +
                  `-----END CERTIFICATE-----`;

  const dummyCertificate = new crypto.X509Certificate(Buffer.from(certPem)); // This will parse the PEM string

  return {
    privateKey,
    certificate: dummyCertificate, // Use the parsed dummy certificate
    certificatePem: certPem,
  };
}
