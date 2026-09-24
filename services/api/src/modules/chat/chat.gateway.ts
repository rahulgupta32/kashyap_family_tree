import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { WebSocket, WebSocketServer } from 'ws';
import { JwtStrategy } from '../auth/guards/jwt.strategy';
import { ChatService } from './chat.service';
import { RedisService } from '../../redis/redis.service';
import { member } from '../community/community-policy';

/** Authenticated WebSocket snapshots come from PostgreSQL, so separate workers
 * and reconnects observe the same durable history. Redis typing state expires. */
@Injectable()
export class ChatGateway implements OnApplicationBootstrap, OnModuleDestroy {
 private server:WebSocketServer;
 private httpServer:any;
 private upgrade:any;
 constructor(private readonly adapter:HttpAdapterHost,private readonly jwt:JwtService,
  private readonly strategy:JwtStrategy,private readonly chat:ChatService,private readonly redis:RedisService){}
 onApplicationBootstrap(){
  this.httpServer=this.adapter.httpAdapter.getHttpServer();
  this.server=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false});
  this.upgrade=(req:any,socket:any,head:any)=>{
   if((req.url||'').split('?')[0]!=='/chat/socket')return;
   const allowed=(process.env.CORS_ORIGINS||'http://127.0.0.1:3002,http://localhost:3002').split(',').map(s=>s.trim());
   // Browser clients must come from an approved origin. Native clients omit Origin.
   if(req.headers.origin&&!allowed.includes(req.headers.origin)){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
   if(req.url.includes('?')){socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');socket.destroy();return;}
   if(this.server.clients.size>=500){socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');socket.destroy();return;}
   this.server.handleUpgrade(req,socket,head,ws=>this.connect(ws));
  };
  this.httpServer.on('upgrade',this.upgrade);
 }
 onModuleDestroy(){
  if(this.upgrade)this.httpServer?.off('upgrade',this.upgrade);
  this.server?.clients.forEach(ws=>ws.terminate());this.server?.close();
 }
 private connect(ws:WebSocket){
  let token:string|null=null,conversation:string|null=null,lastSnapshot='',busy=false;
  let serial=Promise.resolve(),windowAt=Date.now(),frames=0;
  const send=(value:unknown)=>{if(ws.readyState===WebSocket.OPEN){if(ws.bufferedAmount>1048576)ws.close(1008,'Slow consumer');else ws.send(JSON.stringify(value));}};
  const deadline=setTimeout(()=>{if(!token)ws.close(4401,'Authentication required');},5000);
  const currentUser=async()=>{
   if(!token)throw new Error('Authentication required');
   const payload=await this.jwt.verifyAsync(token);const user=await this.strategy.validate(payload);member(user);return user;
  };
  const snapshot=async()=>{
   if(!token||!conversation||busy||ws.readyState!==WebSocket.OPEN)return;busy=true;
   try {
    let user;try{user=await currentUser();}catch{ws.close(4401,'Session expired');return;}
    const messages=await this.chat.messages(conversation,user);
    const key=`chat:typing:${process.env.DB_NAME}:${conversation}`;
    const typing=await this.redis.getClient()?.hgetall(key)||{};
    const typingUserIds=Object.keys(typing).filter(id=>id!==user.id&&Number(typing[id])>Date.now()-5000);
    const serialized=JSON.stringify({type:'snapshot',conversationId:conversation,messages,typingUserIds});
    if(serialized!==lastSnapshot){lastSnapshot=serialized;if(ws.readyState===WebSocket.OPEN){if(ws.bufferedAmount>1048576)ws.close(1008,'Slow consumer');else ws.send(serialized);}}
   }catch{ws.close(4403,'Session or conversation access expired');}finally{busy=false;}
  };
  const poll=setInterval(()=>{void snapshot();},1500);poll.unref();deadline.unref();
  ws.on('message',(data,isBinary)=>{
   if(Date.now()-windowAt>1000){windowAt=Date.now();frames=0;}
   if(isBinary||++frames>20){ws.close(1008,'Invalid or excessive frames');return;}
   serial=serial.then(async()=>{
    const frame=JSON.parse(data.toString());
    if(!token){
     if(frame.type!=='auth'||typeof frame.token!=='string')throw new Error('Authentication required');
     const payload=await this.jwt.verifyAsync(frame.token);member(await this.strategy.validate(payload));
     token=frame.token;clearTimeout(deadline);send({type:'authenticated'});return;
    }
    const user=await currentUser();
    if(frame.type==='subscribe'){
     await this.chat.access(frame.conversationId,user);conversation=frame.conversationId;lastSnapshot='';await snapshot();
    }else if(frame.type==='typing'&&conversation){
     await this.chat.access(conversation,user);
     const key=`chat:typing:${process.env.DB_NAME}:${conversation}`;
     const client=this.redis.getClient();if(client){await client.hset(key,user.id,Date.now().toString());await client.expire(key,10);}
    }else if(frame.type==='read'&&conversation){
     await this.chat.read(conversation,user,frame.sequence);await snapshot();
    }else if(frame.type==='ping'){send({type:'pong'});}
    else throw new Error('Unsupported frame');
   }).catch(()=>{ws.close(4403,'Invalid request or expired authorization');});
  });
  ws.on('close',()=>{clearInterval(poll);clearTimeout(deadline);});
  ws.on('error',()=>ws.terminate());
 }
}
