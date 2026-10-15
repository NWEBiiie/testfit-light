(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LightPdf=factory();})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  // Architectural 1/8 inch = 1 foot: 72 PDF points/inch / 8 = 9 points/foot.
  const POINTS_PER_FOOT=9,RENDER_PIXELS_PER_FOOT=12,DPI=300;
  const papers={letter:[612,792],tabloid:[792,1224],archC:[1296,1728],archD:[1728,2592]};
  function scaleBar(pixelsPerFoot){
    if(!Number.isFinite(pixelsPerFoot)||pixelsPerFoot<=0)throw Error('Invalid display scale.');
    const target=80/pixelsPerFoot,power=10**Math.floor(Math.log10(target));
    const feet=[1,2,5,10].map(n=>n*power).reduce((a,b)=>Math.abs(a-target)<Math.abs(b-target)?a:b);
    return {feet,pixels:feet*pixelsPerFoot};
  }
  function sheet(bounds,paper='auto'){
    if(!bounds||![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)||bounds.width<=0||bounds.height<=0)throw Error('There is no printable drawing extent.');
    const drawingWidth=bounds.width*POINTS_PER_FOOT,drawingHeight=bounds.height*POINTS_PER_FOOT,margin=18;
    let width=drawingWidth+margin*2,height=drawingHeight+margin*2;
    if(paper!=='auto'){
      const p=papers[paper];if(!p)throw Error('Unknown paper size.');
      const orientations=[p,[p[1],p[0]]],fit=orientations.find(s=>drawingWidth<=s[0]-margin*2+1e-7&&drawingHeight<=s[1]-margin*2+1e-7);
      if(!fit)throw Error('Drawing does not fit this sheet at 1/8" = 1\'-0". Choose Auto sheet or a larger paper size; the scale will not be reduced.');
      [width,height]=fit;
    }
    if(Math.max(width,height)>14400)throw Error('Sheet exceeds the PDF page-size limit. Zoom in and export Current view.');
    const pixelWidth=Math.ceil(drawingWidth/72*DPI),pixelHeight=Math.ceil(drawingHeight/72*DPI);
    if(Math.max(pixelWidth,pixelHeight)>16384||pixelWidth*pixelHeight>48e6)throw Error('Drawing is too large for a sharp 300 dpi export. Zoom in and use Current view.');
    return {width,height,drawingWidth,drawingHeight,x:(width-drawingWidth)/2,y:(height-drawingHeight)/2,pixelWidth,pixelHeight};
  }
  function jpegPdf(jpeg,layout){
    if(!(jpeg instanceof Uint8Array)||jpeg[0]!==255||jpeg[1]!==216)throw Error('Invalid PDF image.');
    for(const key of ['width','height','drawingWidth','drawingHeight','x','y','pixelWidth','pixelHeight'])if(!Number.isFinite(layout[key]))throw Error('Invalid PDF sheet.');
    const enc=new TextEncoder(),parts=[],offsets=[0];let length=0;
    const push=value=>{const b=typeof value==='string'?enc.encode(value):value;parts.push(b);length+=b.length;};
    const number=n=>Number(n.toFixed(6));
    const object=(id,body)=>{offsets[id]=length;push(id+' 0 obj\n'+body+'\nendobj\n');};
    push('%PDF-1.4\n% TestFit Light\n');
    object(1,'<< /Type /Catalog /Pages 2 0 R >>');
    object(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    object(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+number(layout.width)+' '+number(layout.height)+'] /Resources << /XObject << /Plan 4 0 R >> >> /Contents 5 0 R >>');
    offsets[4]=length;push('4 0 obj\n<< /Type /XObject /Subtype /Image /Width '+layout.pixelWidth+' /Height '+layout.pixelHeight+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n');push(jpeg);push('\nendstream\nendobj\n');
    const content='q\n'+number(layout.drawingWidth)+' 0 0 '+number(layout.drawingHeight)+' '+number(layout.x)+' '+number(layout.y)+' cm\n/Plan Do\nQ\n';
    object(5,'<< /Length '+enc.encode(content).length+' >>\nstream\n'+content+'endstream');
    object(6,'<< /Title (TestFit Light - 1/8 inch = 1 foot) /Subject (Architectural scale 1:96. Print at Actual size / 100 percent, never Fit.) /Creator (TestFit Light) >>');
    const xref=length;push('xref\n0 7\n0000000000 65535 f \n');
    for(let id=1;id<=6;id++)push(String(offsets[id]).padStart(10,'0')+' 00000 n \n');
    push('trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
    const result=new Uint8Array(length);let cursor=0;for(const part of parts){result.set(part,cursor);cursor+=part.length;}return result;
  }
  async function exportSvg(svg,bounds,paper='auto'){
    const layout=sheet(bounds,paper),canvas=document.createElement('canvas');canvas.width=layout.pixelWidth;canvas.height=layout.pixelHeight;
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('PDF rendering is unavailable in this browser.');
    const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'})),image=new Image();
    try{
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Could not render the drawing for PDF.'));image.src=url;});
      // Only the paper is white; no screen grid or app backdrop is drawn.
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.98));if(!blob)throw Error('The drawing is too large to render.');
      return {bytes:jpegPdf(new Uint8Array(await blob.arrayBuffer()),layout),layout};
    }finally{URL.revokeObjectURL(url);canvas.width=canvas.height=0;}
  }
  return {POINTS_PER_FOOT,RENDER_PIXELS_PER_FOOT,DPI,scaleBar,sheet,jpegPdf,exportSvg};
});
