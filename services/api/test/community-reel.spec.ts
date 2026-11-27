import { execFileSync } from 'node:child_process';
import { Role } from '@kashyap/contracts';
import { CommunityReelService, inspectReel } from '../src/modules/community/community-reel.service';
import { CommunityService } from '../src/modules/community/community.service';

describe('Reel media acceptance', () => {
  function clip(seconds: number): Buffer {
    return execFileSync('ffmpeg', [
      '-v', 'error', '-f', 'lavfi', '-i', 'color=black:s=16x16:r=1',
      '-t', String(seconds), '-an', '-c:v', 'libx264',
      '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1',
    ]);
  }

  it.each([1, 300])('accepts a valid %i-second MP4', async seconds => {
    await expect(inspectReel(clip(seconds))).resolves.toBe(seconds);
  });

  it('rejects a 301-second MP4 and non-video bytes', async () => {
    await expect(inspectReel(clip(301))).rejects.toThrow('300 seconds');
    await expect(inspectReel(Buffer.from('not a video'))).rejects.toThrow('MP4');
  });

  it('checks audience and removal before reading private bytes', async () => {
    const previous = process.env.COMMUNITY_REELS_ENABLED;
    process.env.COMMUNITY_REELS_ENABLED = 'true';
    try {
      const id = '1f342bb1-b6bb-4038-bfff-88782a87c6b7';
      const user = { id: 'reader', roles: [Role.VERIFIED_MEMBER], branchIds: ['a'] } as any;
      let post: { status: string; branch_id: string; author_user_id: string } | undefined = { status: 'PUBLISHED', branch_id: 'a', author_user_id: 'author' };
      const query = jest.fn().mockImplementation(async (sql: string) =>
        ({ rows: sql.includes('FROM community_posts') ? (post ? [post] : []) : [{ id: 'video' }] }));
      const db = { query, transaction: async (work: Function) => work({ query }) } as any;
      const storage = { read: jest.fn().mockResolvedValue(Buffer.from('video')) } as any;
      const service = new CommunityReelService(db, new CommunityService(db, {} as any), storage, {} as any, {} as any);
      await expect(service.playback(id, { ...user, branchIds: ['b'] })).rejects.toThrow();
      expect(storage.read).not.toHaveBeenCalled();
      await expect(service.playback(id, user)).resolves.toEqual(Buffer.from('video'));
      post = undefined;
      await expect(service.playback(id, user)).rejects.toThrow('Post not found');
      expect(storage.read).toHaveBeenCalledTimes(1);
    } finally {
      if (previous === undefined) delete process.env.COMMUNITY_REELS_ENABLED;
      else process.env.COMMUNITY_REELS_ENABLED = previous;
    }
  });
});
