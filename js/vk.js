/* ============================================================
   VK Bridge — обёртка с заглушкой для разработки
   В DEV_MODE / вне ВК используется тестовый пользователь.
   Современный vk-bridge: window.vkBridge.send('VKWebApp...')
   Bridge вызываем ТОЛЬКО внутри ВК (иначе send зависает).
   ============================================================ */

/* Находимся ли мы внутри ВК (iframe с launch-параметрами)? */
const IS_VK = (function () {
  if (typeof window === 'undefined' || typeof location === 'undefined') return false;
  try {
    const q = new URLSearchParams(location.search);
    const hasVkParams = q.has('vk_user_id') || q.has('vk_app_id') ||
      q.has('vk_profile_id') || q.has('vk_viewer_group_role') || q.has('sign');
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
    first_name: 'Тестовый',
    last_name: 'Пользователь',
    photo_100: '',
  };
}

/* Пользователь из launch-параметров (vk_user_id в URL), если есть */
function vkFromLaunchParams() {
  try {
    const urlId = Number(new URLSearchParams(location.search).get('vk_user_id'));
    if (urlId && !DEV_MODE) {
      return { id: urlId, first_name: 'Участник', last_name: '', photo_100: '' };
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

  // Инициализация моста (в новых версиях отправляется автоматически)
  try {
    await withTimeout(BRIDGE.send('VKWebAppInit'), 1500);
  } catch (err) {
    console.warn('VKWebAppInit failed:', err);
  }

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
