'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createOptOutClassifier, isAmbiguousOptOut, isExplicitOptOut } = require('../src/consent/ambiguous-optout');

function classifier({ openQuestion = false, recentMarketing = false, failQuestion = false, failMarketing = false } = {}) {
  return createOptOutClassifier({
    hasOpenQuestion: async () => {
      if (failQuestion) throw new Error('timeout');
      return openQuestion;
    },
    hasRecentMarketing: async () => {
      if (failMarketing) throw new Error('timeout');
      return recentMarketing;
    },
    logger: { error: () => {} }
  });
}

test('frases claras de descadastro valem sempre, com ou sem acento', () => {
  for (const text of ['SAIR', 'parar', 'Não quero mais receber promoções', 'me tira da lista', 'pare de me mandar']) {
    assert.equal(isExplicitOptOut(text), true, text);
  }
});

test('"cancelar" respondendo "voce vem?" nao vira descadastro de marketing', async () => {
  const decision = await classifier({ openQuestion: true, recentMarketing: true })({ phone: '5551999990000', text: 'cancelar' });

  assert.deepEqual(decision, { optOut: false, reason: 'answering_question' });
});

test('"nao" solto sem marketing recente nao descadastra', async () => {
  const decision = await classifier({ recentMarketing: false })({ phone: '5551999990000', text: 'Não' });

  assert.equal(decision.optOut, false);
});

test('"remover" logo depois de uma campanha descadastra', async () => {
  const decision = await classifier({ recentMarketing: true })({ phone: '5551999990000', text: 'remover' });

  assert.deepEqual(decision, { optOut: true, reason: 'ambiguous_after_marketing' });
});

test('erro ao consultar o banco preserva o descadastro', async () => {
  const decision = await classifier({ failQuestion: true, failMarketing: true })({ phone: '5551999990000', text: 'cancelar' });

  assert.equal(decision.optOut, true);
});

test('mensagem comum nao e opt-out', async () => {
  assert.equal(isAmbiguousOptOut('quero cancelar minha reserva das 20h'), false);
  const decision = await classifier()({ phone: '5551999990000', text: 'Qual o horario de hoje?' });
  assert.equal(decision.optOut, false);
});
