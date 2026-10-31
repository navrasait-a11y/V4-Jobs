import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let a;

before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', STORAGE_DRIVER: 'local', MONGODB_URI: 'mongodb://127.0.0.1:1/x', JWT_ACCESS_SECRET: 'x'.repeat(48), ENCRYPTION_KEY: 'b'.repeat(64), REDIS_URL: '' });
  a = await import('../src/modules/assistant/assistant.service.js');
});

test('intent detection covers the common requests', () => {
  const cases = {
    'recommend me some jobs where i am a best fit': 'recommend',
    'mere liye koi job batao': 'recommend',
    'talk to support team': 'handoff',
    'I want a real person': 'handoff',
    'check my applications': 'applications',
    'sales jobs in jaipur': 'search',
    'show remote jobs': 'search',
    'how do i upload my resume': 'help',
    'kaise apply kare job': 'help',
    hello: 'greeting',
    'tell me a joke': 'help',
  };
  for (const [message, intent] of Object.entries(cases)) assert.equal(a.detectIntent(message), intent, message);
});

test('job queries become search filters', () => {
  assert.deepEqual(a.parseJobQuery('sales jobs in jaipur'), { location: 'jaipur', q: 'sales' });
  assert.deepEqual(a.parseJobQuery('show remote jobs'), { remoteOnly: true });
  assert.deepEqual(a.parseJobQuery('fresher react developer jobs in new delhi'), { experience: 0, location: 'new delhi', q: 'react developer' });
  assert.deepEqual(a.parseJobQuery('internship in pune'), { kind: 'internship', location: 'pune' });
});

test('guests are asked to log in for personal answers and start chips are offered', async () => {
  const rec = await a.reply(null, 'recommend me jobs');
  assert.match(rec.text, /Log in/);
  assert.equal(rec.links[0].to, '/login');
  assert.ok((await a.reply({ fullName: 'Riya Sharma' }, 'hello')).text.includes('Riya'));
  assert.equal((await a.reply(null, 'connect me to an agent')).handoff, true);
});
