import { ImageProcessorService,validateImageCrop } from '../src/media/image-processor.service';
const sharp=require('sharp');
describe('Safe image decoding and derivative transforms',()=>{
 const processor=new ImageProcessorService();
 it('rejects unknown, nonfinite, fractional and out-of-image crop coordinates',()=>{
  for(const crop of [{left:0,top:0,width:0,height:10000},{left:-1,top:0,width:10000,height:10000},{left:1,top:0,width:10000,height:10000},{left:0,top:0,width:NaN,height:10000},{left:0,top:0,width:3.5,height:10000},{left:0,top:0,width:10000,height:10000,owner:'spoof'}])expect(()=>validateImageCrop(crop)).toThrow();
 });
 it('rejects header-only inputs, MIME mismatch and unsafe dimensions',async()=>{
  await expect(processor.inspect(Buffer.from([137,80,78,71,13,10,26,10]),'image/png')).rejects.toThrow('valid single-frame');
  const bytes=await sharp({create:{width:8193,height:1,channels:3,background:'green'}}).png().toBuffer();await expect(processor.inspect(bytes,'image/png')).rejects.toThrow('8192');
  const valid=await sharp({create:{width:5,height:5,channels:3,background:'green'}}).png().toBuffer();await expect(processor.inspect(valid,'image/jpeg')).rejects.toThrow();
 });
 it('crops selected pixels, bounds display dimensions and preserves source bytes',async()=>{
  const raw=Buffer.alloc(100*50*3);for(let y=0;y<50;y++)for(let x=0;x<100;x++)raw[(y*100+x)*3+(x<50?0:1)]=255;
  const bytes=await sharp(raw,{raw:{width:100,height:50,channels:3}}).png().toBuffer(),original=Buffer.from(bytes);
  const results=await processor.generate(bytes,'image/png',{left:5000,top:0,width:5000,height:10000});expect(bytes).toEqual(original);
  for(const result of results){expect(result.width).toBe(50);expect(result.height).toBe(50);const pixels=await sharp(result.buffer).raw().toBuffer();expect(pixels[1]).toBeGreaterThan(220);expect(pixels[0]).toBeLessThan(20);}
  const large=await sharp({create:{width:2000,height:1000,channels:3,background:'green'}}).jpeg().toBuffer();const display=(await processor.generate(large,'image/jpeg',null)).find(r=>r.kind==='display')!;expect([display.width,display.height]).toEqual([1600,800]);
 });
 it('applies EXIF orientation and removes source metadata from thumbnail and display',async()=>{
  const source=await sharp({create:{width:64,height:32,channels:3,background:'green'}}).jpeg().withExif({IFD0:{Artist:'Fictional private contributor'}}).withMetadata({orientation:6}).toBuffer();expect((await sharp(source).metadata()).exif).toBeDefined();
  const outputs=await processor.generate(source,'image/jpeg',null),display=outputs.find(r=>r.kind==='display')!;expect([display.width,display.height]).toEqual([32,64]);
  for(const image of outputs){const metadata=await sharp(image.buffer).metadata();expect(metadata.exif).toBeUndefined();expect(metadata.xmp).toBeUndefined();expect(metadata.iptc).toBeUndefined();expect(metadata.orientation).toBeUndefined();}
 });
 it('refuses corrupt pixel data even when the header contains valid dimensions',async()=>{
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==','base64');await expect(processor.generate(bytes,'image/png',null)).rejects.toThrow();
 });
});
