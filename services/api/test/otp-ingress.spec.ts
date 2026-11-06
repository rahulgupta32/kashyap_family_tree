import { OtpIngressGuard } from '../src/modules/auth/guards/otp-ingress.guard';
import { ErrorCode } from '@kashyap/contracts';

describe('Shared OTP admission before database side effects',()=>{
  const original=process.env.NODE_ENV;
  let redis:any,headers:any,context:any,guard:OtpIngressGuard;
  beforeEach(()=>{
    process.env.NODE_ENV='production';redis={isReady:jest.fn().mockReturnValue(true),eval:jest.fn().mockResolvedValue([60,45])};headers={setHeader:jest.fn()};
    context={switchToHttp:()=>({getRequest:()=>({ip:'192.0.2.1',headers:{'x-forwarded-for':'198.51.100.99'}}),getResponse:()=>headers})};guard=new OtpIngressGuard(redis);
  });
  afterEach(()=>{if(original===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=original;});
  it('allows the exact boundary and binds the socket-derived network instead of forwarding text',async()=>{
    expect(await guard.canActivate(context)).toBe(true);expect(redis.eval).toHaveBeenCalledWith(expect.any(String),1,'otp:ratelimit:ingress:192.0.2.1',60);
  });
  it('rejects the next shared-network attempt with a bounded retry header',async()=>{
    redis.eval.mockResolvedValue([61,45]);await expect(guard.canActivate(context)).rejects.toMatchObject({status:429,response:{errorCode:ErrorCode.RATE_LIMIT_EXCEEDED}});expect(headers.setHeader).toHaveBeenCalledWith('Retry-After','45');
  });
  it('fails closed when Redis is unavailable without creating a local fallback counter',async()=>{
    redis.isReady.mockReturnValue(false);await expect(guard.canActivate(context)).rejects.toMatchObject({status:503,response:{errorCode:ErrorCode.SERVICE_UNAVAILABLE}});expect(redis.eval).not.toHaveBeenCalled();
  });
  it('does not expose downstream errors or accept invalid limiter state',async()=>{
    redis.eval.mockRejectedValueOnce(new Error('Private credential'));await expect(guard.canActivate(context)).rejects.toThrow('Authentication admission is temporarily unavailable');
    redis.eval.mockResolvedValue(['invalid',-1]);await expect(guard.canActivate(context)).rejects.toMatchObject({status:503});expect(headers.setHeader).not.toHaveBeenCalled();
  });
});
