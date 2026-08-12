import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const SA = JSON.parse(readFileSync('C:/Users/games/Downloads/mediavolnapp-firebase-adminsdk-fbsvc-9897589c26.json', 'utf8'));
const app = initializeApp({ credential: cert(SA), projectId: 'mediavolnapp' });
const db = getFirestore(app);

const photoB64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//9k=';

const sub = await db.collection('submissions').add({
  uid: 'test_uid',
  vkId: '0',
  name: 'Тест-участник',
  taskId: 999,
  taskText: 'Тестовое задание для проверки бота',
  points: 10,
  photoB64: photoB64,
  sent: false,
  state: 'pending',
  ts: FieldValue.serverTimestamp(),
});
console.log('submission created:', sub.id);
process.exit(0);
