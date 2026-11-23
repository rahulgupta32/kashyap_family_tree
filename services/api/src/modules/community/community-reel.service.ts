import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { DatabaseService } from '../../database/database.service';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { MediaStorageService } from '../../media/media-storage.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { MalwareScannerService } from '../profile/malware-scanner.service';
import { allowedFields, branchAccess, textField, uuid } from './community-policy';
import { CommunityService } from './community.service';

export const REEL_MAX_BYTES = 20 * 1024 * 1024;
const execute = promisify(execFile);

export async function inspectReel(buffer: Buffer): Promise<number> {
  if (buffer.length < 12 || buffer.length > REEL_MAX_BYTES || buffer.toString('ascii', 4, 8) !== 'ftyp') {
    throw new BadRequestException('Choose an MP4 video up to 20 MiB');
  }
  const dir = await mkdtemp(join(tmpdir(), 'community-reel-'));
  try {
    const input = join(dir, 'source.mp4');
    await writeFile(input, buffer, { mode: 0o600 });
    const { stdout } = await execute('ffprobe', [
      '-v', 'error', '-protocol_whitelist', 'file', '-f', 'mov', '-enable_drefs', '0',
      '-show_entries', 'format=duration:stream=codec_type,codec_name,duration:stream_disposition=attached_pic',
      '-of', 'json', input,
    ], { timeout: 8000, maxBuffer: 64 * 1024 });
    const { format, streams } = JSON.parse(stdout);
    if (!Array.isArray(streams) || !streams.some(stream => stream.codec_type === 'video' &&
      stream.codec_name === 'h264' && stream.disposition?.attached_pic === 0) ||
      streams.some(stream => !((stream.codec_type === 'video' && stream.codec_name === 'h264') ||
        (stream.codec_type === 'audio' && stream.codec_name === 'aac')))) {
      throw new BadRequestException('Use H.264 video with optional AAC audio');
    }
    const duration = Math.max(Number(format?.duration), ...streams.map(stream => Number(stream.duration ?? 0)));
    if (!Number.isFinite(duration) || duration <= 0 || duration > 300) {
      throw new BadRequestException('Reel duration must be between 0 and 300 seconds');
    }
    return duration;
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ServiceUnavailableException('Video inspection unavailable');
    }
    throw new BadRequestException('Could not inspect the MP4 video');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

@Injectable()
export class CommunityReelService {
  constructor(
    private readonly db: DatabaseService,
    private readonly community: CommunityService,
    private readonly storage: MediaStorageService,
    private readonly scanner: MalwareScannerService,
    private readonly audit: AuditOutboxRepository,
  ) {}

  private enabled() {
    if (process.env.COMMUNITY_REELS_ENABLED !== 'true') throw new NotFoundException('Reels unavailable');
  }

  async upload(user: AuthenticatedUser, body: any, file?: { buffer: Buffer }) {
    this.enabled();
    allowedFields(body, ['uploadId', 'branchId', 'caption', 'commentsEnabled']);
    const id = uuid(body.uploadId, 'upload ID');
    const branch = body.branchId ? uuid(body.branchId, 'branch') : null;
    branchAccess(user, branch);
    const caption = textField(body.caption, 'Caption', 2000);
    if (!['true', 'false'].includes(body.commentsEnabled)) throw new BadRequestException('Choose a comment setting');
    const comments = body.commentsEnabled === 'true';
    const buffer = file?.buffer;
    if (!buffer?.length || buffer.length > REEL_MAX_BYTES) throw new BadRequestException('Choose an MP4 up to 20 MiB');
    const checksum = createHash('sha256').update(buffer).digest('hex');
    const replay = async (client?: any) => {
      const row = (await this.db.query(`SELECT p.*,m.asset_id,m.reel_duration_seconds,a.sha256_checksum
        FROM community_posts p LEFT JOIN community_post_media m ON m.post_id=p.id AND m.removed_at IS NULL
        LEFT JOIN media_assets a ON a.id=m.asset_id WHERE p.id=$1`, [id], client)).rows[0];
      if (!row) return null;
      if (row.author_user_id !== user.id || row.deleted_at || row.branch_id !== branch ||
          row.content !== caption || row.comments_enabled !== comments || row.sha256_checksum !== checksum ||
          row.reel_duration_seconds == null) throw new ConflictException('Upload ID is already in use');
      return { id, assetId: row.asset_id, durationSeconds: Number(row.reel_duration_seconds), moderationStatus: row.status };
    };
    const existing = await replay();
    if (existing) return existing;

    const assetId = randomUUID();
    const name = `community_${assetId}.mp4`;
    const scan = await this.scanner.scanFile(buffer, name);
    if (scan.status === 'INFECTED') throw new BadRequestException('Video rejected by malware scanning');
    if (scan.status !== 'CLEAN') throw new ServiceUnavailableException('Video scanner unavailable');
    const duration = await inspectReel(buffer);
    const bucket = 'private-community';
    const location = await this.storage.put(bucket, name, buffer, 'video/mp4', user.id);
    const stored = { bucket, file_name: name, storage_key: name, storage_path: location };
    try {
      const result = await this.db.transaction(async client => {
        const account = (await client.query(
          'SELECT 1 FROM user_accounts WHERE id=$1 AND is_active AND NOT is_suspended AND deleted_at IS NULL FOR NO KEY UPDATE',
          [user.id],
        )).rows[0];
        if (!account) throw new ConflictException('Active account required');
        const previous = await replay(client);
        if (previous) return previous;
        const post = (await client.query(`INSERT INTO community_posts
          (id,author_user_id,branch_id,title,content,category,status,comments_enabled)
          VALUES($1,$2,$3,$4,$5,'DISCUSSION','PENDING',$6) RETURNING *`,
          [id,user.id,branch,caption.slice(0, 160),caption,comments])).rows[0];
        await client.query(`INSERT INTO media_assets
          (id,uploader_user_id,storage_key,bucket,file_name,mime_type,byte_size,sha256_checksum,is_private,
           quarantine_status,retention_status,storage_path,scan_evidence)
          VALUES($1,$2,$3,$4,$3,'video/mp4',$5,$6,TRUE,'CLEAN','ACTIVE',$7,$8)`,
          [assetId,user.id,name,bucket,buffer.length,checksum,location,JSON.stringify(scan.evidence)]);
        await client.query(`INSERT INTO community_post_media
          (asset_id,post_id,client_upload_id,submitted_version,change_reason,reel_duration_seconds)
          VALUES($1,$2,$2,$3,'Initial reel upload',$4)`, [assetId,id,post.version,duration]);
        await this.community.saveRevision(post,user.id,'Initial reel submission',client);
        await this.audit.recordAuditIntent({ action:'COMMUNITY_REEL_SUBMITTED',entityType:'community_post',
          entityId:id,actorId:user.id,newValue:{ assetId,durationSeconds:duration,commentsEnabled:comments } },client);
        return { id, assetId, durationSeconds: duration, moderationStatus:'PENDING' };
      });
      if (result.assetId !== assetId) await this.storage.remove(stored).catch(() => {});
      return result;
    } catch (error) {
      // Preserve bytes if the transaction may have committed.
      const persisted = await this.db.query('SELECT 1 FROM media_assets WHERE id=$1',[assetId]).catch(() => null);
      if (persisted && !persisted.rows.length) await this.storage.remove(stored).catch(() => {});
      throw error;
    }
  }

  async playback(id: string, user: AuthenticatedUser) {
    this.enabled();
    return this.db.transaction(async client => {
      await this.community.visiblePost(id,user,client);
      const row = (await client.query(`SELECT a.* FROM community_post_media m JOIN media_assets a ON a.id=m.asset_id
        WHERE m.post_id=$1 AND m.removed_at IS NULL AND m.reel_duration_seconds IS NOT NULL
          AND a.bucket='private-community' AND a.is_private AND a.mime_type='video/mp4'
          AND a.quarantine_status='CLEAN' AND a.retention_status IN ('ACTIVE','LEGAL_HOLD')
        FOR SHARE OF a`, [id])).rows[0];
      if (!row) throw new NotFoundException('Reel unavailable');
      return this.storage.read(row, REEL_MAX_BYTES);
    });
  }
}
