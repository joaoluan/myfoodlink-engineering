'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { prepareTenant, preflight, toSlug } = require('../src/provisioning/prepare-tenant');

function tempBase() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tenants-'));
}

test('slug e nome de conteiner sao derivados do nome do restaurante', () => {
  assert.equal(toSlug('Bistrô São João'), 'bistro-sao-joao');
  const check = preflight({ name: 'Bistrô São João' }, { baseDir: tempBase() });
  assert.equal(check.resources.containerName, 'restaurant_router_bistro_sao_joao');
});

test('cria .env com permissao 600, compose e manifesto', () => {
  const baseDir = tempBase();
  const result = prepareTenant({ name: 'Cantina Exemplo' }, { baseDir, confirm: 'cantina-exemplo' });

  assert.equal(result.created, true);
  const envStat = fs.statSync(path.join(baseDir, 'cantina-exemplo', '.env'));
  assert.equal(envStat.mode & 0o777, 0o600);
  assert.match(fs.readFileSync(path.join(baseDir, 'cantina-exemplo', 'compose.yml'), 'utf8'), /restaurant_router_cantina_exemplo/);
});

test('rodar de novo nao recria nada (idempotente)', () => {
  const baseDir = tempBase();
  prepareTenant({ name: 'Cantina Exemplo' }, { baseDir, confirm: 'cantina-exemplo' });
  const envBefore = fs.readFileSync(path.join(baseDir, 'cantina-exemplo', '.env'), 'utf8');

  const second = prepareTenant({ name: 'Cantina Exemplo' }, { baseDir, confirm: 'cantina-exemplo' });

  assert.equal(second.created, false);
  assert.equal(fs.readFileSync(path.join(baseDir, 'cantina-exemplo', '.env'), 'utf8'), envBefore, 'segredos nao foram regenerados');
});

test('sem confirmacao explicita do slug, nada e criado', () => {
  const baseDir = tempBase();

  assert.throws(() => prepareTenant({ name: 'Cantina Exemplo' }, { baseDir, confirm: 'outro' }), /confirmacao_obrigatoria/);
  assert.equal(fs.existsSync(path.join(baseDir, 'cantina-exemplo')), false);
});

test('falha no meio desfaz so o que a tentativa criou', () => {
  const baseDir = tempBase();
  let writes = 0;
  const failingFs = {
    ...fs,
    writeFileSync(target, content, options) {
      writes += 1;
      if (writes === 2) throw new Error('disco cheio');
      return fs.writeFileSync(target, content, options);
    }
  };

  assert.throws(
    () => prepareTenant({ name: 'Cantina Exemplo' }, { baseDir, confirm: 'cantina-exemplo', fsImpl: failingFs }),
    error => error.message === 'disco cheio' && error.rollbackErrors.length === 0
  );
  assert.equal(fs.existsSync(path.join(baseDir, 'cantina-exemplo')), false, 'nenhum restaurante pela metade');

  // E a proxima tentativa funciona normalmente.
  assert.equal(prepareTenant({ name: 'Cantina Exemplo' }, { baseDir, confirm: 'cantina-exemplo' }).created, true);
});

test('diretorio existente sem manifesto e conflito: nunca sobrescreve o que nao e seu', () => {
  const baseDir = tempBase();
  fs.mkdirSync(path.join(baseDir, 'cantina-exemplo'));
  fs.writeFileSync(path.join(baseDir, 'cantina-exemplo', 'dados.txt'), 'pre-existente');

  assert.throws(
    () => prepareTenant({ name: 'Cantina Exemplo' }, { baseDir, confirm: 'cantina-exemplo' }),
    error => error.conflicts.includes('diretorio_ja_existe_sem_manifesto')
  );
  assert.equal(fs.readFileSync(path.join(baseDir, 'cantina-exemplo', 'dados.txt'), 'utf8'), 'pre-existente');
});
