import { Post } from '@/lib/types';

type TimelineType = 'all' | 'following';

interface FetchPostsResponse {
  posts: Post[];
  nextCursor: number | null;
}

export async function fetchPosts(
  cursor: number | string | null,
  timelineType: TimelineType,
  userId: number | null
): Promise<FetchPostsResponse> {
  const limit = 10;
  let url = '/api/posts?';

  const params = new URLSearchParams();
  params.append('limit', limit.toString());
  if (cursor !== null) {
    params.append('cursor', cursor.toString());
  }
  params.append('timelineType', timelineType);
  if (timelineType === 'following') {
    if (userId === null) {
      throw new Error('userId is required for following timeline');
    }
    params.append('userId', userId.toString());
  }

  url += params.toString();

  console.log(`Fetching posts from URL: ${url}`);

  try {
    const res = await fetch(url);

    if (!res.ok) {
      let errorBody = 'Unknown error';
      try {
        errorBody = await res.text();
      } catch { }
      console.error(`fetchPosts util: Fetch failed with status: ${res.status}, Body: ${errorBody}`);
      throw new Error(`Failed to fetch posts (${res.status})`);
    }

    const responseText = await res.text();
    // console.log('fetchPosts util: Received response text:', responseText.substring(0, 500) + '...');

    let data;
    try {
      data = JSON.parse(responseText);
      // console.log('fetchPosts util: Successfully parsed JSON data:', data);
    } catch (parseError) {
      console.error('fetchPosts util: Failed to parse JSON:', parseError, 'Raw text:', responseText);
      throw new Error('Failed to parse posts data');
    }

    // APIレスポンスの型ガード (より厳密に)
    if (
        typeof data !== 'object' ||
        data === null ||
        !Array.isArray(data.posts) ||
        (data.nextCursor !== null && typeof data.nextCursor !== 'number')
       ) {
      console.error('fetchPosts util: Invalid data structure received:', data);
      throw new Error('Invalid data structure received from API');
    }

    // Post型の基本的なチェック (例としてidとcontentのみ)
    const posts: Post[] = data.posts.filter((post: any): post is Post => {
        const isValid = typeof post === 'object' && post !== null && typeof post.id === 'number' && typeof post.content === 'string';
        if (!isValid) {
            console.warn('fetchPosts util: Filtered out invalid post object:', post);
        }
        return isValid;
    });

    return { posts: posts, nextCursor: data.nextCursor };

  } catch (error) {
    console.error('fetchPosts util: Error in fetchPosts function:', error);
    // エラーを再スローして呼び出し元で処理できるようにする
    throw error;
  }
}
