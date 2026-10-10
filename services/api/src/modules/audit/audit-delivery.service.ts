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
 private lifecycle:'STARTING'|'RUNNING'|'TEST_DISABLED'|'STOPPED'='STARTING';
 private lastStartedAt:string|null=null;
 private lastCompletedAt:string|null=null;
 private lastFailureAt:string|null=null;
 private lastResult:{processed:number;failed:number}|null=null;
 constructor(private readonly migrations:MigrationService,private readonly outbox:AuditOutboxRepository,private readonly audit:AuditRepository){}
 async onModuleInit(){
  if(process.env.NODE_ENV==='test'){this.lifecycle='TEST_DISABLED';return;}
  await this.migrations.runMigrations();
  if(this.stopped)return;
  this.timer=setInterval(()=>{void this.tick().catch(()=>this.logger.error('Audit delivery cycle unavailable; retained evidence will be retried'));},5000);
  this.timer.unref();
  this.lifecycle='RUNNING';
 }
 tick():Promise<{processed:number;failed:number}>{
  if(this.stopped)return Promise.resolve({processed:0,failed:0});
  if(this.running)return this.running;
  this.lastStartedAt=new Date().toISOString();
  this.running=this.outbox.drainOutbox(this.audit,20).then(result=>{
   this.lastCompletedAt=new Date().toISOString();this.lastResult=result;return result;
  }).catch(error=>{this.lastFailureAt=new Date().toISOString();throw error;}).finally(()=>{this.running=undefined;});
  return this.running;
 }
 async onModuleDestroy(){
  this.stopped=true;if(this.timer)clearInterval(this.timer);
  this.lifecycle='STOPPED';
  await this.running?.catch(()=>{});
 }
 async deliveryStatus(){
  const backlog=await this.outbox.getDeliverySummary();
  return {backlog,worker:{scope:'THIS_API_PROCESS',lifecycle:this.lifecycle,inFlight:!!this.running,
   intervalSeconds:5,batchSize:20,lastStartedAt:this.lastStartedAt,lastCompletedAt:this.lastCompletedAt,
   lastFailureAt:this.lastFailureAt,lastResult:this.lastResult},generatedAt:new Date().toISOString()};
 }
}
