import { Injectable, OnModuleDestroy, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand, ListObjectVersionsCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import { promises as fs, constants } from 'fs';
import * as path from 'path';

/** Private bytes only. Callers must authorize and check scan/retention before reading. */
@Injectable()
export class MediaStorageService implements OnModuleDestroy {
  onModuleDestroy() { this.s3?.destroy(); }
  async checkHealth(): Promise<'up' | 'down'> {
    if (!this.s3) return 'up';
    try { await this.s3.send(new HeadBucketCommand({Bucket:this.bucket}), {abortSignal:AbortSignal.timeout(3000)}); return 'up'; } catch { return 'down'; }
  }
  private readonly root = path.resolve(process.env.STORAGE_PATH || path.resolve(process.cwd(), 'storage/uploads'));
  private readonly bucket?: string;
  private readonly s3?: S3Client;
  constructor() {
    const backend = process.env.MEDIA_STORAGE_BACKEND || 'local';
    if (!['local', 's3'].includes(backend)) throw new Error('Unsupported MEDIA_STORAGE_BACKEND');
    if (['production', 'staging'].includes(process.env.NODE_ENV || '') && backend !== 's3') {
      throw new Error('Production and staging require private S3 media storage');
    }
    if (backend === 's3') {
      this.bucket = process.env.MEDIA_S3_BUCKET;
      if (!this.bucket || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(this.bucket)) throw new Error('Configure MEDIA_S3_BUCKET');
      const endpoint = process.env.MEDIA_S3_ENDPOINT;
      if (endpoint) {
        const url = new URL(endpoint);
        if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid MEDIA_S3_ENDPOINT');
        if (url.protocol !== 'https:' && ['production', 'staging'].includes(process.env.NODE_ENV || '')) throw new Error('S3 requires HTTPS in production and staging');
      }
      this.s3 = new S3Client({ region: process.env.MEDIA_S3_REGION || 'us-east-1', endpoint,
        forcePathStyle: process.env.MEDIA_S3_FORCE_PATH_STYLE === 'true', maxAttempts: 3,
        requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
    }
  }
  private key(bucket: string, fileName: string) {
    if (!['private-profiles', 'private-chat', 'private-derivatives'].includes(bucket) || !/^(avatar|attachment|derivative)_[a-f0-9-]{36}\.(png|jpg|webp|pdf)$/.test(fileName)) throw new NotFoundException('Invalid media location');
    return `${bucket}/${fileName}`;
  }
  location(bucket: string, fileName: string) {
    const key = this.key(bucket, fileName);
    return this.s3 ? `s3://${this.bucket}/${key}?versionId=null` : path.join(this.root, ...(bucket === 'private-chat' ? ['chat'] : bucket === 'private-derivatives' ? ['derivatives'] : []), fileName);
  }
  validateLocation(row: any) {
    const expected = this.location(row.bucket, row.file_name);
    if (row.storage_key !== row.file_name) throw new NotFoundException('Invalid media location');
    if (this.s3) {
      const base=expected.slice(0, expected.indexOf('?'));
      const location=row.storage_path;
      if (typeof location !== 'string' || !location.startsWith(base+'?versionId=')) throw new NotFoundException('Invalid media location');
      const encoded=location.slice((base+'?versionId=').length);
      let version: string; try { version=decodeURIComponent(encoded); } catch { throw new NotFoundException('Invalid media location'); }
      if (!version || version.length>1024 || encodeURIComponent(version)!==encoded) throw new NotFoundException('Invalid media location');
      return location;
    }
    if(row.storage_path !== expected) throw new NotFoundException('Invalid media location');
    return expected;
  }
  inventoryScope() {
    return createHash('sha256').update(JSON.stringify([this.s3?'s3':'local',this.bucket||this.root,process.env.MEDIA_S3_ENDPOINT||'aws'])).digest('hex');
  }
  async inventoryPage(cursor:any=null) {
    const prefixes=['private-profiles','private-chat','private-derivatives'];
    const index=cursor?.index||0;
    if(!Number.isInteger(index)||index<0||index>=prefixes.length)throw new Error('Invalid inventory cursor');
    const bucket=prefixes[index],objects:any[]=[];
    let next:any=null;
    if(this.s3){
      const result=await this.s3.send(new ListObjectVersionsCommand({Bucket:this.bucket,Prefix:bucket+'/',MaxKeys:100,KeyMarker:cursor?.key,VersionIdMarker:cursor?.version}),{abortSignal:AbortSignal.timeout(30000)});
      for(const entry of [...(result.Versions||[]).map(value=>({...value,deleted:false})),...(result.DeleteMarkers||[]).map(value=>({...value,deleted:true}))]){
        const name=entry.Key?.slice(bucket.length+1)||'';
        let managed=true;try{this.key(bucket,name);}catch{managed=false;}
        objects.push({bucket,fileName:managed?name:null,location:`s3://${this.bucket}/${entry.Key}?versionId=${encodeURIComponent(entry.VersionId||'null')}`,modifiedAt:entry.LastModified,deleteMarker:entry.deleted,managed});
      }
      if(result.IsTruncated){if(!result.NextKeyMarker)throw new Error('Missing inventory continuation');next={index,key:result.NextKeyMarker,version:result.NextVersionIdMarker};}
    }else{
      const directory=path.join(this.root,...(index===1?['chat']:index===2?['derivatives']:[]));
      let handle:Awaited<ReturnType<typeof fs.opendir>>|undefined;
      try{
        const root=await fs.realpath(this.root),real=await fs.realpath(directory);
        if(real!==path.join(root,...(index===1?['chat']:index===2?['derivatives']:[])))throw new Error('Unsafe inventory directory');
        handle=await fs.opendir(directory);const names:string[]=[];
        for await(const entry of handle){if(index===0&&['chat','derivatives'].includes(entry.name))continue;if(entry.name<=(cursor?.after||''))continue;names.push(entry.name);names.sort();if(names.length>101)names.pop();}
        handle=undefined;
        for(const name of names.slice(0,100)){
          const location=path.join(directory,name),stat=await fs.lstat(location);let managed=stat.isFile()&&!stat.isSymbolicLink();
          try{this.key(bucket,name);}catch{managed=false;}
          objects.push({bucket,fileName:managed?name:null,location,modifiedAt:stat.mtime,deleteMarker:false,managed});
        }
        if(names.length>100)next={index,after:names[99]};
      }catch(error:any){if(error.code!=='ENOENT')throw error;}finally{if(handle)await handle.close().catch(()=>undefined);}
    }
    if(!next&&index<2)next={index:index+1};
    return {objects,next};
  }
  async put(bucket: string, fileName: string, buffer: Buffer, mimeType: string) {
    const location = this.location(bucket, fileName);
    try {
      if (this.s3) {
        const result = await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: this.key(bucket, fileName), Body: buffer,
          ContentType: mimeType, ContentLength: buffer.length, IfNoneMatch: '*',
          Metadata: { sha256: createHash('sha256').update(buffer).digest('hex') } }), { abortSignal: AbortSignal.timeout(30000) });
        return location.replace('?versionId=null', '?versionId='+encodeURIComponent(result.VersionId || 'null'));
      } else {
        await fs.mkdir(path.dirname(location), { recursive: true, mode: 0o700 });
        const directory = await fs.realpath(path.dirname(location));
        const root = await fs.realpath(this.root);
        if (directory !== root && directory !== path.join(root, 'chat') && directory !== path.join(root, 'derivatives')) throw new Error('Unsafe storage directory');
        await fs.writeFile(location, buffer, { flag: 'wx', mode: 0o600 });
      }
      return location;
    } catch { throw new ServiceUnavailableException('Private media storage write failed'); }
  }
  async read(row: any, maximumBytes = 10 * 1024 * 1024): Promise<Buffer> {
    const location = this.validateLocation(row);
    const size = Number(row.byte_size);
    if (!Number.isSafeInteger(size) || size < 1 || size > maximumBytes) throw new ServiceUnavailableException('Media integrity verification failed');
    let buffer: Buffer;
    try {
      if (this.s3) {
        const result = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.key(row.bucket, row.file_name), VersionId: decodeURIComponent(location.split('?versionId=')[1]) }), { abortSignal: AbortSignal.timeout(30000) });
        if (!result.Body || result.ContentLength !== size) { (result.Body as any)?.destroy?.(); throw new Error('Size mismatch'); }
        const chunks: Buffer[] = []; let total = 0;
        try { for await (const chunk of result.Body as any) { const bytes = Buffer.from(chunk); total += bytes.length; if (total > size) throw new Error('Size mismatch'); chunks.push(bytes); } }
        finally { (result.Body as any).destroy?.(); }
        buffer = Buffer.concat(chunks, total);
      } else {
        const real = await fs.realpath(location);
        const root = await fs.realpath(this.root);
        if (real !== path.join(root, ...(row.bucket === 'private-chat' ? ['chat'] : row.bucket === 'private-derivatives' ? ['derivatives'] : []), row.file_name)) throw new Error('Unsafe storage path');
        const handle = await fs.open(location, constants.O_RDONLY | constants.O_NOFOLLOW);
        try { const stat = await handle.stat(); if (!stat.isFile() || stat.size !== size) throw new Error('Size mismatch'); const chunks: Buffer[]=[]; let total=0;
          for await (const chunk of handle.createReadStream({autoClose:false,end:size})) { const bytes=Buffer.from(chunk); total+=bytes.length; if(total>size) throw new Error('Size mismatch'); chunks.push(bytes); }
          buffer=Buffer.concat(chunks,total); }
        finally { await handle.close(); }
      }
    } catch (error: any) {
      if (error?.code === 'ENOENT' || error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) throw new NotFoundException('Media bytes not found');
      throw new ServiceUnavailableException('Private media storage read failed');
    }
    if (buffer.length !== size || createHash('sha256').update(buffer).digest('hex') !== row.sha256_checksum) throw new ServiceUnavailableException('Media integrity verification failed');
    return buffer;
  }
  async remove(row: any) {
    const location = this.validateLocation(row);
    if (this.s3) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(row.bucket, row.file_name), VersionId: decodeURIComponent(location.split('?versionId=')[1]) }), { abortSignal: AbortSignal.timeout(30000) });
    } else {
      try {
        const real = await fs.realpath(location), root = await fs.realpath(this.root);
        if (real !== path.join(root, ...(row.bucket === 'private-chat' ? ['chat'] : row.bucket === 'private-derivatives' ? ['derivatives'] : []), row.file_name)) throw new Error('Unsafe storage path');
        const stat = await fs.lstat(location); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe storage path');
        await fs.unlink(location);
      } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
    }
  }
}
