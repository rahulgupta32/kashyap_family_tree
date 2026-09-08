import { GenealogyService } from '../src/modules/genealogy/genealogy.service';
import { Gender, LivingStatus } from '@kashyap/contracts';

describe('GenealogyService (Unit Tests)', () => {
  let genealogyService: GenealogyService;

  beforeEach(() => {
    genealogyService = new GenealogyService();
  });

  it('should fetch a Person profile with parents, children, and branches', async () => {
    const person = await genealogyService.getPersonById('p-301');
    expect(person).toBeDefined();
    expect(person.primaryNameNepali).toBe('कृष्ण बहादुर अधिकारी');
    expect(person.generation).toBe(3);
    expect(person.gender).toBe(Gender.MALE);
    expect(person.livingStatus).toBe(LivingStatus.LIVING);
    expect(person.parents.length).toBeGreaterThan(0);
    expect(person.children.length).toBeGreaterThan(0);
  });

  it('should build hierarchical genealogy tree structure from root', async () => {
    const tree = await genealogyService.getTree({
      rootPersonId: 'p-101',
      ancestorGenerations: 0,
      descendantGenerations: 3,
    });

    expect(tree).toBeDefined();
    expect(tree.id).toBe('p-101');
    expect(tree.children.length).toBe(2); // Hari Prasad & Shiva Prasad
    expect(tree.children[0].children.length).toBe(2); // Krishna & Govinda
    expect(tree.children[0].children[0].children.length).toBe(2); // Dinesh & Suresh
  });
});
