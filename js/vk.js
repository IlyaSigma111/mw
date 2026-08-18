/* ============================================================
   VK Bridge — обёртка с заглушкой для разработки
   В DEV_MODE / вне ВК используется тестовый пользователь.
   Современный vk-bridge: window.vkBridge.send('VKWebApp...')
   Bridge вызываем ТОЛЬКО внутри ВК (иначе send зависает).
   ============================================================ */

/* Параметры запуска VK приходят и в query (?vk_user_id=...), и в hash (#vk_user_id=...) */
function getLaunchParams() {
  try {
    const q = new URLSearchParams(location.search);
    const h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    return {
      has: (k) => q.has(k) || h.has(k),
      get: (k) => q.get(k) || h.get(k),
    };
  } catch (err) {
    return { has: () => false, get: () => null };
  }
}

/* Находимся ли мы внутри ВК (iframe с launch-параметрами)? */
const IS_VK = (function () {
  if (typeof window === 'undefined' || typeof location === 'undefined') return false;
  try {
    const p = getLaunchParams();
    const hasVkParams = ['vk_user_id', 'vk_app_id', 'vk_profile_id', 'vk_viewer_group_role', 'sign'].some(p.has);
    return hasVkParams || (window.parent && window.parent !== window);
  } catch (err) {
    return false;
  }
})();

const BRIDGE = (IS_VK && typeof vkBridge !== 'undefined' && vkBridge) ? vkBridge : null;

/* Заглушка для офлайн-тестирования / вне ВК */
function vkStubUser() {
  return {
    id: 12345,
    first_name: 'Гость',
    last_name: 'Сайта',
    photo_100: '',
  };
};
}

/* Пользователь из launch-параметров (vk_user_id в URL), если есть */
function vkFromLaunchParams() {
  try {
    const urlId = Number(getLaunchParams().get('vk_user_id'));
    if (urlId && !DEV_MODE) {
      return { id: urlId, first_name: 'Пользователь', last_name: 'ВК', photo_100: '' };
    }
  } catch (err) { /* ignore */ }
  return null;
}

/* Не даём send() висеть вечно: таймаут + гасим отложенные reject */
function withTimeout(promise, ms) {
  return Promise.race([
    Promise.resolve(promise).catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/* Получить данные пользователя ВКонтакте.
   Возвращает Promise<{ id, first_name, last_name, photo_100 }> */
async function vkGetUser() {
  // Вне ВК / DEV_MODE: launch-параметры или заглушка
  if (DEV_MODE || !BRIDGE) {
    return vkFromLaunchParams() || vkStubUser();
  }

  // Инициализация моста теперь вызывается при загрузке скрипта
  try {
    const res = await withTimeout(BRIDGE.send('VKWebAppGetUserInfo'), 3000);
    if (res && res.id) {
      return {
        id: Number(res.id),
        first_name: res.first_name || '',
        last_name: res.last_name || '',
        photo_100: res.photo_100 || '',
      };
    }
  } catch (err) {
    console.warn('VKWebAppGetUserInfo failed:', err);
  }

  return vkFromLaunchParams() || vkStubUser();
}

/* Короткий тост внутри ВК; тихо игнорируем, если недоступен. */
function vkToast(text) {
  if (DEV_MODE || !BRIDGE) return;
  BRIDGE.send('VKWebAppShowToast', { text }).catch(() => {});
}

/* ---------- Тактильные отклики (taptic) ----------
   Работают только в приложении ВК на телефоне. Вне ВК тихо игнорируем. */
function vkTaptic(type) {
  if (DEV_MODE || !BRIDGE) return;
  BRIDGE.send('VKWebAppTapticNotificationOccurred', { type }).catch(() => {});
}

function vkTapticImpact(style) {
  if (DEV_MODE || !BRIDGE) return;
  BRIDGE.send('VKWebAppTapticImpactOccurred', { style }).catch(() => {});
}

/* ---------- Короткие синтезированные звуки (WebAudio, без файлов) ----------
   AudioContext создаём лениво после первого жеста — иначе iOS блокирует. */
let audioCtx = null;

function beep(freq, dur, vol) {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(vol, audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur + 0.05);
  } catch (e) { /* игнорируем */ }
}

function vkSound(kind) {
  if (kind === 'success') beep(880, 0.14, 0.06);
  else if (kind === 'error') beep(220, 0.25, 0.07);
  else if (kind === 'click') beep(620, 0.06, 0.04);
  else if (kind === 'warning') beep(520, 0.18, 0.05);
}
