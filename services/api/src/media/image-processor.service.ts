import { BadRequestException, Injectable } from '@nestjs/common';
import type sharpFactory from 'sharp';
const sharp: typeof sharpFactory = require('sharp');
export interface ImageCrop { left:number;top:number;width:number;height:number; }
export function validateImageCrop(value:any):ImageCrop|null {
  if(value===undefined||value===null)return null;
  if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='height,left,top,width')throw new BadRequestException('Invalid image crop');
  for(const field of ['left','top','width','height'])if(!Number.isInteger(value[field])||value[field]<0||value[field]>10000)throw new BadRequestException('Crop coordinates must be between 0 and 10000');
  if(value.width<1||value.height<1||value.left+value.width>10000||value.top+value.height>10000)throw new BadRequestException('Crop must stay inside the image');
  return {...value};
}
@Injectable()
export class ImageProcessorService {
  private options = {failOn:'warning' as const,limitInputPixels:20000000,limitInputChannels:4,sequentialRead:true};
  async inspect(bytes:Buffer,mimeType:string) {
    try {
      const metadata=await sharp(bytes,this.options).metadata();
      if(metadata.format!==({'image/png':'png','image/jpeg':'jpeg','image/webp':'webp'} as any)[mimeType]||!metadata.width||!metadata.height||metadata.width>8192||metadata.height>8192||metadata.width*metadata.height>20000000||(metadata.pages||1)>1)throw new Error('Unsafe dimensions or format');
      const width=metadata.autoOrient?.width||metadata.width,height=metadata.autoOrient?.height||metadata.height;
      return {width,height};
    } catch { throw new BadRequestException('Choose a valid single-frame JPEG, PNG or WebP up to 20 megapixels and 8192 pixels per side'); }
  }
  async generate(bytes:Buffer,mimeType:string,crop:ImageCrop|null) {
    crop=validateImageCrop(crop);
    const dimensions=await this.inspect(bytes,mimeType);
    const rectangle=crop?{left:Math.floor(dimensions.width*crop.left/10000),top:Math.floor(dimensions.height*crop.top/10000),width:Math.max(1,Math.floor(dimensions.width*crop.width/10000)),height:Math.max(1,Math.floor(dimensions.height*crop.height/10000))}:null;
    const outputs=[];
    // No metadata-copy methods: EXIF/GPS/XMP/IPTC are removed from both outputs.
    for(const kind of ['thumbnail','display'] as const) {
      let pipeline=sharp(bytes,this.options).autoOrient();
      if(rectangle)pipeline=pipeline.extract(rectangle);
      pipeline=kind==='thumbnail'?pipeline.resize({width:256,height:256,fit:'cover',withoutEnlargement:true}):pipeline.resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true});
      const {data,info}=await pipeline.webp({quality:kind==='thumbnail'?75:82,effort:4}).timeout({seconds:5}).toBuffer({resolveWithObject:true});
      if(data.length>5*1024*1024)throw new BadRequestException('Processed image exceeds the safe output limit');
      outputs.push({kind,buffer:data,width:info.width,height:info.height});
    }
    return outputs;
  }
}
