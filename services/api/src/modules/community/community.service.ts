import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ErrorCode } from '@kashyap/contracts';

export interface PostComment {
  id: string;
  postId: string;
  authorUserId: string;
  authorName: string;
  content: string;
  createdAt: string;
  isDeleted: boolean;
}

export interface CommunityPost {
  id: string;
  branchId?: string;
  authorUserId: string;
  authorName: string;
  title: string;
  content: string;
  category: 'ANNOUNCEMENT' | 'DISCUSSION' | 'RITUAL' | 'ACHIEVEMENT';
  likesCount: number;
  likedByUserIds: Set<string>;
  commentsCount: number;
  comments: PostComment[];
  isFlagged: boolean;
  moderationStatus: 'APPROVED' | 'PENDING' | 'REJECTED';
  flaggedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClanEvent {
  id: string;
  title: string;
  description: string;
  eventType: 'KUL_PUJA' | 'GATHERING' | 'SHRADDHA' | 'MEETING';
  eventDate: string;
  locationName: string;
  latitude?: number;
  longitude?: number;
  organizerUserId: string;
  rsvps: Map<string, 'GOING' | 'MAYBE' | 'DECLINED'>;
  createdAt: string;
}

@Injectable()
export class CommunityService {
  private posts = new Map<string, CommunityPost>();
  private events = new Map<string, ClanEvent>();

  constructor() {
    // Seed default baseline announcement
    const seedPost: CommunityPost = {
      id: 'post_001',
      branchId: 'branch_dhading',
      authorUserId: 'u-admin',
      authorName: 'Admin Adhikari',
      title: 'बार्षिक कुलपुजा तथा साधारण सभा सम्बन्धी सूचना',
      content: 'यस वर्षको कश्यप गोत्र अधिकारी कुलपुजा आगामी मंसीर पूर्णिमाका दिन धादिङमा आयोजना हुने व्यहोरा जानकारी गराइन्छ।',
      category: 'ANNOUNCEMENT',
      likesCount: 12,
      likedByUserIds: new Set(['u-401', 'u-402']),
      commentsCount: 1,
      comments: [
        {
          id: 'comm_001',
          postId: 'post_001',
          authorUserId: 'u-401',
          authorName: 'Ram Adhikari',
          content: 'उपस्थित हुनेछौं। जय विन्ध्यवासिनी!',
          createdAt: '2026-09-08T10:00:00Z',
          isDeleted: false,
        },
      ],
      isFlagged: false,
      moderationStatus: 'APPROVED',
      createdAt: '2026-09-08T08:00:00Z',
      updatedAt: '2026-09-08T08:00:00Z',
    };
    this.posts.set(seedPost.id, seedPost);

    // Seed default event
    const seedEvent: ClanEvent = {
      id: 'event_001',
      title: 'कश्यप अधिकारी बार्षिक कुलपुजा २०८३',
      description: 'धादिङ मूल थलोमा कुलपुजा तथा बंशावली अन्तरक्रिया',
      eventType: 'KUL_PUJA',
      eventDate: '2026-11-25T09:00:00Z',
      locationName: 'Dhading Besi, Nepal',
      latitude: 27.8667,
      longitude: 84.9000,
      organizerUserId: 'u-admin',
      rsvps: new Map([
        ['u-401', 'GOING'],
        ['u-402', 'MAYBE'],
      ]),
      createdAt: '2026-09-08T08:00:00Z',
    };
    this.events.set(seedEvent.id, seedEvent);
  }

  async createPost(data: {
    authorUserId: string;
    authorName: string;
    branchId?: string;
    title: string;
    content: string;
    category: 'ANNOUNCEMENT' | 'DISCUSSION' | 'RITUAL' | 'ACHIEVEMENT';
  }): Promise<CommunityPost> {
    const id = `post_${Date.now()}`;
    const post: CommunityPost = {
      id,
      branchId: data.branchId,
      authorUserId: data.authorUserId,
      authorName: data.authorName,
      title: data.title,
      content: data.content,
      category: data.category,
      likesCount: 0,
      likedByUserIds: new Set(),
      commentsCount: 0,
      comments: [],
      isFlagged: false,
      moderationStatus: 'APPROVED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.posts.set(id, post);
    return post;
  }

  async listPosts(branchId?: string): Promise<any[]> {
    return Array.from(this.posts.values())
      .filter((p) => p.moderationStatus === 'APPROVED' && (!branchId || p.branchId === branchId || !p.branchId))
      .map((p) => ({
        ...p,
        likedByUserIds: Array.from(p.likedByUserIds),
      }));
  }

  async toggleLike(postId: string, userId: string): Promise<{ likesCount: number; isLiked: boolean }> {
    const post = this.posts.get(postId);
    if (!post) {
      throw new NotFoundException({
        errorCode: ErrorCode.POST_NOT_FOUND,
        message: 'Post not found',
      });
    }

    let isLiked = false;
    if (post.likedByUserIds.has(userId)) {
      post.likedByUserIds.delete(userId);
      post.likesCount = Math.max(0, post.likesCount - 1);
      isLiked = false;
    } else {
      post.likedByUserIds.add(userId);
      post.likesCount += 1;
      isLiked = true;
    }

    return { likesCount: post.likesCount, isLiked };
  }

  async addComment(postId: string, data: { authorUserId: string; authorName: string; content: string }): Promise<PostComment> {
    const post = this.posts.get(postId);
    if (!post) {
      throw new NotFoundException({
        errorCode: ErrorCode.POST_NOT_FOUND,
        message: 'Post not found',
      });
    }

    const comment: PostComment = {
      id: `comm_${Date.now()}`,
      postId,
      authorUserId: data.authorUserId,
      authorName: data.authorName,
      content: data.content,
      createdAt: new Date().toISOString(),
      isDeleted: false,
    };

    post.comments.push(comment);
    post.commentsCount = post.comments.filter((c) => !c.isDeleted).length;
    return comment;
  }

  async flagPost(postId: string, reason: string): Promise<void> {
    const post = this.posts.get(postId);
    if (!post) {
      throw new NotFoundException({
        errorCode: ErrorCode.POST_NOT_FOUND,
        message: 'Post not found',
      });
    }
    post.isFlagged = true;
    post.flaggedReason = reason;
    post.moderationStatus = 'PENDING';
  }

  async moderatePost(postId: string, decision: 'APPROVED' | 'REJECTED'): Promise<void> {
    const post = this.posts.get(postId);
    if (!post) {
      throw new NotFoundException({
        errorCode: ErrorCode.POST_NOT_FOUND,
        message: 'Post not found',
      });
    }
    post.moderationStatus = decision;
    if (decision === 'APPROVED') {
      post.isFlagged = false;
    }
  }

  // Events & RSVP
  async listEvents(): Promise<any[]> {
    return Array.from(this.events.values()).map((e) => ({
      ...e,
      rsvps: Object.fromEntries(e.rsvps),
      goingCount: Array.from(e.rsvps.values()).filter((v) => v === 'GOING').length,
    }));
  }

  async rsvpEvent(eventId: string, userId: string, response: 'GOING' | 'MAYBE' | 'DECLINED'): Promise<void> {
    const event = this.events.get(eventId);
    if (!event) {
      throw new NotFoundException({
        errorCode: ErrorCode.EVENT_NOT_FOUND,
        message: 'Event not found',
      });
    }
    event.rsvps.set(userId, response);
  }

}
