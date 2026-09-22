/* TestFit Light: feet-based geometry. No animation loop or physics solver. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LightGeometry = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const EPS = 1e-5, rad = a => a * Math.PI / 180;
  const add = (a,b) => ({x:a.x+b.x,y:a.y+b.y});
  const sub = (a,b) => ({x:a.x-b.x,y:a.y-b.y});
  const mul = (a,n) => ({x:a.x*n,y:a.y*n});
  const dot = (a,b) => a.x*b.x+a.y*b.y;
  const cross = (a,b) => a.x*b.y-a.y*b.x;
  const length = a => Math.hypot(a.x,a.y);
  const distance = (a,b) => length(sub(a,b));
  const unit = a => mul(a,1/(length(a)||1));
  const rotate = (p,a) => ({x:p.x*Math.cos(rad(a))-p.y*Math.sin(rad(a)),y:p.x*Math.sin(rad(a))+p.y*Math.cos(rad(a))});
  const normalize = a => ((a+180)%360+360)%360-180;
  const nearestAngle = (current,target) => [0,90,180,270].map(a=>normalize(target+a)).sort((a,b)=>Math.abs(normalize(a-current))-Math.abs(normalize(b-current)))[0];
  const edges = p => p.map((a,i)=>({a,b:p[(i+1)%p.length],index:i}));
  const area = p => Math.abs(p.reduce((n,a,i)=>n+cross(a,p[(i+1)%p.length]),0))/2;
  function centroid(p) {
    let sum=0,x=0,y=0;
    edges(p).forEach(({a,b})=>{const c=cross(a,b);sum+=c;x+=(a.x+b.x)*c;y+=(a.y+b.y)*c;});
    return Math.abs(sum)<EPS ? p[0] : {x:x/(3*sum),y:y/(3*sum)};
  }
  function baseOutline(room) {
    if(room.shape==='custom'&&room.boundaryFit?.points)return room.boundaryFit.points;
    const w=room.width/2,h=room.depth/2;
    return room.shape==='l' ? [{x:-w,y:-h},{x:w,y:-h},{x:w,y:0},{x:0,y:0},{x:0,y:h},{x:-w,y:h}]
      : [{x:-w,y:-h},{x:w,y:-h},{x:w,y:h},{x:-w,y:h}];
  }
  function polygon(room) {
    if(room.type==='corridor')return room.outline||corridorPolygon(room.points,room.width);
    const points=room.boundaryFit?.points||baseOutline(room);
    return points.map(p=>add(room,rotate(p,room.angle)));
  }
  function closest(p,a,b) {
    const d=sub(b,a),t=Math.max(0,Math.min(1,dot(sub(p,a),d)/(dot(d,d)||1)));
    return add(a,mul(d,t));
  }
  function inside(p,poly,includeEdge=true) {
    if(edges(poly).some(({a,b})=>distance(p,closest(p,a,b))<EPS)) return includeEdge;
    let yes=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
      const a=poly[i],b=poly[j];
      if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) yes=!yes;
    }
    return yes;
  }
  function crosses(a,b,c,d) {
    return cross(sub(b,a),sub(c,a))*cross(sub(b,a),sub(d,a)) < -EPS &&
      cross(sub(d,c),sub(a,c))*cross(sub(d,c),sub(b,c)) < -EPS;
  }
  function contains(poly,outer) {
    return poly.every(p=>inside(p,outer)) && !edges(poly).some(e=>edges(outer).some(f=>crosses(e.a,e.b,f.a,f.b))) &&
      edges(poly).every(({a,b})=>inside(mul(add(a,b),.5),outer));
  }
  function overlaps(a,b) {
    if(Math.max(...a.map(p=>p.x))<=Math.min(...b.map(p=>p.x))+EPS||Math.max(...b.map(p=>p.x))<=Math.min(...a.map(p=>p.x))+EPS||Math.max(...a.map(p=>p.y))<=Math.min(...b.map(p=>p.y))+EPS||Math.max(...b.map(p=>p.y))<=Math.min(...a.map(p=>p.y))+EPS)return false;
    return edges(a).some(e=>edges(b).some(f=>crosses(e.a,e.b,f.a,f.b))) ||
      a.some(p=>inside(p,b,false)) || b.some(p=>inside(p,a,false)) ||
      edges(a).some(e=>inside(mul(add(e.a,e.b),.5),b,false)) || edges(b).some(e=>inside(mul(add(e.a,e.b),.5),a,false)) ||
      inside(centroid(a),b,false) || inside(centroid(b),a,false);
  }
  function simple(poly) {
    return poly.length>=3 && area(poly)>1 && edges(poly).every(e=>distance(e.a,e.b)>.05) &&
      !edges(poly).some((e,i)=>edges(poly).some((f,j)=>Math.abs(i-j)>1&&Math.abs(i-j)<poly.length-1&&
        (crosses(e.a,e.b,f.a,f.b)||distance(e.a,closest(e.a,f.a,f.b))<EPS||distance(e.b,closest(e.b,f.a,f.b))<EPS)));
  }
  function inward(edge,poly) {
    const u=unit(sub(edge.b,edge.a)), n={x:-u.y,y:u.x},mid=mul(add(edge.a,edge.b),.5);
    return inside(add(mid,mul(n,.001)),poly) ? n : mul(n,-1);
  }
  function fitInside(room,boundary) {
    let next={...room};
    for(let i=0;i<40;i++) {
      const points=polygon(next);
      if(contains(points,boundary)) return next;
      const outside=points.filter(p=>!inside(p,boundary));
      if(!outside.length) return null; // Do not bridge across a concave notch.
      const corrections=outside.map(p=> {
        const list=edges(boundary).map(e=>({e,q:closest(p,e.a,e.b)})).sort((a,b)=>distance(a.q,p)-distance(b.q,p));
        return add(sub(list[0].q,p),mul(inward(list[0].e,boundary),.001));
      });
      const move=corrections.sort((a,b)=>length(b)-length(a))[0];
      next.x+=move.x;next.y+=move.y;
    }
    return null;
  }
  function edgeGap(room,edge) {
    if(edges(polygon(room)).some(e=>crosses(e.a,e.b,edge.a,edge.b)))return 0;
    return Math.min(...edges(polygon(room)).flatMap(({a,b})=>[distance(a,closest(a,edge.a,edge.b)),distance(b,closest(b,edge.a,edge.b)),distance(edge.a,closest(edge.a,a,b)),distance(edge.b,closest(edge.b,a,b))]));
  }
  function intersectLines(a,u,b,v) {
    const denominator=cross(u,v);
    return Math.abs(denominator)<EPS?null:add(a,mul(u,cross(sub(b,a),v)/denominator));
  }
  function validBoundaryFit(room) {
    const fit=room.boundaryFit;
    if(fit==null)return room.shape!=='custom';
    if(room.shape==='custom')return fit.manual===true&&Array.isArray(fit.points)&&fit.points.length>=4&&fit.points.length<=64&&fit.points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<2000&&Math.abs(p.y)<2000)&&simple(fit.points);
    if(!Array.isArray(fit.points)||fit.points.length!==(room.shape==='l'?6:4))return false;
    const sides=fit.sides||[fit.side],count=fit.points.length;
    if(!Array.isArray(sides)||sides.length<1||sides.length>2||sides.some(i=>!Number.isInteger(i)||i<0||i>=count)||new Set(sides).size!==sides.length)return false;
    if(!fit.points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<2000&&Math.abs(p.y)<2000)||!simple(fit.points))return false;
    const base=baseOutline(room),target=area(base);
    if(fit.manual!==true&&Math.abs(area(fit.points)-target)>Math.max(.0001,target*1e-6))return false;
    // Only boundary-facing sides can leave the room's original grid.
    return edges(fit.points).every((e,i)=>{
      const d=sub(e.b,e.a),original=sub(base[(i+1)%base.length],base[i]);
      return dot(d,original)>EPS&&(sides.includes(i)||Math.abs(cross(unit(d),unit(original)))<EPS);
    });
  }
  function edgeFits(room,edge,boundary) {
    const base={...room,boundaryFit:null},points=polygon(base),count=points.length;
    const u=unit(sub(edge.b,edge.a)),normal=inward(edge,boundary),edgeLength=distance(edge.a,edge.b),target=area(points),fits=[];
    for(const side of edges(points)) {
      const i=side.index,j=(i+1)%count,gridNormal=inward(side,points);
      if(dot(gridNormal,normal)<Math.SQRT1_2-EPS)continue;
      // Extend the two neighboring grid walls to the boundary. Never rotate the grid.
      const a=intersectLines(points[i],sub(points[i],points[(i+count-1)%count]),edge.a,u);
      const b=intersectLines(points[j],sub(points[(j+1)%count],points[j]),edge.a,u);
      if(!a||!b||[a,b].some(p=>dot(sub(p,edge.a),u)<-EPS||dot(sub(p,edge.a),u)>edgeLength+EPS))continue;
      const fitted=points.map(p=>({...p}));fitted[i]=a;fitted[j]=b;
      for(const back of edges(points)) {
        const k=back.index,l=(k+1)%count;
        if([k,l].some(index=>index===i||index===j)||dot(unit(sub(back.b,back.a)),unit(sub(side.b,side.a)))>-.999)continue;
        // Move the opposite grid wall to recover program area without bending other sides.
        const current=area(fitted),probe=fitted.map((p,index)=>index===k||index===l?add(p,gridNormal):p);
        const rate=area(probe)-current;if(Math.abs(rate)<EPS)continue;
        const shift=(target-current)/rate;
        const recovered=fitted.map((p,index)=>index===k||index===l?add(p,mul(gridNormal,shift)):p);
        const next={...base,boundaryFit:{side:i,points:recovered.map(p=>rotate(sub(p,base),-base.angle))}};
        if(!validBoundaryFit(next)||!contains(recovered,boundary))continue;
        fits.push({room:next,cost:recovered.reduce((n,p,index)=>n+distance(p,points[index])**2,0)});
      }
    }
    return fits.sort((a,b)=>a.cost-b.cost).map(f=>f.room);
  }
  function alignToEdge(room,edge,boundary) {
    return edgeFits(room,edge,boundary)[0]||null;
  }
  function cornerFits(room,first,second,boundary) {
    const base={...room,boundaryFit:null},points=polygon(base),count=points.length,target=area(points),fits=[];
    const winding=boundary.reduce((sum,p,i)=>sum+cross(p,boundary[(i+1)%boundary.length]),0);
    const cornerTurn=cross(sub(first.b,first.a),sub(second.b,second.a))*winding;
    const corner=intersectLines(first.a,sub(first.b,first.a),second.a,sub(second.b,second.a));
    if(!corner)return fits;
    for(let i=0;i<count;i++) {
      const j=(i+1)%count,k=(i+2)%count,previous=(i+count-1)%count,after=(k+1)%count;
      if(cross(sub(points[j],points[i]),sub(points[k],points[j]))*cornerTurn<=EPS)continue;
      for(const pair of [[first,second],[second,first]]) {
        if(pair.some((edge,index)=>dot(inward({a:points[(i+index)%count],b:points[(i+index+1)%count]},points),inward(edge,boundary))<.65))continue;
        const a=intersectLines(points[i],sub(points[i],points[previous]),pair[0].a,sub(pair[0].b,pair[0].a));
        const b=intersectLines(points[k],sub(points[after],points[k]),pair[1].a,sub(pair[1].b,pair[1].a));
        if(!a||!b)continue;
        let fitted=points.map(p=>({...p}));fitted[i]=a;fitted[j]=corner;fitted[k]=b;
        const size=area(fitted);if(size<1)continue;
        // Scaling around the fixed corner preserves both contacts and every other grid direction.
        const factor=Math.sqrt(target/size);
        fitted=fitted.map(p=>add(corner,mul(sub(p,corner),factor)));
        if(distance(fitted[i],closest(fitted[i],pair[0].a,pair[0].b))>EPS||distance(fitted[k],closest(fitted[k],pair[1].a,pair[1].b))>EPS)continue;
        const next={...base,boundaryFit:{side:i,sides:[i,j],points:fitted.map(p=>rotate(sub(p,base),-base.angle))}};
        if(!validBoundaryFit(next)||!contains(fitted,boundary))continue;
        fits.push({room:next,cost:fitted.reduce((n,p,index)=>n+distance(p,points[index])**2,0)});
      }
    }
    return fits.sort((a,b)=>a.cost-b.cost).map(f=>f.room);
  }
  function validPlacement(room,others,boundaries) {
    const poly=polygon(room);
    return boundaries.every(b=>contains(poly,b.points))&&!others.filter(o=>o.type!=='corridor').some(other=>overlaps(poly,polygon(other)))&&!corridorCuts(others.filter(o=>o.type==='corridor'),boundaries).some(c=>overlaps(poly,c));
  }
  function settlePrimary(room,others,boundaries,options={}) {
    const margin=options.margin??2;
    const original=room;
    room={...room,boundaryFit:null};
    if(options.boundarySnap!==false) {
      const candidates=boundaries.flatMap((boundary,priority)=>edges(boundary.points).map(edge=>({boundary,priority,edge,gap:Math.min(edgeGap(room,edge),edgeGap(original,edge))})))
        .filter(c=>c.gap<=margin).sort((a,b)=>a.priority-b.priority||a.gap-b.gap);
      for(const boundary of boundaries) {
        const near=candidates.filter(c=>c.boundary===boundary),winding=boundary.points.reduce((sum,p,i)=>sum+cross(p,boundary.points[(i+1)%boundary.points.length]),0);
        // Complete a two-edge corner fit before attempting either single edge.
        for(const c of near) {
          const d=near.find(other=>other.edge.index===(c.edge.index+1)%boundary.points.length);
          if(!d||Math.abs(cross(sub(c.edge.b,c.edge.a),sub(d.edge.b,d.edge.a))*winding)<=EPS)continue;
          for(const next of cornerFits(room,c.edge,d.edge,boundary.points)) {
            if(validPlacement(next,others,boundaries))return {room:next,aligned:true,corner:true,message:'Two-edge corner fit · '+boundary.name+' · room grid unchanged'};
          }
        }
        for(const c of near) for(const next of edgeFits(room,c.edge,c.boundary.points)) {
          if(validPlacement(next,others,boundaries)) return {room:next,aligned:true,message:'Boundary wall fitted · '+c.boundary.name+' · room grid unchanged'};
        }
      }
      // An unsatisfied boundary contact must not silently rotate the room to a neighbor.
      if(candidates.length && validPlacement(original,others,boundaries)) return {room:original,message:'Kept position: both ends cannot fit here without overlap or an area change.'};
    }
    if(options.roomSnap!==false) {
      let candidates=[];
      for(const other of others) for(const edge of edges(polygon(other))) {
        if(edgeGap(room,edge)>margin) continue;
        if(other.type==='corridor') {
          // The free side of a corridor acts just like an enclosing boundary.
          // Fit the facing wall to it while the remaining sides keep the room grid.
          const normal=mul(inward(edge,polygon(other)),-1),reach=2000;
          const freeSide=[edge.a,edge.b,add(edge.b,mul(normal,reach)),add(edge.a,mul(normal,reach))];
          for(const fitted of edgeFits(room,edge,freeSide))if(validPlacement(fitted,others,boundaries))
            candidates.push({room:fitted,aligned:true,move:distance(room,fitted),message:'Fitted to corridor barrier · '+other.name+' · room grid unchanged'});
        }
        const next={...room};
        const u=unit(sub(edge.b,edge.a)),n=mul(inward(edge,polygon(other)),-1);
        if(!edges(polygon(next)).some(e=>dot(inward(e,polygon(next)),n)>.99999))continue;
        const gap=Math.min(...polygon(next).map(p=>dot(sub(p,edge.a),n)));
        next.x-=n.x*gap;next.y-=n.y*gap;
        const contact=edges(polygon(next)).some(e=>{
          if(Math.abs(cross(unit(sub(e.b,e.a)),u))>EPS||Math.abs(dot(sub(e.a,edge.a),n))>EPS)return false;
          const interval=[e.a,e.b].map(p=>dot(sub(p,edge.a),u));
          return Math.min(Math.max(...interval),distance(edge.a,edge.b))-Math.max(Math.min(...interval),0)>.1;
        });
        if(!contact)continue;
        if(validPlacement(next,others,boundaries)) candidates.push({room:next,move:distance(room,next),message:'Joined wall with '+other.name});
      }
      if(candidates.length) return candidates.sort((a,b)=>a.move-b.move)[0];
    }
    if(validPlacement(room,others,boundaries)) return {room,message:'Room placed.'};
    let next={...room};
    for(const boundary of boundaries) {next=fitInside(next,boundary.points);if(!next)break;}
    if(next&&validPlacement(next,others,boundaries)) return {room:next,message:'Kept inside the boundary.'};
    return {room:null,message:'Does not fit here. Rooms cannot overlap or cross an assigned boundary.'};
  }
  function corridorPoint(origin,point,mode='ortho') {
    if(!origin||mode==='free')return {x:point.x,y:point.y};
    return Math.abs(point.x-origin.x)>=Math.abs(point.y-origin.y)
      ?{x:point.x,y:origin.y}:{x:origin.x,y:point.y};
  }
  function corridorPolygon(points,width) {
    if(!Array.isArray(points)||points.length<2||points.length>80||!Number.isFinite(width)||width<1||width>100||!points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)))return [];
    const directions=points.slice(1).map((p,i)=>unit(sub(p,points[i])));
    if(points.slice(1).some((p,i)=>distance(p,points[i])<.1))return [];
    const offset=sign=>points.map((p,i)=>{
      const before=directions[Math.max(0,i-1)],after=directions[Math.min(i,directions.length-1)];
      const a=add(p,mul({x:-before.y,y:before.x},width/2*sign)),b=add(p,mul({x:-after.y,y:after.x},width/2*sign));
      if(dot(before,after)<-.98)return null;
      const q=intersectLines(a,before,b,after)||a;
      return distance(q,p)>width*4?null:q;
    });
    const left=offset(1),right=offset(-1);
    return [...left,...right].some(p=>!p)?[]:left.concat(right.reverse());
  }
  function validCorridor(corridor,rooms,boundaries) {
    const poly=polygon(corridor);
    // Circulation is a priority void, not a room that needs an empty slot.
    // Room footprints are cut non-destructively by roomContours below.
    return simple(poly)&&boundaries.filter(b=>!b.groupId).every(b=>contains(poly,b.points));
  }
  function snapCorridorSegment(c,reference,rooms,boundaries,options={}){
    if(options.roomSnap===false||c.outline)return null;
    const count=c.points.length,poly=polygon(c),sides=edges(poly),margin=options.margin??2;
    const indices=reference.end!==undefined?[reference.end===0?2*count-1:count-1]:[reference.segment,2*count-2-reference.segment];
    const choices=[];
    for(const index of indices){
      const edge=sides[index];if(!edge)continue;
      const u=unit(sub(edge.b,edge.a)),normal=inward(edge,poly);
      for(const room of rooms){const rp=polygon(room);
        for(const wall of edges(rp)){
          const outward=mul(inward(wall,rp),-1);
          if(Math.abs(cross(u,unit(sub(wall.b,wall.a))))>.0001||dot(outward,normal)<.999)continue;
          const half=faceThickness(room,wall.index)/24,a=add(wall.a,mul(outward,half)),b=add(wall.b,mul(outward,half));
          const span=[a,b].map(p=>dot(sub(p,edge.a),u));
          if(Math.min(Math.max(...span),distance(edge.a,edge.b))-Math.max(0,Math.min(...span))<.05)continue;
          const amount=dot(sub(a,edge.a),normal);if(Math.abs(amount)>margin)continue;
          const shift=mul(normal,amount),points=c.points.map((p,i)=>reference.end!==undefined?(i===reference.end?add(p,shift):p):(i===reference.segment||i===reference.segment+1?add(p,shift):p));
          const next={...c,points};
          if(points.slice(1).some((p,i)=>dot(sub(p,points[i]),unit(sub(c.points[i+1],c.points[i])))<=.25))continue;
          if(validCorridor(next,rooms,boundaries))choices.push({corridor:next,cost:Math.abs(amount),snapGuide:{a,b},snapped:true});
        }
      }
    }
    return choices.sort((a,b)=>a.cost-b.cost)[0]||null;
  }
  const corridorCutCache=new Map();
  function corridorCuts(corridors,boundaries=[]){
    const polys=corridors.map(polygon),limits=boundaries.filter(b=>!b.groupId).map(b=>b.points);
    const key=JSON.stringify([polys,limits]),cached=corridorCutCache.get(key);if(cached)return cached;
    const bridges=[],margin=2;
    for(let i=0;i<polys.length;i++)for(let j=i+1;j<polys.length;j++){
      const a=polys[i],b=polys[j];if(overlaps(a,b))continue;
      for(const e of edges(a))for(const f of edges(b)){
        const u=unit(sub(e.b,e.a)),n=mul(inward(e,a),-1);
        if(Math.abs(cross(u,unit(sub(f.b,f.a))))>1e-5||dot(n,inward(f,b))<.99999)continue;
        const gap=dot(sub(f.a,e.a),n);if(gap<=EPS||gap>margin+EPS)continue;
        const span=[f.a,f.b].map(p=>dot(sub(p,e.a),u)),lo=Math.max(0,Math.min(...span)),hi=Math.min(distance(e.a,e.b),Math.max(...span));
        if(hi-lo<.25)continue;
        const p=add(e.a,mul(u,lo)),q=add(e.a,mul(u,hi)),bridge=[p,q,add(q,mul(n,gap)),add(p,mul(n,gap))];
        if(limits.every(outer=>contains(bridge,outer)))bridges.push(bridge);
      }
    }
    const result=polys.concat(bridges);corridorCutCache.set(key,result);
    if(corridorCutCache.size>6)corridorCutCache.delete(corridorCutCache.keys().next().value);
    return result;
  }
  const contourCache=new WeakMap();
  function faceKind(room,side,at=.5){
    const wall=room.walls?.[side];
    return (wall?.segments||[]).filter(s=>at>=s.from-EPS&&at<=s.to+EPS).sort((a,b)=>(b.revision||0)-(a.revision||0))[0]?.kind||wall?.kind||'wall';
  }
  function roomFillContours(room,corridors=[],boundaries=[]) {
    const pieces=[offsetOutline(polygon(room),edges(polygon(room)).map(e=>['curtain','opening','window'].includes(faceKind(room,e.index))?-faceThickness(room,e.index)/24:0))];
    for(const wall of wallNetwork([room])){
      if(!['curtain','opening','window'].includes(wall.style.kind))continue;
      const face=curtainFace(wall,[room]);
      pieces.push([wall.a,wall.b,face.b,face.a]);
    }
    return unionOutline(pieces,corridorCuts(corridors,boundaries));
  }
  function roomContours(room,corridors=[],boundaries=[]) {
    const poly=polygon(room),cuts=corridorCuts(corridors,boundaries).filter(p=>overlaps(poly,p));
    if(!cuts.length)return [poly];
    const key=JSON.stringify([poly,cuts]),cached=contourCache.get(room);
    if(cached?.key===key)return cached.contours;
    const contours=unionOutline([poly],cuts);
    contourCache.set(room,{key,contours});return contours;
  }
  function contourArea(contours) {
    return Math.abs(contours.reduce((sum,p)=>sum+edges(p).reduce((s,e)=>s+cross(e.a,e.b),0)/2,0));
  }
  function insideContours(p,contours,includeEdge=true) {
    if(contours.some(poly=>edges(poly).some(e=>distance(p,closest(p,e.a,e.b))<EPS)))return includeEdge;
    return contours.filter(poly=>inside(p,poly,false)).length%2===1;
  }
  function contoursOverlap(contours,poly) {
    const sides=contours.flatMap(edges),other=edges(poly);
    return sides.some(e=>other.some(f=>crosses(e.a,e.b,f.a,f.b)))||
      sides.some(e=>[e.a,mul(add(e.a,e.b),.5)].some(p=>inside(p,poly,false)))||
      other.some(e=>[e.a,mul(add(e.a,e.b),.5)].some(p=>insideContours(p,contours,false)))||
      insideContours(centroid(poly),contours,false)&&inside(centroid(poly),poly,false);
  }
  // Keep an existing contact while extending another nearby side onto a wall.
  // Unconstrained sides retain their grid direction; one shifts to recover area.
  function secondarySnap(room,others,boundaries,options) {
    const poly=polygon(room),sides=edges(poly),margin=options.margin??2,target=area(baseOutline(room));
    const sources=[];
    if(options.boundarySnap!==false)boundaries.forEach(b=>edges(b.points).forEach(edge=>sources.push({edge,normal:inward(edge,b.points)})));
    if(options.roomSnap!==false)others.forEach(r=>{const p=polygon(r);edges(p).forEach(edge=>sources.push({edge,normal:mul(inward(edge,p),-1)}));});
    const matches=[];
    sides.forEach(side=>sources.forEach(source=>{
      const {edge,normal}=source,u=unit(sub(edge.b,edge.a));
      if(dot(inward(side,poly),normal)<.65)return;
      const interval=[side.a,side.b].map(p=>dot(sub(p,edge.a),u));
      if(Math.min(Math.max(...interval),distance(edge.a,edge.b))-Math.max(0,Math.min(...interval))<.05)return;
      const gap=Math.max(...[side.a,side.b].map(p=>Math.abs(dot(sub(p,edge.a),normal))));
      if(gap<=margin+EPS)matches.push({...source,side:side.index,gap});
    }));
    const contacts=matches.filter(m=>m.gap<.001);
    if(!contacts.length||new Set(contacts.map(c=>c.side)).size>=2)return null;
    const first=contacts[0],candidates=[];
    for(const second of matches.filter(m=>m.side!==first.side&&m.gap>=.001).sort((a,b)=>a.gap-b.gap)){
      const pair=[first,second],fittedSides=pair.map(m=>m.side),lines=sides.map(e=>({a:e.a,u:unit(sub(e.b,e.a))}));
      pair.forEach(m=>lines[m.side]={a:m.edge.a,u:unit(sub(m.edge.b,m.edge.a))});
      for(let free=0;free<lines.length;free++){
        if(fittedSides.includes(free))continue;
        const normal=inward(sides[free],poly);
        const build=t=>lines.map((line,i)=>{
          const previous=(i+lines.length-1)%lines.length,before=lines[previous];
          return intersectLines(add(before.a,mul(normal,previous===free?t:0)),before.u,add(line.a,mul(normal,i===free?t:0)),line.u);
        });
        const signed=p=>p.some(q=>!q)?NaN:p.reduce((sum,q,i)=>sum+cross(q,p[(i+1)%p.length]),0)/2;
        const c=signed(build(0))-target,plus=signed(build(1))-target,minus=signed(build(-1))-target,a=(plus+minus)/2-c,b=(plus-minus)/2;
        const roots=Math.abs(a)<EPS?(Math.abs(b)<EPS?[]:[-c/b]):b*b-4*a*c<0?[]:[(-b+Math.sqrt(b*b-4*a*c))/(2*a),(-b-Math.sqrt(b*b-4*a*c))/(2*a)];
        for(const t of roots){
          const points=build(t);if(points.some(p=>!p))continue;
          const next={...room,boundaryFit:{side:first.side,sides:fittedSides,points:points.map(p=>rotate(sub(p,room),-room.angle))}};
          if(!validBoundaryFit(next)||!validPlacement(next,others,boundaries))continue;
          if(pair.some(m=>{const e=edges(points)[m.side],u=unit(sub(m.edge.b,m.edge.a)),span=[e.a,e.b].map(p=>dot(sub(p,m.edge.a),u));return Math.min(Math.max(...span),distance(m.edge.a,m.edge.b))-Math.max(0,Math.min(...span))<.05;}))continue;
          const cost=points.reduce((sum,p,i)=>sum+distance(p,poly[i])**2,0);
          candidates.push({room:next,cost,aligned:true,message:'Snapped two nearby edges · room grid and area preserved.'});
        }
      }
    }
    return candidates.sort((a,b)=>a.cost-b.cost)[0]||null;
  }
  function settle(room,others,boundaries,options={}) {
    if(!options.corridorFaces){
      const clearance=Math.max(0,...(room.walls||[]).map(w=>w.kind==='opening'||w.kind==='curtain'?0:(w.thickness||6)/24));
      others=others.map(c=>c.type==='corridor'?{...c,outline:offsetOutline(polygon(c),-clearance),snapClearance:clearance}:c);
      options={...options,corridorFaces:true};
    }
    if(room.boundaryFit?.manual){
      const snapped=snapSelection([room],others,boundaries,options);
      return snapped?{room:snapped.rooms[0],aligned:true,message:snapped.message}:
        {room:validPlacement(room,others,boundaries)?room:null,message:'Manual wall shape retained.'};
    }
    const result=settlePrimary(room,others,boundaries,options);
    if(!result.room)return result;
    const fitted=secondarySnap(result.room,others,boundaries,options);if(fitted)return fitted;
    const snapped=snapSelection([result.room],others,boundaries,options);
    const next=snapped?.rooms[0]||result.room;
    return secondarySnap(next,others,boundaries,options)||(snapped?{room:next,aligned:true,message:snapped.message}:result);
  }
  function faceThickness(room,side,at=.5,fallback=6){
    const wall=room.walls?.[side]||{};
    const edit=(wall.segments||[]).filter(s=>at>=s.from-EPS&&at<=s.to+EPS).sort((a,b)=>(b.revision||0)-(a.revision||0))[0];
    return edit?.thickness||wall.thickness||fallback;
  }
  function offsetOutline(poly,amounts){
    const lines=edges(poly).map((e,i)=>({a:add(e.a,mul(inward(e,poly),Array.isArray(amounts)?amounts[i]:amounts)),u:sub(e.b,e.a)}));
    const next=lines.map((l,i)=>{const prev=lines[(i+lines.length-1)%lines.length];return intersectLines(prev.a,prev.u,l.a,l.u)||l.a;});
    return simple(next)?next:poly;
  }
  function interiorOutline(room){
    return offsetOutline(polygon(room),edges(polygon(room)).map(e=>{
      const wall=room.walls?.[e.index];return (['curtain','opening','window'].includes(faceKind(room,e.index))?-1:1)*faceThickness(room,e.index)/24;
    }));
  }
  function curtainFace(wall,entities){
    const owner=wall.source||wall.owners[0],room=entities.find(r=>r.id===owner?.roomId);
    if(!room)return {a:wall.a,b:wall.b};
    const poly=polygon(room),edge=edges(poly)[owner.side];
    if(!edge)return {a:wall.a,b:wall.b};
    const shift=mul(inward(edge,poly),-(wall.style.thickness||6)/24);
    const face={a:add(wall.a,shift),b:add(wall.b,shift)},all=edges(poly);
    for(const key of ['a','b'])for(const index of [(owner.side+all.length-1)%all.length,(owner.side+1)%all.length]){
      const adj=all[index];
      if(!['curtain','opening','window'].includes(faceKind(room,index,distance(wall[key],adj.a)<distance(wall[key],adj.b)?0:1))||Math.min(distance(wall[key],adj.a),distance(wall[key],adj.b))>.02)continue;
      const line=add(adj.a,mul(inward(adj,poly),-faceThickness(room,index)/24));
      const corner=intersectLines(face.a,sub(edge.b,edge.a),line,sub(adj.b,adj.a));
      if(corner&&distance(corner,face[key])<2)face[key]=corner;
    }
    return face;
  }
  function snapSelection(rooms,others,boundaries,options={}) {
    const margin=options.margin??2,matches=[];
    for(const room of rooms){
      const poly=polygon(room),sources=[];
      if(options.boundarySnap!==false)boundaries.filter(b=>!b.groupId||b.groupId===room.groupId).forEach(b=>edges(b.points).forEach(e=>sources.push({e,n:inward(e,b.points)})));
      if(options.roomSnap!==false)others.forEach(r=>{const p=polygon(r);edges(p).forEach(e=>sources.push({e,n:mul(inward(e,p),-1),neighbor:r}));});
      for(const side of edges(poly))for(const {e,n,neighbor} of sources){
        const facing=dot(inward(side,poly),n),continuation=!!neighbor&&facing<-.99999;
        if(facing<.99999&&!continuation)continue;
        const u=unit(sub(e.b,e.a)),span=[side.a,side.b].map(p=>dot(sub(p,e.a),u));
        const overlap=Math.min(Math.max(...span),distance(e.a,e.b))-Math.max(0,Math.min(...span));
        if(continuation){
          // Adjacent TOP/TOP (or bottom/bottom, left/left, right/right) faces
          // should continue on one line; they are not opposing contact faces.
          if(overlap>margin||overlap < -margin||Math.min(...[side.a,side.b].flatMap(a=>[e.a,e.b].map(b=>distance(a,b))))>margin*Math.SQRT2+EPS)continue;
        }else if(overlap<.05)continue;
        const ends=continuation?[side.a,side.b].flatMap((a,i)=>[e.a,e.b].map((b,j)=>({i,j,gap:distance(a,b)}))).sort((a,b)=>a.gap-b.gap)[0]:null;
        const sourceHalf=faceThickness(room,side.index,ends?.i??.5,options.thickness)/24;
        const targetHalf=neighbor&&neighbor.type!=='corridor'?faceThickness(neighbor,e.index,ends?.j??.5,options.thickness)/24:0;
        const sourceExterior=['curtain','opening','window'].includes(faceKind(room,side.index));
        const targetExterior=neighbor&&['curtain','opening','window'].includes(faceKind(neighbor,e.index));
        // settle already offsets corridor barriers to the outside wall face.
        // Only apply the remaining allowance, never the wall thickness twice.
        const faceOffset=continuation?sourceHalf-targetHalf:neighbor?.type==='corridor'? (neighbor.snapClearance||0)-sourceHalf:sourceExterior||targetExterior?-(sourceHalf+targetHalf):0;
        const gap=dot(sub(side.a,e.a),n)+faceOffset;
        if(Math.abs(gap)<=margin+EPS)matches.push({n,gap,side,e,continuation});
      }
    }
    const existing=matches.filter(c=>Math.abs(c.gap)<.001),moves=[];
    matches.forEach(c=>moves.push(mul(c.n,-c.gap)));
    for(let i=0;i<matches.length;i++)for(let j=i+1;j<matches.length;j++){
      const a=matches[i],b=matches[j],det=cross(a.n,b.n);if(Math.abs(det)<.05)continue;
      moves.push({x:(-a.gap*b.n.y+b.gap*a.n.y)/det,y:(-b.gap*a.n.x+a.gap*b.n.x)/det});
    }
    const candidates=[];
    for(const delta of moves){
      if(length(delta)<.00001||length(delta)>margin*Math.SQRT2+EPS||existing.some(c=>Math.abs(dot(delta,c.n))>.001))continue;
      const moved=rooms.map(r=>({...r,x:r.x+delta.x,y:r.y+delta.y}));
      if(!moved.every(r=>validPlacement(r,others,boundaries.filter(b=>!b.groupId||b.groupId===r.groupId))))continue;
      const contacts=matches.filter(c=>{
        if(Math.abs(c.gap+dot(delta,c.n))>=.001)return false;
        const u=unit(sub(c.e.b,c.e.a)),span=[c.side.a,c.side.b].map(p=>dot(sub(add(p,delta),c.e.a),u)),overlap=Math.min(Math.max(...span),distance(c.e.a,c.e.b))-Math.max(0,Math.min(...span));
        return c.continuation?overlap>=-margin-EPS:overlap>.05;
      }).length;
      if(contacts<=existing.length)continue;
      candidates.push({rooms:moved,contacts,cost:length(delta),message:'Edges snapped flush · '+(rooms.length>1?'group kept together.':'existing contact retained.')});
    }
    return candidates.sort((a,b)=>b.contacts-a.contacts||a.cost-b.cost)[0]||null;
  }
  function alignGroupBottom(rooms,others,boundaries) {
    if(rooms.length<2||rooms.some(r=>r.locked||r.shape!=='rect'||Math.abs(normalize(r.angle-rooms[0].angle))>EPS))return null;
    const angle=rooms[0].angle,local=p=>rotate(p,-angle),world=p=>rotate(p,angle);
    const sorted=rooms.map(r=>({r,p:polygon(r).map(local)})).sort((a,b)=>a.p[0].x-b.p[0].x);
    const start=Math.min(...sorted.map(s=>s.p[0].x)),end=Math.max(...sorted.map(s=>s.p[1].x));
    const first=sorted[0].p,roofU=unit(sub(first[1],first[0]));
    const commonRoof=sorted.every(s=>s.r.boundaryFit&&[s.p[0],s.p[1]].every(p=>Math.abs(cross(sub(p,first[0]),roofU))<.001));
    let result=[];
    if(commonRoof){
      const roof=x=>first[0].y+(x-first[0].x)*roofU.y/roofU.x,total=rooms.reduce((n,r)=>n+area(polygon(r)),0),bottom=(roof(start)+roof(end))/2+total/(end-start);
      if(bottom<=Math.max(roof(start),roof(end))+2)return null;
      let left=start;
      for(let i=0;i<sorted.length;i++){
        const {r}=sorted[i],target=area(polygon(r));let lo=left,hi=end;
        for(let step=0;step<60;step++){const mid=(lo+hi)/2,size=(mid-left)*(bottom-(roof(left)+roof(mid))/2);if(size<target)lo=mid;else hi=mid;}
        const right=i===sorted.length-1?end:(lo+hi)/2,width=right-left,depth=target/width;
        if(width<2||depth<2||width>500||depth>500)return null;
        const center=world({x:(left+right)/2,y:bottom-depth/2});
        const points=[{x:left,y:roof(left)},{x:right,y:roof(right)},{x:right,y:bottom},{x:left,y:bottom}].map(p=>rotate(sub(world(p),center),-angle));
        result.push({...r,...center,width,depth,boundaryFit:{side:0,points}});left=right;
      }
    }else{
      if(rooms.some(r=>r.boundaryFit))return null;
      const bottom=Math.max(...sorted.flatMap(s=>s.p.map(p=>p.y)));let left=start;
      result=sorted.map(({r})=>{const center=world({x:left+r.width/2,y:bottom-r.depth/2});left+=r.width;return {...r,...center,boundaryFit:null};});
    }
    if(!result.every((r,i)=>validBoundaryFit(r)&&validPlacement(r,others.concat(result.filter((_,j)=>j!==i)),boundaries.filter(b=>!b.groupId||b.groupId===r.groupId))))return null;
    return result;
  }
  function alignRoomEdges(rooms,others,boundaries,side=0,defaultThickness=6) {
    if(rooms.length<2||!Number.isInteger(side)||side<0||side>3)return null;
    // Explicit alignment references the first picked room and only translates.
    // It never changes room area, shape, order, or tangential location.
    const edgeFor=room=>{const poly=polygon(room),direction=rotate([{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}][side],room.angle);
      return edges(poly).filter(e=>dot(mul(inward(e,poly),-1),direction)>.65).sort((a,b)=>dot(b.a,direction)-dot(a.a,direction))[0];};
    const first=rooms[0],reference=edgeFor(first);if(!reference)return null;
    const n=mul(inward(reference,polygon(first)),-1),target=dot(reference.a,n)+faceThickness(first,reference.index,.5,defaultThickness)/24;
    const result=[];
    for(const room of rooms){
      const edge=edgeFor(room);if(!edge||dot(mul(inward(edge,polygon(room)),-1),n)<.99999)return null;
      const shift=target-dot(edge.a,n)-faceThickness(room,edge.index,.5,defaultThickness)/24;
      if(room.locked&&Math.abs(shift)>.00001)return null;
      const delta=mul(n,shift),next={...room,x:room.x+delta.x,y:room.y+delta.y};
      // Boundary-fitted walls must stay attached rather than sliding off the shell.
      const limits=boundaries.filter(b=>!b.groupId||b.groupId===room.groupId);
      for(const e of edges(polygon(room)))for(const b of limits)for(const f of edges(b.points)){
        if([e.a,e.b].every(p=>distance(p,closest(p,f.a,f.b))<.001)&&[e.a,e.b].some(p=>distance(add(p,delta),closest(add(p,delta),f.a,f.b))>.001))return null;
      }
      result.push(next);
    }
    return result.every((r,i)=>validPlacement(r,others.concat(result.filter((_,j)=>j!==i)),boundaries.filter(b=>!b.groupId||b.groupId===r.groupId)))?result:null;
  }
  function contactEdges(rooms,others,boundaries) {
    const contacts=[];
    for(const room of rooms){
      const source=others.flatMap(r=>edges(polygon(r))).concat(boundaries.filter(b=>!b.groupId||b.groupId===room.groupId).flatMap(b=>edges(b.points)));
      for(const side of edges(polygon(room)))for(const edge of source){
        const u=unit(sub(edge.b,edge.a));
        if(Math.abs(cross(unit(sub(side.b,side.a)),u))>.00001||Math.abs(cross(sub(side.a,edge.a),u))>.001)continue;
        const span=[side.a,side.b].map(p=>dot(sub(p,edge.a),u)),lo=Math.max(0,Math.min(...span)),hi=Math.min(distance(edge.a,edge.b),Math.max(...span));
        if(hi-lo>.05)contacts.push({a:add(edge.a,mul(u,lo)),b:add(edge.a,mul(u,hi))});
      }
    }
    return contacts;
  }
  function moveSelection(rooms,delta,others,boundaries,options={}) {
    if(rooms.some(r=>r.locked))return {rooms,message:'Unlock the selection before moving.',sliding:false};
    // An imported room may already be outside. Let it travel back in without
    // requiring every intermediate frame to be contained. Re-evaluate on the
    // next drag so a repaired room obeys the boundary normally again.
    const limitsFor=room=>boundaries.filter(b=>(!b.groupId||b.groupId===room.groupId)&&(!options.recoverOutside||contains(polygon((options.releaseRooms||rooms).find(r=>r.id===room.id)||room),b.points)));
    const corridors=others.filter(r=>r.type==='corridor');
    const cuts=corridorCuts(corridors,boundaries);
    const shapes=rooms.map(room=>{const poly=polygon(room),half=Math.max(0,...(room.walls||[]).map(w=>w.kind==='opening'||w.kind==='curtain'?0:(w.thickness||6)/24)),clearCuts=cuts.map(c=>offsetOutline(c,-half));return {room,poly,clearCuts,clipped:clearCuts.some(c=>overlaps(poly,c)),boundaries:limitsFor(room)};});
    const neighbors=others.filter(r=>r.type!=='corridor'),obstacles=neighbors.map(polygon).concat(cuts);
    const valid=offset=>shapes.every(({poly,clipped,clearCuts,boundaries:limits})=>{
      const moved=poly.map(p=>add(p,offset));
      if(!limits.every(b=>contains(moved,b.points)))return false;
      // A room already cut by a corridor moves as a base outline; its visible
      // footprint is re-cut at every location. Opposing fragments cannot cage it.
      // Uncut rooms still stop at the void, including merged connector gaps.
      if(!options.ghostCorridors&&!clipped&&clearCuts.some(c=>overlaps(moved,c)))return false;
      return options.ghostRooms||!neighbors.some(other=>overlaps(moved,polygon(other)));
    });
    // Sweep to contact instead of showing an overlap then rejecting the whole drag.
    function trace(start,motion) {
      if(length(motion)<EPS)return start;
      const steps=Math.max(1,Math.ceil(length(motion)/.35));let low=0;
      for(let i=1;i<=steps;i++) {
        const high=i/steps;
        if(valid(add(start,mul(motion,high)))){low=high;continue;}
        let hi=high,lo=low;
        for(let j=0;j<15;j++){const mid=(lo+hi)/2;if(valid(add(start,mul(motion,mid))))lo=mid;else hi=mid;}
        return add(start,mul(motion,lo));
      }
      return add(start,motion);
    }
    const directions=[];
    const axis=u=>{u=unit(u);if(!directions.some(d=>Math.abs(cross(d,u))<.001))directions.push(u);};
    rooms.forEach(r=>{axis(rotate({x:1,y:0},r.angle));axis(rotate({x:0,y:1},r.angle));});
    [...obstacles,...boundaries.map(b=>b.points)].forEach(poly=>edges(poly).forEach(e=>axis(sub(e.b,e.a))));
    let offset={x:0,y:0};
    for(let pass=0;pass<3;pass++) {
      offset=trace(offset,sub(delta,offset));
      const residual=sub(delta,offset);if(length(residual)<.0001)break;
      let best=offset,score=distance(offset,delta);
      for(const direction of directions) {
        const tangent=mul(direction,dot(residual,direction));
        const candidate=trace(offset,tangent),cost=distance(candidate,delta);
        if(cost<score-.0001){best=candidate;score=cost;}
      }
      if(distance(best,offset)<.0001)break;
      offset=best;
    }
    let moved=rooms.map(r=>({...r,x:r.x+offset.x,y:r.y+offset.y}));
    const sliding=distance(offset,delta)>.001;
    let message=sliding?'Sliding along nearby walls.':shapes.some(s=>s.clipped)?'Room moved · corridor cutout recalculated.':'Room placed.';
    if(moved.length===1) {
      const room=moved[0],limits=limitsFor(room).sort((a,b)=>Number(!!b.groupId)-Number(!!a.groupId));
      const fitted=settle(room,others,limits,options);
      // A drag must be able to detach an initial contact. Boundary fitting can
      // otherwise keep stretching a small room back to that wall at every frame.
      const origin=(options.releaseRooms||rooms).find(r=>r.id===room.id)||rooms[0];
      const sourceEdges=limits.flatMap(b=>edges(b.points));
      const retreats=fitted.room&&sourceEdges.some(edge=>{
        const startGap=edgeGap(origin,edge),freeGap=edgeGap(room,edge);
        return startGap<.02&&freeGap>startGap+.001&&edgeGap(fitted.room,edge)<freeGap-.001;
      });
      // Keep the live contact position if reshaping cannot fit. Never bounce to drag-start.
      if(fitted.room&&!retreats){moved=[fitted.room];message=fitted.aligned||fitted.move!==undefined?fitted.message:message;}
    }else{
      const fitted=snapSelection(moved,others,boundaries.filter(b=>rooms.every(r=>b.groupId&&b.groupId!==r.groupId||limitsFor(r).includes(b))),options);
      if(fitted){moved=fitted.rooms;message=fitted.message;}
    }
    return {rooms:moved,sliding,message};
  }
  // Split collinear sides at every endpoint; draw each resulting shared wall ONCE.
  function wallNetwork(rooms,defaultThickness=6) {
    const lines=[],corridors=corridorCuts(rooms.filter(r=>r.type==='corridor'));
    rooms.filter(r=>r.type!=='corridor').forEach(room=>edges(polygon(room)).forEach(({a,b,index})=> {
      let u=unit(sub(b,a));if(u.x<-.00001 || (Math.abs(u.x)<.00001&&u.y<0))u=mul(u,-1);
      const n={x:-u.y,y:u.x},offset=dot(a,n);
      let line=lines.find(l=>Math.abs(cross(l.u,u))<1e-5&&Math.abs(l.offset-offset)<.015);
      if(!line){line={u,n,offset,parts:[]};lines.push(line);}
      line.parts.push({roomId:room.id,entityType:room.type||'room',side:index,a,b,lo:Math.min(dot(a,line.u),dot(b,line.u)),hi:Math.max(dot(a,line.u),dot(b,line.u)),style:room.walls?.[index]||{kind:'wall',thickness:defaultThickness,revision:0}});
    }));
    const walls=[];
    lines.forEach(line=> {
      const cuts=[];
      const cutters=line.parts.some(p=>p.entityType==='corridor')?rooms.map(polygon):corridors;
      cutters.forEach(poly=>edges(poly).forEach(e=>{
        const q=intersectLines(mul(line.n,line.offset),line.u,e.a,sub(e.b,e.a));
        if(q&&distance(q,closest(q,e.a,e.b))<EPS)cuts.push(dot(q,line.u));
      }));
      // Do not round just the longitudinal coordinates: it opens microscopic
      // gaps where a cut wall meets a corridor and can lose a room's inner loop.
      const ordered=[...cuts,...line.parts.flatMap(p=>[p.lo,p.hi,...(p.style.segments||[]).flatMap(edit=>[edit.from,edit.to].map(t=>dot(add(p.a,mul(sub(p.b,p.a),t)),line.u)))])].sort((a,b)=>a-b);
      const stops=ordered.filter((v,i)=>!i||v-ordered[i-1]>1e-8);
      for(let i=0;i<stops.length-1;i++) {
        const lo=stops[i],hi=stops[i+1],mid=(lo+hi)/2;
        const midpoint=add(mul(line.u,mid),mul(line.n,line.offset));
        const owners=line.parts.filter(p=>p.lo<mid+EPS&&p.hi>mid-EPS&&
          (p.entityType==='corridor'||!corridors.some(poly=>inside(midpoint,poly,false)))).map(p=> {
          const at=add(mul(line.u,mid),mul(line.n,line.offset)),delta=sub(p.b,p.a);
          const fraction=dot(sub(at,p.a),delta)/dot(delta,delta);
          const edit=(p.style.segments||[]).filter(e=>fraction>=e.from-EPS&&fraction<=e.to+EPS).sort((a,b)=>(b.revision||0)-(a.revision||0))[0];
          return {...p,style:edit?{...p.style,...edit}:p.style};
        });
        if(!owners.length||hi-lo<.015)continue;
        if(owners.some(p=>p.entityType==='corridor')){
          const p=add(mul(line.u,mid),mul(line.n,line.offset));
          // Overlapping paths form a continuous void, without internal branch walls.
          if([1,-1].every(sign=>corridors.some(poly=>inside(add(p,mul(line.n,.001*sign)),poly,false))))continue;
        }
        const source=[...owners].sort((a,b)=>(b.style.revision||0)-(a.style.revision||0)||(b.style.thickness||defaultThickness)-(a.style.thickness||defaultThickness))[0];
        const point=t=>add(mul(line.u,t),mul(line.n,line.offset));
        const adjacentRoomIds=owners.some(o=>o.entityType==='corridor')?rooms.filter(r=>r.type!=='corridor'&&inside(midpoint,polygon(r))).map(r=>r.id):[];
        const ownerKey=owners.map(o=>o.roomId+':'+o.side).sort().join('|');
        const style={kind:'wall',thickness:defaultThickness,...source.style},previous=walls.at(-1);
        // Finish bookkeeping is not a physical joint. Collapse identical runs
        // while preserving real changes in ownership, thickness or openings.
        const finish=s=>JSON.stringify([s.kind||'wall',s.thickness||defaultThickness]);
        if(previous&&previous.owners.map(o=>o.roomId+':'+o.side).sort().join('|')===ownerKey&&
          distance(previous.b,point(lo))<1e-7&&Math.abs(cross(unit(sub(previous.b,previous.a)),line.u))<1e-7&&
          style.kind!=='door'&&finish(previous.style)===finish(style)){
          previous.b=point(hi);previous.length=distance(previous.a,previous.b);
          previous.id=ownerKey+'@'+dot(previous.a,line.u).toFixed(3)+':'+hi.toFixed(3);
        }else walls.push({id:ownerKey+'@'+lo.toFixed(3)+':'+hi.toFixed(3),a:point(lo),b:point(hi),owners,adjacentRoomIds,source,style,length:hi-lo});
      }
    });
    return walls;
  }
  function shiftedEdge(points,side,offset) {
    if(!Number.isFinite(offset)||!Number.isInteger(side)||!points[side])return null;
    const count=points.length,i=side,j=(side+1)%count,previous=(i+count-1)%count,after=(j+1)%count;
    const edge={a:points[i],b:points[j]},normal=mul(inward(edge,points),-1),linePoint=add(edge.a,mul(normal,offset)),direction=sub(edge.b,edge.a);
    const a=intersectLines(points[previous],sub(points[i],points[previous]),linePoint,direction);
    const b=intersectLines(points[j],sub(points[after],points[j]),linePoint,direction);
    if(!a||!b)return null;
    const result=points.map(p=>({...p}));result[i]=a;result[j]=b;
    if(!simple(result)||edges(result).some((e,k)=>distance(e.a,e.b)<.5||dot(sub(e.b,e.a),sub(points[(k+1)%count],points[k]))<=EPS))return null;
    return result;
  }
  function withManualOutline(entity,points) {
    if(entity.type==='corridor')return {...entity,outline:points};
    const local=points.map(p=>rotate(sub(p,entity),-entity.angle));
    const xs=local.map(p=>p.x),ys=local.map(p=>p.y),width=Math.max(...xs)-Math.min(...xs),depth=Math.max(...ys)-Math.min(...ys);
    const center={x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2},position=add(entity,rotate(center,entity.angle));
    if(entity.shape==='custom'||points.length!==baseOutline(entity).length)return {...entity,...position,width,depth,shape:'custom',boundaryFit:{manual:true,side:0,sides:[0],points:local.map(p=>sub(p,center))}};
    const base=baseOutline(entity),sides=edges(local).filter((e,i)=>Math.abs(cross(unit(sub(e.b,e.a)),unit(sub(base[(i+1)%base.length],base[i]))))>EPS).map(e=>e.index);
    return {...entity,...position,width,depth,boundaryFit:{manual:true,side:sides[0]??0,sides:sides.length?sides:[0],points:local.map(p=>sub(p,center))}};
  }
  function wallReference(wall,entities,preferredId) {
    return wall.owners.find(o=>o.roomId===preferredId)||wall.owners.find(o=>entities.some(e=>e.id===o.roomId&&e.type!=='corridor'))||wall.source;
  }
  function shiftWall(entities,reference,offset,boundaries=[],clampMove=false,options={}) {
    const entity=entities.find(e=>e.id===reference?.roomId),side=reference?.side;
    if(!entity||!Number.isFinite(offset)||Math.abs(offset)>1000)return {error:'Enter a move distance within 1,000 feet.'};
    const poly=polygon(entity),edge=edges(poly)[side];if(!edge)return {error:'Select a wall first.'};
    const u=unit(sub(edge.b,edge.a)),normal=mul(inward(edge,poly),-1),span=distance(edge.a,edge.b);
    // Extend the whole side, including every shared segment along that side.
    const affected=entities.filter(e=>entity.type==='corridor'||options.isolatedId===entity.id?e.id===entity.id:e.type!=='corridor').flatMap(e=>edges(polygon(e)).filter(f=>{
      if(Math.abs(cross(unit(sub(f.b,f.a)),u))>EPS||Math.abs(cross(sub(f.a,edge.a),u))>.015)return false;
      const ts=[f.a,f.b].map(p=>dot(sub(p,edge.a),u));return Math.min(span,Math.max(...ts))-Math.max(0,Math.min(...ts))>.015;
    }).map(f=>({entity:e,side:f.index,normal:mul(inward(f,polygon(e)),-1)})));
    if(affected.some(a=>a.entity.locked))return {error:'Unlock every room sharing this wall before moving it.'};
    const changed=new Set(affected.map(a=>a.entity.id));
    function attempt(amount){
      let result=entities.map(e=>({...e}));
      for(const a of affected){const e=result.find(r=>r.id===a.entity.id),p=shiftedEdge(polygon(e),a.side,amount*dot(normal,a.normal));if(!p)return null;Object.assign(e,withManualOutline(e,p));}
      const rooms=result.filter(e=>e.type!=='corridor'),paths=result.filter(e=>e.type==='corridor');
      for(const e of result.filter(r=>changed.has(r.id))){
        if(e.type==='corridor'){if(!validCorridor(e,rooms,boundaries))return null;continue;}
        if(e.width<2||e.depth<2||e.width>500||e.depth>500||!validBoundaryFit(e)||!validPlacement(e,rooms.filter(r=>r.id!==e.id),boundaries.filter(b=>!b.groupId||b.groupId===e.groupId)))return null;
        const old=entities.find(r=>r.id===e.id);
        const fixedPaths=paths.filter(p=>!changed.has(p.id));
        const oldLoss=area(polygon(old))-contourArea(roomContours(old,fixedPaths,boundaries));
        const newLoss=area(polygon(e))-contourArea(roomContours(e,fixedPaths,boundaries));
        if(newLoss>oldLoss+.0001)return null;
      }
      return result;
    }
    let result=attempt(offset),amount=offset;
    if(!result&&clampMove){let lo=0,hi=1;result=entities;for(let i=0;i<16;i++){const mid=(lo+hi)/2,next=attempt(offset*mid);if(next){lo=mid;result=next;}else hi=mid;}amount=offset*lo;}
    return result?{entities:result,offset:amount,normal,reference,changedIds:[...changed],limited:Math.abs(amount-offset)>.001}:
      {error:'That move crosses another room, the site, or a corridor, or makes a side too short.'};
  }
  function fitWallToBoundary(entities,reference,target,boundaries=[]){
    const entity=entities.find(e=>e.id===reference.roomId);
    if(!entity||entity.locked)return {error:'Select an unlocked room.'};
    const poly=polygon(entity),side=reference.side,count=poly.length,j=(side+1)%count,prev=(side+count-1)%count,after=(j+1)%count,u=unit(sub(target.b,target.a));
    const a=intersectLines(poly[prev],sub(poly[side],poly[prev]),target.a,u),b=intersectLines(poly[j],sub(poly[after],poly[j]),target.a,u);
    if(!a||!b||[a,b].some(p=>distance(p,closest(p,target.a,target.b))>.001))return {error:'Both ends must fit on the boundary edge.'};
    const points=poly.map(p=>({...p}));points[side]=a;points[j]=b;
    if(!simple(points)||edges(points).some(e=>distance(e.a,e.b)<.5))return {error:'Boundary fit makes a side too short.'};
    const next=withManualOutline(entity,points),others=entities.filter(e=>e.id!==entity.id);
    if(next.type==='corridor'?!validCorridor(next,others.filter(e=>e.type!=='corridor'),boundaries):next.width<2||next.depth<2||next.width>500||next.depth>500||!validBoundaryFit(next)||!validPlacement(next,others,boundaries.filter(b=>!b.groupId||b.groupId===next.groupId)))return {error:'Boundary fit would cross another space.'};
    const normal=mul(inward(edges(poly)[side],poly),-1),offset=dot(sub(mul(add(a,b),.5),mul(add(poly[side],poly[j]),.5)),normal);
    return {entities:entities.map(e=>e.id===next.id?next:e),offset,normal,reference,changedIds:[entity.id],limited:false,reshaped:true};
  }
  function snapWallDrag(entities,reference,offset,boundaries=[],options={}) {
    const base=shiftWall(entities,reference,offset,boundaries,true,options),margin=Number(options.margin??2);
    if(base.error||!Number.isFinite(margin)||margin<=0||(options.roomSnap===false&&options.boundarySnap===false))return base;
    const entity=entities.find(e=>e.id===reference.roomId),original=edges(polygon(entity))[reference.side];
    const current=edges(polygon(base.entities.find(e=>e.id===entity.id)))[reference.side];
    const u=unit(sub(original.b,original.a)),n=base.normal,changed=new Set(base.changedIds),targets=[],candidates=[];
    // Never use the edited/shared sides, or other edges of those same rooms,
    // as magnets. They move with the edit rather than serving as fixed targets.
    if(options.roomSnap!==false)wallNetwork(entities,options.thickness??6).forEach(w=>{
      if(w.owners.some(o=>changed.has(o.roomId)))return;
      const owner=w.source,neighbor=entities.find(e=>e.id===owner.roomId),poly=polygon(neighbor);
      targets.push({edge:{a:w.a,b:w.b},normal:mul(inward(edges(poly)[owner.side],poly),-1),thickness:w.style.thickness,kind:'neighbor'});
    });
    if(options.roomSnap!==false)corridorCuts(entities.filter(e=>e.type==='corridor'&&!changed.has(e.id)),boundaries).forEach(poly=>edges(poly).forEach(e=>targets.push({edge:e,normal:mul(inward(e,poly),-1),thickness:0,kind:'corridor'})));
    if(options.boundarySnap!==false)boundaries.filter(b=>!b.groupId||b.groupId===entity.groupId).forEach(b=>
      edges(b.points).forEach(e=>targets.push({edge:e,normal:inward(e,b.points),kind:'boundary'})));
    function nearby(side,target,continuation){
      const axis=unit(sub(target.b,target.a)),span=[side.a,side.b].map(p=>dot(sub(p,target.a),axis));
      const overlap=Math.min(Math.max(...span),distance(target.a,target.b))-Math.max(0,Math.min(...span));
      return continuation?overlap>=-margin-EPS&&overlap<=margin+EPS:overlap>.05;
    }
    for(const target of targets){
      const e=target.edge;
      if(Math.abs(cross(u,unit(sub(e.b,e.a))))>EPS){
        if(target.kind==='boundary'&&base.changedIds.length===1&&dot(mul(n,-1),target.normal)>.65&&nearby(current,e,false)){
          const gap=Math.max(...[current.a,current.b].map(p=>Math.abs(dot(sub(p,e.a),target.normal))));
          if(gap<=margin+EPS)candidates.push({...target,cost:gap,angled:true});
        }
        continue;
      }
      const facing=dot(mul(n,-1),target.normal),continuation=target.kind==='neighbor'&&facing<-.99999;
      if(facing<.99999&&!continuation||!nearby(current,e,continuation))continue;
      const end=[current.a,current.b].map((a,i)=>({i,gap:Math.min(distance(a,e.a),distance(a,e.b))})).sort((a,b)=>a.gap-b.gap)[0].i;
      const sourceThickness=faceThickness(entity,reference.side,end,options.thickness??6);
      // Same-facing adjacent walls align their outside faces, even if their
      // thickness differs. Opposing walls meet on one shared centerline.
      const faceOffset=target.kind==='corridor'?-sourceThickness/24:continuation?(target.thickness-sourceThickness)/24:0;
      const amount=dot(sub(e.a,original.a),n)+faceOffset,cost=Math.abs(amount-base.offset);
      if(cost<=margin+EPS)candidates.push({...target,amount,cost,continuation,sourceThickness});
    }
    candidates.sort((a,b)=>a.cost-b.cost);
    for(const candidate of candidates){
      const result=candidate.angled?fitWallToBoundary(entities,reference,candidate.edge,boundaries):shiftWall(entities,reference,candidate.amount,boundaries,false,options);
      if(result.error)continue;
      const side=edges(polygon(result.entities.find(e=>e.id===entity.id)))[reference.side];
      if(!nearby(side,candidate.edge,candidate.continuation))continue;
      const axis=unit(sub(side.b,side.a)),origin=add(side.a,mul(n,candidate.continuation?candidate.sourceThickness/24:0));
      const span=[side.a,side.b,candidate.edge.a,candidate.edge.b].map(p=>dot(sub(p,origin),axis));
      return {...result,snapped:true,snapKind:candidate.kind,snapGuide:{a:add(origin,mul(axis,Math.min(...span)-.5)),b:add(origin,mul(axis,Math.max(...span)+.5))}};
    }
    return base;
  }
  function sideLengthMove(entity,side,target,anchor='start') {
    if(!Number.isFinite(target)||target<.5||target>1000)return null;
    const points=polygon(entity),count=points.length,current=distance(points[side],points[(side+1)%count]);
    const movingSide=(side+(anchor==='end'?count-1:1))%count;
    const probe=shiftedEdge(points,movingSide,.01);if(!probe)return null;
    const rate=(distance(probe[side],probe[(side+1)%count])-current)/.01;if(Math.abs(rate)<EPS)return null;
    return {reference:{roomId:entity.id,side:movingSide},offset:(target-current)/rate};
  }
  function doorOpening(wall) {
    const spec=wall.style,source=wall.source;
    const direction=unit(sub(source.b,source.a));
    const sideLength=distance(source.a,source.b),width=Number(spec.doorWidth)||3;
    if(width<.5||width>sideLength-.1)return null;
    const offset=Math.max(width/2+.05,Math.min(sideLength-width/2-.05,(spec.position??.5)*sideLength));
    const center=add(source.a,mul(direction,offset)),a=add(center,mul(direction,-width/2)),b=add(center,mul(direction,width/2));
    // A door must fit wholly on one physical segment, not duplicate across splits.
    if(distance(a,closest(a,wall.a,wall.b))>.02||distance(b,closest(b,wall.a,wall.b))>.02)return null;
    return {a,b,width,hinge:spec.hinge==='end'?b:a,tip:spec.hinge==='end'?a:b};
  }
  function wallJoins(walls,minThickness=0) {
    const nodes=[];
    function endpoint(p,toward,wall) {
      let node=nodes.find(n=>distance(n.p,p)<.001);
      if(!node){node={p,rays:[]};nodes.push(node);}
      const u=unit(sub(toward,p));
      node.rays.push({u,angle:Math.atan2(u.y,u.x),half:Math.max(minThickness,wall.style.thickness/12)/2,length:distance(p,toward),wallId:wall.id});
    }
    walls.forEach(wall=>{
      if(wall.style.kind==='curtain'||wall.style.kind==='opening')return;
      const door=wall.style.kind==='door'?doorOpening(wall):null;
      const u=unit(sub(wall.b,wall.a));
      const ends=door?[door.a,door.b].sort((a,b)=>dot(a,u)-dot(b,u)):null;
      // Only physical wall junctions join. Door jambs retain their flat open ends.
      endpoint(wall.a,ends?ends[0]:wall.b,wall);
      endpoint(wall.b,ends?ends[1]:wall.a,wall);
    });
    const joins=[];
    nodes.forEach(({p,rays})=>{
      rays.sort((a,b)=>a.angle-b.angle);
      if(rays.length<2)return;
      rays.forEach((a,i)=>{
        const b=rays[(i+1)%rays.length];
        if(Math.abs(cross(a.u,b.u))<EPS)return;
        const left=add(p,mul({x:-a.u.y,y:a.u.x},a.half));
        const right=add(p,mul({x:b.u.y,y:-b.u.x},b.half));
        const miter=intersectLines(left,a.u,right,b.u);
        const limit=4*Math.max(a.half,b.half);
        const points=[p,left];
        // A split wall segment can be shorter than its thickness. Its length is
        // not a miter limit: applying that test chips otherwise square junctions.
        if(miter&&distance(p,miter)<=limit)points.push(miter);
        points.push(right);
        if(area(points)>EPS)joins.push({points,wallIds:[a.wallId,b.wallId]});
      });
    });
    return joins;
  }
  function wallMass(walls,minThickness=0,hostedDoors=[],entities=[]) {
    const strip=(a,b,half)=>{const u=unit(sub(b,a)),n=mul({x:-u.y,y:u.x},half);return [add(a,n),add(b,n),sub(b,n),sub(a,n)];};
    const pieces=[],openings=[];
    walls.forEach(w=>{
      if(!['wall','door'].includes(w.style.kind))return;
      const half=Math.max(minThickness,w.style.thickness/12)/2;
      pieces.push(strip(w.a,w.b,half));
      // Curtain fronts sit on the exterior face. Carry adjoining partition
      // end caps to that same face, without moving the room or its doors.
      for(const [end,other] of [[w.a,w.b],[w.b,w.a]]){
        const outward=unit(sub(end,other));
        for(const curtain of walls.filter(c=>['curtain','opening','window'].includes(c.style.kind))){
          if(!curtain.owners.some(c=>w.owners.some(o=>o.roomId===c.roomId)))continue;
          if(distance(end,closest(end,curtain.a,curtain.b))>.02)continue;
          const face=curtainFace(curtain,entities),u=unit(sub(face.b,face.a));
          if(Math.abs(cross(outward,u))<.01)continue;
          const hit=intersectLines(end,outward,face.a,u);
          if(!hit)continue;
          const extension=dot(sub(hit,end),outward);
          if(extension>EPS&&extension<=Math.max(1,(curtain.style.thickness||6)/6))pieces.push(strip(end,hit,half));
        }
      }
      const door=w.style.kind==='door'?doorOpening(w):null;
      if(door)openings.push(strip(door.a,door.b,half+.01));
    });
    wallJoins(walls,minThickness).forEach(join=>pieces.push(join.points));
    // Hosted inserts cut the rendered mass only. The wall network and its
    // editable side geometry stay unchanged, even across shared-wall splits.
    hostedDoors.forEach(door=>openings.push(strip(door.a,door.b,Math.max(minThickness,door.thickness/12)/2+.01)));
    return {pieces,openings};
  }
  // Outline the union, rather than outlining/eroding its overlapping pieces.
  // Only edges separating solid wall from empty space survive this arrangement.
  function unionBoundarySegments(pieces,openings=[],intersection=false) {
    const bounds=p=>({minX:Math.min(...p.map(q=>q.x)),maxX:Math.max(...p.map(q=>q.x)),minY:Math.min(...p.map(q=>q.y)),maxY:Math.max(...p.map(q=>q.y))});
    const intersects=(a,b)=>a.minX<=b.maxX+EPS&&a.maxX>=b.minX-EPS&&a.minY<=b.maxY+EPS&&a.maxY>=b.minY-EPS;
    const items=pieces.map(p=>({p,hole:false})).concat(openings.map(p=>({p,hole:true}))).filter(i=>i.p.length>2&&area(i.p)>EPS).map(i=>({...i,box:bounds(i.p),edges:edges(i.p)}));
    const strictlyInside=(p,poly)=>{let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;};
    const filled=(p,list)=>intersection?pieces.every(poly=>strictlyInside(p,poly)):list.some(i=>!i.hole&&strictlyInside(p,i.p))&&!list.some(i=>i.hole&&strictlyInside(p,i.p));
    const key=p=>Math.round(p.x*1e6)+','+Math.round(p.y*1e6),segments=new Map();
    for(const item of items){
      const nearby=items.filter(i=>intersects(item.box,i.box));
      for(const e of item.edges){
        const d=sub(e.b,e.a),len=length(d),cuts=[0,1],edgeBox=bounds([e.a,e.b]);
        for(const other of nearby)if(other!==item&&intersects(edgeBox,other.box))for(const f of other.edges){
          const v=sub(f.b,f.a),den=cross(d,v),relative=sub(f.a,e.a);
          if(Math.abs(den)>1e-10){const t=cross(relative,v)/den,u=cross(relative,d)/den;if(t>0&&t<1&&u>=-1e-8&&u<=1+1e-8)cuts.push(t);}
          else if(Math.abs(cross(relative,d))/len<1e-7)for(const p of [f.a,f.b]){const t=dot(sub(p,e.a),d)/dot(d,d);if(t>0&&t<1)cuts.push(t);}
        }
        cuts.sort((a,b)=>a-b);
        for(let i=1;i<cuts.length;i++){
          if((cuts[i]-cuts[i-1])*len<1e-6)continue;
          let a=add(e.a,mul(d,cuts[i-1])),b=add(e.a,mul(d,cuts[i]));
          const mid=mul(add(a,b),.5),n=mul({x:-d.y/len,y:d.x/len},1e-6),left=filled(add(mid,n),nearby),right=filled(sub(mid,n),nearby);
          if(left===right)continue;if(!left)[a,b]=[b,a];
          const from=key(a),to=key(b);if(from!==to)segments.set(from+'>'+to,{a,b,from,to});
        }
      }
    }
    return [...segments.values()];
  }
  function unionOutline(pieces,openings=[],intersection=false) {
    const segments=unionBoundarySegments(pieces,openings,intersection);
    const outgoing=new Map();for(const e of segments){if(!outgoing.has(e.from))outgoing.set(e.from,[]);outgoing.get(e.from).push(e);}
    const contours=[];
    for(const start of segments){
      if(start.used)continue;const loop=[],first=start.from;let e=start,closed=false;
      for(let guard=0;guard<=segments.length;guard++){
        e.used=true;loop.push(e.a);if(e.to===first){closed=true;break;}
        const choices=(outgoing.get(e.to)||[]).filter(n=>!n.used);if(!choices.length)break;
        const incoming=unit(sub(e.b,e.a));
        choices.sort((a,b)=>{const turn=n=>{const v=unit(sub(n.b,n.a));return (Math.atan2(cross(incoming,v),dot(incoming,v))+Math.PI*2)%(Math.PI*2);};return turn(a)-turn(b);});e=choices[0];
      }
      if(closed&&loop.length>=3)contours.push(loop.filter((p,i)=>{const a=loop[(i+loop.length-1)%loop.length],b=loop[(i+1)%loop.length];return Math.abs(cross(unit(sub(p,a)),unit(sub(b,p))))>1e-7||dot(sub(p,a),sub(b,p))<0;}));
    }
    return contours;
  }
  return {roomFillContours,curtainFace,snapCorridorSegment,interiorOutline,offsetOutline,EPS,add,sub,mul,dot,cross,length,distance,unit,rotate,normalize,nearestAngle,edges,area,centroid,baseOutline,polygon,closest,inside,contains,overlaps,simple,inward,fitInside,alignToEdge,cornerFits,validBoundaryFit,validPlacement,settle,moveSelection,wallNetwork,shiftedEdge,withManualOutline,wallReference,shiftWall,snapWallDrag,sideLengthMove,doorOpening,wallJoins,wallMass,corridorPoint,corridorPolygon,validCorridor,corridorCuts,roomContours,contourArea,insideContours,contoursOverlap,secondarySnap,snapSelection,alignGroupBottom,alignRoomEdges,unionOutline,unionBoundarySegments,contactEdges};
});
