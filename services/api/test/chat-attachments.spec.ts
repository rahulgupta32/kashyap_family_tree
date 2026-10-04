import { ChatAttachmentsService, decodeChatAttachment } from '../src/modules/chat/chat-attachments.service';
import { ScanResultStatus } from '../src/modules/profile/malware-scanner.service';
import { randomUUID } from 'crypto';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==';
const input=()=>({content:'Fictional attachment',clientMessageId:randomUUID(),mimeType:'image/png',dataBase64:png});
describe('Chat attachment validation and scanner ordering',()=>{
 it('rejects spoofed identity, unknown MIME, noncanonical base64 and mismatched headers',()=>{
  for(const body of [{...input(),senderId:randomUUID()},{...input(),mimeType:'image/svg+xml'},{...input(),dataBase64:png+' '},{...input(),mimeType:'application/pdf'},{...input(),dataBase64:''}])expect(()=>decodeChatAttachment(body)).toThrow();
 });
 it('bounds decoded and encoded data and handles a maximum-size record without a regex stack overflow',()=>{
  const file=Buffer.alloc(5*1024*1024);Buffer.from([137,80,78,71,13,10,26,10]).copy(file);
  expect(decodeChatAttachment({...input(),dataBase64:file.toString('base64')}).buffer.length).toBe(file.length);
  expect(()=>decodeChatAttachment({...input(),dataBase64:Buffer.concat([file,Buffer.from('x')]).toString('base64')})).toThrow();
 });
 it('checks current access before invoking the scanner',async()=>{
  const client:any={},db:any={transaction:(work:any)=>work(client)},chat:any={access:jest.fn().mockRejectedValue(new Error('no access'))},scanner:any={scanFile:jest.fn()};
  await expect(new ChatAttachmentsService(db,chat,scanner).send(randomUUID(),{} as any,input())).rejects.toThrow('no access');expect(scanner.scanFile).not.toHaveBeenCalled();
 });
 it('fails closed before storing or sending infected or unavailable scans',async()=>{
  const client:any={query:jest.fn().mockResolvedValue({rows:[]})},db:any={transaction:(work:any)=>work(client)},chat:any={access:jest.fn(),send:jest.fn()},scanner:any={scanFile:jest.fn()};
  for(const status of [ScanResultStatus.INFECTED,ScanResultStatus.SCANNER_FAILED]){
   scanner.scanFile.mockResolvedValue({status});await expect(new ChatAttachmentsService(db,chat,scanner).send(randomUUID(),{} as any,input())).rejects.toThrow();
  }expect(chat.send).not.toHaveBeenCalled();
 });
});
