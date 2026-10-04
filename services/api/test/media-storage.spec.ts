import { MediaStorageService } from '../src/media/media-storage.service';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';

describe('Private media storage boundaries', () => {
  const original = { ...process.env };
  let directory: string;
  const bytes = Buffer.from('Fictional private media');
  const file = () => `avatar_${randomUUID()}.png`;
  const record = (name: string, location: string) => ({bucket:'private-profiles',file_name:name,storage_key:name,storage_path:location,byte_size:bytes.length,sha256_checksum:createHash('sha256').update(bytes).digest('hex')});
  beforeEach(async () => { process.env.NODE_ENV='test';process.env.MEDIA_STORAGE_BACKEND='local';directory=await fs.mkdtemp(path.join(os.tmpdir(),'media-storage-test-'));process.env.STORAGE_PATH=directory; });
  afterEach(async () => { jest.restoreAllMocks();process.env={...original};await fs.rm(directory,{recursive:true,force:true}); });
  it('requires durable HTTPS storage in production and rejects unknown backends', () => {
    process.env.NODE_ENV='production';expect(()=>new MediaStorageService()).toThrow('require private S3');
    process.env.MEDIA_STORAGE_BACKEND='s3';delete process.env.MEDIA_S3_BUCKET;expect(()=>new MediaStorageService()).toThrow('MEDIA_S3_BUCKET');
    process.env.MEDIA_S3_BUCKET='fictional-private';process.env.MEDIA_S3_ENDPOINT='http://localhost:9000';expect(()=>new MediaStorageService()).toThrow('HTTPS');
    process.env.MEDIA_STORAGE_BACKEND='typo';expect(()=>new MediaStorageService()).toThrow('Unsupported');
  });
  it('survives adapter recreation and refuses overwrite, tampered bytes and changed locations', async () => {
    const name=file(),store=new MediaStorageService(),location=await store.put('private-profiles',name,bytes,'image/png'),row=record(name,location);
    expect(await new MediaStorageService().read(row)).toEqual(bytes);
    await expect(store.put('private-profiles',name,Buffer.from('overwrite'),'image/png')).rejects.toThrow();expect(await store.read(row)).toEqual(bytes);
    await expect(store.read({...row,storage_path:'/etc/passwd'})).rejects.toThrow('Invalid media location');
    await fs.writeFile(location,Buffer.alloc(bytes.length));await expect(store.read(row)).rejects.toThrow('integrity');
    await store.remove(row);await store.remove(row);await expect(store.read(row)).rejects.toThrow('not found');
  });
  it('rejects local symlinks on reads and deletion', async () => {
    const name=file(),store=new MediaStorageService(),location=store.location('private-profiles',name),target=path.join(directory,'unrelated.txt');await fs.writeFile(target,bytes);await fs.symlink(target,location);
    await expect(store.read(record(name,location))).rejects.toThrow();await expect(store.remove(record(name,location))).rejects.toThrow();expect(await fs.readFile(target)).toEqual(bytes);
    await expect(store.remove({...record(name,location),file_name:'../../unrelated.txt'})).rejects.toThrow();
  });
  it('uses only the configured S3 bucket, private generated keys and conditional writes', async () => {
    process.env.MEDIA_STORAGE_BACKEND='s3';process.env.MEDIA_S3_BUCKET='fictional-private';process.env.MEDIA_S3_ENDPOINT='http://127.0.0.1:9000';
    const send=jest.spyOn(S3Client.prototype,'send') as jest.SpyInstance;send.mockResolvedValue({});
    const store=new MediaStorageService(),name=file(),location=await store.put('private-profiles',name,bytes,'image/png'),row=record(name,location);
    const put=send.mock.calls[0][0] as PutObjectCommand;expect(put).toBeInstanceOf(PutObjectCommand);expect(put.input).toMatchObject({Bucket:'fictional-private',Key:`private-profiles/${name}`,IfNoneMatch:'*'});expect(put.input.ACL).toBeUndefined();
    send.mockResolvedValue({Body:Readable.from([bytes]),ContentLength:bytes.length});expect(await store.read(row)).toEqual(bytes);expect(send.mock.calls[1][0]).toBeInstanceOf(GetObjectCommand);
    await expect(store.read({...row,storage_path:`s3://other/private-profiles/${name}`})).rejects.toThrow('Invalid media location');
    send.mockResolvedValue({});await store.remove(row);expect(send.mock.calls[2][0]).toBeInstanceOf(DeleteObjectCommand);
  });
  it('fails closed on S3 outage and bounds streamed reads even when the length header lies', async () => {
    process.env.MEDIA_STORAGE_BACKEND='s3';process.env.MEDIA_S3_BUCKET='fictional-private';
    const send=jest.spyOn(S3Client.prototype,'send') as jest.SpyInstance;send.mockRejectedValue(new Error('offline'));
    const store=new MediaStorageService(),name=file(),row=record(name,store.location('private-profiles',name));await expect(store.put('private-profiles',name,bytes,'image/png')).rejects.toThrow('write failed');await expect(store.read(row)).rejects.toThrow('read failed');await expect(store.remove(row)).rejects.toThrow('offline');
    send.mockResolvedValue({Body:Readable.from([bytes,bytes]),ContentLength:bytes.length});await expect(store.read(row)).rejects.toThrow('read failed');
  });
  it('inventories bounded local pages without following symlinks or exposing untrusted names as managed',async()=>{
    const store=new MediaStorageService(),names=Array.from({length:103},()=>file()).sort();
    await Promise.all(names.map(name=>store.put('private-profiles',name,bytes,'image/png')));
    const first=await store.inventoryPage();expect(first.objects).toHaveLength(100);expect(first.next.index).toBe(0);
    const second=await store.inventoryPage(first.next);expect(second.objects).toHaveLength(3);expect(second.next.index).toBe(1);
    expect(new Set([...first.objects,...second.objects].map(o=>o.location)).size).toBe(103);
    const target=path.join(directory,'outside.txt');await fs.writeFile(target,bytes);await fs.symlink(target,path.join(directory,'avatar_00000000-0000-4000-8000-000000000000.png'));
    const page=await store.inventoryPage();expect(page.objects.some(o=>!o.managed)).toBe(true);
    await expect(store.inventoryPage({index:-1})).rejects.toThrow('cursor');
  });
  it('uses version-aware S3 inventory and retains explicit continuation markers',async()=>{
    process.env.MEDIA_STORAGE_BACKEND='s3';process.env.MEDIA_S3_BUCKET='fictional-private';
    const send=jest.spyOn(S3Client.prototype,'send') as jest.SpyInstance,name=file();send.mockResolvedValue({Versions:[{Key:'private-profiles/'+name,VersionId:'v+1',LastModified:new Date()}],DeleteMarkers:[{Key:'private-profiles/'+name,VersionId:'marker',LastModified:new Date()}],IsTruncated:true,NextKeyMarker:'private-profiles/'+name,NextVersionIdMarker:'marker'});
    const page=await new MediaStorageService().inventoryPage();expect(page.objects[0].location).toContain('versionId=v%2B1');expect(page.objects[1].deleteMarker).toBe(true);expect(page.next.version).toBe('marker');expect(send.mock.calls[0][0].input).toMatchObject({Prefix:'private-profiles/',MaxKeys:100});
  });

});
