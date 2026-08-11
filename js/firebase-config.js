/* ============================================================
   Конфигурация Firebase
   ЗАМЕНИТЕ FIREBASE_CONFIG на данные вашего проекта:
   Firebase Console → Project settings → Your apps → Web
   ============================================================ */

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDKo3hChcpW-yMjxSoZH-IzxHN6KxN2dd4',
  authDomain: 'mediavolnapp.firebaseapp.com',
  projectId: 'mediavolnapp',
  storageBucket: 'mediavolnapp.firebasestorage.app',
  messagingSenderId: '923400993998',
  appId: '1:923400993998:web:3c66692fb09a5a74c4649f',
};

/* DEV_MODE = true — тестирование без ВК и без реальной БД:
   пользователь-заглушка (id 12345), данные в памяти/локально. */
const DEV_MODE = false;

/* ID мини-приложения ВКонтакте (для VK.init) */
const VK_APP_ID = 54716297;
