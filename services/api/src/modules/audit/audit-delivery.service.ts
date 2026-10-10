import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { MigrationService } from '../../database/migration.service';
import { AuditRepository } from '../../database/repositories/audit.repository';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';

@Injectable()
export class AuditDeliveryService implements OnModuleInit,OnModuleDestroy {
 private readonly logger=new Logger(AuditDeliveryService.name);
 private timer?:ReturnType<typeof setInterval>;
 private running?:Promise<{processed:number;failed:number}>;
 private stopped=false;
 constructor(private readonly migrations:MigrationService,private readonly outbox:AuditOutboxRepository,private readonly audit:AuditRepository){}
 async onModuleInit(){
  if(process.env.NODE_ENV==='test')return;
  await this.migrations.runMigrations();
  if(this.stopped)return;
  this.timer=setInterval(()=>{void this.tick().catch(()=>this.logger.error('Audit delivery cycle unavailable; retained evidence will be retried'));},5000);
  this.timer.unref();
 }
 tick():Promise<{processed:number;failed:number}>{
  if(this.stopped)return Promise.resolve({processed:0,failed:0});
  if(this.running)return this.running;
  this.running=this.outbox.drainOutbox(this.audit,20).finally(()=>{this.running=undefined;});
  return this.running;
 }
 async onModuleDestroy(){
  this.stopped=true;if(this.timer)clearInterval(this.timer);
  await this.running?.catch(()=>{});
 }
}
