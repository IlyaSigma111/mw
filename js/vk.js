/* ============================================================
   VK Bridge — обёртка с заглушкой для разработки
   В DEV_MODE / вне ВК используется тестовый пользователь.
   Современный vk-bridge: window.vkBridge.send('VKWebApp...')
   ============================================================ */

const BRIDGE = (typeof vkBridge !== 'undefined' && vkBridge) ? vkBridge : null;

/* Заглушка для офлайн-тестирования / вне ВК */
function vkStubUser() {
  return {
    id: 12345,
    first_name: 'Тестовый',
    last_name: 'Пользователь',
    photo_100: '',
  };
}

/* Получить данные пользователя ВКонтакте.
   Возвращает Promise<{ id, first_name, last_name, photo_100 }> */
async function vkGetUser() {
  // Вне ВК / DEV_MODE: если в URL есть vk_user_id (redirect из ВК) — берём его
  if (DEV_MODE || !BRIDGE) {
    const urlId = Number(new URLSearchParams(location.search).get('vk_user_id'));
    if (urlId && !DEV_MODE) {
      return { id: urlId, first_name: 'Участник', last_name: '', photo_100: '' };
    }
    return vkStubUser();
  }

  // Инициализация моста (в новых версиях отправляется автоматически)
  try {
    await BRIDGE.send('VKWebAppInit');
  } catch (err) {
    console.warn('VKWebAppInit failed:', err);
  }

  try {
    const res = await BRIDGE.send('VKWebAppGetUserInfo');
    return {
      id: Number(res.id),
      first_name: res.first_name || '',
      last_name: res.last_name || '',
      photo_100: res.photo_100 || '',
    };
  } catch (err) {
    console.warn('VKWebAppGetUserInfo failed, fallback to stub:', err);
    return vkStubUser();
  }
}

/* Короткий тост внутри ВК; тихо игнорируем, если недоступен. */
function vkToast(text) {
  if (DEV_MODE || !BRIDGE) return;
  BRIDGE.send('VKWebAppShowToast', { text }).catch(() => {});
}
