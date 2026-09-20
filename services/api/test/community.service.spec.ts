import { CommunityService } from '../src/modules/community/community.service';
import { canModerate, branchAccess } from '../src/modules/community/community-policy';
import { Role } from '@kashyap/contracts';
import { AuthenticatedUser } from '../src/modules/auth/decorators/current-user.decorator';
const member:AuthenticatedUser={id:'member',personId:undefined,phoneNumber:'',sessionId:'session',roles:[Role.VERIFIED_MEMBER],branchIds:['branch-a'],roleAssignments:[{role:Role.VERIFIED_MEMBER,branchId:'branch-a'}]};

describe('Community authorization and request integrity',()=>{
  const db={query:jest.fn(),transaction:jest.fn()};
  const service=new CommunityService(db as any,{} as any);
  beforeEach(()=>jest.clearAllMocks());
  it('rejects caller-supplied author identity before querying persistence',async()=>{
    await expect(service.createPost(member,{title:'Title',content:'Content',category:'DISCUSSION',authorUserId:'victim'})).rejects.toThrow('Unexpected request fields');
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it('does not confer moderation in a membership branch from an admin role in another branch',()=>{
    const actor={...member,roles:[Role.BRANCH_ADMIN,Role.VERIFIED_MEMBER],branchIds:['branch-a','branch-b'],roleAssignments:[{role:Role.BRANCH_ADMIN,branchId:'branch-a'},{role:Role.VERIFIED_MEMBER,branchId:'branch-b'}]};
    expect(canModerate(actor,'branch-a')).toBe(true);
    expect(canModerate(actor,'branch-b')).toBe(false);
    expect(canModerate(actor,undefined)).toBe(false);
  });
  it('rejects unverified accounts and other branches',()=>{
    expect(()=>branchAccess({...member,roles:[Role.REGISTERED_USER]},'branch-a')).toThrow('Verified community membership');
    expect(()=>branchAccess(member,'branch-b')).toThrow('outside your current membership');
  });
  it('requires explicit reaction state instead of retry-sensitive toggling',async()=>{
    await expect(service.react('post',member,'true' as any)).rejects.toThrow('boolean');
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it('rejects unknown publication categories and empty content',async()=>{
    await expect(service.createPost(member,{title:'Title',content:' ',category:'DISCUSSION'})).rejects.toThrow('Content must contain');
    await expect(service.createPost(member,{title:'Title',content:'Content',category:'IMPERSONATION'})).rejects.toThrow('Invalid category');
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
