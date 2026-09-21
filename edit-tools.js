/* Direct sketch edits: partial-wall extrusions and CAD-style selection windows. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./geometry.js'));
  else root.LightEdit=factory(root.LightGeometry);
})(typeof window==='undefined'?globalThis:window,function(G){
  'use strict';
  const {add,sub,mul,dot,cross,unit,distance,edges,polygon}=G;
  function intersection(a,u,b,v){const d=cross(u,v);return Math.abs(d)<1e-7?null:add(a,mul(u,cross(sub(b,a),v)/d));}
  function selectRooms(rooms,corridors,start,end,crossing=false,boundaries=[]){
    const left=Math.min(start.x,end.x),right=Math.max(start.x,end.x),top=Math.min(start.y,end.y),bottom=Math.max(start.y,end.y);
    const box=[{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}];
    const within=p=>p.x>=left-1e-5&&p.x<=right+1e-5&&p.y>=top-1e-5&&p.y<=bottom+1e-5;
    return rooms.filter(r=>{const contours=G.roomContours(r,corridors,boundaries);if(!contours.length)return false;
      return crossing?G.contoursOverlap(contours,box)||contours.some(loop=>loop.some(within))||box.some(p=>G.insideContours(p,contours)):
        contours.every(loop=>loop.every(within));}).map(r=>r.id);
  }
  function wallStyle(source,from,to){
    const base={kind:'wall',thickness:6,...source,segments:[]};
    base.segments=(source?.segments||[]).filter(s=>s.to>from&&s.from<to).map(s=>({...s,from:Math.max(0,(s.from-from)/(to-from)),to:Math.min(1,(s.to-from)/(to-from))}));
    return base;
  }
  // Collapse zero-length returns and merge consecutive collinear sides while
  // carrying finish intervals and door coordinates onto the surviving side.
  function cleanedRoom(entity,points,movingSide){
    const removedSides=[],parts=edges(points).filter(e=>{
      if(distance(e.a,e.b)<1e-6){removedSides.push(e.index);return false;}return true;
    }).map(e=>({...e,sources:[{oldSide:e.index,a:e.a,b:e.b}],moving:e.index===movingSide}));
    let changed=true;
    while(changed&&parts.length>3){
      changed=false;
      for(let i=0;i<parts.length;i++){
        const j=(i+1)%parts.length,a=parts[i],b=parts[j],u=unit(sub(a.b,a.a)),v=unit(sub(b.b,b.a));
        if(distance(a.b,b.a)<1e-6&&Math.abs(cross(u,v))<1e-6&&dot(u,v)>.99999){
          const joined={a:a.a,b:b.b,sources:a.sources.concat(b.sources),moving:a.moving||b.moving};
          if(j===0){parts[i]=joined;parts.shift();}else{parts[i]=joined;parts.splice(j,1);}
          changed=true;break;
        }
      }
    }
    const outline=parts.map(e=>e.a);
    if(outline.length<4||!G.simple(outline))return null;
    const mapping=[],walls=parts.map((e,side)=>{
      const len=distance(e.a,e.b),u=unit(sub(e.b,e.a)),segments=[];
      for(const source of e.sources){
        const newFrom=dot(sub(source.a,e.a),u)/len,newTo=dot(sub(source.b,e.a),u)/len;
        mapping.push({side,oldSide:source.oldSide,from:0,to:1,newFrom,newTo});
        const spec=entity.walls?.[source.oldSide]||{kind:'wall',thickness:6},base={...spec};delete base.segments;
        segments.push({...base,from:newFrom,to:newTo});
        for(const s of spec.segments||[])segments.push({...s,from:newFrom+(newTo-newFrom)*s.from,to:newFrom+(newTo-newFrom)*s.to});
      }
      if(e.sources.length===1)return {...(entity.walls?.[e.sources[0].oldSide]||{kind:'wall',thickness:6}),segments:[...(entity.walls?.[e.sources[0].oldSide]?.segments||[])]};
      return {kind:'wall',thickness:entity.walls?.[e.sources[0].oldSide]?.thickness||6,segments};
    });
    const next={...G.withManualOutline(entity,outline),walls};
    // Recover a normal rectangle when all the return sides have disappeared.
    const local=next.boundaryFit.points;
    if(local.length===4&&edges(local).every(e=>Math.abs(e.a.x-e.b.x)<1e-6||Math.abs(e.a.y-e.b.y)<1e-6)&&G.validBoundaryFit({...next,shape:'rect'}))next.shape='rect';
    return {next,reference:{roomId:entity.id,side:Math.max(0,parts.findIndex(e=>e.moving))},sideMapping:{roomId:entity.id,edges:mapping,removedSides}};
  }
  function moveWall(entities,reference,offset,boundaries=[],options={},magnetic=true){
    const entity=entities.find(e=>e.id===reference.roomId);
    // An exposed portion may extend without pushing the neighbor attached to
    // the rest of this logical side. Keep that junction and form a return.
    if(entity&&!entity.locked&&entity.type!=='corridor'&&offset>0&&Number.isFinite(reference.at)){
      const side=edges(polygon(entity))[reference.side];
      if(side){
        // A stepped site/group edge blocks only the part of the wall it touches.
        // Split at projected boundary corners and extend the available run,
        // just as an exposed portion beside a neighboring room would extend.
        const limits=boundaries.filter(b=>!b.groupId||b.groupId===entity.groupId);
        if(limits.length){
          const len=distance(side.a,side.b),axis=unit(sub(side.b,side.a)),normal=mul(G.inward(side,polygon(entity)),-1);
          const fractions=[0,1,...limits.flatMap(b=>b.points.map(p=>dot(sub(p,side.a),axis)/len))].filter(t=>t>=0&&t<=1).sort((a,b)=>a-b);
          const stops=fractions.filter((t,i)=>!i||t-fractions[i-1]>1e-7),runs=[];
          let blocked=false;
          for(let i=0;i<stops.length-1;i++){
            const from=stops[i],to=stops[i+1],p=add(add(side.a,mul(axis,(from+to)*len/2)),mul(normal,.02));
            if(!limits.every(b=>G.inside(p,b.points))){blocked=true;continue;}
            const last=runs.at(-1);if(last&&Math.abs(last.to-from)<1e-7)last.to=to;else runs.push({from,to});
          }
          if(blocked){
            const usable=runs.filter(r=>(r.to-r.from)*len>=.5&&(r.from===0||r.from*len>=.5)&&(r.to===1||(1-r.to)*len>=.5));
            usable.sort((a,b)=>Math.max(a.from-reference.at,0,reference.at-a.to)-Math.max(b.from-reference.at,0,reference.at-b.to));
            if(usable.length){const run=usable[0];return extendWall(entities,reference,run.from,run.to,offset,boundaries,{...options,exact:!magnetic});}
          }
        }
        const v=sub(side.b,side.a),length2=dot(v,v),fraction=p=>dot(sub(p,side.a),v)/length2;
        const siblings=G.wallNetwork(entities).filter(w=>w.owners.some(o=>o.roomId===entity.id&&o.side===reference.side));
        const picked=siblings.find(w=>reference.at>Math.min(fraction(w.a),fraction(w.b))+1e-7&&reference.at<Math.max(fraction(w.a),fraction(w.b))-1e-7);
        if(picked&&picked.owners.length===1&&siblings.some(w=>w.owners.some(o=>o.roomId!==entity.id))){
          const from=Math.max(0,Math.min(fraction(picked.a),fraction(picked.b))),to=Math.min(1,Math.max(fraction(picked.a),fraction(picked.b)));
          if(to-from<1-1e-7)return extendWall(entities,reference,from,to,offset,boundaries,{...options,exact:!magnetic});
        }
      }
    }
    const fallback=()=>magnetic?G.snapWallDrag(entities,reference,offset,boundaries,options):G.shiftWall(entities,reference,offset,boundaries,false,options);
    if(!entity||entity.shape!=='custom'||entity.type==='corridor')return fallback();
    if(entity.locked)return {error:'Select an unlocked room.'};
    if(!Number.isFinite(offset)||Math.abs(offset)>1000)return {error:'Enter a move distance within 1,000 feet.'};
    const poly=polygon(entity),side=reference.side,edge=edges(poly)[side];if(!edge)return {error:'Select a wall first.'};
    const others=entities.filter(e=>e.id!==entity.id),u=unit(sub(edge.b,edge.a)),normal=mul(G.inward(edge,poly),-1);
    const shared=G.wallNetwork(entities).some(w=>w.owners.some(o=>o.roomId===entity.id&&o.side===side)&&w.owners.some(o=>o.roomId!==entity.id));
    if(shared&&options.isolatedId!==entity.id)return fallback();
    function attempt(amount){
      if(Math.abs(amount)<1e-8)return {entities,offset:0,normal,reference,changedIds:[]};
      const count=poly.length,j=(side+1)%count,prev=(side+count-1)%count,after=(side+2)%count,line=add(edge.a,mul(normal,amount));
      const a=intersection(poly[prev],sub(poly[side],poly[prev]),line,u),b=intersection(poly[j],sub(poly[after],poly[j]),line,u);
      if(!a||!b||dot(sub(b,a),sub(edge.b,edge.a))<=0)return null;
      const points=poly.map(p=>({...p}));points[side]=a;points[j]=b;
      const clean=cleanedRoom(entity,points,side);if(!clean)return null;
      const next=clean.next,limits=boundaries.filter(b=>!b.groupId||b.groupId===entity.groupId);
      if(next.width<2||next.depth<2||next.width>500||next.depth>500||!G.validBoundaryFit(next)||!G.validPlacement(next,others.filter(e=>e.type!=='corridor'),limits))return null;
      const paths=others.filter(e=>e.type==='corridor'),loss=r=>G.area(polygon(r))-G.contourArea(G.roomContours(r,paths,boundaries));
      if(loss(next)>loss(entity)+.0001)return null;
      return {...clean,entities:entities.map(e=>e.id===next.id?next:e),offset:amount,normal,changedIds:[entity.id],reshaped:true};
    }
    // Own parallel sides are collapse targets, even if external magnets are off.
    // A small catch range makes it easy to erase a step without forcing it to stay.
    const collapseTargets=edges(poly).filter(e=>e.index!==side&&Math.abs(cross(unit(sub(e.b,e.a)),u))<1e-6)
      .map(e=>dot(sub(e.a,edge.a),normal)).filter(n=>Math.abs(n)>1e-6);
    const catches=collapseTargets.filter(n=>Math.abs(n-offset)<(magnetic ? .25 : 1e-6)).sort((a,b)=>Math.abs(a-offset)-Math.abs(b-offset));
    for(const amount of catches){const result=attempt(amount);if(result&&polygon(result.next).length<poly.length)return {...result,snapped:true,snapKind:'aligned return'};}
    if(magnetic){
      const snap=G.snapWallDrag(entities,reference,offset,boundaries,options);
      if(snap.snapped&&snap.reshaped)return snap; // Preserve a valid angled-shell fit.
      if(snap.snapped){const result=attempt(snap.offset);if(result)return {...result,snapped:true,snapKind:snap.snapKind,snapGuide:snap.snapGuide};}
    }
    let result=attempt(offset);
    if(!result&&magnetic){
      let lo=0,hi=1;result=attempt(0);
      for(let i=0;i<18;i++){const mid=(lo+hi)/2,next=attempt(offset*mid);if(next){lo=mid;result=next;}else hi=mid;}
      // An overshoot into an occupied neighbor stops just before a zero-length
      // return because simple() rejects tiny sides. Test the exact topology
      // change at that contact instead of leaving the minimum 0.05 ft sliver.
      const reached=collapseTargets.filter(n=>n*offset>0&&Math.abs(n)<=Math.abs(offset)+1e-6&&Math.abs(n-result.offset)<.25)
        .sort((a,b)=>Math.abs(a-result.offset)-Math.abs(b-result.offset));
      for(const amount of reached){
        const joined=attempt(amount);
        if(joined&&joined.next&&polygon(joined.next).length<poly.length)return {...joined,limited:true,snapped:true,snapKind:'aligned return'};
      }
      return {...result,limited:true};
    }
    return result||{error:'That stretch would cross another room, corridor, or boundary.'};
  }
  function extendWall(entities,reference,from,to,offset,boundaries=[],options={}){
    let entity=entities.find(e=>e.id===reference.roomId);const side=reference.side;
    if(!entity||entity.type==='corridor'||entity.locked)return {error:'Select an unlocked room.'};
    // Explicit partial-stretch controls need the same precise junction as drag.
    if(from>0||to<1){
      const edge=edges(polygon(entity))[side];
      const neighbor=G.wallNetwork(entities).filter(w=>w.owners.some(o=>o.roomId===entity.id&&o.side===side)).flatMap(w=>w.owners).find(o=>o.roomId!==entity.id);
      if(edge&&neighbor){
        const u=unit(sub(neighbor.b,neighbor.a)),n={x:-u.y,y:u.x},gap=dot(sub(neighbor.a,edge.a),n);
        if(Math.abs(gap)>1e-10&&Math.abs(gap)<.015){
          const points=polygon(entity).map(p=>({...p}));
          for(const i of [side,(side+1)%points.length])points[i]=add(points[i],mul(n,gap));
          const aligned=G.withManualOutline(entity,points);
          if(G.validBoundaryFit(aligned)){entity=aligned;entities=entities.map(e=>e.id===entity.id?entity:e);}
        }
      }
    }
    const poly=polygon(entity),edge=edges(poly)[side];
    if(!edge||![from,to,offset].every(Number.isFinite)||from<0||to>1||to<=from||Math.abs(offset)>1000)return {error:'Choose a valid portion of this side.'};
    const len=distance(edge.a,edge.b),n=mul(G.inward(edge,poly),-1),u=unit(sub(edge.b,edge.a));
    if((to-from)*len<.5||from>0&&from*len<.5||to<1&&(1-to)*len<.5)return {error:'Each new wall portion needs at least 6 inches.'};
    if(from===0&&to===1)return moveWall(entities,reference,offset,boundaries,{...options,isolatedId:entity.id},!options.exact);
    function attempt(amount){
      if(Math.abs(amount)<.01)return {entities,offset:0,normal:n,reference,changedIds:[]};
      const line=add(edge.a,mul(n,amount)),p=add(edge.a,mul(u,from*len)),q=add(edge.a,mul(u,to*len));
      const previous=poly[(side+poly.length-1)%poly.length],after=poly[(side+2)%poly.length];
      const a=from===0?intersection(previous,sub(edge.a,previous),line,u):add(p,mul(n,amount));
      const b=to===1?intersection(edge.b,sub(after,edge.b),line,u):add(q,mul(n,amount));
      if(!a||!b)return null;
      const points=[],mapping=[],styles=[];let movedSide=-1,broken=false;
      function append(start,end,oldSide,lo=0,hi=1,moving=false){
        if(distance(start,end)<1e-6)return;
        if(points.length&&distance(points.at(-1).end,start)>.001){broken=true;return;}
        const index=points.length;points.push({start,end});mapping.push({side:index,oldSide,from:lo,to:hi});
        styles.push(oldSide===null?{kind:'wall',thickness:entity.walls?.[side]?.thickness||6,segments:[]}:
          wallStyle(entity.walls?.[oldSide],lo,hi));if(moving)movedSide=index;
      }
      // Build in original side order, retaining provenance for finishes and doors.
      edges(poly).forEach((e,i)=>{
        if(i===side){
          if(from>0){append(e.a,p,i,0,from);append(p,a,null);}
          append(a,b,i,from,to,true);
          if(to<1){append(b,q,null);append(q,e.b,i,to,1);}
        }else{
          const start=i===(side+1)%poly.length&&to===1?b:e.a;
          const end=i===(side+poly.length-1)%poly.length&&from===0?a:e.b;
          append(start,end,i);
        }
      });
      const outline=points.map(p=>p.start);
      if(broken||points.length>64||points.length<4||distance(points.at(-1).end,points[0].start)>.001||!G.simple(outline))return null;
      const next={...G.withManualOutline({...entity,shape:'custom'},outline),walls:styles};
      const others=entities.filter(e=>e.id!==entity.id),limits=boundaries.filter(b=>!b.groupId||b.groupId===entity.groupId);
      if(next.width<2||next.depth<2||next.width>500||next.depth>500||!G.validBoundaryFit(next)||!G.validPlacement(next,others.filter(e=>e.type!=='corridor'),limits))return null;
      const corridors=others.filter(e=>e.type==='corridor'),loss=r=>G.area(polygon(r))-G.contourArea(G.roomContours(r,corridors,boundaries));
      if(loss(next)>loss(entity)+.0001)return null;
      return {entities:entities.map(e=>e.id===next.id?next:e),offset:amount,normal:n,reference:{roomId:entity.id,side:movedSide},changedIds:[entity.id],sideMapping:{roomId:entity.id,edges:mapping},reshaped:true};
    }
    let result=attempt(offset),amount=offset;
    if(!result){let lo=0,hi=1;result=attempt(0);for(let i=0;i<17;i++){const mid=(lo+hi)/2,next=attempt(offset*mid);if(next){lo=mid;result=next;}else hi=mid;}amount=offset*lo;}
    if(!result)return {error:'This extension would overlap a room, corridor, or boundary.'};
    const margin=options.margin??2,candidates=[],others=entities.filter(e=>e.id!==entity.id);
    const targets=[];
    if(options.roomSnap!==false)others.forEach(e=>edges(polygon(e)).forEach(edge=>targets.push({edge,kind:e.type==='corridor'?'corridor':'neighbor'})));
    if(options.boundarySnap!==false)boundaries.filter(b=>!b.groupId||b.groupId===entity.groupId).forEach(b=>edges(b.points).forEach(edge=>targets.push({edge,kind:'boundary'})));
    for(const t of targets){const v=unit(sub(t.edge.b,t.edge.a));if(Math.abs(cross(v,u))>1e-5)continue;
      const range=[t.edge.a,t.edge.b].map(p=>dot(sub(p,edge.a),u));
      if(Math.min(to*len,Math.max(...range))-Math.max(from*len,Math.min(...range))<.05)continue;
      const snap=dot(sub(t.edge.a,edge.a),n),cost=Math.abs(snap-result.offset);if(cost<=margin)candidates.push({...t,snap,cost});
    }
    for(const c of candidates.sort((a,b)=>a.cost-b.cost)){const snap=attempt(c.snap);if(snap&&snap.reshaped)return {...snap,snapped:true,snapKind:c.kind,snapGuide:c.edge};}
    return {...result,limited:Math.abs(amount-offset)>.001};
  }
  function remapDoors(doors,result){
    const mapping=result?.sideMapping;if(!mapping)return doors;
    return doors.filter(d=>d.hostId!==mapping.roomId||!mapping.removedSides?.includes(d.side)).map(d=>{
      if(d.hostId!==mapping.roomId)return d;
      const matches=mapping.edges.filter(e=>e.oldSide===d.side&&d.position>=e.from-1e-6&&d.position<=e.to+1e-6);
      const edge=matches.sort((a,b)=>(b.to-b.from)-(a.to-a.from))[0];
      const at=edge?(d.position-edge.from)/(edge.to-edge.from):0;
      return edge?{...d,side:edge.side,position:Math.max(0,Math.min(1,(edge.newFrom??0)+at*((edge.newTo??1)-(edge.newFrom??0))))}:d;
    });
  }
  return {selectRooms,extendWall,moveWall,remapDoors};
});
