import { CommunityService } from '../src/modules/community/community.service';

describe('CommunityService (Posts, Moderation, Events & RSVP)', () => {
  let communityService: CommunityService;

  beforeEach(() => {
    communityService = new CommunityService();
  });

  describe('Post Creation, Likes & Comments', () => {
    it('should create and list approved community posts', async () => {
      const post = await communityService.createPost({
        authorUserId: 'u-401',
        authorName: 'Ram Adhikari',
        branchId: 'branch_dhading',
        title: 'बंशावली अपडेट सम्बन्धी छलफल',
        content: 'धादिङ शाखाका सबै सदस्यहरूलाई आफ्नो विवरण अद्यावधिक गर्न अनुरोध छ।',
        category: 'DISCUSSION',
      });

      expect(post.id).toBeDefined();
      expect(post.category).toBe('DISCUSSION');
      expect(post.moderationStatus).toBe('APPROVED');

      const posts = await communityService.listPosts('branch_dhading');
      expect(posts.some((p) => p.id === post.id)).toBe(true);
    });

    it('should toggle likes idempotently', async () => {
      const posts = await communityService.listPosts();
      const firstPost = posts[0];

      // User 403 likes
      const likeRes = await communityService.toggleLike(firstPost.id, 'u-403');
      expect(likeRes.isLiked).toBe(true);
      expect(likeRes.likesCount).toBe(firstPost.likesCount + 1);

      // User 403 unlikes
      const unlikeRes = await communityService.toggleLike(firstPost.id, 'u-403');
      expect(unlikeRes.isLiked).toBe(false);
      expect(unlikeRes.likesCount).toBe(firstPost.likesCount);
    });

    it('should add comments to a post', async () => {
      const posts = await communityService.listPosts();
      const firstPost = posts[0];

      const comment = await communityService.addComment(firstPost.id, {
        authorUserId: 'u-402',
        authorName: 'Hari Adhikari',
        content: 'हामी सबै उपस्थित हुनेछौं।',
      });

      expect(comment.id).toBeDefined();
      expect(comment.content).toBe('हामी सबै उपस्थित हुनेछौं।');
    });
  });

  describe('Post Flagging & Moderation Queue', () => {
    it('should put flagged posts into moderation queue until reviewed', async () => {
      const post = await communityService.createPost({
        authorUserId: 'u-spammer',
        authorName: 'Spam User',
        title: 'Unauthorized Content',
        content: 'Spam promotional content',
        category: 'DISCUSSION',
      });

      await communityService.flagPost(post.id, 'Inappropriate / commercial spam');

      // Unapproved post is hidden from public list
      const publicPosts = await communityService.listPosts();
      expect(publicPosts.some((p) => p.id === post.id)).toBe(false);

      // Moderator approves
      await communityService.moderatePost(post.id, 'APPROVED');
      const approvedPosts = await communityService.listPosts();
      expect(approvedPosts.some((p) => p.id === post.id)).toBe(true);
    });
  });

  describe('Clan Events & RSVP Tracking', () => {
    it('should list events and record RSVP responses', async () => {
      const events = await communityService.listEvents();
      expect(events.length).toBeGreaterThan(0);
      const event = events[0];

      await communityService.rsvpEvent(event.id, 'u-403', 'GOING');

      const updatedEvents = await communityService.listEvents();
      const updated = updatedEvents.find((e) => e.id === event.id);
      expect(updated.rsvps['u-403']).toBe('GOING');
    });
  });
});
