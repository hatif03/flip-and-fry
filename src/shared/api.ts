/** Request and response shapes shared by the client and the server. Keep this file free of imports from either side. */
export type InitResponse = {
  type: 'init';
  postId: string;
  date: string;
  username: string;
};
