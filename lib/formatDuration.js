export function formatMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;

  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return remMinutes ? `${hours}h ${remMinutes}min` : `${hours}h`;

  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}

export function formatDuration(startIso, endIso) {
  return formatMs(new Date(endIso) - new Date(startIso));
}
