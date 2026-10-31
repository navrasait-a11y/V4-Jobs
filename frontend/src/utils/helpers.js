import { formatDistanceToNow } from 'date-fns';

// "2 hours ago" jaisa relative time dikhane ke liye
export const timeAgo = (date) => formatDistanceToNow(new Date(date), { addSuffix: true });

export const truncateText = (text, length = 100) =>
  text.length > length ? text.slice(0, length) + '...' : text;
