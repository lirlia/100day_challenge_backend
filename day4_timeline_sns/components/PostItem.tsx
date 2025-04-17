import type { Post } from '@/lib/types';
import { motion } from 'framer-motion';

interface PostItemProps {
  post: Post;
}

export default function PostItem({ post }: PostItemProps) {
  const timeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + '年前';
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + 'ヶ月前';
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + '日前';
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + '時間前';
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + '分前';
    return Math.floor(seconds) + '秒前';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="border rounded p-4 mb-4 bg-white dark:bg-gray-800 shadow-sm"
    >
      <div className="flex items-center mb-2">
        <span className="font-bold mr-2">{post.user.name}</span>
        <span className="text-gray-500 dark:text-gray-400 text-sm">
          · {timeAgo(post.createdAt)}
        </span>
      </div>
      <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
        {post.content}
      </p>
    </motion.div>
  );
}
