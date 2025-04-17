import { Post } from '@/lib/types';
import { motion } from 'framer-motion';

interface PostItemProps {
  post: Post;
}

export default function PostItem({ post }: PostItemProps) {
  // 経過時間の表示
  const timeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "年前";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "ヶ月前";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "日前";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "時間前";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "分前";
    return Math.floor(seconds) + "秒前";
  };

  // 実際の日付時間表示のフォーマット
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="border-b border-brand-light-gray px-3 py-3 hover:bg-brand-highlight transition-colors cursor-pointer bg-white shadow-sm mb-1"
    >
      <div className="flex">
        {/* ユーザーアバター */}
        <div className="mr-3 flex-shrink-0">
          <div className="w-12 h-12 bg-gradient-to-br from-brand-blue to-brand-blue-dark rounded-full flex items-center justify-center text-white font-bold shadow-sm">
            {post.user.name.charAt(0).toUpperCase()}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {/* ヘッダー: ユーザー名と時間 */}
          <div className="flex items-center mb-1">
            <span className="font-bold mr-1 truncate text-brand-black">{post.user.name}</span>
            <span className="text-brand-light-gray ml-1">·</span>
            <time
              className="text-brand-light-gray ml-1"
              title={formatDateTime(post.createdAt)}
            >
              {timeAgo(post.createdAt)}
            </time>
          </div>

          {/* 投稿内容 */}
          <p className="text-brand-black mb-2 whitespace-pre-wrap break-words bg-brand-highlight p-3 rounded-md shadow-sm">
            {post.content}
          </p>

          {/* アクション (いいね、リツイートなど) */}
          <div className="flex justify-between mt-2 max-w-md text-brand-light-gray">
            {/* 返信 */}
            <button className="flex items-center group">
              <div className="p-2 rounded-full group-hover:bg-brand-highlight group-hover:text-brand-blue transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
            </button>

            {/* リツイート */}
            <button className="flex items-center group">
              <div className="p-2 rounded-full group-hover:bg-green-100 group-hover:text-green-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
            </button>

            {/* いいね */}
            <button className="flex items-center group">
              <div className="p-2 rounded-full group-hover:bg-red-100 group-hover:text-red-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
            </button>

            {/* シェア */}
            <button className="flex items-center group">
              <div className="p-2 rounded-full group-hover:bg-brand-highlight group-hover:text-brand-blue transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </div>
            </button>
          </div>
        </div>
      </div>
    </motion.article>
  );
}
