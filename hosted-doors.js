/* Doors are hosted inserts, never wall segments or polygon vertices. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./geometry.js'));
  else root.LightDoors=factory(root.LightGeometry);
})(typeof window==='undefined'?globalThis:window,function(G){
  'use strict';
  const {add,sub,mul,dot,cross,unit,distance,edges,polygon}=G;
  function frame(door,entities){
    const host=entities.find(e=>e.id===door.hostId),edge=host&&edges(polygon(host))[door.side];
    if(!edge)return null;
    const length=distance(edge.a,edge.b),u=unit(sub(edge.b,edge.a));
    return {host,edge,length,u};
  }
  function opening(door,entities){
    const f=frame(door,entities);if(!f||door.width<.5||door.width>f.length-.1)return null;
    const offset=Math.max(door.width/2+.05,Math.min(f.length-door.width/2-.05,door.position*f.length));
    const center=add(f.edge.a,mul(f.u,offset)),a=add(center,mul(f.u,-door.width/2)),b=add(center,mul(f.u,door.width/2));
    return {...f,a,b,center,offset,width:door.width,leaves:door.leaves===2?2:1,hinge:door.hinge==='end'?b:a,tip:door.hinge==='end'?a:b,id:door.id,swing:door.swing};
  }
  function subtract(ranges,lo,hi){
    return ranges.flatMap(([a,b])=>hi<=a||lo>=b?[[a,b]]:[[a,Math.max(a,lo)],[Math.min(b,hi),b]].filter(([x,y])=>y-x>1e-6));
  }
  function runs(door,entities,network,doors=[]){
    const f=frame(door,entities);if(!f)return [];
    const at=p=>dot(sub(p,f.edge.a),f.u);
    const spans=network.filter(w=>w.style.kind==='wall'&&w.owners.some(o=>o.roomId===door.hostId&&o.side===door.side))
      .map(w=>[Math.min(at(w.a),at(w.b)),Math.max(at(w.a),at(w.b))]).sort((a,b)=>a[0]-b[0]);
    let merged=[];
    spans.forEach(([a,b])=>{const last=merged.at(-1);if(last&&a<=last[1]+.02)last[1]=Math.max(last[1],b);else merged.push([a,b]);});
    // Do not place a door through a T-junction, corner, or another door.
    network.forEach(w=>{
      const v=unit(sub(w.b,w.a));if(Math.abs(cross(f.u,v))<1e-5||w.style.kind==='opening')return;
      const q=add(f.edge.a,mul(f.u,cross(sub(w.a,f.edge.a),v)/cross(f.u,v)));
      if(!q||distance(q,G.closest(q,w.a,w.b))>.015)return;
      const half=(w.style.thickness||6)/24/Math.max(.05,Math.abs(cross(f.u,v)));
      merged=subtract(merged,at(q)-half,at(q)+half);
    });
    doors.filter(d=>d.id!==door.id).forEach(d=>{
      const other=opening(d,entities);if(!other||Math.abs(cross(f.u,other.u))>1e-5||Math.abs(cross(f.u,sub(other.center,f.edge.a)))>.02)return;
      // Ignore inserts temporarily covered by a corridor or an open wall.
      if(!runs(d,entities,network).some(([a,b])=>other.offset-other.width/2>=a+.049&&other.offset+other.width/2<=b-.049))return;
      merged=subtract(merged,Math.min(at(other.a),at(other.b))-.1,Math.max(at(other.a),at(other.b))+.1);
    });
    return merged;
  }
  function place(door,entities,network,doors=[]){
    const f=frame(door,entities);if(!f||!Number.isFinite(door.width)||door.width<.5||door.width>12||!Number.isFinite(door.position))return null;
    const target=door.position*f.length;
    const choices=runs(door,entities,network,doors).filter(([a,b])=>b-a>=door.width+.1-1e-6)
      .map(([a,b])=>Math.max(a+door.width/2+.05,Math.min(b-door.width/2-.05,target))).sort((a,b)=>Math.abs(a-target)-Math.abs(b-target));
    return choices.length?{...door,position:choices[0]/f.length}:null;
  }
  function autoPlace(door,entities,network,doors=[]){
    const f=frame(door,entities);if(!f||!Number.isFinite(door.position)||!Number.isFinite(door.width)||door.width<.5||door.width>12)return null;
    const target=door.position*f.length,at=p=>dot(sub(p,f.edge.a),f.u),perpendicular=[];
    // Use the physical wall face, not its centerline, for the six-inch jamb
    // clearance. Room corners and perpendicular T-junctions both count.
    for(const w of network){
      if(!['wall','door'].includes(w.style.kind))continue;
      const v=unit(sub(w.b,w.a));if(Math.abs(dot(f.u,v))>1e-5)continue;
      const q=add(f.edge.a,mul(f.u,cross(sub(w.a,f.edge.a),v)/cross(f.u,v))),offset=at(q);
      if(offset<-.02||offset>f.length+.02||distance(q,G.closest(q,w.a,w.b))>.015)continue;
      perpendicular.push({offset,half:(w.style.thickness||6)/24});
    }
    let ranges=runs(door,entities,network,doors);
    for(const wall of perpendicular)ranges=subtract(ranges,wall.offset-wall.half-.45,wall.offset+wall.half+.45);
    // The ordinary 0.05-ft insertion tolerance makes .45 + .05 = .50 ft.
    const choices=ranges.filter(([a,b])=>b-a>=door.width+.1-1e-6).map(([a,b])=>Math.max(a+door.width/2+.05,Math.min(b-door.width/2-.05,target))).sort((a,b)=>Math.abs(a-target)-Math.abs(b-target));
    if(!choices.length)return null;
    const offset=choices[0],nearest=perpendicular.slice().sort((a,b)=>Math.abs(a.offset-offset)-a.half-(Math.abs(b.offset-offset)-b.half))[0];
    const hinge=nearest?(nearest.offset<=offset?'start':'end'):(offset<=f.length/2?'start':'end');
    const closedDirection=door.leaves===2||hinge==='start'?f.u:mul(f.u,-1),inward=G.inward(f.edge,polygon(f.host));
    const swing=dot(G.rotate(closedDirection,90),inward)>=0?1:-1;
    return {...door,position:offset/f.length,hinge,swing};
  }
  function resolve(door,entities,network,doors=[]){
    const o=opening(door,entities);if(!o)return null;
    if(!runs(door,entities,network,doors).some(([a,b])=>o.offset-o.width/2>=a+.049&&o.offset+o.width/2<=b-.049))return null;
    const relevant=network.filter(w=>w.owners.some(p=>p.roomId===door.hostId&&p.side===door.side)&&
      Math.max(dot(sub(w.a,o.edge.a),o.u),dot(sub(w.b,o.edge.a),o.u))>o.offset-o.width/2&&
      Math.min(dot(sub(w.a,o.edge.a),o.u),dot(sub(w.b,o.edge.a),o.u))<o.offset+o.width/2);
    return {...o,thickness:Math.max(1,...relevant.map(w=>w.style.thickness))};
  }
  function resolveAll(doors,entities,network){
    const result=[];
    doors.forEach(d=>{const o=resolve(d,entities,network);if(o&&!result.some(p=>Math.abs(cross(p.u,o.u))<1e-5&&Math.abs(cross(p.u,sub(o.center,p.center)))<.02&&Math.abs(dot(sub(o.center,p.center),p.u))<(o.width+p.width)/2+.099))result.push(o);});
    return result;
  }
  function migrate(model){
    model.doors??=[];
    const entities=model.rooms.concat(model.corridors||[]);
    // Read the effective legacy styles before removing door-specific wall edits.
    const candidates=[];
    entities.forEach(e=>(e.walls||[]).forEach((w,side)=>{
      [w,...(w.segments||[])].filter(s=>s.kind==='door').forEach(s=>{
        const at=s.position??.5,edit=(w.segments||[]).filter(p=>at>=p.from-1e-5&&at<=p.to+1e-5).sort((a,b)=>(b.revision||0)-(a.revision||0))[0];
        if((edit||w)!==s)return;
        candidates.push({source:{roomId:e.id,side},style:s});
      });
    }));
    if(!entities.some(e=>(e.walls||[]).some(w=>[w,...(w.segments||[])].some(s=>s.kind==='door')))){model.version=Math.max(7,model.version||0);return model;}
    candidates.sort((a,b)=>(b.style.revision||0)-(a.style.revision||0));
    candidates.forEach(w=>{
      const spec=w.style,door={hostId:w.source.roomId,side:w.source.side,width:spec.doorWidth||3,position:spec.position??.5,hinge:spec.hinge==='end'?'end':'start',swing:spec.swing===-1?-1:1};
      const o=opening(door,entities);if(!o)return;
      const duplicate=model.doors.some(d=>{const p=opening(d,entities);return p&&distance(o.center,p.center)<.02&&Math.abs(o.width-p.width)<.02&&Math.abs(cross(o.u,p.u))<1e-5;});
      if(!duplicate)model.doors.push({...door,id:model.nextId++});
    });
    entities.forEach(e=>(e.walls||[]).forEach(w=>{
      const clean=s=>{if(s.kind==='door')s.kind='wall';delete s.doorWidth;delete s.position;delete s.hinge;delete s.swing;};
      clean(w);(w.segments||[]).forEach(clean);
      // A legacy door-only style change is not a real material split.
      if((w.segments||[]).every(s=>s.kind===w.kind&&s.thickness===w.thickness)){
        w.revision=Math.max(w.revision||0,...(w.segments||[]).map(s=>s.revision||0));w.segments=[];
      }
    }));
    model.version=Math.max(7,model.version||0);return model;
  }
  return {frame,opening,runs,place,autoPlace,resolve,resolveAll,migrate};
});
