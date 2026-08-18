/* ============================================================
   Конфигурация Firebase
   ЗАМЕНИТЕ FIREBASE_CONFIG на данные вашего проекта:
   Firebase Console → Project settings → Your apps → Web
   ============================================================ */


const PROD_CONFIG = {
  apiKey: 'AIzaSyDKo3hChcpW-yMjxSoZH-IzxHN6KxN2dd4',
  authDomain: 'mediavolnapp.firebaseapp.com',
  projectId: 'mediavolnapp',
  storageBucket: 'mediavolnapp.firebasestorage.app',
  messagingSenderId: '923400993998',
  appId: '1:923400993998:web:3c66692fb09a5a74c4649f',
};

const TEST_CONFIG = {
  apiKey: 'AIzaSyAcY5ZUvWUQAQFdpIa5Y4aMgwqn0rXce_s',
  authDomain: 'mediavolnapp-test-26.firebaseapp.com',
  projectId: 'mediavolnapp-test-26',
  storageBucket: 'mediavolnapp-test-26.firebasestorage.app',
  messagingSenderId: '146069036344',
  appId: '1:146069036344:web:5d792e35f93d281bef75cd',
};

const FIREBASE_CONFIG = location.hostname.includes('test-26') ? TEST_CONFIG : PROD_CONFIG;


/* DEV_MODE = true — тестирование без ВК и без реальной БД:
   пользователь-заглушка (id 12345), данные в памяти/локально. */
const DEV_MODE = false;

/* ID мини-приложения ВКонтакте (для VK.init) */
const VK_APP_ID = location.hostname.includes('test-26') ? 54725787 : 54716297;
