'use strict';

// Credenciais de terceiros (chaves de API de cada restaurante, tokens de pagamento) ficam
// cifradas no banco com AES-256-GCM.
// - IV aleatório por valor; tag de autenticação detecta adulteração.
// - AAD amarra o texto cifrado ao seu propósito: um valor cifrado para "api-key" não decifra
//   se for copiado para outro campo.
// - Prefixo versionado (enc:v1) permite trocar o formato no futuro e conviver com valores
//   antigos em texto puro durante a migração.

const crypto = require('node:crypto');

const PREFIX = 'enc:v1';

function decodeKey(encodedKey) {
  const value = String(encodedKey || '').trim();
  if (!value) return null;
  const key = Buffer.from(value, 'base64url');
  if (key.length !== 32) throw new Error('invalid_credentials_key');
  return key;
}

function createCredentialCipher(encodedKey, { purpose = 'credential' } = {}) {
  const key = decodeKey(encodedKey);
  if (!key) return null;
  const aad = Buffer.from(`restaurant-platform:${purpose}`);

  function isEncrypted(value) {
    return String(value || '').startsWith(`${PREFIX}:`);
  }

  function encrypt(plaintext) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad);
    const encrypted = Buffer.concat([cipher.update(String(plaintext || ''), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [PREFIX, iv.toString('base64url'), encrypted.toString('base64url'), tag.toString('base64url')].join(':');
  }

  function decrypt(value) {
    const stored = String(value || '');
    if (!isEncrypted(stored)) return stored;
    const parts = stored.split(':');
    if (parts.length !== 5) throw new Error('invalid_encrypted_credential');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[2], 'base64url'));
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(parts[4], 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8');
  }

  return { decrypt, encrypt, isEncrypted };
}

module.exports = { createCredentialCipher };
