export interface PostConfig { X_BEARER_TOKEN?: string; BEARER_TOKEN?: string; X_DAILY_LOOKUP_LIMIT?: string }
export type PostProof = { id: string; authorId: string; username: string; createdAt: number; text: string; urls: string[] };
export const bearerToken = (env: PostConfig) => env.X_BEARER_TOKEN?.trim() || env.BEARER_TOKEN?.trim();
export const randomToken = () => [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join('');
export const ownershipStatement = 'I have earned my Consciousness License.';
export const proofText = (url: string) => `${ownershipStatement}\n${url}`;
export function postId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(url.hostname)) return null;
    return url.pathname.match(/^\/(?:[A-Za-z0-9_]{1,15}\/status|i\/(?:web\/)?status)\/([1-9][0-9]{0,19})(?:\/(?:photo|video)\/[1-4])?\/?$/)?.[1] ?? null;
  } catch { return null; }
}
export class PostUnavailable extends Error {
  status: number | null;
  constructor(status: number | null = null) { super('The post could not be retrieved from X.'); this.status = status; }
}
// No user OAuth, scraping, URL-following, timeline requests, or automatic retries.
export async function fetchPost(env: PostConfig, id: string): Promise<PostProof> {
  if (!/^[1-9][0-9]{0,19}$/.test(id)) throw new PostUnavailable();
  const url = new URL(`https://api.x.com/2/tweets/${id}`);
  url.search = new URLSearchParams({ 'tweet.fields': 'author_id,created_at,entities,referenced_tweets', expansions: 'author_id', 'user.fields': 'username,protected' }).toString();
  try {
    const response = await fetch(url.href, { headers: { Authorization: `Bearer ${bearerToken(env)}` }, redirect: 'manual', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new PostUnavailable(response.status);
    const body = await response.json() as {
      data?: { id?: unknown; author_id?: unknown; created_at?: unknown; text?: unknown;
        entities?: { urls?: { expanded_url?: unknown; unwound_url?: unknown }[] }; referenced_tweets?: { type: string }[] };
      includes?: { users?: { id: string; username: string; protected?: boolean }[] };
    };
    const post = body.data;
    const author = body.includes?.users?.find(user => user.id === post?.author_id);
    if (!post || post.id !== id || typeof post.text !== 'string' || typeof post.created_at !== 'string' ||
      !Number.isFinite(Date.parse(post.created_at)) || typeof post.author_id !== 'string' || !/^[1-9][0-9]{0,24}$/.test(post.author_id) ||
      !author || typeof author.username !== 'string' || !/^[A-Za-z0-9_]{1,15}$/.test(author.username) || author.protected !== false ||
      post.referenced_tweets?.some(ref => ref.type === 'retweeted')) throw new PostUnavailable(422);
    return { id, authorId: post.author_id, username: author.username, createdAt: Date.parse(post.created_at) / 1000, text: post.text,
      urls: (post.entities?.urls ?? []).flatMap(link => [link.expanded_url, link.unwound_url]).filter((link): link is string => typeof link === 'string') };
  } catch (error) { if (error instanceof PostUnavailable) throw error; throw new PostUnavailable(); }
}
export function matchesProof(post: PostProof, challenge: { handle: string; record_url: string; created_at: number; expires_at: number }, stamp: number): boolean {
  // The owner declares an account before posting; X supplies the actual author.
  // Require an explicit statement and the exact permanent URL, with no public
  // challenge code. Internal request generations still protect in-flight updates.
  const words = post.text.split(/\s+/);
  return post.username.toLowerCase() === challenge.handle.toLowerCase() &&
    post.createdAt >= challenge.created_at && post.createdAt <= challenge.expires_at && post.createdAt <= stamp + 30 &&
    post.text.split(/\r?\n/).some(line => line.trim() === ownershipStatement) &&
    (post.urls.includes(challenge.record_url) || words.includes(challenge.record_url));
}
