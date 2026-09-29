(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./geometry'),require('./hosted-doors'));else root.LightCad=factory(root.LightGeometry,root.LightDoors);})(typeof window!=='undefined'?window:globalThis,function(G,H){
  'use strict';
  // Model-space feet only: never export screen pixels, wall poche or selection UI.
  function curves(source,{preserveXY=false}={}){
    const model=H.migrate(JSON.parse(JSON.stringify(source))),entities=[...(model.rooms||[]),...(model.corridors||[])],network=G.wallNetwork(entities,model.settings?.thickness||6,model.boundaries||[]),doors=H.resolveAll(model.doors||[],entities,network),result=[],seen=new Set();
    const point=p=>({x:p.x,y:preserveXY?p.y:-p.y});
    const key=p=>`${p.x.toFixed(7)},${p.y.toFixed(7)}`;
    function line(layer,a,b){if(G.distance(a,b)<1e-7)return;const ends=[key(a),key(b)].sort(),id=layer+':'+ends.join('|');if(seen.has(id))return;seen.add(id);result.push({type:'LINE',layer,a:point(a),b:point(b)});}
    for(const wall of network){
      const kind=wall.style.kind;if(wall.shell||kind==='opening')continue;
      const layer=kind==='curtain'?'CURTAINS':kind==='window'?'WINDOWS':'WALL_CENTERLINES',u=G.unit(G.sub(wall.b,wall.a)),len=G.distance(wall.a,wall.b),holes=[];
      if(layer==='WALL_CENTERLINES')for(const d of doors){
        if(!wall.owners.some(o=>o.roomId===d.host.id))continue;
        if(Math.abs(G.cross(G.sub(d.a,wall.a),u))>1e-5||Math.abs(G.cross(G.sub(d.b,wall.a),u))>1e-5)continue;
        const offsets=[G.dot(G.sub(d.a,wall.a),u),G.dot(G.sub(d.b,wall.a),u)].sort((a,b)=>a-b);
        if(offsets[1]>0&&offsets[0]<len)holes.push([Math.max(0,offsets[0]),Math.min(len,offsets[1])]);
      }
      let start=0;for(const [lo,hi]of holes.sort((a,b)=>a[0]-b[0])){if(lo>start)line(layer,G.add(wall.a,G.mul(u,start)),G.add(wall.a,G.mul(u,lo)));start=Math.max(start,hi);}if(start<len)line(layer,G.add(wall.a,G.mul(u,start)),wall.b);
    }
    for(const d of doors){
      const leaves=d.leaves===2?[{hinge:d.a,tip:d.center,swing:d.swing},{hinge:d.b,tip:d.center,swing:-d.swing}]:[d];
      for(const leaf of leaves){const end=G.add(leaf.hinge,G.rotate(G.sub(leaf.tip,leaf.hinge),leaf.swing*90));line('DOOR_PANELS',leaf.hinge,end);
        const center=point(leaf.hinge),closed=point(leaf.tip),open=point(end),angle=p=>(Math.atan2(p.y-center.y,p.x-center.x)*180/Math.PI+360)%360,ccw=leaf.swing*(preserveXY?1:-1)>0;
        result.push({type:'ARC',layer:'DOOR_SWINGS',center,radius:G.distance(leaf.hinge,leaf.tip),start:angle(ccw?closed:open),end:angle(ccw?open:closed)});
      }
    }
    const shell=G.exteriorWallMass(model.boundaries||[],model.settings?.exteriorThickness??12,doors,model.portals||[]);
    for(const e of shell.centerlines)line('EXTERIOR_WALL_CENTERLINES',e.a,e.b);
    for(const e of G.unionBoundarySegments(shell.pieces,shell.openings))line('EXTERIOR_WALL_FACES',e.a,e.b);
    for(const b of model.boundaries||[])for(const e of G.edges(b.points))line('BOUNDARY',e.a,e.b);
    for(const e of G.unionBoundarySegments(G.corridorCuts(model.corridors||[],model.boundaries||[])))line('CORRIDOR_EDGES',e.a,e.b);
    if(model.settings?.columnsEnabled!==false)for(const c of model.columns||[])if(c.enabled!==false)for(const e of G.edges(G.columnOutline(c)))line('COLUMNS',e.a,e.b);
    return result;
  }
  function exportDxf(model,options={}){
    const items=curves(model,options),layers=['0',...new Set(items.map(e=>e.layer))],out=[];
    let handle=16;
    const pair=(code,value)=>{if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('Invalid CAD coordinate');value=Number(value.toFixed(9));}out.push(String(code),String(value));if(code===0&&['LTYPE','LAYER','LINE','ARC'].includes(value))out.push('5',(handle++).toString(16).toUpperCase());};
    pair(0,'SECTION');pair(2,'HEADER');pair(9,'$ACADVER');pair(1,'AC1015');pair(9,'$INSUNITS');pair(70,2);pair(9,'$MEASUREMENT');pair(70,0);pair(9,'$LUNITS');pair(70,2);pair(9,'$LUPREC');pair(70,6);pair(0,'ENDSEC');
    pair(999,'TestFit Light: wall centerline curves; 1 unit = 1 foot; '+(options.preserveXY?'saved X/Y preserved':'X unchanged; Y negated to match screen orientation')+'. Schematic, not construction documents.');
    pair(0,'SECTION');pair(2,'TABLES');pair(0,'TABLE');pair(2,'LTYPE');pair(5,'1');pair(100,'AcDbSymbolTable');pair(70,1);pair(0,'LTYPE');pair(100,'AcDbSymbolTableRecord');pair(100,'AcDbLinetypeTableRecord');pair(2,'CONTINUOUS');pair(70,0);pair(3,'Solid line');pair(72,65);pair(73,0);pair(40,0);pair(0,'ENDTAB');
    pair(0,'TABLE');pair(2,'LAYER');pair(5,'2');pair(100,'AcDbSymbolTable');pair(70,layers.length);
    for(const name of layers){pair(0,'LAYER');pair(100,'AcDbSymbolTableRecord');pair(100,'AcDbLayerTableRecord');pair(2,name);pair(70,0);pair(62,7);pair(6,'CONTINUOUS');}pair(0,'ENDTAB');pair(0,'ENDSEC');
    pair(0,'SECTION');pair(2,'ENTITIES');
    const xyz=(p,code=10)=>{pair(code,p.x);pair(code+10,p.y);pair(code+20,0);};
    for(const e of items){pair(0,e.type);pair(100,'AcDbEntity');pair(8,e.layer);if(e.type==='LINE'){pair(100,'AcDbLine');xyz(e.a);xyz(e.b,11);}else{pair(100,'AcDbCircle');xyz(e.center);pair(40,e.radius);pair(100,'AcDbArc');pair(50,e.start);pair(51,e.end);}}
    pair(0,'ENDSEC');pair(0,'EOF');return out.join('\r\n')+'\r\n';
  }
  return {curves,exportDxf};
});
