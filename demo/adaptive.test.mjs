import test from 'node:test';
import assert from 'node:assert/strict';
import { initialRound, eligible, applyDecision, clientJob } from './adaptive.mjs';

function provider(action, surveyId = null) {
  const decision = {
    action, rule:'Test rule', evidence:'Test evidence', finding:'Test finding', limitations:'Test limit',
    questions: action === 'ASK' ? ['Which price? $10 / $20 / neither'] : [],
  };
  return {final_text: 'DECISION_JSON\n' + JSON.stringify(decision), survey_id: surveyId, cost_usdc: 0.5};
}
function pilot() {
  const adaptive = initialRound(1, 'Which plan would you buy?');
  adaptive.responses.push({source:'human', count:2, answer:'Monthly'}, {source:'synthetic', count:1, answer:'Annual'});
  return {adaptive, receipts:['private-receipt']};
}
test('wait for additional evidence before another review', () => {
  const job = pilot();
  assert.equal(eligible(job.adaptive),true);
  applyDecision(job,provider('WAIT'));
  assert.equal(eligible(job.adaptive),false);
  job.adaptive.responses.push({source:'human',count:1,answer:'Neither'});
  assert.equal(eligible(job.adaptive),true);
  assert.deepEqual(job.adaptive.history[0].counts,{human:2,synthetic:1});
});
test('a follow-up uses its own questions and starts with zero responses', () => {
  const job = pilot();
  applyDecision(job,provider('ASK','new-survey'));
  const visible = clientJob(job);
  assert.equal(visible.adaptive.number,2);
  assert.match(visible.adaptive.questionnaire,/Which price/);
  assert.deepEqual(visible.adaptive.counts,{human:0,synthetic:0});
  assert.ok(job.adaptive.history[0].input.responses.length);
  assert.ok(!('input' in visible.adaptive.history[0]) && !('receipts' in visible));
  job.adaptive.responses.push({source:'human',count:3,answer:'Neither'});
  applyDecision(job,provider('STOP'));
  assert.equal(job.adaptive.status,'complete');
  assert.deepEqual(job.adaptive.history.map(e=>e.decision.action),['ASK','STOP']);
});
test('inconsistent receipts never open or close a round', () => {
  const job = pilot();
  assert.throws(()=>applyDecision(job,provider('ASK')));
  assert.throws(()=>applyDecision(job,provider('STOP','unexpected-survey')));
  assert.throws(()=>applyDecision(job,{final_text:'No structured decision'}));
  assert.deepEqual(job.adaptive.history,[]);
});
