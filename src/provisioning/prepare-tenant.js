'use strict';

// Preparação de um novo restaurante (tenant), versão didática do provisionador do MyFoodLink.
//
// No produto real, cada restaurante ganha banco, contêiner, instância de WhatsApp, domínio e
// TLS próprios. Aqui o padrão é mostrado com arquivos, que é a primeira etapa: .env com
// segredos gerados, compose do contêiner e manifesto.
//
// Problemas que esse desenho evita:
// - Restaurante "pela metade": se a 3ª etapa falha, as duas primeiras ficavam para trás e a
//   próxima tentativa batia em conflito. Agora a falha desfaz o que ELA criou.
// - Apagar o que não é seu: o rollback nunca remove algo que já existia antes da tentativa.
// - Rodar duas vezes: a segunda execução reconhece o manifesto e não recria nada (idempotência).
// - Criar o restaurante errado: exige confirmação explícita digitando o slug.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

function toSlug(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function deriveResources({ name, slug }, { baseDir }) {
  const finalSlug = slug || toSlug(name);
  const tenantDir = path.join(baseDir, finalSlug);
  return {
    slug: finalSlug,
    // Nome de contêiner não aceita hífen em todos os lugares: padroniza com underscore.
    containerName: `restaurant_router_${finalSlug.replace(/-/g, '_')}`,
    tenantDir,
    envPath: path.join(tenantDir, '.env'),
    composePath: path.join(tenantDir, 'compose.yml'),
    manifestPath: path.join(tenantDir, 'manifest.json')
  };
}

function preflight(input, { baseDir, fsImpl = fs } = {}) {
  const resources = deriveResources(input, { baseDir });
  const conflicts = [];
  if (!SLUG_PATTERN.test(resources.slug)) conflicts.push('slug_invalido');

  if (fsImpl.existsSync(resources.manifestPath)) {
    const manifest = JSON.parse(fsImpl.readFileSync(resources.manifestPath, 'utf8'));
    if (manifest.slug === resources.slug && manifest.state === 'prepared') {
      return { ok: true, alreadyPrepared: true, resources, conflicts };
    }
    conflicts.push('manifesto_de_outro_estado');
  } else if (fsImpl.existsSync(resources.tenantDir)) {
    conflicts.push('diretorio_ja_existe_sem_manifesto');
  }
  return { ok: conflicts.length === 0, alreadyPrepared: false, resources, conflicts };
}

function generateSecrets(randomBytes = crypto.randomBytes) {
  return {
    adminApiKey: randomBytes(32).toString('base64url'),
    webhookSecret: randomBytes(32).toString('base64url')
  };
}

function renderEnv(resources, secrets) {
  return [
    `TENANT_SLUG=${resources.slug}`,
    `ADMIN_API_KEY=${secrets.adminApiKey}`,
    `WEBHOOK_SECRET=${secrets.webhookSecret}`,
    ''
  ].join('\n');
}

function renderCompose(resources) {
  return [
    'services:',
    `  router_${resources.slug.replace(/-/g, '_')}:`,
    `    container_name: ${resources.containerName}`,
    '    image: "${ROUTER_IMAGE:?imagem fixada por digest}"',
    '    env_file: .env',
    '    restart: unless-stopped',
    ''
  ].join('\n');
}

// Grava só se o arquivo NÃO existir (flag 'wx') e anota o caminho para um eventual rollback.
function writeExclusive(fsImpl, target, content, mode, createdPaths) {
  fsImpl.writeFileSync(target, content, { flag: 'wx', mode });
  createdPaths.push(target);
}

function rollback(fsImpl, resources, createdPaths, tenantDirCreated) {
  const errors = [];
  for (const target of [...createdPaths].reverse()) {
    try {
      fsImpl.rmSync(target, { force: true });
    } catch (error) {
      errors.push({ target, message: error.message });
    }
  }
  if (tenantDirCreated) {
    try {
      fsImpl.rmSync(resources.tenantDir, { recursive: true, force: true });
    } catch (error) {
      errors.push({ target: resources.tenantDir, message: error.message });
    }
  }
  return errors;
}

function prepareTenant(input, { baseDir, confirm, fsImpl = fs, randomBytes } = {}) {
  const check = preflight(input, { baseDir, fsImpl });
  if (check.alreadyPrepared) return { ...check, created: false };
  if (!check.ok) {
    const error = new Error('preflight_falhou');
    error.conflicts = check.conflicts;
    throw error;
  }
  const { resources } = check;
  if (String(confirm || '') !== resources.slug) {
    throw new Error('confirmacao_obrigatoria: repita o slug para confirmar');
  }

  const createdPaths = [];
  const tenantDirCreated = !fsImpl.existsSync(resources.tenantDir);
  try {
    fsImpl.mkdirSync(resources.tenantDir, { recursive: true, mode: 0o750 });
    const secrets = generateSecrets(randomBytes);
    writeExclusive(fsImpl, resources.envPath, renderEnv(resources, secrets), 0o600, createdPaths);
    writeExclusive(fsImpl, resources.composePath, renderCompose(resources), 0o640, createdPaths);
    // O manifesto é o último: só existe quando tudo antes deu certo.
    const manifest = { slug: resources.slug, containerName: resources.containerName, state: 'prepared' };
    writeExclusive(fsImpl, resources.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 0o640, createdPaths);
    return { ...check, created: true };
  } catch (error) {
    error.rollbackErrors = rollback(fsImpl, resources, createdPaths, tenantDirCreated);
    throw error;
  }
}

module.exports = { deriveResources, preflight, prepareTenant, toSlug };
