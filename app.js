/* TestFit Light — all changes are direct edits, never time-based simulation. */
(() => {
  'use strict';
  const G=window.LightGeometry,H=window.LightDoors,E=window.LightEdit,$=s=>document.querySelector(s),plan=$('#plan');
  const copy=x=>JSON.parse(JSON.stringify(x)),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let model,selected=new Set(),selectedWall=null,selectedDoor=null,doorPlacement=null,numbering=null,activeGroup=null,activeCorridor=null,drawing=null,stoppedDrawing=null,drag=null,preview=null,wallPreview=null;
  let isolatedRoom=null,wallExtension=null,selectedCorridorSide=null;
  let completedRoomClick=null,handledDoubleClickUntil=0;
  let walls=[],doorViews=[],undo=[],redo=[],view={x:32,y:22,zoom:10},size={width:900,height:600};
  const defaultModel=()=>({schema:'testfit-light',version:7,nextId:1,revision:1,rooms:[],groups:[],boundaries:[],corridors:[],doors:[],columns:[],portals:[],settings:{wallStyle:'poche',thickness:6,exteriorThickness:12,boundarySnap:true,roomSnap:true,solidWallSnap:'middle',columnsEnabled:true,columnSnap:true,columnSnapMode:'face',margin:2}});
  const snapOptions=()=>({...model.settings,columns:model.settings.columnsEnabled===false?[]:(model.columns||[])});
  const getRoom=id=>model.rooms.find(r=>r.id===Number(id));
  const getCorridor=id=>model.corridors.find(c=>c.id===Number(id));
  const getEntity=id=>getRoom(id)||getCorridor(id);
  const obstacles=()=>model.rooms.concat(model.corridors);
  const displayContours=room=>G.roomContours(room,wallPreview?.corridors||model.corridors,model.boundaries);
  const hatchMetrics=room=>G.hatchMetrics(room,wallPreview?.corridors||model.corridors,model.boundaries);
  const displayArea=room=>hatchMetrics(room).area;
  const corridorLoss=room=>G.area(G.polygon(room))-G.contourArea(displayContours(room));
  const roomWallLabel=(wall,room)=>{const owner=wall.owners.find(o=>o.roomId===room.id);return owner?'Side '+(owner.side+1):'Corridor edge';};
  const one=()=>selected.size===1?getRoom([...selected][0]):null;
  const getGroup=id=>model.groups.find(g=>g.id===Number(id));
  const groupRooms=id=>model.rooms.filter(r=>r.groupId===id);
  const applicable=room=>model.boundaries.filter(b=>b.groupId===room.groupId&&room.groupId).concat(model.boundaries.filter(b=>!b.groupId));
  const fmt=n=>Number(n.toFixed(2)).toLocaleString();
  const roundArea=n=>Math.round((n+1e-9)*2)/2;
  const fmtArea=n=>fmt(roundArea(n));
  const roundLength=n=>Math.round((n+1e-9)*12)/12;
  function fmtLength(n){
    const inches=Math.round((Math.abs(n)+1e-9)*12);
    return (n<0&&inches?'-':'')+Math.floor(inches/12)+"' "+inches%12+'"';
  }
  function parseLength(value){
    const s=String(value).trim().toLowerCase().replace(/[′’]/g,"'").replace(/[″“”]/g,'"');
    if(/^[+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s))return Number(s);
    const m=s.match(/^(?:(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')\s*(?:-\s*)?)?(?:(\d+(?:\.\d+)?)\s*(?:in|inches|inch|"))?$/);
    if(!m||(!m[1]&&!m[2]))throw Error('Use feet and inches, such as 12\' 6", or decimal feet.');
    return Number(m[1]||0)+Number(m[2]||0)/12;
  }
  const dimensionPair=m=>fmtLength(Math.min(m.width,m.depth))+' × '+fmtLength(Math.max(m.width,m.depth));
  function exportProgramCsv(){
    // Use the live colored footprint, including corridor cutouts, on the room grid.
    // User-entered names are quoted and protected against spreadsheet formulas.
    const cell=value=>{let s=String(value??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    const rows=[['Room number','Room name','Group','Hatch area (sf)','Dimensions A x B (ft-in)']];
    for(const room of model.rooms){
      const m=G.hatchMetrics(room,model.corridors,model.boundaries);
      rows.push([room.number||'',room.name,getGroup(room.groupId)?.name||'',roundArea(m.area),dimensionPair(m)]);
    }
    return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
  }
  const status=text=>$('#status').textContent=text;
  function checkpoint(){undo.push(copy(model));if(undo.length>60)undo.shift();redo=[];}
  function incrementRoomNumber(value){
    const match=String(value).match(/^(.*?)(\d+)$/);
    if(!match)throw Error('Start number must end in a digit, e.g. 101 or A-001.');
    const n=Number(match[2]);if(!Number.isSafeInteger(n)||n>=Number.MAX_SAFE_INTEGER)throw Error('Room number is too large.');
    return match[1]+String(n+1).padStart(match[2].length,'0');
  }
  function setRoomNumber(room,value){
    const number=String(value).trim().slice(0,32);
    if(model.rooms.some(r=>r.id!==room.id&&number&&r.number===number)){status('Room number already used.');render();return false;}
    if((room.number||'')===number)return true;
    checkpoint();room.number=number;render();status('Room number updated.');return true;
  }
  function beginNumbering(){
    if(numbering){numbering=null;render();status('Numbering stopped.');return;}
    const next=$('#numberStart').value.trim();
    try{incrementRoomNumber(next);}catch(error){status(error.message);return;}
    numbering={next,visited:new Set()};doorPlacement=drawing=drag=preview=wallPreview=null;isolatedRoom=wallExtension=selectedCorridorSide=null;
    selectedWall=selectedDoor=activeCorridor=activeGroup=null;completedRoomClick=null;
    render();plan.focus({preventScroll:true});status('Click rooms in order · Escape to stop.');
  }
  function numberRoom(id){
    const room=getRoom(id);if(!room||!numbering||numbering.visited.has(id))return;
    let number=numbering.next;
    try{
      while(model.rooms.some(r=>r.id!==id&&r.number===number))number=incrementRoomNumber(number);
      const next=incrementRoomNumber(number);
      if(!setRoomNumber(room,number))return;
      numbering.visited.add(id);numbering.next=next;selected=new Set([id]);render();status('Next: '+next);
    }catch(error){status(error.message);}
  }
  function renderNumbering(){
    $('#renumberRooms').textContent=numbering?'Stop renumbering':'Renumber · click rooms';
    $('#renumberRooms').classList.toggle('active',!!numbering);
    $('#renumberRooms').setAttribute('aria-pressed',String(!!numbering));
    $('#numberStart').disabled=!!numbering;
  }
  function newRoom(name,width,depth,shape='rect',angle=0){return {id:model.nextId++,name,width,depth,shape,angle,x:0,y:0,number:'',color:'#ffffff',groupId:null,locked:false,walls:Array.from({length:shape==='l'?6:4},()=>({kind:'wall',thickness:model.settings.thickness,revision:0,segments:[]}))};}
  function sample(variant){
    variant=variant||window.location?.search?.match(/[?&]layout=(advice1|advice2|advice3|previous|points|saved|boundary)(?:&|$)/)?.[1]||'advice1';
    model=H.migrate(window.LightSeptemberStudies?.models[variant]?copy(window.LightSeptemberStudies.models[variant]):variant==='boundary'?copy(window.LightBoundaryStudy):window.createLightPhotoProject(G,variant));
    model.settings.exteriorThickness??=12;
    model.settings.solidWallSnap??='middle';
    const site=model.boundaries.find(b=>!b.groupId);if($('#boundaryPoints')&&site){$('#boundaryPoints').value=JSON.stringify({points:site.points},null,2);clearBoundaryImport();}
    activeCorridor=null;selected=new Set(model.rooms.length?[model.rooms[0].id]:[]);selectedWall=selectedDoor=null;activeGroup=null;isolatedRoom=wallExtension=selectedCorridorSide=null;numbering=doorPlacement=drawing=stoppedDrawing=drag=preview=wallPreview=null;
    render();fit();status('Ready.');
  }
  function screen(point){return {x:(point.x-view.x)*view.zoom+size.width/2,y:(point.y-view.y)*view.zoom+size.height/2};}
  function world(event){const rect=plan.getBoundingClientRect();return {x:(event.clientX-rect.left-size.width/2)/view.zoom+view.x,y:(event.clientY-rect.top-size.height/2)/view.zoom+view.y};}
  const path=points=>points.map((p,i)=>{const q=screen(p);return (i?'L':'M')+q.x.toFixed(2)+' '+q.y.toFixed(2);}).join(' ')+' Z';
  function line(a,b,attrs=''){const p=screen(a),q=screen(b);return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" ${attrs}/>`;}
  function fit(){const columns=model.settings.columnsEnabled===false?[]:(model.columns||[]).filter(c=>c.enabled!==false);const points=[...obstacles().flatMap(G.polygon),...model.boundaries.flatMap(b=>b.points),...columns.flatMap(G.columnOutline)];if(!points.length){view={x:25,y:20,zoom:10};draw();return;}
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
    const boundaryOnly=model.reference?.variant==='boundary';
    view={x:x+w/2,y:y+h/2,zoom:Math.max(.5,Math.min(25,(size.width-(boundaryOnly?230:70))/(w+4),(size.height-(boundaryOnly?180:100))/(h+4)))};draw();}
  function drawWallMass(network){
    const entities=wallPreview?.rooms||preview||model.rooms;
    const minThickness=1.2/view.zoom,key=JSON.stringify([network,minThickness,doorViews,entities]);
    if(drawWallMass.cache?.key!==key){
      drawWallMass.cache={key,...G.wallMass(network,minThickness,doorViews,entities)};
    }
    const mass=drawWallMass.cache,style=model.settings.wallStyle;
    const corridorVoids=G.corridorCuts(wallPreview?.corridors||model.corridors,model.boundaries),openings=mass.openings.concat(corridorVoids);
    // Fill only real strips/join patches. A broken contour chain must NEVER turn
    // a room-sized hole into a solid wall. Same winding makes overlaps additive.
    const solidPath=polys=>polys.map(p=>path(G.edges(p).reduce((sum,e)=>sum+G.cross(e.a,e.b),0)<0?[...p].reverse():p)).join(' ');
    const holes=openings.length?`<mask id="wall-door-cuts" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width="${size.width}" height="${size.height}" style="mask-type:luminance"><rect width="${size.width}" height="${size.height}" fill="#fff"/><path d="${solidPath(openings)}" fill="#000" fill-rule="nonzero"/></mask>`:'';
    let outline='';
    if(style!=='black'){
      mass.boundary=G.unionBoundarySegments(mass.pieces,openings);
      const d=mass.boundary.map(e=>{const a=screen(e.a),b=screen(e.b);return `M${a.x} ${a.y}L${b.x} ${b.y}`;}).join(' ');
      // Open boundary segments cannot accidentally enclose/fill a room either.
      outline=`<path d="${d}" fill="none" stroke="#000" stroke-width="1.2" stroke-linecap="round"/>`;
    }
    return `<defs>${holes}<pattern id="wall-hatch" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#fff"/><path d="M-2 2L2 -2 M0 7L7 0 M5 9L9 5" stroke="#777" stroke-width=".7"/></pattern></defs><g pointer-events="none"><path class="wall-solid" d="${solidPath(mass.pieces)}" fill="${style==='black'?'#000000':style==='hatch'?'url(#wall-hatch)':'#ffffff'}" fill-rule="nonzero" ${openings.length?'mask="url(#wall-door-cuts)"':''}/>${outline}</g>`;
  }
  function drawExteriorShell(){
    const shell=G.exteriorWallMass(model.boundaries,model.settings.exteriorThickness??12,doorViews),style=model.settings.wallStyle;
    const solid=polys=>polys.map(p=>path(G.edges(p).reduce((sum,e)=>sum+G.cross(e.a,e.b),0)<0?[...p].reverse():p)).join(' ');
    const outline=G.unionBoundarySegments(shell.pieces,shell.openings).map(e=>line(e.a,e.b,'stroke="#000" stroke-width="1.2"')).join('');
    return `<defs><mask id="exterior-cuts" maskUnits="userSpaceOnUse" x="0" y="0" width="${size.width}" height="${size.height}" style="mask-type:luminance"><rect width="100%" height="100%" fill="white"/><path d="${solid(shell.openings)}" fill="black"/></mask></defs><g class="exterior-shell" pointer-events="none"><path d="${solid(shell.pieces)}" fill="${style==='black'?'#000':style==='hatch'?'url(#wall-hatch)':'#fff'}" fill-rule="nonzero" mask="url(#exterior-cuts)"/>${outline}</g>`;
  }
  function drawWall(wall){
    const originalWall=wall,spec=wall.style,shared=wall.owners.length>1,selectedHere=wall.id===selectedWall;
    if(['curtain','opening','window'].includes(spec.kind))wall={...wall,...G.curtainFace(wall,wallPreview?.rooms||preview||model.rooms)};
    const editable=!!wallEditRoom(wall)||!!doorPlacement&&(!doorPlacement.roomId||wall.owners.some(o=>o.roomId===doorPlacement.roomId));
    const thickness=Math.max(1.2,spec.thickness/12*view.zoom),color=spec.kind==='curtain'?'#698397':'#000000';
    let markup='';
    if(selectedHere)markup+=line(wall.a,wall.b,`stroke="#f0b64f" stroke-width="${thickness+9}" opacity=".65"`);
    if(spec.kind==='curtain')markup+=line(wall.a,wall.b,`stroke="${color}" stroke-width="1.7" stroke-dasharray="6 4"`);
    else if(spec.kind==='window'){
      const u=G.unit(G.sub(originalWall.b,originalWall.a)),normal={x:-u.y,y:u.x},n=G.mul(normal,G.dot(normal,G.sub(originalWall.a,wall.a))<0?-1:1),half=spec.thickness/24;
      for(const sign of [0,2])markup+=line(G.add(wall.a,G.mul(n,half*sign)),G.add(wall.b,G.mul(n,half*sign)),'stroke="#47788f" stroke-width="1.4"');
      const count=Math.max(1,Math.ceil(wall.length/4));
      for(let i=0;i<=count;i++){const p=G.add(wall.a,G.mul(G.sub(wall.b,wall.a),i/count));markup+=line(p,G.add(p,G.mul(n,2*half)),'stroke="#263b53" stroke-width="2.5"');}
    }
    else if(spec.kind==='opening'){if(editable)markup+=line(wall.a,wall.b,'stroke="#bcc8d7" stroke-width="1" stroke-dasharray="2 5"');}
    const movable=canMoveWall(wall);
    if(editable&&!drawing)markup+=line(wall.a,wall.b,`class="wall-hit ${movable?'movable':''}" data-wall="${esc(wall.id)}" style="--wall-cursor:${wallCursor(wall)}" stroke="transparent" stroke-width="${Math.max(14,thickness+8)}"`).replace('/>',`><title>${shared?'Shared':'Room'} wall · ${fmtLength(wall.length)} · ${movable?'Drag to resize selected room':'Click to edit wall properties'}</title></line>`);
    return markup;
  }
  function isolateRoom(id){
    if(!getRoom(id))return;chooseRoom(id);isolatedRoom=id;render();status('Isolated '+getRoom(id).name+'. Wall edits affect this room only. Escape exits isolation.');
  }
  function exitIsolation(){isolatedRoom=wallExtension=null;render();status('Isolation ended. Shared-wall editing restored.');}
  function onPlanDoubleClick(event){
    if(numbering||doorPlacement)return;
    if(drawing||doorPlacement||drag||Date.now()<handledDoubleClickUntil)return;
    const wallId=event.target.closest('[data-wall]')?.dataset.wall;
    const wall=walls.find(w=>w.id===wallId);
    const id=Number(event.target.closest('[data-room]')?.dataset.room)||wallEditRoom(wall)?.id||model.rooms.find(r=>G.insideContours(world(event),displayContours(r)))?.id;
    if(id){event.preventDefault();isolatedRoom===id?exitIsolation():isolateRoom(id);}
  }
  function drawDimensions(entity){
    let svg='<g class="room-dimensions" pointer-events="none">';
    for(const poly of hatchMetrics(entity).contours)for(const edge of G.edges(poly)){
      const n=G.mul(G.inward(edge,poly),-1),a=screen(edge.a),b=screen(edge.b),p=G.add(a,G.mul(n,24)),q=G.add(b,G.mul(n,24)),mid=G.mul(G.add(p,q),.5),u=G.unit(G.sub(q,p));
      let angle=Math.atan2(u.y,u.x)*180/Math.PI;if(angle>90)angle-=180;if(angle< -90)angle+=180;
      const tick=G.mul(G.add(u,n),3);
      svg+=`<path d="M${a.x} ${a.y}L${p.x+n.x*5} ${p.y+n.y*5} M${b.x} ${b.y}L${q.x+n.x*5} ${q.y+n.y*5} M${p.x} ${p.y}L${q.x} ${q.y} M${p.x-tick.x} ${p.y-tick.y}L${p.x+tick.x} ${p.y+tick.y} M${q.x-tick.x} ${q.y-tick.y}L${q.x+tick.x} ${q.y+tick.y}" fill="none" stroke="#2765a6" stroke-width="1"/><text transform="translate(${mid.x} ${mid.y}) rotate(${angle})" y="-5" text-anchor="middle" font-family="Arial" font-size="13" fill="#235bb7" stroke="#fff" stroke-width="4" paint-order="stroke">${esc(fmtLength(G.distance(edge.a,edge.b)))}</text>`;
    }
    return svg+'</g>';
  }
  function drawCorridorEdges(c){
    let svg=G.edges(G.polygon(c)).map(e=>line(e.a,e.b,`class="corridor-edge-hit" data-corridor-edge="${e.index}" stroke="transparent" stroke-width="14" style="cursor:move"`)).join('');
    if(!c.outline){
      c.points.slice(1).forEach((p,i)=>{const q=screen(G.mul(G.add(p,c.points[i]),.5));svg+=`<rect data-corridor-segment="${i}" x="${q.x-6}" y="${q.y-6}" width="12" height="12" fill="#fff" stroke="#2685a7" stroke-width="2" style="cursor:move"><title>Move segment ${i+1} sideways · fixed width</title></rect>`;});
      [0,c.points.length-1].forEach(i=>{const q=screen(c.points[i]);svg+=`<circle data-corridor-end="${i}" cx="${q.x}" cy="${q.y}" r="8" fill="#2685a7" stroke="#fff" stroke-width="2" style="cursor:move"><title>Extend or shorten this end</title></circle>`;});
    }return svg;
  }
  function beginCorridorEdgeDrag(side,p){
    const c=getCorridor(activeCorridor);if(!c)return;
    selectedCorridorSide=null;selectedWall=selectedDoor=null;wallExtension=null;
    const n=c.points.length,reference={roomId:c.id};
    if(c.outline)reference.outlineSide=side;
    else if(side===n-1)reference.end=n-1;
    else if(side===2*n-1)reference.end=0;
    else reference.segment=side<n-1?side:2*n-2-side;
    drag={kind:'corridor-edge',start:p,reference,before:copy(model),moved:false};render();
  }
  function updateCorridorEdgeDrag(p){
    if(drag?.kind!=='corridor-edge')return;
    const delta=G.sub(p,drag.start);
    if(G.length(delta)*view.zoom<2&&!drag.moved)return;
    const source=drag.before.corridors.find(c=>c.id===drag.reference.roomId);
    const limits=drag.before.boundaries.filter(b=>b.groupId||G.contains(G.polygon(source),b.points));
    const at=t=>{
      const points=copy(source.points),r=drag.reference;
      if(r.outlineSide!==undefined){const edge=G.edges(source.outline)[r.outlineSide],normal=G.mul(G.inward(edge,source.outline),-1),outline=G.shiftedEdge(source.outline,r.outlineSide,G.dot(delta,normal)*t);return outline?{...source,outline}:null;}
      if(r.end!==undefined){const i=r.end,j=i===0?1:i-1,u=G.unit(G.sub(points[i],points[j]));points[i]=G.add(points[i],G.mul(u,G.dot(delta,u)*t));}
      else if(r.segment!==undefined){const i=r.segment,u=G.unit(G.sub(points[i+1],points[i])),n={x:-u.y,y:u.x},shift=G.mul(n,G.dot(delta,n)*t);points[i]=G.add(points[i],shift);points[i+1]=G.add(points[i+1],shift);}
      else points.forEach((q,i)=>points[i]=G.add(q,G.mul(delta,t)));
      return {...source,points,...(source.outline?{outline:source.outline.map(q=>G.add(q,G.mul(delta,t)))}:{})};
    };
    const valid=c=>c&&c.points.slice(1).every((p,i)=>G.dot(G.sub(p,c.points[i]),G.unit(G.sub(source.points[i+1],source.points[i])))>.25)&&G.validCorridor(c,drag.before.rooms,limits);
    let t=0;const steps=Math.max(1,Math.ceil(G.length(delta)/.25));
    for(let i=1;i<=steps;i++){
      const target=i/steps;
      if(valid(at(target))){t=target;continue;}
      let lo=t,hi=target;
      for(let j=0;j<18;j++){const mid=(lo+hi)/2;if(valid(at(mid)))lo=mid;else hi=mid;}
      t=lo;break;
    }
    let moved=at(t)||source;
    const snapped=G.snapCorridorSegment(moved,drag.reference,drag.before.rooms,limits,snapOptions());
    if(snapped&&valid(snapped.corridor))moved=snapped.corridor;
    drag.moved=true;drag.result={offset:G.length(delta)*t,...(snapped&&valid(snapped.corridor)?{snapped:true,snapGuide:snapped.snapGuide,reshaped:true}:{})};
    wallPreview={rooms:drag.before.rooms,corridors:drag.before.corridors.map(c=>c.id===source.id?moved:c)};
    draw();status((source.outline?'Custom corridor edge adjusted':drag.reference.end!==undefined?'Corridor end extended / shortened':'Corridor segment moved · width fixed')+(drag.result.snapped?' · snapped to '+(snapped.snapKind==='column'?(model.settings.columnSnapMode==='center'?'column centerline · projection allowed':'column face · kept outside corridor'):'parallel wall face'):t<.999?' · stopped at boundary or minimum segment length':'')+'.');
  }
  function addCorridorEdgeControls(c){
    $('#inspector').insertAdjacentHTML('beforeend','');
  }
  function updateMarquee(p){
    if(drag?.kind!=='marquee')return;drag.end=p;drag.moved=drag.moved||G.distance(drag.start,p)*view.zoom>4;
    drag.crossing=p.x<drag.start.x;
    drag.hits=drag.moved?E.selectRooms(model.rooms,model.corridors,drag.start,p,drag.crossing,model.boundaries):[];
    draw();status((drag.crossing?'Crossing · touching':'Window · fully inside')+' · '+drag.hits.length+' room(s)'+(drag.additive?' · adding to selection':''));
  }
  function drawMarquee(){
    const a=screen(drag.start),b=screen(drag.end),x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.abs(a.x-b.x),h=Math.abs(a.y-b.y),color=drag.crossing?'#208a60':'#246fc4';
    return `<g pointer-events="none"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}18" stroke="${color}" stroke-width="1.5" ${drag.crossing?'stroke-dasharray="7 4"':''}/><text x="${x+6}" y="${y-8}" fill="${color}" stroke="#fff" stroke-width="4" paint-order="stroke" font-family="Arial" font-size="13">${drag.crossing?'Crossing · touching':'Window · fully inside'} · ${drag.hits.length}</text></g>`;
  }
  function finishMarquee(p){
    updateMarquee(p);const d=drag;drag=null;isolatedRoom=wallExtension=selectedCorridorSide=null;activeCorridor=activeGroup=selectedWall=selectedDoor=null;
    selected=d.moved?new Set(d.additive?[...d.original,...d.hits]:d.hits):new Set(d.additive?d.original:[]);
    render();status(selected.size+' room(s) selected. Drag the selection to move it, or group it.');
  }
  function drawDoor(door){
    const leaves=door.leaves===2?[{hinge:door.a,tip:door.center,swing:door.swing},{hinge:door.b,tip:door.center,swing:-door.swing}]:[door];
    const d=leaves.map(leaf=>{
      const hinge=screen(leaf.hinge),closed=screen(leaf.tip),tip=screen(G.add(leaf.hinge,G.rotate(G.sub(leaf.tip,leaf.hinge),leaf.swing*90))),radius=G.distance(leaf.hinge,leaf.tip)*view.zoom;
      return `M${hinge.x} ${hinge.y} L${tip.x} ${tip.y} M${closed.x} ${closed.y} A${radius} ${radius} 0 0 ${leaf.swing>0?1:0} ${tip.x} ${tip.y}`;
    }).join(' ');
    const picked=door.id===selectedDoor,color=picked?'#235bb7':'#59728c';
    let svg=`<g class="door-symbol" ${drawing?'pointer-events="none"':`data-door="${door.id}"`}><path d="${d}" fill="none" stroke="${color}" stroke-width="${picked?2.5:1.4}" pointer-events="none"/>`;
    if(!drawing)svg+=`<path class="door-hit" d="${d}" fill="none" stroke="transparent" stroke-width="16" pointer-events="stroke"><title>Door · ${fmtLength(door.width)} · Click to edit; drag along its wall</title></path>`+line(door.a,door.b,'class="door-hit" stroke="transparent" stroke-width="16" pointer-events="stroke"');
    if(picked){const c=screen(door.center);svg+=`<circle cx="${c.x}" cy="${c.y}" r="5" fill="#fff" stroke="#235bb7" stroke-width="2" pointer-events="none"/>`;}
    const role=model.doors.find(d=>d.id===door.id)?.access;
    if(['patient-in','patient-out'].includes(role)){
      const p=screen(G.sub(door.center,G.mul(G.inward(door.edge,G.polygon(door.host)),2.5))),label=role==='patient-in'?'IN':'OUT';
      svg+=`<text class="patient-door-role" x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="middle" font-size="9" fill="#235b68" stroke="#f6fbfd" stroke-width="2.5" paint-order="stroke" pointer-events="none">${label}</text>`;
    }
    return svg+'</g>';
  }
  function draw(){
    const rooms=wallPreview?.rooms||preview||model.rooms,corridors=wallPreview?.corridors||model.corridors;
    walls=G.wallNetwork(rooms.concat(corridors),model.settings.thickness,model.boundaries);
    const liveDoors=E.remapDoors(model.doors,drag?.result),visibleDoors=drag?.kind==='door'&&drag.doorPreview?liveDoors.map(d=>d.id===drag.doorPreview.id?drag.doorPreview:d):liveDoors;
    doorViews=H.resolveAll(visibleDoors,rooms.concat(corridors),walls,model.boundaries);
    if(drag?.kind==='wall')selectedWall=wallForReference(wallSelectionAfter(drag.result,drag.reference))?.id||selectedWall;
    const unit=5*view.zoom,origin=screen({x:0,y:0});
    let svg=`<defs><pattern id="grid" width="${unit}" height="${unit}" patternUnits="userSpaceOnUse" x="${origin.x%unit}" y="${origin.y%unit}"><path d="M${unit} 0 H0 V${unit}" fill="none" stroke="#dce4ed" stroke-width=".7"/></pattern></defs><rect width="100%" height="100%" fill="#f8fafc"/><rect width="100%" height="100%" fill="url(#grid)"/>`;
    model.boundaries.forEach(b=>{const color=b.groupId?(getGroup(b.groupId)?.color||'#3675c8'):'#768699';svg+=`<path d="${path(b.points)}" fill="${b.groupId?'none':'#ffffff88'}" stroke="${color}" stroke-width="${b.groupId?1.5:2}" ${b.groupId?'stroke-dasharray="8 5"':''}/>`;});
    if(model.reference?.variant==='boundary'){
      const p=model.boundaries[0].points;
      p.forEach((a,i)=>{
        const b=p[(i+1)%p.length],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),mid=screen({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
        const short=len<6,offset=(i===5||i===7)?-17:17;
        const leaders={0:[0,22],2:[-20,-32],3:[0,-65],4:[25,-22],9:[-30,-40],13:[55,12],14:[20,-40],19:[25,35],20:[15,25],21:[-20,42],22:[-65,25],23:[-30,70],25:[-30,-35],26:[-65,0]};
        const shift=leaders[i];
        const x=mid.x+(shift?shift[0]:dy/len*offset),y=mid.y+(shift?shift[1]:-dx/len*offset);
        let angle=Math.atan2(dy,dx)*180/Math.PI;if(angle>90)angle-=180;if(angle< -90)angle+=180;
        const label=model.boundaryLabels?.[i]||('≈ '+fmtLength(len));
        const compact='E'+(i+1)+' · '+label.split(' · ')[0].replace(' photo','');
        svg+='<g class="boundary-dimension" pointer-events="none"><title>'+esc(label)+'; drawn '+fmtLength(len)+'</title><line x1="'+mid.x+'" y1="'+mid.y+'" x2="'+x+'" y2="'+y+'" stroke="#43749d" stroke-width=".7"/><text x="'+x+'" y="'+y+'" text-anchor="middle" dominant-baseline="middle" transform="rotate('+(short?0:angle)+' '+x+' '+y+')" font-size="11" fill="#235bb7" stroke="white" stroke-width="3" paint-order="stroke">'+esc(compact)+'</text></g>';
      });
      const corner=screen(p[12]);svg+='<text x="'+(corner.x+20)+'" y="'+(corner.y-35)+'" font-size="13" fill="#235bb7">97°</text>';
    }
    const corridorRegion=G.unionOutline(G.corridorCuts(corridors,model.boundaries));
    if(corridorRegion.length)svg+=`<path data-corridor="region" d="${corridorRegion.map(path).join(' ')}" fill-rule="evenodd" fill="#edf5f8" stroke="#9abcc8" stroke-width=".8"><title>Continuous corridor void · no walls</title></path>`;
    corridors.forEach(c=>{const p=G.polygon(c);svg+=`<path data-corridor="${c.id}" d="${path(p)}" fill="transparent" stroke="${activeCorridor===c.id?'#2d82a0':'none'}" stroke-width="1.5" stroke-dasharray="6 4"><title>${esc(c.name)} · wall-free corridor</title></path>`;});
    rooms.forEach(room=>{
      let contours=G.roomFillContours(room,corridors,model.boundaries);
      // A corridor can hide an imported room completely. Selecting it in the
      // room list exposes its footprint so it can still be grabbed and moved.
      if(!contours.length&&selected.has(room.id))contours=[G.polygon(room)];
      if(!contours.length)return;
      const points=[...contours].sort((a,b)=>G.area(b)-G.area(a))[0],center=screen(G.centroid(points)),outline=contours.map(path).join(' '),netArea=displayArea(room);
      svg+=`<path class="room-hit ${room.locked?'locked':''}" data-room="${room.id}" d="${outline}" fill-rule="evenodd" fill="${room.color}" fill-opacity="${isolatedRoom&&isolatedRoom!==room.id ? .2 : room.color.toLowerCase()==='#ffffff'?1:(selected.has(room.id)||drag?.hits?.includes(room.id)) ? .85 : .55}" stroke="${selected.has(room.id)?'#2e6abc':'none'}" stroke-width="6" stroke-opacity=".18"><title>${esc(room.name)} · ${fmtArea(netArea)} sf${room.locked?' · locked':''}</title></path>`;
      if(selected.has(room.id)&&!selectedWall){
        const spacing=Math.max(1,Math.ceil(12/view.zoom))*view.zoom,anchor=screen(room);
        svg+=`<defs><pattern id="room-grid-${room.id}" width="${spacing}" height="${spacing}" patternUnits="userSpaceOnUse" patternTransform="translate(${anchor.x} ${anchor.y}) rotate(${room.angle})"><path d="M${spacing} 0 H0 V${spacing}" fill="none" stroke="#366296" stroke-width=".65" opacity=".23"/></pattern></defs><path d="${outline}" fill-rule="evenodd" fill="url(#room-grid-${room.id})" pointer-events="none"/>`;
      }
      const font=Math.max(8,Math.min(14,Math.min(room.width,room.depth)*view.zoom/6)),width=room.width*view.zoom,height=room.depth*view.zoom;
      const labelBase=(room.number?room.number+' · ':'')+(width<100&&room.shortLabel?room.shortLabel:room.name),limit=Math.max(2,Math.floor((width-6)/(font*.56)));
      const label=labelBase.length>limit?labelBase.slice(0,limit-1)+'…':labelBase,showArea=height>font*3&&width>font*4;
      if(width>=16&&height>=12){
        svg+=`<defs><clipPath id="label-clip-${room.id}"><path clip-rule="evenodd" d="${outline}"/></clipPath></defs><g clip-path="url(#label-clip-${room.id})" pointer-events="none"><text x="${center.x}" y="${center.y+(showArea?-3:font*.35)}" text-anchor="middle" font-family="Arial" font-size="${font}" font-weight="600" fill="#263b53">${esc(label)}</text>${showArea?`<text x="${center.x}" y="${center.y+font+1}" text-anchor="middle" font-family="Arial" font-size="${font*.84}" fill="#60718a">${fmtArea(netArea)} sf${room.locked?' · fixed':''}</text>`:''}</g>`;
      }
    });
    svg+=drawWallMass(walls);
    svg+=drawExteriorShell();
    walls.forEach(w=>svg+=drawWall(w));
    if(['wall','corridor-edge'].includes(drag?.kind)&&drag.result?.snapGuide){const guide=drag.result.snapGuide;svg+=line(guide.a,guide.b,'stroke="#1984b5" stroke-width="2" stroke-dasharray="6 4" pointer-events="none"');}
    const selectedEdge=walls.find(w=>w.id===selectedWall);
    if(!drawing&&selectedEdge&&(drag?.kind==='wall'||canMoveWall(selectedEdge))){
      const mid=screen(G.mul(G.add(selectedEdge.a,selectedEdge.b),.5));
      svg+=`<g data-wall="${esc(selectedEdge.id)}" class="wall-grip"><circle cx="${mid.x}" cy="${mid.y}" r="11" fill="#fff" stroke="#235bb7" stroke-width="2"/><path d="M${mid.x-5} ${mid.y}h10 M${mid.x} ${mid.y-5}v10" stroke="#235bb7" stroke-width="1.5"/><title>Drag to shift this wall</title></g>`;
      const reference=G.wallReference(selectedEdge,rooms.concat(corridors),one()?.id),entity=rooms.concat(corridors).find(r=>r.id===reference.roomId),edge=G.edges(G.polygon(entity))[reference.side];
      [edge.a,edge.b].forEach((p,i)=>{const q=screen(p);svg+=`<g pointer-events="none"><circle cx="${q.x}" cy="${q.y}" r="4" fill="#235bb7"/><text x="${q.x+8}" y="${q.y-8}" fill="#235bb7" stroke="#fff" stroke-width="4" paint-order="stroke" font-family="Arial" font-size="12" font-weight="bold">${i?'B':'A'}</text></g>`;});
    }
    if(doorPlacement?.hover){const w=walls.concat(G.corridorDoorWalls(corridors,model.boundaries)).find(w=>w.id===doorPlacement.hover);if(w)svg+=line(w.a,w.b,'stroke="#235bb7" stroke-width="5" opacity=".6" pointer-events="none"');}
    const dimensionRoom=one()&&rooms.find(r=>r.id===one().id);if(dimensionRoom&&!drawing&&!doorPlacement)svg+=drawDimensions(dimensionRoom);
    const activePath=corridors.find(c=>c.id===activeCorridor);if(activePath&&!drawing&&!doorPlacement)svg+=drawCorridorEdges(activePath);
    doorViews.forEach(d=>svg+=drawDoor(d));
    if(model.settings.columnsEnabled!==false)(model.columns||[]).filter(c=>c.enabled!==false).forEach(c=>{const p=screen(c);svg+=`<g data-column="${c.id}" pointer-events="none"><title>${esc(c.name)} · center (${fmt(c.x)}, ${fmt(c.y)}) · reference only</title><path d="${path(G.columnOutline(c))}" fill="#475569" stroke="#fff" stroke-width="1.2"/><text x="${p.x+7}" y="${p.y-7}" font-size="10" fill="#334155" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(c.name)}</text></g>`;});
    (model.portals||[]).forEach(p=>{const q=screen(p),color=p.kind==='entry'?'#147d63':'#a14b12',dir=p.kind==='entry'?-1:1;svg+=`<g class="patient-portal" pointer-events="none"><title>${esc(p.name)} · ${fmtLength(p.clearWidth)} recess · location marker only; actual door required</title><circle cx="${q.x}" cy="${q.y}" r="6" fill="${color}"/><path d="M${q.x-dir*25} ${q.y}h${dir*50} m${-dir*8} -5 l${dir*8} 5 l${-dir*8} 5" stroke="${color}" fill="none" stroke-width="2.5"/><text x="${q.x+15}" y="${q.y-14}" font-size="12" font-weight="bold" fill="${color}" stroke="white" stroke-width="4" paint-order="stroke">${esc(p.name)}</text></g>`;});
    if(model.settings.boundaryReview===true){
      const site=model.boundaries.find(b=>!b.groupId);
      if(site){svg+='<path d="'+path(site.points)+'" fill="none" stroke="#235bb7" stroke-width="2" pointer-events="none"/>';
      }
      rooms.concat(corridors).filter(r=>r.type==='corridor'?!G.validCorridor(r,[],model.boundaries):!G.validPlacement(r,rooms.filter(o=>o.id!==r.id),applicable(r),model.settings)).forEach(r=>{svg+='<path class="boundary-conflict" d="'+path(G.polygon(r))+'" fill="none" stroke="#cf433e" stroke-width="2" stroke-dasharray="6 4" pointer-events="none"><title>'+esc(r.name)+' has a layout conflict — retained for manual adjustment</title></path>';});
    }
    if(drag?.kind==='rooms'&&drag.moved&&preview){
      const moving=rooms.filter(r=>selected.has(r.id)),others=rooms.filter(r=>!selected.has(r.id)).concat(model.corridors);
      G.contactEdges(moving,others,model.boundaries).forEach(e=>svg+=line(e.a,e.b,'stroke="#1984b5" stroke-width="3" stroke-dasharray="5 3" pointer-events="none"'));
    }
    if(drawing?.points?.length){const points=drawing.preview||drawing.points;const outline=drawing.type==='corridor'?G.corridorPolygon(points,drawing.width):points;svg+=`<path d="${outline.length>2?path(outline):path(outline).replace(' Z','')}" fill="#3579d51a" stroke="#235bb7" stroke-width="2" stroke-dasharray="7 4"/>`;drawing.points.forEach(p=>{const q=screen(p);svg+=`<circle cx="${q.x}" cy="${q.y}" r="4" fill="#235bb7"/>`;});}
    if(stoppedDrawing?.points?.length){const outline=G.corridorPolygon(stoppedDrawing.points,stoppedDrawing.width);svg+=`<path d="${outline.length?path(outline):path(stoppedDrawing.points).replace(' Z','')}" fill="#e05b4322" stroke="#b64029" stroke-width="2" stroke-dasharray="8 4" pointer-events="none"/>`;const q=screen(stoppedDrawing.points[0]);svg+=`<text x="${q.x}" y="${q.y-12}" font-family="Arial" font-size="12" fill="#b64029" pointer-events="none">Unfinished — ${esc(stoppedDrawing.error||'Resume to correct')}</text>`;}
    if(drag?.kind==='marquee'&&drag.moved)svg+=drawMarquee();
    $('#isolationBar').hidden=!isolatedRoom;$('#isolationName').textContent=isolatedRoom?'Isolated · '+(getRoom(isolatedRoom)?.name||'Room'):'';
    plan.innerHTML=svg;plan.style.cursor=drawing||doorPlacement?'crosshair':'default';plan.classList.toggle('panning',drag?.kind==='pan');plan.classList.toggle('drawing-path',!!drawing||!!doorPlacement);
    $('#zoom').value=view.zoom;$('#zoomValue').textContent=Math.round(view.zoom*10)+'%';$('#scaleBar').style.width=10*view.zoom+'px';
    $('#wallCount').textContent=walls.filter(w=>w.owners.length>1).length+' shared wall segments';
  }
  function render(){renderNumbering();$('#addDoor').textContent=doorPlacement?'Stop adding doors':'＋ Add door';$('#addDoor').classList.toggle('active',!!doorPlacement);$('#addDoor').setAttribute('aria-pressed',String(!!doorPlacement));renderLists();draw();renderInspector();$('#undo').disabled=!undo.length;$('#redo').disabled=!redo.length;$('#finish').hidden=!drawing||!['poly','corridor'].includes(drawing.type);$('#finish').textContent=drawing?.type==='corridor'?'Stop drawing':'Finish boundary';$('#pathDrawingBar').hidden=drawing?.type!=='corridor';$('#corridorDirection').disabled=!!drawing;$('#pathDrawingHint').textContent=drawing?.drawMode==='free'?'Free angle · click end, then stop.':'90° corners · click end, then stop.';$('#resumeDrawing').hidden=!stoppedDrawing;$('#discardDraft').hidden=!stoppedDrawing;$('#cancel').hidden=!drawing;$('#undoPoint').hidden=!drawing||!['poly','corridor'].includes(drawing.type);}
  function validColumn(c){return c&&[c.x,c.y,c.width,c.depth].every(Number.isFinite)&&Math.abs(c.x)<=1e6&&Math.abs(c.y)<=1e6&&c.width>=.1&&c.width<=100&&c.depth>=.1&&c.depth<=100;}
  function renderColumns(){
    $('#columnsEnabled').checked=model.settings.columnsEnabled!==false;
    $('#columnSnap').checked=model.settings.columnSnap!==false;
    $('#columnSnapMode').value=model.settings.columnSnapMode==='center'?'center':'face';
    $('#columnCount').textContent=(model.columns||[]).length;
  }
  function renderClientPalette(){
    const panel=$('#clientPalette');if(!panel)return;
    const colors=window.LightSeptemberStudies?.colors||{plant:'#c8c8c8',admin:'#ebdaa9',patient:'#a4c3ce',support:'#b8ccad',public:'#b39ab8',treatment:'#d19ca6'};
    const labels={plant:'MEP',admin:'Admin',patient:'Patient',support:'Support',public:'Public',treatment:'Treatment'};
    panel.innerHTML='<span>Client colors</span>'+Object.entries(colors).map(([key,color])=>`<button type="button" data-client-color="${color}" title="${labels[key]}" aria-label="${labels[key]}" style="--chip:${color}" ${!selected.size?'disabled':''}></button>`).join('')+'<button type="button" data-client-color="#ffffff" title="White" aria-label="White" style="--chip:#ffffff" '+(!selected.size?'disabled':'')+'></button>';
  }
  function renderLists(){
    renderClientPalette();
    $('#projectNote').hidden=true;
    $('#corridorList').innerHTML=model.corridors.map(c=>`<div class="corridor-row"><button class="side-button ${activeCorridor===c.id?'active':''}" data-corridor="${c.id}"><span>${esc(c.name)}</span><small>${c.outline?'Custom outline':fmtLength(c.width)+' wide'}</small></button><button class="danger corridor-delete" type="button" data-delete-corridor="${c.id}" aria-label="Delete ${esc(c.name)}" title="Delete corridor · Undo restores it">Delete</button></div>`).join('')||'';
    renderExclusionControls();renderColumns();
    $('#boundaryCount').textContent=model.boundaries.length;
    $('#boundaryList').innerHTML=model.boundaries.map(b=>`<div class="boundary-item"><div><strong>${esc(b.name)}</strong><small>${fmt(G.area(b.points))} sf · ${b.groupId?'group':'site'}${b.noAccessFaces?.length?' · No access: '+esc(b.noAccessFaces.join(' + '))+' facade':''}</small></div><button data-remove-boundary="${b.id}" aria-label="Remove ${esc(b.name)}">×</button></div>`).join('')||'';
  }
  const input=(id,label,value,extra='')=>`<label>${label}<input id="${id}" value="${esc(value)}" ${extra}></label>`;
  function renderInspector(){
    const panel=$('#inspector'),room=one(),wall=walls.find(w=>w.id===selectedWall);
    if(numbering){$('#inspectorTitle').textContent='Room numbers';panel.innerHTML='<div class="notice">Next: '+esc(numbering.next)+'</div><button id="stopNumbering" class="wide">Stop · Escape</button>';$('#stopNumbering').onclick=beginNumbering;return;}
    if(doorPlacement){$('#inspectorTitle').textContent='Door brush';panel.innerHTML='<div class="notice">Click walls to add doors.</div><button id="cancelDoorPlacement" class="wide">Stop adding doors · Escape</button>';$('#cancelDoorPlacement').onclick=beginDoorPlacement;return;}
    if(selectedDoor&&model.doors.some(d=>d.id===selectedDoor)){renderDoorInspector();return;}
    if(selectedWall&&wall){
      const spec=wall.style,owners=wall.owners.map(o=>getEntity(o.roomId)?.name).join(' + ');
      $('#inspectorTitle').textContent=wall.owners.length>1?'Shared wall':'Wall properties';
      panel.innerHTML=`<div class="notice">${esc(owners)}${wall.noAccess?'<br>No-access exterior facade · fixed glazing allowed':''}<br>${fmtLength(wall.length)} · ${wall.owners.length>1?'Shared':''}</div><label>Wall type<select id="wallKind">${[['wall','Solid wall'],['curtain','Curtain · dashed'],['opening','Open passage'],['window','Window wall · mullions']].map(([v,l])=>`<option value="${v}" ${v===spec.kind?'selected':''}>${l}</option>`).join('')}</select></label>${['curtain','opening'].includes(spec.kind)?`<label>Curtain / passage face<select id="wallFace"><option value="exterior" ${spec.face!=='interior'?'selected':''}>Exterior</option><option value="interior" ${spec.face==='interior'?'selected':''}>Interior</option></select></label>`:''}${input('wallThickness','Thickness · inches',spec.thickness,'type="number" min="1" max="36" step="0.5"')}<button id="addHostedDoor" class="primary wide" ${spec.kind!=='wall'||wall.noAccess?'disabled':''}>＋ Add door to wall</button>${doorList(wall.owners.map(o=>({id:o.roomId,side:o.side})))}<button id="backToRoom" class="wide">Back to space</button>`;
      $('#wallKind').onchange=e=>editWall({kind:e.target.value});if($('#wallFace'))$('#wallFace').onchange=e=>editWall({face:e.target.value});$('#wallThickness').onchange=e=>editWall({thickness:Number(e.target.value)});
      $('#addHostedDoor').onclick=beginDoorPlacement;
      addWallGeometryControls(wall);
      $('#backToRoom').onclick=()=>{const id=wallEditRoom(wall)?.id||activeCorridor||wall.owners[0].roomId;getRoom(id)?chooseRoom(id):chooseCorridor(id);};return;
    }
    if(activeCorridor&&getCorridor(activeCorridor)){renderCorridorInspector(getCorridor(activeCorridor));return;}
    if(room){
      $('#inspectorTitle').textContent=room.name.toUpperCase();
      const sideWalls=walls.filter(w=>w.owners.some(o=>o.roomId===room.id)||w.adjacentRoomIds?.includes(room.id));
      panel.innerHTML=`<div class="two room-actions"><button id="addRoomDoor" class="primary">＋ Add door</button><button id="isolateRoom">${isolatedRoom===room.id?'Exit isolation':'Isolate room'}</button></div>${input('roomName','Room name',room.name,'maxlength="48"')}${input('roomNumber','Room number',room.number||'','maxlength="32"')}<div class="metric"><strong>${fmtArea(displayArea(room))}</strong><span>sf · hatched floor area</span></div>${corridorLoss(room)>.01?`<div class="notice warning">${fmtArea(corridorLoss(room))} sf corridor overlap</div>`:""}<div class="two">${input('roomWidth','Hatch width · ft / in',fmtLength(hatchMetrics(room).width),'type="text"')}${input('roomDepth','Hatch depth · ft / in',fmtLength(hatchMetrics(room).depth),'type="text"')}</div><div class="two">${input('roomArea','Hatch area · sf',roundArea(displayArea(room)),'type="number" min="0.5" step="0.5"')}${input('roomAngle','Room grid · degrees',room.angle.toFixed(2),'type="number" min="-180" max="180" step="1"')}</div><div><label>Room color<input id="roomColor" type="color" value="${room.color}"></label></div><label class="check"><input id="roomLocked" type="checkbox" ${room.locked?'checked':''}> Lock geometry and location</label><button id="alignRoom" class="wide" ${room.locked?'disabled':''}>Fit side to nearby boundary</button>${doorList([{id:room.id}])}<button id="deleteRoom" class="wide danger" style="margin-top:18px">Delete room</button>`;
      $('#addRoomDoor').onclick=beginDoorPlacement;$('#isolateRoom').onclick=()=>isolatedRoom===room.id?exitIsolation():isolateRoom(room.id);
      $('#roomNumber').onchange=e=>setRoomNumber(room,e.target.value);
      $('#roomName').onchange=e=>{checkpoint();room.name=e.target.value.trim().slice(0,48)||room.name;delete room.shortLabel;render();};$('#roomColor').onchange=e=>{checkpoint();room.color=e.target.value;render();};$('#roomLocked').onchange=e=>{checkpoint();room.locked=e.target.checked;render();};
      ['Width','Depth','Area'].forEach(name=>$('#room'+name).onchange=e=>{try{const field=name.toLowerCase(),raw=name==='Area'?Number(e.target.value):parseLength(e.target.value),target=name==='Area'?roundArea(raw):roundLength(raw),shown=name==='Area'?roundArea(hatchMetrics(room).area):roundLength(hatchMetrics(room)[field]);if(Math.abs(target-shown)<.00001){render();return;}updateRoom(room,G.hatchSizePatch(room,name.toLowerCase(),target,model.corridors,model.boundaries),false,true);}catch(error){status(error.message);render();}});
      $('#roomAngle').onchange=e=>updateRoom(room,{angle:Number(e.target.value)});
      $('#alignRoom').onclick=()=>updateRoom(room,{},true);$('#deleteRoom').onclick=()=>{checkpoint();model.rooms=model.rooms.filter(r=>r.id!==room.id);model.doors=model.doors.filter(d=>d.hostId!==room.id);selected.clear();render();status('Room deleted. Undo restores it.');};return;
    }
    $('#inspectorTitle').textContent=selected.size?'Multiple rooms':'EXAM ROOM';panel.innerHTML=selected.size>1?edgeAlignmentControls(getRoom([...selected][0])):'';if($('#alignEdges'))$('#alignEdges').onclick=()=>alignPickedEdges([...selected]);
  }
  function validDimensions(room){return [room.x,room.y,room.width,room.depth,room.angle].every(Number.isFinite)&&room.width>=2&&room.depth>=2&&room.width<=500&&room.depth<=500;}
  function wallForReference(reference){
    const candidates=walls.filter(w=>w.owners.some(o=>o.roomId===reference.roomId&&o.side===reference.side));
    if(!Number.isFinite(reference.at))return candidates.sort((a,b)=>b.length-a.length)[0];
    const gap=w=>{const o=w.owners.find(o=>o.roomId===reference.roomId&&o.side===reference.side),p=G.add(o.a,G.mul(G.sub(o.b,o.a),reference.at));return G.distance(p,G.closest(p,w.a,w.b));};
    return candidates.sort((a,b)=>gap(a)-gap(b)||a.length-b.length)[0];
  }
  function wallSelectionReference(wall,roomId){
    const owner=G.wallReference(wall,obstacles(),roomId),v=G.sub(owner.b,owner.a),mid=G.mul(G.add(wall.a,wall.b),.5);
    return {...owner,at:Math.max(0,Math.min(1,G.dot(G.sub(mid,owner.a),v)/G.dot(v,v)))};
  }
  function wallSelectionAfter(result,reference){
    const next=result?.reference||reference;
    if(!result?.sideMapping)return {...next,at:reference.at};
    const mapping=result.sideMapping.edges.find(e=>e.side===next.side&&e.oldSide===reference.side&&reference.at>=e.from-1e-6&&reference.at<=e.to+1e-6);
    const at=mapping?(mapping.newFrom??0)+(reference.at-mapping.from)/(mapping.to-mapping.from)*((mapping.newTo??1)-(mapping.newFrom??0)):.5;
    return {...next,at:Math.max(0,Math.min(1,at))};
  }
  function wallEditRoom(wall){const room=one();return room&&wall&&(wall.owners.some(o=>o.roomId===room.id)||wall.adjacentRoomIds?.includes(room.id))?room:null;}
  function wallCursor(wall){const normal=Math.atan2(wall.b.y-wall.a.y,wall.b.x-wall.a.x)*180/Math.PI+90;return ['ew-resize','nwse-resize','ns-resize','nesw-resize'][((Math.round(normal/45)%4)+4)%4];}
  function canMoveWall(wall){const room=wallEditRoom(wall);return !!room&&!room.locked&&(isolatedRoom===room.id||!wall.owners.some(o=>getEntity(o.roomId)?.locked));}
  function canMoveReference(reference){return walls.some(w=>w.owners.some(o=>o.roomId===reference.roomId&&o.side===reference.side)&&canMoveWall(w));}
  function addWallGeometryControls(wall){
    if(!canMoveWall(wall)){$('#inspector').insertAdjacentHTML('afterbegin',`<div class="notice">${wallEditRoom(wall)?'Unlock the adjoining rooms before moving this wall.':'Select one adjoining room first to move this wall. Wall finishes remain editable.'}</div>`);return;}
    const owner=G.wallReference(wall,obstacles(),one()?.id),entity=getEntity(owner.roomId),points=G.polygon(entity),edge=G.edges(points)[owner.side];
    const locked=entity.locked||isolatedRoom!==entity.id&&wall.owners.some(o=>getEntity(o.roomId)?.locked),disabled=locked?'disabled':'';
    $('#inspector').insertAdjacentHTML('beforeend',`<section class="wall-geometry"><h3>Move / resize wall</h3><label>Shift wall · ft (+ outward, − inward)<input id="wallOffset" type="number" step="0.25" value="0" ${disabled}></label><button id="applyWallOffset" class="primary wide" ${disabled}>Move wall</button><label>Whole side length · ft<input id="wallSideLength" type="number" min="0.5" max="1000" step="0.25" value="${G.distance(edge.a,edge.b).toFixed(3)}" ${disabled}></label><label>Keep fixed<select id="wallAnchor" ${disabled}><option value="start">Endpoint A · start</option><option value="end">Endpoint B · end</option></select></label><button id="applyWallLength" class="wide" ${disabled}>Set side length</button></section>`);
    $('#applyWallOffset').onclick=()=>applyWallMove(owner,Number($('#wallOffset').value));
    $('#applyWallLength').onclick=()=>{const move=G.sideLengthMove(entity,owner.side,Number($('#wallSideLength').value),$('#wallAnchor').value);if(!move){status('Enter a valid side length.');return;}applyWallMove(move.reference,move.offset,owner);};
    ['#wallOffset','#wallSideLength'].forEach(id=>$(id).onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$(id==='#wallOffset'?'#applyWallOffset':'#applyWallLength').click();}});
  }
  function applyWallMove(reference,offset,keepReference=reference){
    if(!canMoveReference(reference)){status('Select one adjoining, unlocked room before moving a wall.');return;}
    const picked=walls.find(w=>w.id===selectedWall);
    if(picked?.owners.some(o=>o.roomId===keepReference.roomId&&o.side===keepReference.side))keepReference=wallSelectionReference(picked,keepReference.roomId);
    if(reference.roomId===keepReference.roomId&&reference.side===keepReference.side)reference={...reference,at:keepReference.at};
    const part=wallExtension?.roomId===reference.roomId&&wallExtension.side===reference.side?wallExtension:null;
    const result=part?E.extendWall(obstacles(),reference,part.from,part.to,offset,model.boundaries,{roomSnap:false,boundarySnap:false,exact:true}):E.moveWall(obstacles(),reference,offset,model.boundaries,{isolatedId:isolatedRoom},false);
    if(result.error){status(result.error);return;}if(Math.abs(result.offset)<.00001&&!result.reshaped){status('Wall already at that position.');return;}
    checkpoint();model.rooms=result.entities.filter(e=>e.type!=='corridor');model.corridors=result.entities.filter(e=>e.type==='corridor');model.doors=E.remapDoors(model.doors,result);wallExtension=null;
    draw();selectedWall=wallForReference(result.sideMapping?wallSelectionAfter(result,keepReference):keepReference)?.id||null;render();status('Wall moved '+fmt(Math.abs(result.offset))+' ft. Adjoining walls and areas updated. Undo restores it.');
  }
  function updateWallDrag(p){
    if(drag?.kind!=='wall')return;
    // Permission is anchored to the selected room at pointer-down, not to a
    // temporary shared wall created by snapping against a locked neighbor.
    if(!one()||one().locked||one().id!==(drag.selectedRoomId??drag.reference.roomId)){status('Select one adjoining, unlocked room before moving a wall.');return;}
    const offset=G.dot(G.sub(p,drag.start),drag.normal);if(Math.abs(offset)*view.zoom<2&&!drag.moved)return;
    drag.moved=true;const entities=drag.before.rooms.concat(drag.before.corridors),options={...snapOptions(),isolatedId:drag.isolatedId};
    const result=drag.part?E.extendWall(entities,drag.reference,drag.part.from,drag.part.to,offset,drag.before.boundaries,options):E.moveWall(entities,drag.reference,offset,drag.before.boundaries,options);
    if(result.error){status(result.error);return;}
    drag.result=result;wallPreview={rooms:result.entities.filter(e=>e.type!=='corridor'),corridors:result.entities.filter(e=>e.type==='corridor')};draw();
    status('Wall shift: '+fmt(result.offset)+' ft'+(result.snapped?' · snapped to '+(result.snapKind==='boundary'?'outer / group boundary':result.snapKind==='corridor'?'corridor edge':result.snapKind==='column'?(model.settings.columnSnapMode==='center'?'column centerline':'column outer face'):'parallel neighboring wall')+'.':result.limited?' · stopped at a room or boundary.':' · areas update on release.'));
  }
  function beginWallDrag(id,p){
    const wall=walls.find(w=>w.id===id),allowed=canMoveWall(wall);
    chooseWall(id);
    if(!allowed){status('Select this wall’s room first. Only its edges can be dragged.');return false;}
    const reference=wallSelectionReference(wall,one().id),entity=getEntity(reference.roomId),poly=G.polygon(entity),edge=G.edges(poly)[reference.side];
    drag={kind:'wall',start:p,reference,part:wallExtension?{...wallExtension}:null,isolatedId:isolatedRoom,selectedRoomId:one().id,normal:G.mul(G.inward(edge,poly),-1),before:copy(model),moved:false};return true;
  }
  function chooseCorridor(id){if(!getCorridor(id))return;completedRoomClick=null;isolatedRoom=wallExtension=selectedCorridorSide=null;doorPlacement=null;activeCorridor=id;selected.clear();selectedWall=selectedDoor=activeGroup=null;drawing=null;render();}
  function beginCorridor(existing=null){
    numbering=doorPlacement=null;isolatedRoom=wallExtension=selectedCorridorSide=null;
    const width=existing?.width??Number($('#corridorWidth').value);
    if(!Number.isFinite(width)||width<1||width>100){status('Corridor width must be 1–100 feet.');return;}
    const drawMode=existing?.drawMode||($('#corridorDirection').value==='free'?'free':'ortho');
    $('#corridorDirection').value=drawMode;
    stoppedDrawing=null;drawing={type:'corridor',width,drawMode,id:existing?.id??null,name:existing?.name||'Corridor '+(model.corridors.length+1),points:[]};
    selectedWall=selectedDoor=null;render();plan.focus({preventScroll:true});status((drawMode==='ortho'?'90° mode: horizontal / vertical segments. ':'Free-angle mode. ')+'Click start, corners and end, then Stop drawing or Enter. Backspace removes a point.');
  }
  function drawingPoint(p){return drawing?.type==='corridor'?G.corridorPoint(drawing.points.at(-1),p,drawing.drawMode):p;}
  function finishDrawing(includeCursor=false){
    if(!drawing)return;
    if(includeCursor&&drawing.preview?.length){
      const endpoint=drawingPoint(drawing.preview.at(-1)),last=drawing.points.at(-1);
      if(!last||G.distance(endpoint,last)>.1)drawing.points.push({...endpoint});
    }
    drawing.preview=null;
    if(drawing.type==='corridor')finishCorridor();else finishBoundary();
  }
  function stopDrawing(includeCursor=false){
    if(!drawing)return;
    finishDrawing(includeCursor);
    if(drawing){
      const reason=$('#status').textContent;
      stoppedDrawing={...copy(drawing),error:reason};drawing=null;drag=preview=null;render();
      status('Path needs correction and remains visible in red. '+reason+' Resume to correct it.');
    }else{
      stoppedDrawing=null;render();
    }
    plan.focus({preventScroll:true});
  }
  function resumeDrawing(){
    if(!stoppedDrawing)return;numbering=doorPlacement=null;drawing=stoppedDrawing;stoppedDrawing=null;drawing.preview=null;render();plan.focus({preventScroll:true});
    status('Path resumed. Undo point corrects a corner; Stop drawing saves and exits.');
  }
  function undoDrawingPoint(){if(!drawing)return;drawing.points.pop();drawing.preview=null;draw();plan.focus({preventScroll:true});status('Last point removed. Continue drawing, or Escape to cancel.');}
  function handleDrawingKey(event){
    if(!drawing)return false;
    if(event.key==='Enter'&&['poly','corridor'].includes(drawing.type)){
      event.preventDefault();event.stopPropagation();if(!event.repeat){if(drawing.type==='corridor')stopDrawing(drawing.points.length<2);else finishDrawing(true);};return true;
    }
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();drawing=drag=preview=wallPreview=null;render();status('Drawing canceled.');return true;}
    if(event.key==='Backspace'&&!/INPUT|TEXTAREA/.test(event.target.tagName)){event.preventDefault();undoDrawingPoint();return true;}
    return false;
  }
  function finishCorridor(){
    if(drawing?.type!=='corridor')return;
    const candidate={id:drawing.id??model.nextId,type:'corridor',name:drawing.name,width:drawing.width,drawMode:drawing.drawMode||'ortho',points:copy(drawing.points)};
    const poly=G.polygon(candidate);
    if(!drawing.id&&model.corridors.length>=100){status('This project supports up to 100 corridor paths.');return;}
    if(!G.simple(poly)){status('Use at least two distinct points. Avoid crossing the path or making turns tighter than its width.');return;}
    if(!G.validCorridor(candidate,model.rooms,model.boundaries)){status('Part of this corridor is outside the site boundary.');return;}
    const n=candidate.points.length;
    candidate.walls=[];
    checkpoint();if(drawing.id)model.doors=model.doors.filter(d=>d.hostId!==drawing.id);if(drawing.id)model.corridors=model.corridors.filter(c=>c.id!==drawing.id);else model.nextId++;
    model.corridors.push(candidate);drawing=null;chooseCorridor(candidate.id);
    const affected=model.rooms.filter(r=>G.overlaps(G.polygon(r),poly)).length;
    status('Corridor formed — wall-free circulation void.'+(affected?' '+affected+' room footprint'+(affected===1?' was':'s were')+' cut back; original shapes are retained.':'')+' Drawing stopped.');
  }
  function renderCorridorInspector(c){
    $('#inspectorTitle').textContent='Corridor properties';
    const sideWalls=walls.filter(w=>w.owners.some(o=>o.roomId===c.id));
    $('#inspector').innerHTML=`<button id="deleteCorridor" class="wide danger corridor-delete-primary" type="button">Delete this corridor</button><button id="addCorridorDoor" class="primary wide" type="button">＋ Add corridor door</button>${input('corridorName','Name',c.name,'maxlength="48"')}${input('pathWidth','Fixed width · ft',c.width,'type="number" readonly')}<div class="notice">Clear circulation</div>${doorList([{id:c.id}])}`;

    $('#addCorridorDoor').onclick=beginDoorPlacement;$('#corridorName').onchange=e=>{checkpoint();c.name=e.target.value.trim().slice(0,48)||c.name;render();};

    $('#deleteCorridor').onclick=()=>removeCorridor(c.id);addCorridorEdgeControls(c);
  }
  function removeCorridor(id){
    const c=getCorridor(id);if(!c)return;
    checkpoint();model.corridors=model.corridors.filter(p=>p.id!==c.id);model.doors=model.doors.filter(d=>d.hostId!==c.id);selectedDoor=null;
    if(activeCorridor===c.id)activeCorridor=null;
    selectedWall=selectedDoor=null;
    if(drawing?.id===c.id)drawing=null;
    if(stoppedDrawing?.id===c.id)stoppedDrawing=null;
    render();status(c.name+' deleted. Room footprints restored where clear; Undo brings the corridor back.');
  }
  function updateRoom(room,patch,align=false,exactSize=false){
    if(room.locked){status('Unlock this room before changing its geometry or group.');render();return;}
    const proposed={...copy(room),...patch};proposed.angle=G.normalize(proposed.angle);
    if(proposed.boundaryFit?.manual&&!('shape' in patch)){
      proposed.boundaryFit.points=proposed.boundaryFit.points.map(p=>({x:p.x*proposed.width/room.width,y:p.y*proposed.depth/room.depth}));
    }else if(['width','depth','angle','shape'].some(key=>key in patch))proposed.boundaryFit=null;
    if(!validDimensions(proposed)){status('Enter dimensions from 2 to 500 feet and a valid angle.');render();return;}
    const others=obstacles().filter(r=>r.id!==room.id),boundaries=applicable(proposed);
    const result=!exactSize&&(align||model.settings.boundarySnap)?G.settle(proposed,others,boundaries,{...model.settings,roomSnap:align?false:model.settings.roomSnap}):{room:G.validPlacement(proposed,others,boundaries,model.settings)?proposed:null,message:exactSize?'Hatch dimensions updated. Wall thickness is excluded.':'Updated. Area and wall lengths recalculated.'};
    if(!result.room&&!align&&corridorLoss(room)>.01&&
      G.validPlacement(proposed,others.filter(r=>r.type!=='corridor'),boundaries,model.settings)&&displayArea(proposed)>1){
      result.room=proposed;result.message='Base shape updated. The corridor still reserves its full width; displayed area excludes it.';
    }
    if(!result.room){status(align?result.message:'That edit would overlap a room or leave its boundary. Move the room or enlarge the boundary first.');render();return;}
    checkpoint();Object.assign(room,result.room);
    const oldCount=model.doors.length;model.doors=model.doors.filter(d=>d.hostId!==room.id||d.side<G.polygon(room).length);
    render();status(result.message+(oldCount>model.doors.length?' Doors on removed sides were removed too; Undo restores them.':''));
  }
  function beginDoorPlacement(){
    numbering=null;
    doorPlacement=doorPlacement?null:{hover:null};
    if(drag?.frame)cancelAnimationFrame(drag.frame);
    drawing=drag=preview=wallPreview=null;isolatedRoom=wallExtension=selectedCorridorSide=null;completedRoomClick=null;
    activeCorridor=activeGroup=null;selectedDoor=selectedWall=null;render();plan.focus({preventScroll:true});
    status(doorPlacement?'Click walls to add doors · Escape to stop.':'Door brush stopped.');
  }
  function doorPlacementWall(p){
    return walls.concat(G.corridorDoorWalls(model.corridors,model.boundaries)).filter(w=>w.style.kind==='wall')
      .map(w=>({w,gap:G.distance(p,G.closest(p,w.a,w.b))})).filter(v=>v.gap<=Math.max(.5,16/view.zoom)).sort((a,b)=>a.gap-b.gap)[0]?.w;
  }
  function nearestCorridor(p){
    return model.corridors.map(c=>({c,gap:Math.min(...G.edges(G.polygon(c)).map(e=>G.distance(p,G.closest(p,e.a,e.b))))})).sort((a,b)=>a.gap-b.gap)[0]?.c;
  }
  function doorList(hosts){
    const list=model.doors.filter(d=>hosts.some(h=>h.id===d.hostId&&(h.side===undefined||h.side===d.side)));
    if(!list.length)return '';
    return '<div class="subheading">Hosted doors</div><div class="side-list">'+list.map(d=>`<button class="side-button" data-door="${d.id}"><span>Door · ${fmtLength(d.width)}</span><small>Side ${d.side+1}${doorViews.some(v=>v.id===d.id)?'':' · check host'}</small></button>`).join('')+'</div>';
  }
  function chooseDoor(id){
    const door=model.doors.find(d=>d.id===id);if(!door)return;
    if(isolatedRoom!==door.hostId)isolatedRoom=null;wallExtension=selectedCorridorSide=null;
    selectedDoor=id;selectedWall=activeGroup=null;activeCorridor=getCorridor(door.hostId)?door.hostId:null;
    selected=new Set(getRoom(door.hostId)?[door.hostId]:[]);render();
  }
  function addHostedDoor(wall=walls.find(w=>w.id===selectedWall),point=null){if(!wall||wall.style.kind!=='wall')return;
    if(wall.noAccess){status('No access on this exterior facade. Use an interior wall or the top/right exterior.');return;}
    if(model.doors.length>=1500){status('This project supports up to 1,500 hosted doors.');return;}
    const host=G.wallReference(wall,obstacles(),one()?.id),edge=G.edges(G.polygon(getEntity(host.roomId)))[host.side],delta=G.sub(edge.b,edge.a);
    const position=G.dot(G.sub(point||G.mul(G.add(wall.a,wall.b),.5),edge.a),delta)/G.dot(delta,delta);
    const candidate={id:model.nextId,hostId:host.roomId,side:host.side,width:Math.min(3,Math.floor((wall.length-.6)*4)/4),position,hinge:'start',swing:1};
    const placed=H.autoPlace(candidate,obstacles(),walls,model.doors,model.boundaries);
    if(!placed){status('No clear span for this door with six-inch clearance from perpendicular walls. Try another wall or position.');return;}
    checkpoint();model.nextId++;model.doors.push(placed);
    if(doorPlacement){doorPlacement.hover=null;render();status('Door added. Keep clicking any solid room wall or exposed corridor edge to add more. Stop adding doors or Escape finishes.');}
    else{chooseDoor(placed.id);status('Door added on its host wall. Drag the door along the wall, or edit its width and position. The wall was not split.');}
  }
  function editDoor(patch){
    const door=model.doors.find(d=>d.id===selectedDoor);if(!door)return;
    const proposed={...door,...patch};
    if(!Number.isFinite(proposed.position)||proposed.position<0||proposed.position>1){status('Position must be on the host wall.');renderInspector();return;}
    // Hinge/swing edits remain available even if a corridor currently covers it.
    const placed=('position' in patch||'leaves' in patch)?H.autoPlace(proposed,obstacles(),walls,model.doors,model.boundaries):'width' in patch?H.place(proposed,obstacles(),walls,model.doors,model.boundaries):proposed;
    if(!placed){status('That door will not fit on a clear solid wall. Try a smaller width or restore its host wall.');renderInspector();return;}
    if('hinge' in patch)placed.hinge=patch.hinge;if('swing' in patch)placed.swing=patch.swing;
    checkpoint();Object.assign(door,placed);render();status('Door updated. Host wall and room dimensions unchanged.');
  }
  function deleteDoor(){
    const door=model.doors.find(d=>d.id===selectedDoor);if(!door)return;
    checkpoint();model.doors=model.doors.filter(d=>d.id!==door.id);selectedDoor=null;render();status('Door removed. The continuous wall is restored. Undo brings the door back.');
  }
  function renderDoorInspector(){
    const door=model.doors.find(d=>d.id===selectedDoor),f=H.frame(door,obstacles());if(!f)return;
    const o=H.opening(door,obstacles()),shown=doorViews.some(d=>d.id===door.id);
    $('#inspectorTitle').textContent='Door properties';
    $('#inspector').innerHTML=`<div class="notice">Hosted on ${esc(f.host.name)} · Side ${door.side+1}</div>${shown?'':'<div class="notice warning">Door does not fit on its host.</div>'}<label>Door type<select id="doorLeaves"><option value="1" ${door.leaves!==2?'selected':''}>Single leaf</option><option value="2" ${door.leaves===2?'selected':''}>Double door · equal leaves</option></select></label>${input('doorWidth','Total opening width · ft',door.width,'type="number" min="0.5" max="12" step="0.25"')}${input('doorPosition','Door center from endpoint A · ft',Number((o?.offset??door.position*f.length).toFixed(3)),`type="number" min="0" max="${f.length}" step="0.25"`)}<div class="two door-actions"><button id="flipHinge">Flip hinge</button><button id="flipSwing">Flip swing</button></div><button id="backToHost" class="wide">Select host wall</button><button id="deleteDoor" class="wide danger door-actions">Delete door</button>`;
    $('#doorLeaves').onchange=e=>editDoor({leaves:Number(e.target.value)});
    $('#flipHinge').disabled=door.leaves===2;
    $('#doorWidth').onchange=e=>editDoor({width:Number(e.target.value)});
    $('#doorPosition').onchange=e=>editDoor({position:Number(e.target.value)/f.length});
    $('#flipHinge').onclick=()=>editDoor({hinge:door.hinge==='end'?'start':'end'});
    $('#flipSwing').onclick=()=>editDoor({swing:-door.swing});
    $('#deleteDoor').onclick=deleteDoor;
    $('#backToHost').onclick=()=>{const wall=wallForReference({roomId:door.hostId,side:door.side});if(wall)chooseWall(wall.id);else{selectedDoor=null;if(getCorridor(door.hostId))chooseCorridor(door.hostId);else render();}};
  }
  function beginDoorDrag(id,p){
    chooseDoor(id);const door=model.doors.find(d=>d.id===id),o=H.opening(door,obstacles());if(!o)return;
    drag={kind:'door',original:copy(door),start:p,offset:o.offset,before:copy(model),moved:false};
  }
  function updateDoorDrag(p){
    if(drag?.kind!=='door')return;const f=H.frame(drag.original,obstacles());if(!f)return;
    const delta=G.dot(G.sub(p,drag.start),f.u);if(Math.abs(delta)*view.zoom<2&&!drag.moved)return;
    const proposed={...drag.original,position:(drag.offset+delta)/f.length};
    const placed=H.autoPlace(proposed,obstacles(),walls,model.doors,model.boundaries);
    if(!placed)return;drag.moved=true;drag.doorPreview=placed;draw();
    status('Door center: '+fmt(placed.position*f.length)+' ft from endpoint A. Inward swing · hinge toward nearest perpendicular wall · six-inch corner clearance.');
  }
  function editWall(patch){
    const wall=walls.find(w=>w.id===selectedWall);if(!wall)return;
    if(wall.noAccess&&['opening','curtain'].includes(patch.kind)){status('This facade has no access. Solid wall or fixed window glazing only.');renderInspector();return;}
    const spec={...wall.style,...patch};delete spec.segments;
    if(!['wall','curtain','opening','window'].includes(spec.kind)||!Number.isFinite(spec.thickness)||spec.thickness<1||spec.thickness>36){status('Use a solid wall, curtain, opening or window wall, with thickness 1–36 inches.');renderInspector();return;}
    checkpoint();const revision=++model.revision;
    for(const owner of wall.owners){
      const entity=getEntity(owner.roomId),d=G.sub(owner.b,owner.a),size=G.dot(d,d),params=[wall.a,wall.b].map(p=>G.dot(G.sub(p,owner.a),d)/size);
      const edit={kind:spec.kind,face:spec.face==='interior'?'interior':'exterior',thickness:spec.thickness,from:Math.max(0,Math.min(...params)),to:Math.min(1,Math.max(...params)),revision};
      entity.walls[owner.side]??={kind:'wall',thickness:model.settings.thickness,segments:[]};entity.walls[owner.side].segments??=[];entity.walls[owner.side].segments.push(edit);
    }
    draw();renderInspector();$('#undo').disabled=false;status('Wall finish updated. Hosted doors are retained; they appear wherever their host remains solid.');
  }
  function chooseRoom(id,additive=false){if(!getRoom(id))return;if(isolatedRoom!==id||additive)isolatedRoom=null;wallExtension=selectedCorridorSide=null;doorPlacement=null;activeCorridor=null;selectedWall=selectedDoor=null;activeGroup=null;if(additive){selected.has(id)?selected.delete(id):selected.add(id);}else selected=new Set([id]);render();}
  function chooseWall(id){if(id!==selectedWall)wallExtension=null;doorPlacement=null;const wall=walls.find(w=>w.id===id);if(!wall)return;if(!wall.owners.some(o=>o.roomId===activeCorridor))activeCorridor=null;selectedDoor=null;selectedWall=id;activeGroup=null;render();}
  function edgeAlignmentControls(reference){
    return `<label>Line up wall faces<select id="alignSide"><option value="0">Top edges</option><option value="2">Bottom edges</option><option value="3">Left edges</option><option value="1">Right edges</option></select></label><button id="alignEdges" class="wide">Align edges</button>`;
  }
  function alignPickedEdges(ids){
    const members=ids.map(getRoom).filter(Boolean),picked=new Set(ids),side=Number($('#alignSide').value);
    const aligned=G.alignRoomEdges(members,obstacles().filter(r=>!picked.has(r.id)),model.boundaries,side,model.settings.thickness,model.settings);
    if(!aligned){status('Cannot align these edges without an overlap, moving a locked room, or detaching from the boundary. No rooms changed.');return;}
    if(aligned.every(r=>G.distance(r,getRoom(r.id))<.00001)){status('These wall faces are already aligned.');return;}
    checkpoint();model.rooms=model.rooms.map(r=>aligned.find(a=>a.id===r.id)||r);render();
    status(['Top','Right','Bottom','Left'][side]+' wall faces aligned. Room sizes and arrangement preserved.');
  }
  function groupValid(rooms,boundaries=model.boundaries,corridors=[],settings=model.settings){return rooms.every((r,i)=>G.validPlacement(r,rooms.filter((_,j)=>j!==i),boundaries.filter(b=>!b.groupId||b.groupId===r.groupId),settings))&&corridors.every(c=>G.validCorridor(c,rooms,boundaries));}
  function beginBoundary(type,groupId=null){numbering=doorPlacement=null;isolatedRoom=wallExtension=selectedCorridorSide=null;drawing={type,groupId,points:[]};selectedWall=selectedDoor=null;render();status(type==='rect'?'Drag the two opposite corners of the boundary.':'Click each boundary corner, then Finish boundary. Escape cancels.');}
  function finishBoundary(){if(!drawing)return;const points=drawing.preview||drawing.points;
    if(!G.simple(points)){status('Use at least three corners with no crossing edges.');return;}
    const groupId=drawing.groupId,name=groupId?(getGroup(groupId)?.name||'Group')+' boundary':'Site boundary';
    const candidate={id:model.nextId,name,groupId,points:copy(points)},boundaries=model.boundaries.filter(b=>b.groupId!==groupId).concat(candidate),rooms=copy(model.rooms);
    for(const room of rooms.filter(r=>!groupId||r.groupId===groupId)){
      if(G.contains(G.polygon(room),points))continue;if(room.locked){status('This boundary excludes a locked room. Enlarge it or unlock the room first.');return;}
      const fitted=G.fitInside(room,points);if(!fitted){status('A room cannot fit inside this boundary without changing its area. Draw a larger boundary.');return;}Object.assign(room,fitted);
    }
    if(!groupValid(rooms,boundaries,model.corridors)){status('That boundary would exclude a corridor or force rooms to overlap. Reposition the spaces or draw a larger boundary.');return;}
    checkpoint();model.nextId++;model.boundaries=boundaries;model.rooms=rooms;drawing=null;render();status(name+' set. Nearby rooms fit a wall to the boundary while keeping their own grid.');}
  function findPosition(room){const candidates=[{x:view.x,y:view.y}],bounds=applicable(room);let minX=0,minY=0,maxX=120,maxY=100;if(bounds.length){const p=bounds[0].points;minX=Math.min(...p.map(q=>q.x));minY=Math.min(...p.map(q=>q.y));maxX=Math.max(...p.map(q=>q.x));maxY=Math.max(...p.map(q=>q.y));}
    for(let y=minY+room.depth/2;y<=maxY;y+=2)for(let x=minX+room.width/2;x<=maxX;x+=2)candidates.push({x,y});
    return candidates.map(p=>({...room,...p})).find(r=>G.validPlacement(r,obstacles(),bounds));}
  function addRoom(values){const snapshot=copy(model);const room=newRoom(values.name,values.width,values.depth,values.shape,values.angle);room.groupId=null;const placed=findPosition(room);if(!placed){model=snapshot;status('No clear space for this room. Enlarge a boundary or use smaller dimensions.');return null;}undo.push(snapshot);redo=[];model.rooms.push(placed);activeCorridor=null;selected=new Set([room.id]);activeGroup=null;selectedWall=selectedDoor=null;render();status('Room added.');return placed;}
  function clearPlanSelection(){completedRoomClick=null;isolatedRoom=wallExtension=selectedCorridorSide=null;doorPlacement=null;selected.clear();activeCorridor=activeGroup=selectedWall=selectedDoor=null;render();}
  function startPan(event){
    event.preventDefault();plan.focus({preventScroll:true});
    if(drawing)drawing.preview=null;
    drag={kind:'pan',pointerId:event.pointerId,start:{x:event.clientX,y:event.clientY},view:{...view},moved:false,tapToClear:event.pointerType==='touch'};
    plan.setPointerCapture(event.pointerId);draw();
  }
  function updatePan(event){
    const dx=event.clientX-drag.start.x,dy=event.clientY-drag.start.y;
    drag.moved=drag.moved||Math.hypot(dx,dy)>3;
    view.x=drag.view.x-dx/drag.view.zoom;view.y=drag.view.y-dy/drag.view.zoom;draw();
  }
  function onPlanPointerDown(event){
    if(drag)return;
    if(event.button===1){startPan(event);return;}
    if(event.button!==0)return;plan.focus({preventScroll:true});const p=world(event);
    if(drawing){if(['poly','corridor'].includes(drawing.type)){const end=drawingPoint(p);if(!drawing.points.length||G.distance(end,drawing.points.at(-1))>.1)drawing.points.push({x:end.x,y:end.y});drawing.preview=null;drawing.pointerStart=p;plan.setPointerCapture(event.pointerId);draw();}else{drawing.points=[{x:p.x,y:p.y}];drag={kind:'boundary'};plan.setPointerCapture(event.pointerId);}return;}
    if(numbering){const hit=Number(event.target.closest('[data-room]')?.dataset.room);if(hit)numberRoom(hit);return;}
    if(doorPlacement){const w=doorPlacementWall(p);if(w)addHostedDoor(w,p);else status('Click a solid room wall or an exposed corridor edge/end cap.');return;}
    const doorId=Number(event.target.closest('[data-door]')?.dataset.door);
    if(doorId){beginDoorDrag(doorId,p);plan.setPointerCapture(event.pointerId);return;}
    const corridorEnd=event.target.closest('[data-corridor-end]'),corridorSegment=event.target.closest('[data-corridor-segment]');
    if(corridorEnd||corridorSegment){beginCorridorEdgeDrag(0,p);if(drag){if(corridorEnd)drag.reference.end=Number(corridorEnd.dataset.corridorEnd);else drag.reference.segment=Number(corridorSegment.dataset.corridorSegment);}plan.setPointerCapture(event.pointerId);return;}
    const corridorEdge=event.target.closest('[data-corridor-edge]');if(corridorEdge){beginCorridorEdgeDrag(Number(corridorEdge.dataset.corridorEdge),p);plan.setPointerCapture(event.pointerId);return;}
    const wallId=event.target.closest('[data-wall]')?.dataset.wall;
    if(wallId){
      if(event.shiftKey||$('#multi').checked){const room=wallEditRoom(walls.find(w=>w.id===wallId));if(room)chooseRoom(room.id,true);return;}
      if(beginWallDrag(wallId,p))plan.setPointerCapture(event.pointerId);return;
    }
    const corridor=event.target.closest('[data-corridor]');if(corridor){const id=corridor.dataset.corridor==='region'?nearestCorridor(p)?.id:Number(corridor.dataset.corridor);chooseCorridor(id);return;}
    const id=Number(event.target.closest('[data-room]')?.dataset.room);
    if(id){
      if(event.shiftKey||$('#multi').checked){chooseRoom(id,true);return;}
      // SVG paths are replaced on redraw, so recognize a second completed
      // click ourselves instead of depending on a persistent DOM target.
      if(completedRoomClick?.id===id&&Date.now()-completedRoomClick.time<450&&G.distance(p,completedRoomClick.point)*view.zoom<6){
        completedRoomClick=null;handledDoubleClickUntil=Date.now()+500;
        isolatedRoom===id?exitIsolation():isolateRoom(id);return;
      }
      if(!selected.has(id)||selected.size===1)chooseRoom(id);const room=getRoom(id),moving=model.rooms.filter(r=>selected.has(r.id));
      if(moving.some(r=>r.locked)){status('Selection includes a locked room. Unlock it before moving.');return;}
      drag={kind:'rooms',start:p,roomId:id,original:copy(model.rooms),lastGood:copy(moving),before:copy(model),moved:false};
    }else{
      if(event.pointerType==='touch')startPan(event);
      else{drag={kind:'marquee',start:p,end:p,moved:false,additive:event.shiftKey||$('#multi').checked,original:[...selected],hits:[]};plan.setPointerCapture(event.pointerId);}
      return;
    }
    plan.setPointerCapture(event.pointerId);
  }
  plan.addEventListener('pointerdown',onPlanPointerDown);
  plan.addEventListener('dblclick',onPlanDoubleClick);
  // Prevent the browser's middle-click autoscroll and auxiliary-click action.
  ['mousedown','auxclick'].forEach(name=>plan.addEventListener(name,event=>{if(event.button===1)event.preventDefault();}));
  function updateRoomDrag(p){
    if(!drag||drag.kind!=='rooms')return;
    const delta=G.sub(p,drag.start);drag.moved=drag.moved||G.length(delta)>1/view.zoom;
    if(!drag.moved)return;
    const anchor=drag.original.find(r=>r.id===drag.roomId),current=drag.lastGood.find(r=>r.id===drag.roomId);
    const remaining=G.sub(G.add(anchor,delta),current),others=drag.original.filter(r=>!selected.has(r.id)).concat(model.corridors);
    // Use the chosen physical snap distance for single rooms AND groups.
    drag.placement=G.moveSelection(drag.lastGood,remaining,others,model.boundaries,{...snapOptions(),margin:model.settings.margin,ghostRooms:true,ghostCorridors:true,recoverOutside:true,releaseRooms:drag.original.filter(r=>selected.has(r.id))});
    drag.lastGood=drag.placement.rooms;
    preview=drag.original.map(r=>drag.lastGood.find(next=>next.id===r.id)||r);
    status(drag.placement.message);draw();
  }
  function flushRoomDrag(){
    if(drag?.frame){cancelAnimationFrame(drag.frame);drag.frame=null;updateRoomDrag(drag.latest);}
  }
  plan.addEventListener('pointermove',event=>{
    if(drag?.kind==='pan'){if(event.pointerId===drag.pointerId)updatePan(event);return;}
    const p=world(event);
    if(drawing&&['poly','corridor'].includes(drawing.type)&&drawing.points.length){const end=drawingPoint(p);drawing.preview=G.distance(end,drawing.points.at(-1))>.1?[...drawing.points,end]:null;draw();return;}
    if(doorPlacement){const w=doorPlacementWall(p);if(doorPlacement.hover!==w?.id){doorPlacement.hover=w?.id;draw();}return;}
    if(!drag)return;
    if(drag.kind==='marquee'){updateMarquee(p);return;}
    if(drag.kind==='corridor-edge'){updateCorridorEdgeDrag(p);return;}
    if(drag.kind==='door'){updateDoorDrag(p);return;}
    if(drag.kind==='wall'){drag.latest=p;if(!drag.frame){const active=drag;drag.frame=requestAnimationFrame(()=>{if(drag!==active)return;drag.frame=null;updateWallDrag(drag.latest);});}return;}
    if(drag.kind==='boundary'){const a=drawing.points[0],b={x:p.x,y:p.y};drawing.preview=[{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y)},{x:Math.max(a.x,b.x),y:Math.min(a.y,b.y)},{x:Math.max(a.x,b.x),y:Math.max(a.y,b.y)},{x:Math.min(a.x,b.x),y:Math.max(a.y,b.y)}];draw();}
    if(drag.kind==='rooms'){
      drag.latest=p;
      if(!drag.frame){const active=drag;drag.frame=requestAnimationFrame(()=>{if(drag!==active)return;drag.frame=null;updateRoomDrag(drag.latest);});}
    }
  });
  plan.addEventListener('pointerleave',()=>{if(drawing){drawing.preview=null;draw();}});
  plan.addEventListener('pointerup',event=>{
    if(drag?.kind==='pan'){
      if(event.pointerId!==drag.pointerId)return;updatePan(event);const clear=drag.tapToClear&&!drag.moved&&!drawing;drag=null;
      if(clear)clearPlanSelection();else draw();return;
    }
    if(drawing?.pointerStart){drawing.pointerStart=null;drawing.preview=null;draw();return;}
    if(drag?.kind==='marquee'){finishMarquee(world(event));return;}
    if(drag?.kind==='corridor-edge'){updateCorridorEdgeDrag(world(event));if(drag.result&&drag.moved&&(Math.abs(drag.result.offset)>.00001||drag.result.reshaped)){undo.push(drag.before);redo=[];model.corridors=wallPreview.corridors;}drag=wallPreview=null;render();return;}
    if(drag?.kind==='door'){updateDoorDrag(world(event));if(drag.moved&&drag.doorPreview&&Math.abs(drag.doorPreview.position-drag.original.position)>1e-7){undo.push(drag.before);redo=[];model.doors=model.doors.map(d=>d.id===drag.original.id?drag.doorPreview:d);}drag=null;render();return;}
    if(!drag)return;if(drag.kind==='boundary'){drag=null;finishBoundary();return;}
    if(drag.kind==='wall'){
      if(drag.frame)cancelAnimationFrame(drag.frame);updateWallDrag(world(event));const reference=wallSelectionAfter(drag.result,drag.reference);
      if(drag.moved&&drag.result&&(Math.abs(drag.result.offset)>.00001||drag.result.reshaped)){undo.push(drag.before);redo=[];model.rooms=wallPreview.rooms;model.corridors=wallPreview.corridors;model.doors=E.remapDoors(model.doors,drag.result);wallExtension=null;}
      drag=wallPreview=null;draw();selectedWall=wallForReference(reference)?.id||null;render();return;
    }
    if(drag.kind==='rooms'){drag.latest=world(event);if(!drag.frame)updateRoomDrag(drag.latest);}
    flushRoomDrag();
    if(drag.kind==='rooms'&&drag.moved&&preview){
      const moving=preview.filter(r=>selected.has(r.id)),others=preview.filter(r=>!selected.has(r.id));
      const collision=moving.some(r=>!G.validPlacement(r,others,[],model.settings)||
        (G.validPlacement(drag.original.find(o=>o.id===r.id),model.corridors,[],model.settings)&&!G.validPlacement(r,model.corridors,[],model.settings)));
      if(collision){preview=null;drag.placement={message:'Release in a clear spot. Rooms can pass through rooms and corridors while dragging; this overlapping drop was canceled.'};}
      if(preview&&JSON.stringify(preview)!==JSON.stringify(model.rooms)){undo.push(drag.before);redo=[];model.rooms=preview;}
      status(drag.placement?.message||'Selection moved.');
    }
    if(drag.kind==='rooms')completedRoomClick=drag.moved?null:{id:drag.roomId,point:world(event),time:Date.now()};
    drag=null;preview=null;render();
  });
  plan.addEventListener('pointercancel',()=>{if(drag?.frame)cancelAnimationFrame(drag.frame);drag=preview=wallPreview=null;render();});
  plan.addEventListener('wheel',event=>{event.preventDefault();const before=world(event),factor=Math.exp(-event.deltaY*.001);view.zoom=Math.max(.5,Math.min(35,view.zoom*factor));const after=world(event);view.x+=before.x-after.x;view.y+=before.y-after.y;draw();},{passive:false});
  document.addEventListener('click',event=>{
    const deletePath=event.target.closest('[data-delete-corridor]');if(deletePath){removeCorridor(Number(deletePath.dataset.deleteCorridor));return;}
    if(plan.contains(event.target))return;const edgeButton=event.target.closest('[data-corridor-side]');if(edgeButton){selectedCorridorSide=Number(edgeButton.dataset.corridorSide);render();return;}const door=event.target.closest('[data-door]');if(door){chooseDoor(Number(door.dataset.door));return;}const room=event.target.closest('[data-room]'),wall=event.target.closest('[data-wall]'),group=event.target.closest('[data-group]'),remove=event.target.closest('[data-remove-boundary]');
    const corridor=event.target.closest('[data-corridor]');if(corridor)chooseCorridor(Number(corridor.dataset.corridor));
    if(room)chooseRoom(Number(room.dataset.room),event.shiftKey||$('#multi').checked);
    if(wall)chooseWall(wall.dataset.wall);
    if(remove){checkpoint();model.boundaries=model.boundaries.filter(b=>b.id!==Number(remove.dataset.removeBoundary));render();status('Boundary removed. Undo restores it.');}
  });
  $('#createForm').onsubmit=event=>{event.preventDefault();const values={name:$('#newName').value.trim().slice(0,48),width:Number($('#newWidth').value),depth:Number($('#newDepth').value),shape:'rect',angle:Number($('#newAngle').value)};if(values.name&&validDimensions({...values,x:0,y:0}))addRoom(values);};
  ['#newWidth','#newDepth'].forEach(id=>$(id).addEventListener('input',()=>$('#newArea').textContent=fmtArea(Number($('#newWidth').value)*Number($('#newDepth').value))+' sf'));

  $('#siteRect').onclick=()=>beginBoundary('rect');$('#sitePoly').onclick=()=>beginBoundary('poly');$('#finish').onclick=()=>drawing?.type==='corridor'?stopDrawing():finishDrawing();$('#stopDrawing').onclick=()=>stopDrawing();$('#resumeDrawing').onclick=resumeDrawing;$('#discardDraft').onclick=()=>{stoppedDrawing=null;render();status('Unfinished path discarded. Existing rooms and corridors are unchanged.');};$('#undoPoint').onclick=undoDrawingPoint;$('#cancel').onclick=()=>{drawing=null;drag=null;render();status('Drawing canceled.');};
  $('#exitIsolation').onclick=exitIsolation;
  $('#addDoor').onclick=beginDoorPlacement;
  $('#renumberRooms').onclick=beginNumbering;
  $('#clientPalette').onclick=e=>{
    const color=e.target.closest('[data-client-color]')?.dataset.clientColor;
    if(!/^#[0-9a-f]{6}$/i.test(color||'')||!selected.size)return;
    checkpoint();model.rooms.filter(r=>selected.has(r.id)).forEach(r=>r.color=color);render();status('Color updated.');
  };
  $('#clearSelection').onclick=clearPlanSelection;
  function history(direction){const from=direction==='undo'?undo:redo,to=direction==='undo'?redo:undo;if(!from.length)return;const brushActive=!!doorPlacement;completedRoomClick=null;to.push(copy(model));model=from.pop();selected=new Set([...selected].filter(id=>getRoom(id)));activeCorridor=selectedWall=selectedDoor=activeGroup=null;isolatedRoom=wallExtension=selectedCorridorSide=null;doorPlacement=drawing=stoppedDrawing=drag=preview=wallPreview=null;if(brushActive)doorPlacement={hover:null};syncSettings();render();status(direction==='undo'?'Undone.':'Redone.');}
  $('#undo').onclick=()=>history('undo');$('#redo').onclick=()=>history('redo');
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&numbering){event.preventDefault();numbering=null;render();return;}if(event.key==='Escape'&&doorPlacement){event.preventDefault();doorPlacement=null;render();status('Ready.');return;}if(handleDrawingKey(event))return;if(/INPUT|SELECT|TEXTAREA/.test(event.target.tagName))return;if(event.key==='Delete'&&!drawing&&selectedDoor&&!event.repeat&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();deleteDoor();return;}if(event.key==='Delete'&&!drawing&&activeCorridor&&!event.repeat&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();removeCorridor(activeCorridor);return;}if(event.key==='Escape'){if(drag?.frame)cancelAnimationFrame(drag.frame);drawing=drag=preview=wallPreview=null;if(wallExtension)wallExtension=null;else isolatedRoom=null;render();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();history(event.shiftKey?'redo':'undo');}},true);
  function renderExclusionControls(){
    const site=model.boundaries.find(b=>!b.groupId),panel=$('#exclusionControls');if(!panel)return;
    if(model.reference?.variant==='boundary'){panel.innerHTML='<h3>Boundary dimensions · feet</h3>'+model.boundaries[0].points.map((a,i)=>{const b=model.boundaries[0].points[(i+1)%model.boundaries[0].points.length];return '';}).join('');return;}
    if(!site){panel.innerHTML='';return;}
    const literal=window.LightSeptemberStudies?.sourcePoints;
    if(literal&&JSON.stringify(site.points)===JSON.stringify(literal)){panel.innerHTML='';return;}
    const e=E.cornerExclusion(site);
    panel.innerHTML=`<label class="check"><input id="exclusionEnabled" type="checkbox" ${e.enabled?'checked':''}> Exclude lower-right corner</label><div class="two">${input('exclusionWidth','Width · ft',Number(e.width.toFixed(3)),'type="number" min="0.25" max="500" step="0.25"')}${input('exclusionHeight','Height · ft',Number(e.height.toFixed(3)),'type="number" min="0.25" max="500" step="0.25"')}</div><button id="applyExclusion" class="wide">Apply exclusion size</button><button id="resetExclusion" class="text-button">Use default 50 × 40 ft</button>`;
    $('#exclusionEnabled').onchange=ev=>editExclusion({enabled:ev.target.checked});
    $('#applyExclusion').onclick=()=>editExclusion({width:Number($('#exclusionWidth').value),height:Number($('#exclusionHeight').value)});
    $('#resetExclusion').onclick=()=>editExclusion({enabled:true,width:50,height:40});
  }
  $('.corridor-section').insertAdjacentHTML('beforebegin','<section id="columnsPanel"><div class="section-heading"><h2>Columns</h2><output id="columnCount"></output></div><label class="check"><input id="columnsEnabled" type="checkbox" checked> Show columns</label><label class="check"><input id="columnSnap" type="checkbox" checked> Snap to columns</label><label>Snap to<select id="columnSnapMode"><option value="face">Face</option><option value="center">Centerline</option></select></label><details><summary>Add column</summary><form id="columnForm"><label>Name<input id="columnName" value="C1" maxlength="32" required></label><div class="two"><label>Center X · ft<input id="columnX" type="number" value="-30" step="any" required></label><label>Center Y · ft<input id="columnY" type="number" value="-30" step="any" required></label><label>Width · ft<input id="columnWidth" type="number" value="1.5" min="0.1" max="100" step="any" required></label><label>Depth · ft<input id="columnDepth" type="number" value="1.5" min="0.1" max="100" step="any" required></label></div><button type="submit" class="wide">＋ Place column</button></form></details></section>');
  $('#columnForm').onsubmit=e=>{e.preventDefault();if((model.columns?.length||0)>=500){status('This project supports at most 500 columns.');return;}const c={name:$('#columnName').value.trim()||'Column',x:Number($('#columnX').value),y:Number($('#columnY').value),width:Number($('#columnWidth').value),depth:Number($('#columnDepth').value),enabled:true};if(!validColumn(c)){status('Enter finite X/Y centers and column dimensions from 0.1 to 100 ft.');return;}checkpoint();c.id=model.nextId++;(model.columns??=[]).push(c);$('#columnName').value='C'+(model.columns.length+1);render();status('Column placed. Room geometry and hatched areas are unchanged.');};
  $('#columnsPanel').insertAdjacentHTML('beforeend','<details><summary>Bulk columns</summary><label>Name, X, Y, width, depth · ft<textarea id="bulkColumns" rows="6" spellcheck="false"  placeholder="C1, -30, -20, 1.5, 1.5&#10;C2, -15, -20, 2, 2"></textarea></label><button id="addBulkColumns" type="button" class="wide">＋ Add columns from text</button><p id="bulkColumnNotice" class="hint" role="status"></p></details>');
  $('#addBulkColumns').onclick=()=>{try{const columns=E.parseColumnText($('#bulkColumns').value);if((model.columns?.length||0)+columns.length>500)throw Error('This project supports at most 500 columns; nothing was added.');checkpoint();for(const c of columns)(model.columns??=[]).push({...c,id:model.nextId++,enabled:true});render();$('#bulkColumnNotice').textContent=columns.length+' columns added.';status(columns.length+' columns added; rooms unchanged.');}catch(error){$('#bulkColumnNotice').textContent=error.message;status(error.message);}};
  for(const [id,key] of [['columnsEnabled','columnsEnabled'],['columnSnap','columnSnap']])$('#'+id).onchange=e=>{checkpoint();model.settings[key]=e.target.checked;render();status(key==='columnSnap'?'Column snapping '+(e.target.checked?'on.':'off.'):'Column overlay '+(e.target.checked?'on.':'off.'));};
  $('#columnSnapMode').onchange=e=>{if(!['face','center'].includes(e.target.value))return;checkpoint();model.settings.columnSnapMode=e.target.value;render();status(e.target.value==='center'?'Column centerline snapping · projection into clear space is allowed.':'Column face snapping · keep columns outside the corridor.');};
  let svgCandidates=[],boundaryImportType='SVG';
  const boundaryPointsExample='{\n  "points": [\n    {"x": 0, "y": 0},\n    {"x": 100, "y": 0},\n    {"x": 100, "y": 80},\n    {"x": 0, "y": 80}\n  ]\n}';
  $('#svgChoose').insertAdjacentHTML('beforebegin',`<details id="boundaryPointsEditor"><summary>Point coordinates</summary><label>Points · X / Y<textarea id="boundaryPoints" rows="10" spellcheck="false" ></textarea></label><div class="two"><button id="boundaryPointsCurrent" type="button">Current</button><button id="boundaryPointsExample" type="button">Example</button></div><button id="boundaryPointsPreview" type="button" class="wide">Preview points</button></details>`);
  $('#boundaryPoints').value=boundaryPointsExample;
  function clearBoundaryImport(message=''){
    svgCandidates=[];$('#svgApply').disabled=true;$('#svgOutline').innerHTML='';$('#svgPreview').textContent='';$('#svgNotice').textContent=message;
  }
  function showBoundaryCandidates(message){
    $('#svgOutline').innerHTML=svgCandidates.map((c,i)=>'<option value="'+i+'">'+esc(c.name)+'</option>').join('');$('#svgOutline').value='0';
    const site=model.boundaries.find(b=>!b.groupId),p=boundaryImportType==='JSON'?svgCandidates[0].points:site?.points||svgCandidates[0].points;
    $('#svgWidth').value=Math.max(...p.map(v=>v.x))-Math.min(...p.map(v=>v.x));$('#svgX').value=Math.min(...p.map(v=>v.x));$('#svgY').value=Math.min(...p.map(v=>v.y));
    $('#svgNotice').textContent=message;previewSvgBoundary();
  }
  $('#boundaryPoints').oninput=()=>clearBoundaryImport('Points changed. Preview again before applying.');
  $('#boundaryPointsPreview').onclick=()=>{
    clearBoundaryImport();
    try{
      const source=$('#boundaryPoints').value.trim().replace(/^\uFEFF/,'');
      if(!source)throw Error('Enter boundary points or load an example first.');
      if(source.length>3e6)throw Error('Use less than 3 MB of point data.');
      let value;try{value=JSON.parse(source);}catch(e){throw Error('Invalid JSON. Use the "points" object with named "x" and "y" values. Click Load X / Y example for a complete sample. Use colons (:), double quotes and no trailing commas.');}
      svgCandidates=E.jsonBoundaryCandidates(value);boundaryImportType='JSON';
      showBoundaryCandidates('Pasted points · '+svgCandidates.length+' outlines. Coordinates preserved in feet unless you change width or X/Y below.');
    }catch(e){clearBoundaryImport(e.message);}
  };
  $('#boundaryPointsCurrent').onclick=()=>{
    const site=model.boundaries.find(b=>!b.groupId);
    if(!site){clearBoundaryImport('No site boundary yet. Enter points or load the example.');return;}
    $('#boundaryPoints').value=JSON.stringify({points:site.points},null,2);$('#boundaryPoints').oninput();
  };
  $('#boundaryPointsExample').onclick=()=>{
    $('#boundaryPoints').value=boundaryPointsExample;$('#boundaryPoints').oninput();
  };
  function svgImportPoints(){
    const item=svgCandidates[Number($('#svgOutline').value)];if(!item)throw Error('Choose an SVG or JSON outline first.');
    const width=Number($('#svgWidth').value),x=Number($('#svgX').value),y=Number($('#svgY').value);
    if(!Number.isFinite(width)||width<=0||width>10000||![x,y].every(v=>Number.isFinite(v)&&Math.abs(v)<1e5))throw Error('Enter a positive width up to 10,000 ft and valid X/Y coordinates.');
    const minX=Math.min(...item.points.map(p=>p.x)),minY=Math.min(...item.points.map(p=>p.y)),span=Math.max(...item.points.map(p=>p.x))-minX;
    return item.points.map(p=>({x:x+(p.x-minX)*width/span,y:y+(p.y-minY)*width/span}));
  }
  function previewSvgBoundary(){
    try{const points=svgImportPoints(),xs=points.map(p=>p.x),ys=points.map(p=>p.y),w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);
      const roomConflicts=model.rooms.filter(r=>!G.contains(G.polygon(r),points)).length,corridorConflicts=model.corridors.filter(c=>!G.contains(G.polygon(c),points)).length;
      $('#svgPreview').innerHTML='<svg viewBox="'+(Math.min(...xs)-w*.05)+' '+(Math.min(...ys)-h*.05)+' '+w*1.1+' '+h*1.1+'" width="100%" height="150" aria-label="Imported boundary preview"><polygon points="'+points.map(p=>p.x+','+p.y).join(' ')+'" fill="#edf5f8" stroke="#235bb7" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>';
      $('#svgApply').disabled=false;
    }catch(e){$('#svgPreview').textContent=e.message;$('#svgApply').disabled=true;}
  }
  $('#svgChoose').onclick=()=>$('#svgFile').click();
  $('#svgFile').onchange=async event=>{
    const file=event.target.files?.[0];if(!file)return;clearBoundaryImport();
    try{
      if(file.size>3e6)throw Error('Choose an SVG or JSON smaller than 3 MB.');
      const source=(await file.text()).replace(/^\uFEFF/,'');boundaryImportType=/\.json$/i.test(file.name)||/^\s*[\[{]/.test(source)?'JSON':'SVG';
      let skipped=0;
      if(boundaryImportType==='JSON')svgCandidates=E.jsonBoundaryCandidates(JSON.parse(source));
      else{
      if(/<!DOCTYPE|<!ENTITY/i.test(source))throw Error('SVG document declarations/entities are not supported.');
      const doc=new DOMParser().parseFromString(source,'image/svg+xml');if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')throw Error('Invalid SVG file.');
      for(const node of doc.querySelectorAll('polygon,rect,path')){
        try{
          for(let n=node;n&&n!==doc;n=n.parentNode){if(n.nodeType===1&&(n.hasAttribute('transform')||n.hasAttribute('clip-path')||n.hasAttribute('mask')||/(?:transform|clip-path|mask|\bd)\s*:/i.test(n.getAttribute('style')||'')||['defs','symbol','clipPath','mask'].includes(n.localName)||n!==doc.documentElement&&n.localName==='svg'))throw Error('Flatten transforms and remove clipping first.');}
          let data=node.getAttribute('d');
          if(node.localName==='polygon')data='M '+node.getAttribute('points')+' Z';
          if(node.localName==='rect'){if(node.hasAttribute('rx')||node.hasAttribute('ry'))throw Error('Rounded rectangles are unsupported.');const x=Number(node.getAttribute('x')||0),y=Number(node.getAttribute('y')||0),w=Number(node.getAttribute('width')),h=Number(node.getAttribute('height'));if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)throw Error('Invalid rectangle.');data=`M ${x} ${y} h ${w} v ${h} h ${-w} Z`;}
          svgCandidates.push({name:(node.getAttribute('id')||node.localName)+' · '+(svgCandidates.length+1),points:E.svgStraightPath(data)});
        }catch(e){skipped++;}
        if(svgCandidates.length>=100)break;
      }
      if(!svgCandidates.length)throw Error('No supported outline found. Export a closed polygon or straight M/L/H/V/Z path; flatten transforms, styles and clipping. Curves and compound paths are not supported.');
      }
      showBoundaryCandidates(file.name+' · '+svgCandidates.length+' outlines available'+(skipped?' · '+skipped+' unsupported shapes skipped.':''));
    }catch(e){clearBoundaryImport(e.message);}
    event.target.value='';
  };
  for(const id of ['svgOutline','svgWidth','svgX','svgY']){$('#'+id).onchange=previewSvgBoundary;$('#'+id).oninput=previewSvgBoundary;}
  $('#svgOutline').onchange=()=>{if(boundaryImportType==='JSON'&&svgCandidates[Number($('#svgOutline').value)]){const p=svgCandidates[Number($('#svgOutline').value)].points;$('#svgWidth').value=Math.max(...p.map(v=>v.x))-Math.min(...p.map(v=>v.x));$('#svgX').value=Math.min(...p.map(v=>v.x));$('#svgY').value=Math.min(...p.map(v=>v.y));}previewSvgBoundary();};
  $('#svgApply').onclick=()=>{try{
    const points=svgImportPoints(),only=$('#svgMode').value==='study';checkpoint();
    if(only){model=defaultModel();selected.clear();selectedWall=selectedDoor=activeGroup=activeCorridor=null;}
    const old=model.boundaries.find(b=>!b.groupId);model.boundaries=model.boundaries.filter(b=>b.groupId).concat({id:old?.id||model.nextId++,name:'Imported '+boundaryImportType+' boundary',groupId:null,points});
    model.settings.boundaryReview=!groupValid(model.rooms,model.boundaries,model.corridors);delete model.boundaryLabels;
    model.reference={title:only?boundaryImportType+' boundary-only study':'Layout with '+boundaryImportType+' boundary',note:'Imported boundary scaled in feet. Room positions and geometry are unchanged. Any crossing spaces are marked red for review; import does not automatically refit rooms.'};
    drawing=drag=preview=wallPreview=doorPlacement=null;render();fit();status(boundaryImportType+' boundary applied. Undo restores the previous plan; Save keeps this version.');
  }catch(e){status(e.message);}};
  function editExclusion(patch){
    const site=model.boundaries.find(b=>!b.groupId);if(!site)return;
    const next=E.setCornerExclusion(site,patch);
    if(!next){renderExclusionControls();status('Use positive dimensions that fit the lower-right rectangular corner.');return;}
    const boundaries=model.boundaries.map(b=>b.id===site.id?next:b);
    if(!groupValid(model.rooms,boundaries,model.corridors)){renderExclusionControls();status('That exclusion intersects a room or corridor. Move those spaces first; nothing was changed.');return;}
    checkpoint();model.boundaries=boundaries;render();status(next.exclusion.enabled?'Lower-right exclusion: '+fmt(next.exclusion.width)+' × '+fmt(next.exclusion.height)+' ft.':'Exclusion off. The full lower-right area is available.');
  }
  function syncSettings(){$('#wallStyle').value=model.settings.wallStyle;$('#defaultThickness').value=model.settings.thickness;$('#exteriorThickness').value=model.settings.exteriorThickness??12;$('#boundarySnap').checked=model.settings.boundarySnap;$('#roomSnap').checked=model.settings.roomSnap;$('#solidWallSnap').value=model.settings.solidWallSnap||'middle';$('#snapDistance').value=model.settings.margin;}
  $('#solidWallSnap').onchange=e=>{if(!['middle','outer','inner'].includes(e.target.value))return;checkpoint();model.settings.solidWallSnap=e.target.value;render();status('Solid wall snap: '+e.target.selectedOptions[0].textContent+'.');};
  [['#exteriorThickness','exteriorThickness'],['#defaultThickness','thickness'],['#boundarySnap','boundarySnap'],['#roomSnap','roomSnap'],['#snapDistance','margin']].forEach(([id,key])=>$(id).onchange=e=>{const value=e.target.type==='checkbox'?e.target.checked:Number(e.target.value);if(typeof value==='number'&&(!Number.isFinite(value)||value<0||(['thickness','exteriorThickness'].includes(key)&&(value<1||value>36)))){syncSettings();return;}checkpoint();model.settings[key]=value;render();});
  $('#wallStyle').onchange=e=>{checkpoint();model.settings.wallStyle=e.target.value;draw();};
  $('#corridorWidth').closest?.('label')?.insertAdjacentHTML('beforebegin','<label>New route type<select id="corridorPurpose"><option value="patient">Patient care / OR patient access · 8 ft</option><option value="staff">Staff / service access · 6 ft</option></select></label>');
  if($('#corridorPurpose'))$('#corridorPurpose').onchange=()=>{$('#corridorWidth').value=$('#corridorPurpose').value==='staff'?6:8;};
  $('#drawCorridor').onclick=()=>beginCorridor();
  $('#zoom').oninput=e=>{view.zoom=Number(e.target.value);draw();};$('#zoomOut').onclick=()=>{view.zoom=Math.max(.5,view.zoom/1.2);draw();};$('#zoomIn').onclick=()=>{view.zoom=Math.min(35,view.zoom*1.2);draw();};$('#fit').onclick=fit;
  function download(name,contents,type){const url=URL.createObjectURL(new Blob([contents],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('#exportCsv').onclick=()=>{try{download('testfit-light-room-program.csv',exportProgramCsv(),'text/csv;charset=utf-8');status('CSV exported.');}catch(error){status('Program CSV export failed: '+error.message);}};
  $('#exportDxf').onclick=()=>{try{const preserveXY=false;download('testfit-light-centerlines.dxf',window.LightCad.exportDxf(model,{preserveXY}),'application/dxf');status('CAD centerlines exported · 1 unit = 1 foot · '+(preserveXY?'saved X/Y preserved.':'Y reversed to match the displayed plan.'));}catch(error){status('CAD export failed: '+error.message);}};
  $('#save').onclick=()=>{download('testfit-light.json',JSON.stringify(model,null,2),'application/json');status('Editable project saved.');};$('#open').onclick=()=>$('#file').click();
  function validateFile(value){
    if(value?.schema!=='testfit-light'||!Array.isArray(value.rooms)||!Array.isArray(value.groups)||!Array.isArray(value.boundaries)||value.rooms.length>300||value.groups.length>100||value.boundaries.length>100)throw Error('Choose a TestFit Light project (up to 300 rooms and 100 boundaries).');
    const next=defaultModel(),ids=new Set();next.settings={...next.settings,...value.settings};next.settings.thickness=Math.max(1,Math.min(36,Number(next.settings.thickness)||6));next.settings.exteriorThickness=Math.max(1,Math.min(36,Number(next.settings.exteriorThickness)||12));next.settings.margin=Math.max(.1,Math.min(10,Number(next.settings.margin)||2));delete next.settings.grid;next.settings.wallStyle=['black','poche','hatch'].includes(next.settings.wallStyle)?next.settings.wallStyle:'poche';
    if(value.reference&&typeof value.reference==='object'){
      next.reference={title:String(value.reference.title||'Photo-based study').slice(0,96),note:String(value.reference.note||'Approximate reference plan.').slice(0,700)};
      if(['advice1','advice2','advice3','previous','points','saved','boundary','west','east','split','client1','client2','client3','client4','client5'].includes(value.reference.variant))next.reference.variant=value.reference.variant;
      if(value.reference.dimensions)next.reference.dimensions=Object.fromEntries(['overallWidth','leftDepth','topLength','rightReturn'].filter(key=>Number.isFinite(value.reference.dimensions[key])).map(key=>[key,value.reference.dimensions[key]]));
      const exclusion=value.reference.excludedCorner;
      if(exclusion&&['x','y','width','height','area'].every(key=>Number.isFinite(exclusion[key])))next.reference.excludedCorner=Object.fromEntries(['x','y','width','height','area'].map(key=>[key,exclusion[key]]));
    }
    if(Array.isArray(value.boundaryLabels))next.boundaryLabels=value.boundaryLabels.slice(0,100).map(s=>String(s).slice(0,120));
    const cleanId=id=>{if(!Number.isSafeInteger(id)||id<1||id>1e9||ids.has(id))throw Error('Invalid or duplicated project IDs.');ids.add(id);return id;};
    next.groups=value.groups.map(g=>({id:cleanId(g.id),name:String(g.name||'Group').slice(0,48),alignment:g.alignment==='bottom'?'bottom':null,color:/^#[0-9a-f]{6}$/i.test(g.color)?g.color:'#3675c8'}));
    next.rooms=value.rooms.map(r=>{if(!validDimensions(r)||!['rect','l','custom'].includes(r.shape)||!G.validBoundaryFit(r))throw Error('Invalid room geometry or boundary fit.');const id=cleanId(r.id);return {...r,id,type:'room',shortLabel:String(r.shortLabel||'').slice(0,48),name:String(r.name||'Room').slice(0,48),angle:G.normalize(r.angle),boundaryFit:r.boundaryFit?{side:r.boundaryFit.side,...(r.boundaryFit.manual===true?{manual:true}:{}),...(r.boundaryFit.sides?{sides:[...r.boundaryFit.sides]}:{}),points:r.boundaryFit.points.map(p=>({x:p.x,y:p.y}))}:null,number:String(r.number??'').slice(0,32),color:/^#[0-9a-f]{6}$/i.test(r.color)?r.color:'#ffffff',locked:!!r.locked,groupId:next.groups.some(g=>g.id===r.groupId)?r.groupId:null,walls:Array.from({length:r.shape==='custom'?r.boundaryFit.points.length:r.shape==='l'?6:4},(_,i)=>sanitizeWall(r.walls?.[i],next.settings.thickness))};});
    next.boundaries=value.boundaries.map(b=>{const id=cleanId(b.id);if(!Array.isArray(b.points)||b.points.length>100||!b.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))||!G.simple(b.points))throw Error('Invalid boundary polygon.');if(b.groupId&&!next.groups.some(g=>g.id===b.groupId))throw Error('Unknown boundary group.');const clean={id,name:String(b.name||'Boundary').slice(0,64),groupId:b.groupId||null,points:b.points.map(p=>({x:p.x,y:p.y}))};if(b.noAccessFaces!==undefined){if(!Array.isArray(b.noAccessFaces)||b.noAccessFaces.some(f=>!['left','bottom','right','top'].includes(f)))throw Error('Invalid facade restriction.');clean.noAccessFaces=[...new Set(b.noAccessFaces)];}if(b.exclusion){const e=b.exclusion;if(b.groupId||typeof e.enabled!=='boolean'||!Array.isArray(e.basePoints)||e.basePoints.length>100||!e.basePoints.every(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)))throw Error('Invalid corner exclusion.');const rebuilt=E.setCornerExclusion({...clean,exclusion:e},{});if(!rebuilt||rebuilt.points.length!==clean.points.length||rebuilt.points.some((p,i)=>G.distance(p,clean.points[i])>1e-5))throw Error('Exclusion does not match the boundary.');clean.exclusion=rebuilt.exclusion;}return clean;});
    if(value.corridors!==undefined&&(!Array.isArray(value.corridors)||value.corridors.length>100))throw Error('Use at most 100 corridor paths.');
    next.corridors=(value.corridors||[]).map(c=>{
      const id=cleanId(c.id),points=Array.isArray(c.points)?c.points.map(p=>({x:p?.x,y:p?.y})):[],poly=G.corridorPolygon(points,c.width);
      if(!G.simple(poly))throw Error('Invalid corridor path or width.');
      if(c.outline&&(!Array.isArray(c.outline)||c.outline.length>100||!c.outline.every(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&Math.abs(p.x)<1e6&&Math.abs(p.y)<1e6)||!G.simple(c.outline)))throw Error('Invalid edited corridor outline.');
      return {id,type:'corridor',name:String(c.name||'Corridor').slice(0,48),width:c.width,...(c.outline?{outline:c.outline.map(p=>({x:p.x,y:p.y}))}:{}),drawMode:c.drawMode==='free'?'free':points.slice(1).every((p,i)=>Math.abs(p.x-points[i].x)<G.EPS||Math.abs(p.y-points[i].y)<G.EPS)?'ortho':'free',points,walls:(c.outline||poly).map((_,i)=>sanitizeWall(c.walls?.[i]||{kind:i===points.length-1||i===poly.length-1?'opening':'wall'},next.settings.thickness))};
    });
    if(new Set(next.boundaries.map(b=>b.groupId)).size!==next.boundaries.length)throw Error('Only one boundary per group and one site boundary are supported.');
    // Layout conflicts are repairable, not malformed file data. Retain every
    // valid entity exactly where it was saved and flag it instead of rejecting.
    next.settings.solidWallSnap=['middle','outer','inner'].includes(value.settings?.solidWallSnap)?value.settings.solidWallSnap:'middle';
    next.settings.boundaryReview=!groupValid(next.rooms,next.boundaries,next.corridors,next.settings);
    if(value.doors!==undefined&&(!Array.isArray(value.doors)||value.doors.length>1500))throw Error('Use at most 1,500 hosted doors.');
    next.doors=(value.doors||[]).map(d=>{
      const id=cleanId(d.id),host=next.rooms.concat(next.corridors).find(e=>e.id===d.hostId);
      if(!host||!Number.isInteger(d.side)||!G.edges(G.polygon(host))[d.side]||!Number.isFinite(d.width)||d.width<.5||d.width>12||!Number.isFinite(d.position)||d.position<0||d.position>1)throw Error('Invalid hosted door or missing host wall.');
      return {id,hostId:host.id,side:d.side,width:d.width,position:d.position,...(d.leaves===2?{leaves:2}:{}),...(['patient-in','patient-out','entry','patient','exterior-service','staff','nurse','public','admin','processing','clean','exterior'].includes(d.access)?{access:d.access}:{}),hinge:d.hinge==='end'?'end':'start',swing:d.swing===-1?-1:1};
    });
    if(value.columns!==undefined&&(!Array.isArray(value.columns)||value.columns.length>500))throw Error('Use at most 500 columns.');
    next.columns=(value.columns||[]).map(c=>{if(!validColumn(c))throw Error('Invalid column coordinates or dimensions.');return {id:cleanId(c.id),name:String(c.name||'Column').slice(0,32),x:c.x,y:c.y,width:c.width,depth:c.depth,enabled:c.enabled!==false};});
    if(value.portals!==undefined&&(!Array.isArray(value.portals)||value.portals.length>20))throw Error('Use at most 20 entrance/discharge markers.');
    next.portals=(value.portals||[]).map(p=>{if(!['entry','discharge'].includes(p.kind)||![p.x,p.y,p.clearWidth].every(Number.isFinite)||Math.abs(p.x)>1e6||Math.abs(p.y)>1e6||p.clearWidth<=0||p.clearWidth>100)throw Error('Invalid patient access marker.');return {name:String(p.name||p.kind).slice(0,48),kind:p.kind,x:p.x,y:p.y,clearWidth:p.clearWidth};});
    next.settings.columnsEnabled=value.settings?.columnsEnabled!==false;next.settings.columnSnap=value.settings?.columnSnap!==false;
    next.settings.columnSnapMode=value.settings?.columnSnapMode==='center'?'center':'face';
    next.nextId=Math.max(0,...ids)+1;next.revision=Math.max(1,...next.rooms.concat(next.corridors).flatMap(r=>r.walls.flatMap(w=>[w.revision,...w.segments.map(s=>s.revision)])))+1;return H.migrate(next);
  }
  function sanitizeWall(w={},thickness=6){const spec={kind:['wall','door','curtain','opening','window'].includes(w.kind)?w.kind:'wall',thickness:Math.max(1,Math.min(36,Number(w.thickness)||thickness)),face:w.face==='interior'?'interior':'exterior',doorWidth:Math.max(.5,Math.min(12,Number(w.doorWidth)||3)),position:Math.max(0,Math.min(1,Number.isFinite(w.position)?w.position:.5)),hinge:w.hinge==='end'?'end':'start',swing:w.swing===-1?-1:1,revision:Math.max(0,Math.min(1e6,Number(w.revision)||0)),segments:[]};spec.segments=(Array.isArray(w.segments)?w.segments:[]).slice(-200).map(e=>{const part=sanitizeWall({...e,segments:[]},thickness);delete part.segments;return {...part,from:Math.max(0,Math.min(1,Number(e.from)||0)),to:Math.max(0,Math.min(1,Number(e.to)||1))};});return spec;}
  $('#file').onchange=async event=>{try{const file=event.target.files[0];if(!file)return;if(file.size>3e6)throw Error('Project file is too large.');const next=validateFile(JSON.parse(await file.text()));checkpoint();model=next;selected.clear();activeCorridor=activeGroup=selectedWall=selectedDoor=null;isolatedRoom=wallExtension=selectedCorridorSide=null;doorPlacement=drawing=stoppedDrawing=drag=preview=wallPreview=null;syncSettings();render();fit();status(model.settings.boundaryReview?'Project opened with layout conflicts. Nothing moved or removed. Drag rooms into a clear spot; select corridors and drag their edges to refit. Red outlines mark conflicts.':'Project opened.');}catch(error){status('Could not open: '+error.message);}event.target.value='';};
  $('#export').onclick=()=>{try{download('testfit-light-wall-centerlines.svg',window.LightCad.exportWallSvg(model),'image/svg+xml');status('SVG wall centerlines + door leaves and swings exported · no fills, curtains, labels or reference edges · 1 model unit = 1 foot. Check a known length after Rhino import.');}catch(error){status('SVG export failed: '+error.message);}};
  $('#blank').onclick=()=>{checkpoint();model=defaultModel();selected.clear();activeCorridor=selectedWall=selectedDoor=activeGroup=null;isolatedRoom=wallExtension=selectedCorridorSide=null;doorPlacement=drawing=stoppedDrawing=drag=preview=wallPreview=null;syncSettings();render();fit();status('Blank project. Create a room or draw a boundary. Undo restores your previous plan.');};$('#sample').onclick=()=>{checkpoint();sample();syncSettings();};
  let initialSize=true;new ResizeObserver(()=>{const rect=$('#drawing').getBoundingClientRect();size={width:rect.width,height:rect.height};plan.setAttribute('viewBox',`0 0 ${size.width} ${size.height}`);if(initialSize){initialSize=false;fit();}else draw();}).observe($('#drawing'));
  sample();syncSettings();requestAnimationFrame(fit);
  // Small, optional agent interface; ordinary browsers do not need WebMCP.
  const context=document.modelContext,lifecycle=new AbortController();
  if(context?.registerTool){
    const register=tool=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
    register({name:'read_testfit_light_plan',description:'Read rooms, groups and boundaries in this TestFit Light plan.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>copy(model)});
    register({name:'create_testfit_light_room',description:'Create a straight-sided room in a free position inside the active boundary.',inputSchema:{type:'object',properties:{name:{type:'string'},width:{type:'number',minimum:2,maximum:500},depth:{type:'number',minimum:2,maximum:500},angle:{type:'number'},shape:{enum:['rect','l']}},required:['name','width','depth'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>{const v={name:String(input.name||'').trim().slice(0,48),width:input.width,depth:input.depth,angle:input.angle??0,shape:input.shape??'rect'};if(!v.name||!validDimensions({...v,x:0,y:0})||!['rect','l'].includes(v.shape))throw Error('Invalid room name or dimensions.');const room=addRoom(v);if(!room)throw Error('No clear position inside the boundary.');return {id:room.id,name:room.name,area:G.area(G.polygon(room))};}});
    window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  }
})();
