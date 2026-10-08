'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { createCredentialCipher } = require('../src/security/credential-cipher');
const { createSignedLink } = require('../src/security/signed-link');

const KEY = crypto.randomBytes(32).toString('base64url');

test('credencial cifrada volta igual e nao aparece em texto puro', () => {
  const cipher = createCredentialCipher(KEY, { purpose: 'api-key' });
  const stored = cipher.encrypt('chave-ficticia-123');

  assert.match(stored, /^enc:v1:/);
  assert.doesNotMatch(stored, /chave-ficticia/);
  assert.equal(cipher.decrypt(stored), 'chave-ficticia-123');
});

test('valor cifrado para um proposito nao decifra em outro (AAD)', () => {
  const stored = createCredentialCipher(KEY, { purpose: 'api-key' }).encrypt('segredo');

  assert.throws(() => createCredentialCipher(KEY, { purpose: 'payment-token' }).decrypt(stored));
});

test('valor adulterado e rejeitado pela tag de autenticacao', () => {
  const cipher = createCredentialCipher(KEY);
  const parts = cipher.encrypt('segredo').split(':');
  parts[3] = Buffer.from('outro-conteudo').toString('base64url');

  assert.throws(() => cipher.decrypt(parts.join(':')));
});

test('chave com tamanho errado e recusada; sem chave, cifra desligada', () => {
  assert.throws(() => createCredentialCipher(Buffer.alloc(16).toString('base64url')), /invalid_credentials_key/);
  assert.equal(createCredentialCipher(''), null);
});

test('link assinado identifica a reserva e expira', () => {
  let clock = Date.parse('2026-10-08T12:00:00Z');
  const links = createSignedLink({ secret: 'segredo-de-teste', now: () => clock });
  const token = links.sign({ resourceId: 42, phone: '5551999990000', expiresAt: clock + 60 * 60 * 1000 });

  assert.deepEqual(links.verify(token), { resourceId: 42, phoneKey: '99990000' });
  clock += 2 * 60 * 60 * 1000;
  assert.equal(links.verify(token), null);
});

test('link com ID trocado ou assinatura de outro segredo e recusado', () => {
  const now = () => Date.parse('2026-10-08T12:00:00Z');
  const links = createSignedLink({ secret: 'segredo-de-teste', now });
  const token = links.sign({ resourceId: 42, phone: '5551999990000' });
  const forgedBody = Buffer.from(JSON.stringify({ r: 43, p: '99990000', exp: now() + 1000 })).toString('base64url');

  assert.equal(links.verify(`${forgedBody}.${token.split('.')[1]}`), null);
  assert.equal(createSignedLink({ secret: 'outro', now }).verify(token), null);
  assert.equal(links.verify('lixo'), null);
});
