export function messageDay(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0 || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function messageDateLabel(timestamp, now = new Date()) {
  const day = messageDay(timestamp);
  if (!day) return '';
  if (day === messageDay(now.getTime())) return 'Сегодня';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === messageDay(yesterday.getTime())) return 'Вчера';
  return new Date(timestamp).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}
