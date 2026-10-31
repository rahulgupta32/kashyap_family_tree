import { MapService } from '../src/modules/map/map.service';
import { PrivacyEngineService } from '../src/modules/genealogy/privacy/privacy-engine.service';
import { Role } from '@kashyap/contracts';
import { randomUUID } from 'crypto';
describe('Map authorization and generalized coordinates',()=>{
 let service:MapService;
 const db:any={query:jest.fn(),transaction:jest.fn()};
 const user:any={id:randomUUID(),roles:[Role.VERIFIED_MEMBER],branchIds:[],roleAssignments:[]};
 beforeEach(()=>{jest.clearAllMocks();service=new MapService(db,{} as any,new PrivacyEngineService());});
 it('rejects caller-supplied verification flags and incomplete bounds',async()=>{
  await expect(service.getHouseholds({isVerified:'true'})).rejects.toThrow('Unexpected request fields');
  await expect(service.getHouseholds({minLat:27})).rejects.toThrow('complete map bounding box');expect(db.query).not.toHaveBeenCalled();
 });
 it('requires linked adult identity and explicit visibility/consent before storing a map proposal',async()=>{
  await expect(service.save(user,{title:'Fictional home',district:'Kaski',municipality:'Pokhara',visibility:'VERIFIED_COMMUNITY',mapConsent:true,protectedLocation:false,latitude:28,longitude:84,version:0})).rejects.toThrow('Link a verified adult profile');expect(db.transaction).not.toHaveBeenCalled();
 });
 it('never trusts ownership or branch fields in map updates',async()=>{
  await expect(service.save(user,{ownerUserId:randomUUID(),branchId:randomUUID()})).rejects.toThrow('Unexpected request fields');expect(db.transaction).not.toHaveBeenCalled();
 });
});
