'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const OPS = path.join(__dirname, '..', 'ops');

function run(script, args, env) {
  return spawnSync('bash', [path.join(OPS, script), ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });
}

test('verificar-digests aprova so imagens fixadas por digest', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'versoes-'));
  const ok = path.join(dir, 'ok.env');
  const ruim = path.join(dir, 'ruim.env');
  fs.writeFileSync(ok, `ROUTER_IMAGE=ghcr.io/exemplo/router@sha256:${'a'.repeat(64)}\n`);
  fs.writeFileSync(ruim, 'ROUTER_IMAGE=ghcr.io/exemplo/router:latest\n');

  assert.equal(run('verificar-digests.sh', [ok]).status, 0);
  const result = run('verificar-digests.sh', [ruim]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /sem digest/);
});

test('backup espera a coleta de metricas liberar o lock em vez de ser descartado', async () => {
  const estado = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-'));
  const lock = path.join(estado, 'backup.lock');
  fs.writeFileSync(lock, '');
  // Simula a coleta segurando o lock por 1 segundo.
  const holder = spawn('flock', [lock, 'sleep', '1']);
  await new Promise(resolve => setTimeout(resolve, 200));

  const metricas = run('backup-lock.sh', ['metricas'], { BACKUP_ESTADO_DIR: estado });
  const backup = run('backup-lock.sh', ['backup'], { BACKUP_ESTADO_DIR: estado, BACKUP_LOCK_TIMEOUT: '10' });
  await new Promise(resolve => holder.on('exit', resolve));

  assert.equal(metricas.status, 0);
  assert.match(metricas.stdout, /coleta de metricas adiada/, 'a coleta pode pular a rodada');
  assert.equal(backup.status, 0);
  assert.match(backup.stdout, /backup-executado/, 'o backup esperou e executou');
  assert.ok(fs.existsSync(path.join(estado, 'ultimo_backup_ok')));
});

test('backup falha alto se o lock nao liberar dentro do prazo', async () => {
  const estado = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-'));
  const lock = path.join(estado, 'backup.lock');
  fs.writeFileSync(lock, '');
  const holder = spawn('flock', [lock, 'sleep', '3']);
  await new Promise(resolve => setTimeout(resolve, 200));

  const backup = run('backup-lock.sh', ['backup'], { BACKUP_ESTADO_DIR: estado, BACKUP_LOCK_TIMEOUT: '1' });
  holder.kill();

  assert.equal(backup.status, 1);
  assert.match(backup.stdout, /nao conseguiu obter o lock/);
});

test('deploy e bloqueado sem backup recente', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-'));
  fs.mkdirSync(path.join(base, 'backup'));
  fs.writeFileSync(path.join(base, 'backup', 'ultimo_backup_ok'), String(Math.floor(Date.now() / 1000) - 27 * 3600));

  const result = run('deploy-pull.sh', ['--dry-run'], { DEPLOY_BASE: base, RELEASE_ALVO: 'abc123' });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /deploy bloqueado/);
});

test('deploy com backup recente passa pelos portoes (dry-run)', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-'));
  fs.mkdirSync(path.join(base, 'backup'));
  fs.writeFileSync(path.join(base, 'backup', 'ultimo_backup_ok'), String(Math.floor(Date.now() / 1000)));

  const result = run('deploy-pull.sh', ['--dry-run'], { DEPLOY_BASE: base, RELEASE_ALVO: 'abc123' });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /dry-run\) aplicaria abc123/);
});
