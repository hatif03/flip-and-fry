import { reddit } from '@devvit/web/server';

/** Creates a post that starts at the splash entry. The daily roll (P3) replaces this with headline, flair and a sticky. */
export const createPost = async (title: string) => reddit.submitCustomPost({ title, entry: 'default' });
