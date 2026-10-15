(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LightPdf=factory();})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  // Architectural 1/8 inch = 1 foot: 72 PDF points/inch / 8 = 9 points/foot.
  const POINTS_PER_FOOT=9,RENDER_PIXELS_PER_FOOT=12;
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
    return {width,height,drawingWidth,drawingHeight,x:(width-drawingWidth)/2,y:(height-drawingHeight)/2};
  }
  function vectorSvg(source){
    const doc=new DOMParser().parseFromString(source,'image/svg+xml'),svg=doc.documentElement,ns='http://www.w3.org/2000/svg';
    if(doc.querySelector('parsererror')||svg.localName!=='svg')throw Error('Invalid drawing SVG.');
    // Only generated vector primitives; never load or rasterize external content.
    const allowed=new Set(['svg','g','defs','path','rect','line','polyline','polygon','circle','ellipse','text','tspan','clipPath','pattern','mask','title']);
    for(const el of [svg,...svg.querySelectorAll('*')]){
      if(!allowed.has(el.localName))throw Error('Unsupported non-vector drawing element: '+el.localName);
      for(const a of [...el.attributes])if(/^on/i.test(a.name)||/href$/i.test(a.name)||a.name==='style'&&/@import|url\(/i.test(a.value)||/url\(\s*['"]?(?!#)/i.test(a.value))throw Error('External drawing resources are not supported in vector PDF.');
      if(el.hasAttribute('filter'))throw Error('Raster SVG filters are not supported in vector PDF.');
      if(el.hasAttribute('font-family'))el.setAttribute('font-family','helvetica');
      if(el.hasAttribute('font-weight'))el.setAttribute('font-weight',el.getAttribute('font-weight')==='bold'||Number(el.getAttribute('font-weight'))>=600?'bold':'normal');
      // PDF text paints fill before stroke; SVG's stroke-first white halo would
      // otherwise cover the letters. Keep readable, selectable colored text.
      if(['text','tspan'].includes(el.localName)){el.removeAttribute('stroke');el.removeAttribute('stroke-width');el.removeAttribute('paint-order');}
    }
    const defs=doc.createElementNS(ns,'defs');svg.prepend(defs);let id=0;
    // Convert screen luminance masks to real vector holes. Intersecting the
    // complement of each opening correctly subtracts overlapping door cutouts.
    for(const target of [...svg.querySelectorAll('[mask]')]){
      const ref=target.getAttribute('mask').match(/^url\(#([^)]*)\)$/),mask=ref&&doc.getElementById(ref[1]);
      if(!mask||mask.localName!=='mask')throw Error('Invalid wall cutout.');
      const width=Number(svg.getAttribute('width')),height=Number(svg.getAttribute('height'));
      if(!(width>0&&height>0))throw Error('Invalid vector drawing extent.');
      for(const cut of mask.querySelectorAll('path')){
        if(!['black','#000','#000000'].includes(cut.getAttribute('fill')))throw Error('Unsupported wall cutout.');
        const d=cut.getAttribute('d')||'';
        if(/[^MLZ\d\s.,e+\-]/i.test(d))throw Error('Unsupported wall cutout path.');
        for(const polygon of d.match(/M[^M]+/gi)||[]){
          const clip=doc.createElementNS(ns,'clipPath'),hole=doc.createElementNS(ns,'path'),group=doc.createElementNS(ns,'g'),key='pdf-cut-'+id++;
          clip.setAttribute('id',key);clip.setAttribute('clipPathUnits','userSpaceOnUse');
          hole.setAttribute('d',`M0 0H${width}V${height}H0Z ${polygon}`);hole.setAttribute('clip-rule','evenodd');hole.setAttribute('fill-rule','evenodd');clip.append(hole);defs.append(clip);
          group.setAttribute('clip-path','url(#'+key+')');target.parentNode.insertBefore(group,target);group.append(target);
        }
      }
      target.removeAttribute('mask');
    }
    svg.querySelectorAll('mask,title').forEach(el=>el.remove());
    return svg;
  }
  async function exportSvg(source,bounds,paper='auto'){
    const layout=sheet(bounds,paper),svg=vectorSvg(source),JsPDF=globalThis.jspdf?.jsPDF;
    if(!JsPDF||typeof JsPDF.API.svg!=='function')throw Error('Vector PDF libraries did not load. Reload and try again.');
    const pdf=new JsPDF({orientation:layout.width>layout.height?'landscape':'portrait',unit:'pt',format:[layout.width,layout.height],putOnlyUsedFonts:true,compress:true,floatPrecision:8});
    pdf.setProperties({title:'TestFit Light - vector - 1/8 inch = 1 foot',subject:'Vector paths and text. Architectural scale 1:96. Print at Actual size / 100 percent, never Fit.',creator:'TestFit Light'});
    // Map the SVG viewBox to an exact physical rectangle. No bitmap/DPI step.
    await pdf.svg(svg,{x:layout.x,y:layout.y,width:layout.drawingWidth,height:layout.drawingHeight,loadExternalStyleSheets:false});
    return {bytes:new Uint8Array(pdf.output('arraybuffer')),layout};
  }
  return {POINTS_PER_FOOT,RENDER_PIXELS_PER_FOOT,scaleBar,sheet,vectorSvg,exportSvg};
});
