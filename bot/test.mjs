import { parseDecision, buildCaption, findDecisionMessages, filterPeerList } from './bot.js';

let pass = 0;
const cases = [
  ['+', 'approve'],
  ['+ фото огонь', 'approve'],
  ['засчитано', 'approve'],
  ['зачёт', 'approve'],
  ['ок', 'approve'],
  ['верно', 'approve'],
  ['принято', 'approve'],
  ['−', 'reject'],
  ['-', 'reject'],
  ['нет, не то', 'reject'],
  ['не засчитано', 'reject'],
  ['отклоняю', 'reject'],
  ['брак', 'reject'],
  ['хз', null],
  ['', null],
  ['', null],
];
for (const [input, want] of cases) {
  const got = parseDecision(input);
  if (got !== want) {
    console.log(`FAIL parseDecision(${JSON.stringify(input)}) = ${got}, want ${want}`);
    process.exitCode = 1;
  } else pass++;
}

const cap = buildCaption({ taskId: 7, taskText: 'Селфи с розой', points: 50, name: 'Илюха' });
if (!cap.includes('№7') || !cap.includes('Селфи с розой') || !cap.includes('+50') || !cap.includes('Илюха')) {
  console.log('FAIL buildCaption:', cap);
  process.exitCode = 1;
} else pass++;

const history = [
  { id: 1, text: 'привет', from_id: 5 },
  { id: 2, text: '+', reply_message: { id: 900, text: 'x' }, from_id: 42 },
  { id: 3, text: 'нет', reply_message: { id: 901, text: 'y' }, from_id: 42 },
  { id: 4, text: 'обычное сообщение', reply_message: null },
  { id: 5, text: '', reply_message: { id: 902 } },
];
const found = findDecisionMessages(history, 901);
if (found.length !== 1 || found[0].text !== 'нет' || found[0].fromId !== 42) {
  console.log('FAIL findDecisionMessages:', JSON.stringify(found));
  process.exitCode = 1;
} else pass++;
if (findDecisionMessages(history, 900).length !== 1) {
  console.log('FAIL findDecisionMessages 900');
  process.exitCode = 1;
} else pass++;

const convs = [
  { conversation: { peer: { id: 610622680, type: 'user' }, can_write: { allowed: true } } },
  { conversation: { peer: { id: 200000964099, type: 'user' }, can_write: { allowed: true } } },
  { conversation: { peer: { id: 777, type: 'user' }, can_write: { allowed: false } } },
  { conversation: { peer: { id: 2000000001, type: 'chat' }, can_write: { allowed: true } } },
  {},
];
const p = filterPeerList(convs);
if (JSON.stringify(p) !== JSON.stringify([610622680, 200000964099, 2000000001])) {
  console.log('FAIL filterPeerList:', JSON.stringify(p));
  process.exitCode = 1;
} else pass++;

console.log(`${pass}/${pass} passed`);
