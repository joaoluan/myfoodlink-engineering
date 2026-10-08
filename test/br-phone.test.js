'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildContactKey, canonicalizeBrazilianPhone, lookupVariants } = require('../src/phone/br-phone');

test('mesmo celular em formatos diferentes vira uma unica forma canonica', () => {
  const formats = ['(51) 99999-0000', '51999990000', '5551999990000', '+55 51 9 9999-0000', '5199990000'];
  const canonical = new Set(formats.map(canonicalizeBrazilianPhone));

  assert.deepEqual([...canonical], ['5551999990000']);
});

test('fixo continua sem o nono digito', () => {
  assert.equal(canonicalizeBrazilianPhone('(51) 3333-4444'), '555133334444');
});

test('faixas novas de celular (9 1xxx a 9 5xxx) sao aceitas', () => {
  assert.equal(canonicalizeBrazilianPhone('51912345678'), '5551912345678');
  assert.equal(canonicalizeBrazilianPhone('11951234567'), '5511951234567');
});

test('DDD inexistente e numero curto sao rejeitados', () => {
  assert.equal(canonicalizeBrazilianPhone('20999990000'), null, 'DDD 20 nao existe');
  assert.equal(canonicalizeBrazilianPhone('9999'), null);
  assert.equal(canonicalizeBrazilianPhone(''), null);
});

test('LID do WhatsApp vira chave propria em vez de telefone invalido', () => {
  assert.equal(buildContactKey('123456789012345', '123456789012345@lid'), 'lid:123456789012345');
  assert.equal(buildContactKey('5551999990000', '5551999990000@s.whatsapp.net'), '5551999990000');
  assert.equal(buildContactKey('4915112345678', ''), 'raw:4915112345678', 'estrangeiro fica como raw');
});

test('variantes de busca encontram cadastros antigos com e sem 55 e nono digito', () => {
  const variants = lookupVariants('5551999990000');

  for (const legacy of ['5551999990000', '51999990000', '555199990000', '5199990000']) {
    assert.ok(variants.includes(legacy), legacy);
  }
});
