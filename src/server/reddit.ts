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
  async highlight(postId) { await (await reddit.getPostById(postId as `t3_${string}`)).highlight(); },
};

import { context } from '@devvit/web/server';
import type { SocialApi } from './core/social';
import type { KitchenPostApi } from './core/kitchen-post';

/** Comments run as the player (after approval; before it, as the app account except for the app owner). Flair and follow are explicit too. */
export const kitchenPostApi: KitchenPostApi = {
  async createAsUser({ title, postData, text }) {
    const post = await reddit.submitCustomPost({ title, entry: 'default', postData, runAs: 'USER', userGeneratedContent: { text }, textFallback: { text }, subredditName: context.subredditName });
    return { id: post.id, url: post.url };
  },
};

export const socialApi: SocialApi = {
  async comment(parentId, text) {
    const comment = await reddit.submitComment({ id: parentId as PostId, text, runAs: 'USER' });
    return { id: comment.id };
  },
  async setFlair(username, text, background) {
    await reddit.setUserFlair({ subredditName: context.subredditName, username, text, backgroundColor: background, textColor: 'light' });
  },
  async subscribe() { await reddit.subscribeToCurrentSubreddit(); },
};
