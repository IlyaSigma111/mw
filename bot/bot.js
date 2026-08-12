import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

export const PROJECT_ID = 'mediavolnapp';
export const BUCKET = 'mediavolnapp.firebasestorage.app';
const VK_API = 'https://api.vk.com/method';

const REJECT_WORDS = ['-', '−', 'нет', 'не ', 'откло', 'брак', 'фейк', 'не то', 'невер', 'не засчит', 'не засчи', 'незасчит', 'не зачёт', 'не зачет', 'минус', 'спам'];
const APPROVE_WORDS = ['+', 'засчи', 'засчит', 'зачет', 'зачёт', 'верно', 'ок', 'ok', 'да', 'принято', 'гуд', 'супер', 'отлично', 'красава', 'плюс'];

export function parseDecision(text) {
  const t = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (REJECT_WORDS.some((w) => t.includes(w))) return 'reject';
  if (APPROVE_WORDS.some((w) => t.includes(w))) return 'approve';
  return null;
}

export function buildCaption(sub) {
  const lines = [
    `Фото с задания №${sub.taskId} · «${sub.taskText || ''}» · +${sub.points ?? '?'} б`,
    `Участник: ${sub.name || sub.vkId || sub.uid}`,
    'Ответьте реплаем: «+» засчитать или «−» отклонить',
  ];
  return lines.join('\n');
}

export function findDecisionMessages(history, msgId) {
  const out = [];
  for (const m of history || []) {
    const rm = m.reply_message;
    if (rm && rm.id === msgId && m.text) {
      out.push({ text: m.text, fromId: m.from_id, date: m.date });
    }
  }
  return out;
}

async function vkApi(token, method, params) {
  const body = new URLSearchParams({
    access_token: token,
    v: '5.199',
    ...params,
  });
  const res = await fetch(`${VK_API}/${method}`, { method: 'POST', body });
  const json = await res.json();
  if (json.error) {
    throw new Error(`vk ${method}: [${json.error.error_code}] ${json.error.error_msg}`);
  }
  return json.response;
}

async function uploadPhotoToChat(token, groupId, peerId, buf, filename) {
  const upload = await vkApi(token, 'photos.getMessagesUploadServer', {
    group_id: groupId,
    peer_id: peerId,
  });
  const form = new FormData();
  form.append('photo', new Blob([buf], { type: 'image/jpeg' }), filename);
  const upRes = await fetch(upload.upload_url, { method: 'POST', body: form });
  const upJson = await upRes.json();
  if (!upJson.photo) throw new Error(`upload photo failed: ${JSON.stringify(upJson).slice(0, 300)}`);
  const saved = await vkApi(token, 'photos.saveMessagesPhoto', {
    server: upJson.server,
    photo: upJson.photo,
    hash: upJson.hash,
  });
  const p = saved[0];
  return `photo${p.owner_id}_${p.id}_${p.access_key}`;
}

export async function runBot(env) {
  const { VK_TOKEN, VK_GROUP_ID, VK_CHAT_ID, SA_PATH } = env;
  if (!VK_TOKEN || !VK_GROUP_ID || !VK_CHAT_ID || !SA_PATH) {
    throw new Error('missing env: need VK_TOKEN, VK_GROUP_ID, VK_CHAT_ID, SA_PATH');
  }
  const sa = JSON.parse(readFileSync(SA_PATH, 'utf8'));
  const app = initializeApp({ credential: cert(sa), projectId: PROJECT_ID });
  const db = getFirestore(app);
  const bucket = getStorage(app).bucket(BUCKET);
  const chatId = Number(VK_CHAT_ID);

  const pending = await db
    .collection('submissions')
    .where('sent', '==', false)
    .limit(5)
    .get();

  for (const snap of pending.docs) {
    const sub = snap.data();
    if (sub.photoPath) {
      const [buf] = await bucket.file(sub.photoPath).download();
      const attachment = await uploadPhotoToChat(
        VK_TOKEN,
        VK_GROUP_ID,
        chatId,
        buf,
        (sub.photoPath.split('/').pop() || 'photo.jpg'),
      );
      const sent = await vkApi(VK_TOKEN, 'messages.send', {
        peer_id: chatId,
        random_id: `${Date.now()}-${Math.random()}`,
        message: buildCaption(sub),
        attachment,
      });
      await snap.ref.update({ sent: true, msgId: sent, sentAt: FieldValue.serverTimestamp() });
      console.log(`sent submission ${snap.id} msgId=${sent}`);
    } else {
      await snap.ref.update({ sent: true, skipped: true, sentAt: FieldValue.serverTimestamp() });
      console.log(`skip submission ${snap.id} (no photo)`);
    }
  }

  const undecided = await db
    .collection('submissions')
    .where('sent', '==', true)
    .where('state', '==', 'pending')
    .limit(20)
    .get();

  if (undecided.size === 0) return;

  const history = await vkApi(VK_TOKEN, 'messages.getHistory', {
    peer_id: chatId,
    count: 200,
  });

  for (const snap of undecided.docs) {
    const sub = snap.data();
    if (!sub.msgId) continue;
    const replies = findDecisionMessages(history.items, sub.msgId);
    let decision = null;
    for (const r of replies) {
      decision = parseDecision(r.text);
      if (decision) {
        console.log(`decision for ${snap.id}: ${decision} from ${r.fromId}`);
        break;
      }
    }
    if (!decision) continue;
    await snap.ref.update({
      state: decision,
      decidedBy: null,
      decidedAt: FieldValue.serverTimestamp(),
    });
    if (decision === 'approve' && sub.uid) {
      await db.doc(`users/${sub.uid}`).update({
        score: FieldValue.increment(sub.points || 0),
        [`done.${sub.taskId}`]: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`awarded ${sub.points} to ${sub.uid}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBot({
    VK_TOKEN: process.env.VK_TOKEN,
    VK_GROUP_ID: process.env.VK_GROUP_ID,
    VK_CHAT_ID: process.env.VK_CHAT_ID,
    SA_PATH: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  }).then(
    () => process.exit(0),
    (e) => {
      console.error('BOT FAIL:', e);
      process.exit(1);
    },
  );
}
