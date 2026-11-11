export function filterChats(chats, query) {
  const text = query.trim().toLocaleLowerCase('ru-RU');
  if (!text) return chats;
  const digits = text.replace(/\D/g, '');
  const isPhoneQuery = digits && /^[+\d\s()-]+$/.test(text);
  return chats.filter(chat =>
    (chat.name || '').toLocaleLowerCase('ru-RU').includes(text) ||
    (isPhoneQuery ? chat.phone.replace(/\D/g, '').includes(digits) : chat.phone.toLocaleLowerCase('ru-RU').includes(text))
  );
}
