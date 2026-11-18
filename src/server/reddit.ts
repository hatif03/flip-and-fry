import { reddit } from '@devvit/web/server';
import type { PostApi } from './core/daily-post';

/** The only place the game touches Reddit's posting API, so the rest of it is tested without Reddit. */
type PostId = Parameters<typeof reddit.submitComment>[0]['id'];

export const postApi: PostApi = {
  async createPost({ title, postData, textFallback, flairText }) {
    const post = await reddit.submitCustomPost({ title, entry: 'default', postData, textFallback: { text: textFallback }, ...(flairText ? { flairText } : {}) });
    return { id: post.id };
  },
  async comment(postId, text) {
    const comment = await reddit.submitComment({ id: postId as PostId, text, runAs: 'APP' });
    return { id: comment.id, makeSticky: () => comment.distinguish(true) };
  },
};
