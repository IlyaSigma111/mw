import { parseDecision, buildCaption, buildStatusText, findDecisionMessages, filterPeerList, joinChunks } from './bot.js';

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
if (!cap.includes('Фото с задания №7') || !cap.includes('Селфи с розой') || !cap.includes('+50') || !cap.includes('Илюха')) {
  console.log('FAIL buildCaption:', cap);
  process.exitCode = 1;
} else pass++;

const capVideo = buildCaption({ taskId: 8, taskText: 'Сними визитку', points: 20, name: 'Аня', mediaType: 'video' });
if (!capVideo.includes('Видео с задания №8') || !capVideo.includes('Сними визитку')) {
  console.log('FAIL buildCaption video:', capVideo);
  process.exitCode = 1;
} else pass++;

const capMixed = buildCaption({ taskId: 9, taskText: 'Фото и видео', points: 30, name: 'Боря', mediaType: 'mixed' });
if (!capMixed.includes('Фото+видео с задания №9')) {
  console.log('FAIL buildCaption mixed:', capMixed);
  process.exitCode = 1;
} else pass++;

const enc = (s) => Buffer.from(s, 'utf8').toString('base64');
const joined = joinChunks([enc('Пр'), enc('иве'), enc('т!')], 3);
if (!joined || joined.toString('utf8') !== 'Привет!') {
  console.log('FAIL joinChunks reassembly:', joined && joined.toString('utf8'));
  process.exitCode = 1;
} else pass++;

const single = joinChunks([enc('один чанк')], 1);
if (!single || single.toString('utf8') !== 'один чанк') {
  console.log('FAIL joinChunks single');
  process.exitCode = 1;
} else pass++;

const missing = joinChunks([enc('ab'), '', enc('cd')], 3);
if (!missing || missing.toString('utf8') !== 'abcd') {
  console.log('FAIL joinChunks missing middle');
  process.exitCode = 1;
} else pass++;

if (joinChunks([], 0) !== null) {
  console.log('FAIL joinChunks empty');
  process.exitCode = 1;
} else pass++;

const stApprove = buildStatusText({ taskId: 7, taskText: 'Селфи с розой', points: 50, name: 'Илюха' }, 'approve');
const stReject = buildStatusText({ taskId: 7, taskText: 'Селфи с розой', points: 50, name: 'Илюха' }, 'reject');
if (!stApprove.includes('✅ Засчитано') || stApprove.includes('Отклонено')) {
  console.log('FAIL buildStatusText approve:', stApprove);
  process.exitCode = 1;
} else pass++;
if (!stReject.includes('❌ Отклонено') || !stReject.includes('Фото с задания №7')) {
  console.log('FAIL buildStatusText reject:', stReject);
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
