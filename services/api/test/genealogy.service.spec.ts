import { GenealogyService } from '../src/modules/genealogy/genealogy.service';
import { Gender, LivingStatus, ErrorCode, SpouseStatus } from '@kashyap/contracts';

describe('GenealogyService (Comprehensive Unit, Graph & Edge Case Tests)', () => {
  let genealogyService: GenealogyService;

  beforeEach(() => {
    genealogyService = new GenealogyService();
  });

  describe('Person Profiles & Direct Relatives', () => {
    it('should fetch a Person profile with parents, children, and branches', async () => {
      const person = await genealogyService.getPersonById('p-301');
      expect(person).toBeDefined();
      expect(person.primaryNameNepali).toBe('कृष्ण बहादुर अधिकारी (परीक्षण)');
      expect(person.generation).toBe(3);
      expect(person.gender).toBe(Gender.MALE);
      expect(person.livingStatus).toBe(LivingStatus.LIVING);
      expect(person.parents.length).toBeGreaterThan(0);
      expect(person.children.length).toBeGreaterThan(0);
    });

    it('should throw PERSON_NOT_FOUND when querying nonexistent ID', async () => {
      await expect(genealogyService.getPersonById('p-nonexistent')).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.PERSON_NOT_FOUND,
        },
      });
    });
  });

  describe('Graph Integrity & Cycle Prevention', () => {
    it('should prevent linking a person to themselves as parent (EC-GEN-001)', async () => {
      await expect(genealogyService.addParentLink('p-301', 'p-301')).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.SELF_LINK_PROHIBITED,
        },
      });
    });

    it('should prevent linking a person to themselves as spouse', async () => {
      await expect(genealogyService.addSpouseLink('p-301', 'p-301')).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.SELF_LINK_PROHIBITED,
        },
      });
    });

    it('should prevent duplicate parent links', async () => {
      // p-101 is already parent of p-201
      await expect(genealogyService.addParentLink('p-101', 'p-201')).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.DUPLICATE_PARENT_LINK,
        },
      });
    });

    it('should detect and reject directed ancestry cycles (EC-GEN-002: p-401 -> p-101)', async () => {
      // p-101 is ancestor of p-201 -> p-301 -> p-401.
      // Trying to make p-401 a parent of p-101 must be rejected!
      await expect(genealogyService.addParentLink('p-401', 'p-101')).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.CYCLE_DETECTED,
        },
      });
    });

    it('should correctly identify multi-hop descendants', () => {
      expect(genealogyService.isDescendantOf('p-401', 'p-101')).toBe(true);
      expect(genealogyService.isDescendantOf('p-301', 'p-101')).toBe(true);
      expect(genealogyService.isDescendantOf('p-101', 'p-401')).toBe(false);
    });
  });

  describe('Account–Person Separation (BR-GEN-001, PROF-FR-001/011)', () => {
    it('should preserve Person genealogy record when user account is de-linked/deleted', async () => {
      const personBefore = await genealogyService.getPersonById('p-401');
      expect(personBefore.isClaimed).toBe(true);
      expect(personBefore.claimedByUserId).toBe('u-401');

      // Execute de-linking
      await genealogyService.deLinkUserAccount('p-401');

      const personAfter = await genealogyService.getPersonById('p-401');
      expect(personAfter.isClaimed).toBe(false);
      expect(personAfter.claimedByUserId).toBeUndefined();
      // Lineage & name remain fully intact
      expect(personAfter.primaryNameNepali).toBe('दिनेश अधिकारी (परीक्षण)');
      expect(personAfter.parents.length).toBeGreaterThan(0);
    });
  });

  describe('Hierarchical Family Tree Traversal (GEN-FR-009/010)', () => {
    it('should build hierarchical genealogy tree structure up to 4 generations', async () => {
      const tree = await genealogyService.getTree({
        rootPersonId: 'p-101',
        ancestorGenerations: 0,
        descendantGenerations: 3,
      });

      expect(tree).toBeDefined();
      expect(tree.id).toBe('p-101');
      expect(tree.children.length).toBe(2); // Hari & Shiva
      expect(tree.children[0].children.length).toBe(2); // Krishna & Govinda
      expect(tree.children[0].children[0].children.length).toBe(2); // Dinesh & Suresh
    });

    it('should reject requests exceeding maximum safe depth (>25 generations)', async () => {
      await expect(
        genealogyService.getTree({
          rootPersonId: 'p-101',
          descendantGenerations: 30,
        }),
      ).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.MAX_TREE_DEPTH_EXCEEDED,
        },
      });
    });
  });
});
