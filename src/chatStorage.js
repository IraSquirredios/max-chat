const prefix = 'max-chat:history:v1:';
export async function historyKey(instanceId) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(instanceId.trim()));
  return prefix + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function readHistory(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    if (!value || !Array.isArray(value.chats) || !Array.isArray(value.messages)) return null;
    const chats = value.chats.filter(chat => typeof chat?.id === 'string' && typeof chat.phone === 'string');
    const messages = value.messages.filter(message => typeof message?.id === 'string' &&
      typeof message.chatId === 'string' && typeof message.text === 'string' &&
      typeof message.sender === 'string' && ['incoming', 'outgoing'].includes(message.direction));
    return { chats, messages, activeChatId: chats.some(chat => chat.id === value.activeChatId) ? value.activeChatId : chats[0]?.id || '' };
  } catch { return null; }
}
export function writeHistory(key, chats, messages, activeChatId) {
  try {
    localStorage.setItem(key, JSON.stringify({
      chats: chats.map(({ id, phone, name }) => ({ id, phone, ...(typeof name === "string" && name ? { name } : {}) })),
      messages: messages.map(({ id, chatId, text, sender, direction, timestamp, status, read, apiId }) => ({ id, chatId, text, sender, direction, read: read !== false, ...(apiId ? { apiId } : {}), ...(["sending", "accepted", "unconfirmed", "demo"].includes(status) ? { status: status === "sending" ? "unconfirmed" : status } : {}), ...(Number.isFinite(timestamp) && timestamp > 0 && timestamp <= 8640000000000000 ? { timestamp } : {}) })),
      activeChatId
    }));
    return true;
  } catch { return false; }
}

export const demoHistoryKey = prefix + 'demo';
export function readDemoMode() {
  try { return localStorage.getItem(prefix + 'mode') === 'demo'; }
  catch { return false; }
}
export function writeDemoMode(isDemo) {
  try { localStorage.setItem(prefix + 'mode', isDemo ? 'demo' : 'real'); }
  catch { /* The app remains usable when storage is unavailable. */ }
}
