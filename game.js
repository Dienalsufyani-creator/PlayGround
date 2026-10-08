import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ============================================================
   DETROIT DRIFT 313 — Hajwala-style, but Motor City
   Downtown Detroit map • 2026 Big-Three cars • 313 Radio
   ============================================================ */

export const CARS = [
  { id:'mustang', name:'2026 Ford Mustang GTD', year:'2026', desc:'5.2L Supercharged • 815 HP', color:'#e10600',
    top: 88, accel: 26, grip: 7.5, drift: 1.15, body:'muscle' },
  { id:'charger', name:'2026 Dodge Charger Daytona', year:'2026', desc:'Scat Pack EV • 670 HP', color:'#00c2ff',
    top: 84, accel: 30, grip: 6.2, drift: 1.45, body:'sedan' },
  { id:'corvette', name:'2026 Corvette ZR1X', year:'2026', desc:'Twin-Turbo V8 Hybrid • 1250 HP', color:'#ffb300',
    top: 98, accel: 32, grip: 9.0, drift: 0.95, body:'super' },
  { id:'escalade', name:'2026 Cadillac Escalade IQ', year:'2026', desc:'Electric Full-Size • 750 HP', color:'#111111',
    top: 72, accel: 22, grip: 6.8, drift: 1.1, body:'suv' },
  { id:'hummer', name:'2026 GMC Hummer EV 3X', year:'2026', desc:'CrabWalk • 1000 HP', color:'#4caf50',
    top: 70, accel: 28, grip: 5.6, drift: 1.35, body:'truck' },
  { id:'bronco', name:'2026 Ford Bronco Raptor', year:'2026', desc:'3.0L TT V6 • 418 HP', color:'#ff6a00',
    top: 74, accel: 24, grip: 6.0, drift: 1.25, body:'suv2' },
];

export const TRACKS = [
  { name:'8 MILE BOOM BAP', insp:'Eminem • D12 style', sub:'Original 90 BPM boom-bap beat', bpm:90,  root:45, scale:[0,3,5,7,10], drums:'boom' },
  { name:'WOODWARD TRAP', insp:'Tee Grizzley • 42 Dugg style', sub:'Original 140 BPM trap beat', bpm:140, root:41.2, scale:[0,3,5,7,10,11], drums:'trap' },
  { name:'MOTOR CITY SOUL', insp:'Big Sean • Royce da 5\'9 style', sub:'Original 95 BPM soul beat', bpm:95,  root:49, scale:[0,2,3,7,9], drums:'soul' },
  { name:'BELLE ISLE DRILL', insp:'Sada Baby • Icewear Vezzo style', sub:'Original 142 BPM drill beat', bpm:142, root:38.9, scale:[0,1,5,6,10], drums:'drill' },
  { name:'CONEY BOUNCE', insp:'Kash Doll • Dej Loaf style', sub:'Original 102 BPM bounce', bpm:102, root:51.9, scale:[0,4,5,7,11], drums:'bounce' },
  { name:'TECHNO CITY 313', insp:'Detroit Techno tribute', sub:'Original 128 BPM techno', bpm:128, root:43.6, scale:[0,3,7,10], drums:'techno' },
];

export const ZONES = [
  { id:'downtown', name:'Downtown / Campus Martius', desc:'Tight blocks around Woodward & Michigan. Best for technical slides.', spawn:[0, 110] },
  { id:'woodward', name:'Woodward Strip', desc:'Long wide straight — pure Hajwala high-speed drifting.', spawn:[0, 300] },
  { id:'eight', name:'8 Mile Rd', desc:'Legendary dividing line. Wide road, traffic, neon.', spawn:[120, -548] },
  { id:'bridge', name:'Ambassador Bridge Run', desc:'Bridge approach + riverfront sweepers.', spawn:[-280, -110] },
];

const $ = s => document.querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;

// ---------- Audio ----------
let AC=null, masterGain=null, musicGain=null, engineNodes=null;
function audio(){ if(!AC){ AC=new (window.AudioContext||window.webkitAudioContext)(); masterGain=AC.createGain(); masterGain.gain.value=.8; masterGain.connect(AC.destination); musicGain=AC.createGain(); musicGain.gain.value=.5; musicGain.connect(masterGain);} if(AC.state==='suspended')AC.resume(); return AC; }

function startEngine(){
  audio(); stopEngine();
  const o=AC.createOscillator(), o2=AC.createOscillator(), g=AC.createGain(), f=AC.createBiquadFilter();
  o.type='sawtooth'; o2.type='square'; f.type='lowpass'; f.frequency.value=900; g.gain.value=.05;
  o.connect(f); o2.connect(f); f.connect(g); g.connect(masterGain); o.start(); o2.start();
  engineNodes={o,o2,g,f};
}
function stopEngine(){ if(engineNodes){try{engineNodes.o.stop();engineNodes.o2.stop();}catch{} engineNodes=null;} }
function engineUpdate(speed01, throttle){
  if(!engineNodes)return; const t=AC.currentTime;
  const rpm=60+speed01*220+throttle*40;
  engineNodes.o.frequency.setTargetAtTime(rpm,t,.05);
  engineNodes.o2.frequency.setTargetAtTime(rpm*1.5+3,t,.05);
  engineNodes.f.frequency.setTargetAtTime(500+speed01*2500,t,.1);
  engineNodes.g.gain.setTargetAtTime(.03+throttle*.05+speed01*.04,t,.1);
}
function skidAudioOn(){ if(!AC||skidSrc)return; const len=AC.sampleRate*1, buf=AC.createBuffer(1,len,AC.sampleRate), d=buf.getChannelData(0);
  for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*.5;
  skidSrc=AC.createBufferSource(); skidSrc.buffer=buf; skidSrc.loop=true;
  const f=AC.createBiquadFilter(); f.type='bandpass'; f.frequency.value=900; f.Q.value=2;
  skidGain=AC.createGain(); skidGain.gain.value=0; skidSrc.connect(f); f.connect(skidGain); skidGain.connect(masterGain); skidSrc.start();
}
let skidSrc=null, skidGain=null;
function skidAudio(intensity){ audio(); skidAudioOn(); if(skidGain)skidGain.gain.setTargetAtTime(clamp(intensity,0,1)*.14,AC.currentTime,.06); }

// --- 313 Radio: procedural sequencer (original beats, no samples) ---
const Radio={ idx:0, playing:false, timer:null, step:0, nextT:0,
  play(i){ audio(); if(i!==undefined)this.idx=i; this.stop(false); this.playing=true; this.step=0; this.nextT=AC.currentTime+.1; this.sched(); uiRadio(); },
  stop(update=true){ this.playing=false; if(this.timer){clearInterval(this.timer);this.timer=null;} if(update)uiRadio(); },
  toggle(){ this.playing?this.stop():this.play(true); }, next(){ this.play((this.idx+1)%TRACKS.length); }, prev(){ this.play((this.idx-1+TRACKS.length)%TRACKS.length); },
  sched(){ this.timer=setInterval(()=>{
    if(!this.playing)return;
    const tr=TRACKS[this.idx], spb=60/tr.bpm/2; // 8th notes
    while(this.nextT<AC.currentTime+.25){ this.hit(this.step,tr,this.nextT); this.step=(this.step+1)%32; this.nextT+=spb; }
  },60); },
  tone(freq,t,dur,type='sine',vol=.2,slide=0){ const o=AC.createOscillator(),g=AC.createGain(); o.type=type;o.frequency.setValueAtTime(freq,t);
    if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,freq+slide),t+dur);
    g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.001,t+dur);
    o.connect(g);g.connect(musicGain); o.start(t);o.stop(t+dur+.02); },
  noise(t,dur,vol,hp=1500){ const len=Math.floor(AC.sampleRate*dur),b=AC.createBuffer(1,len,AC.sampleRate),d=b.getChannelData(0);
    for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
    const s=AC.createBufferSource();s.buffer=b;const f=AC.createBiquadFilter();f.type='highpass';f.frequency.value=hp;
    const g=AC.createGain();g.gain.value=vol;s.connect(f);f.connect(g);g.connect(musicGain);s.start(t); },
  kick(t,v=.5){ this.tone(150,t,.22,'sine',v,-110); }, snare(t,v=.3){ this.noise(t,.14,v,900); this.tone(190,t,.1,'triangle',v*.6); },
  hat(t,v=.12,open=false){ this.noise(t,open?.28:.05,v,7000); },
  bass(freq,t,dur,v=.28){ this.tone(freq,t,dur,'sawtooth',v); this.tone(freq/2,t,dur,'sine',v); },
  hit(s,tr,t){ const m=s%16, bar=Math.floor(s/16);
    const N=n=>440*Math.pow(2,(tr.root-69+n)/12);
    if(tr.drums==='boom'){ if(m===0||m===7||m===10)this.kick(t); if(m===4||m===12)this.snare(t); if(m%2===0)this.hat(t,.07); if(m===14)this.hat(t,.1,true);
      if(m===0)this.bass(N(tr.scale[0]),t,.4); if(m===7)this.bass(N(tr.scale[2]),t,.3); if(m===10)this.bass(N(tr.scale[3]),t,.35);
      if(m%4===2)this.tone(N(tr.scale[(bar+m)%tr.scale.length])*4,t,.18,'triangle',.05);
    } else if(tr.drums==='trap'||tr.drums==='drill'){ const roll=(m%4===3);
      if(m===0||m===6||(tr.drums==='drill'&&m===9))this.kick(t,.55);
      if(m===8)this.snare(t,.35); if(tr.drums==='drill'&&m===11)this.snare(t,.2);
      this.hat(t,roll?.16:.07); if(roll){this.hat(t+.06,.1);this.hat(t+.12,.08);}
      if(m===0||m===5||m===10)this.bass(N(0)/2,t,.5,.32);
      if(bar===1&&m%2===0)this.tone(N(tr.scale[m%tr.scale.length])*8,t,.12,'square',.03);
    } else if(tr.drums==='soul'||tr.drums==='bounce'){ if(m===0||m===10)this.kick(t,.45); if(m===4||m===12)this.snare(t,.3);
      if(m%2===1)this.hat(t,.06); if(m===0||m===8)this.bass(N(tr.scale[0]),t,.5,.26); if(m===6)this.bass(N(tr.scale[2]),t,.3,.24);
      const mel=[0,2,4,2,3,4,2,0]; if(m%2===0)this.tone(N(mel[(m/2)|0]%5+ (tr.scale.length>0?tr.scale[(m/2)%tr.scale.length]:0))*2,t,.22,'triangle',.07);
    } else { if(m%4===0)this.kick(t,.55); if(m%4===2)this.hat(t,.12,true); this.hat(t,.06);
      if(m===4||m===12)this.snare(t,.18); this.bass(N([0,0,3,5][bar%4]||0)/2,t,.22,.26);
      if(m%2===0)this.tone(N(tr.scale[m%tr.scale.length])*8,t,.1,'sawtooth',.04);
    }
  }
};
function uiRadio(){
  const tr=TRACKS[Radio.idx];
  const rh=$('#rh-t'), ra=$('#ra'), bp=$('#rb-play');
  if(rh)rh.textContent=(Radio.playing?'▶ ':'⏸ ')+tr.name;
  if(ra)ra.textContent=tr.insp+' • '+tr.sub;
  if(bp)bp.textContent=Radio.playing?'⏸':'▶';
  document.querySelectorAll('.track').forEach((el,i)=>el.classList.toggle('active',i===Radio.idx));
  const viz=$('#viz'); if(viz&&!viz.children.length){ for(let i=0;i<24;i++){const b=document.createElement('i');viz.appendChild(b);} }
}

// ---------- Three setup ----------
let renderer, scene, camera, clock, sunLight, hemiLight, sky, stars, moonSpr;
let composer=null, bloomPass=null, usePost=true;
let envTex=null, waterTex=null, lampHeadMat=null, signalGreenMats=[];
let quality='high', autoQTuned=false, fpsAcc=0, fpsN=0;
let player, playerMesh, wheels={f:[],r:[]}, headlight, underglow;
let traffic=[], cops=[], lamps=[];
let smokePool=[], smokeIdx=0, skids=[], snow=null, snowOn=false, night=false;
let camMode=0, camPos=new THREE.Vector3(), camLook=new THREE.Vector3();
const keys={};
let game={ state:'menu', mode:'free', zone:'downtown', carIdx:0, color:'#e10600',
  total:0, combo:0, comboT:0, best:+(localStorage.getItem('det313best')||0),
  time:120, tLeft:120, wanted:0, elapsed:0, countdown:0, nearCD:0, bankMsg:0 };

const WORLD=1400;

/* ---------- procedural PBR textures ---------- */
function canvasTex(w,h,fn,srgb=true){
  const c=document.createElement('canvas');c.width=w;c.height=h;fn(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  if(srgb)t.colorSpace=THREE.SRGBColorSpace;
  t.anisotropy=4;
  return t;
}
function noiseOver(g,w,h,n,alpha,light){
  for(let i=0;i<n;i++){
    const v=Math.random();
    g.fillStyle=light?`rgba(255,255,255,${v*alpha})`:`rgba(0,0,0,${v*alpha})`;
    g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1+Math.random()*2);
  }
}
let ASPHALT=null, CONCRETE=null, GRASS=null;
let FACADES=[];
let GLOWTEX=null, SMOKETEX=null, PLATETEX=null;
function makeTextures(){
  ASPHALT=canvasTex(256,256,(g,w,h)=>{
    g.fillStyle='#2c313b';g.fillRect(0,0,w,h);
    noiseOver(g,w,h,5200,.16,false); noiseOver(g,w,h,2600,.07,true);
    g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=1;
    for(let i=0;i<5;i++){g.beginPath();let x=Math.random()*w,y=Math.random()*h;g.moveTo(x,y);
      for(let k=0;k<5;k++){x+=(Math.random()-.5)*60;y+=(Math.random()-.5)*60;g.lineTo(x,y);}g.stroke();}
  });
  CONCRETE=canvasTex(256,256,(g,w,h)=>{
    g.fillStyle='#434a55';g.fillRect(0,0,w,h);
    noiseOver(g,w,h,3600,.12,false); noiseOver(g,w,h,1800,.06,true);
    g.strokeStyle='rgba(0,0,0,.4)';g.lineWidth=2;
    for(let x=0;x<=w;x+=64){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}
    g.beginPath();g.moveTo(0,h/2);g.lineTo(w,h/2);g.stroke();
  });
  GRASS=canvasTex(256,256,(g,w,h)=>{
    g.fillStyle='#2c5c34';g.fillRect(0,0,w,h);
    for(let i=0;i<4200;i++){g.fillStyle=`rgba(${30+Math.random()*40|0},${100+Math.random()*60|0},${40+Math.random()*30|0},.5)`;
      g.fillRect(Math.random()*w,Math.random()*h,2,2+Math.random()*3);}
  });
  waterTex=canvasTex(256,256,(g,w,h)=>{
    g.fillStyle='#0b2c49';g.fillRect(0,0,w,h);
    for(let i=0;i<46;i++){const y=Math.random()*h;
      g.strokeStyle=`rgba(140,190,230,${.05+Math.random()*.12})`;g.lineWidth=1+Math.random()*2;
      g.beginPath();for(let x=0;x<=w;x+=8)g.lineTo(x,y+Math.sin(x*.1+i)*3);g.stroke();}
  });
  waterTex.repeat.set(24,3);
  const styles=[
    {base:'#4d3d33',win:'#10141c',lit:['#ffd98a','#ffe9b8','#cfe4ff'],glass:false}, // brick
    {base:'#5c636e',win:'#0e131b',lit:['#ffdf9e','#d8ecff','#fff3cf'],glass:false}, // concrete
    {base:'#2b3f55',win:'#0c1626',lit:['#bfe0ff','#9fd0ff','#e8f4ff'],glass:true},  // glass tower
    {base:'#232b38',win:'#0b0f16',lit:['#ffc46b','#d9e8ff','#fff0c0'],glass:false}, // dark steel
  ];
  FACADES=styles.map(s=>{
    const map=canvasTex(128,256,(g,w,h)=>{
      g.fillStyle=s.base;g.fillRect(0,0,w,h);
      noiseOver(g,w,h,900,.1,false);
      if(s.glass){const gr=g.createLinearGradient(0,0,w,0);
        gr.addColorStop(0,'rgba(255,255,255,.14)');gr.addColorStop(.5,'rgba(255,255,255,0)');gr.addColorStop(1,'rgba(0,0,0,.25)');
        g.fillStyle=gr;g.fillRect(0,0,w,h);}
      for(let y=10;y<h-8;y+=18)for(let x=8;x<w-8;x+=16){
        g.fillStyle=s.win;g.fillRect(x,y,11,10);
        if(s.glass){g.fillStyle='rgba(160,200,235,.25)';g.fillRect(x,y,11,3);}
      }
    });
    const glow=canvasTex(128,256,(g,w,h)=>{
      g.fillStyle='#000';g.fillRect(0,0,w,h);
      for(let y=10;y<h-8;y+=18)for(let x=8;x<w-8;x+=16){
        if(Math.random()<.42){g.fillStyle=s.lit[Math.random()*s.lit.length|0];g.fillRect(x,y,11,10);}
      }
    });
    return {map,glow,glass:s.glass};
  });
  GLOWTEX=canvasTex(128,128,(g,w,h)=>{
    const gr=g.createRadialGradient(64,64,2,64,64,62);
    gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.35,'rgba(255,255,255,.5)');gr.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=gr;g.fillRect(0,0,w,h);
  });
  SMOKETEX=canvasTex(128,128,(g)=>{
    g.clearRect(0,0,128,128);
    for(let i=0;i<26;i++){const x=34+Math.random()*60,y=34+Math.random()*60,r=8+Math.random()*20;
      const gr=g.createRadialGradient(x,y,1,x,y,r);
      gr.addColorStop(0,'rgba(255,255,255,.32)');gr.addColorStop(1,'rgba(255,255,255,0)');
      g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,7);g.fill();}
  });
  PLATETEX=canvasTex(128,32,(g,w,h)=>{
    g.fillStyle='#e9edf2';g.fillRect(0,0,w,h);
    g.fillStyle='#123a7d';g.fillRect(0,0,w,7);
    g.fillStyle='#0a1a33';g.font='bold 17px Arial';g.textAlign='center';g.textBaseline='middle';
    g.fillText('313 • DET',w/2,h/2+3);
  });
}
function facadeMat(si,w,h){
  const F=FACADES[si%FACADES.length];
  const map=F.map.clone(), glow=F.glow.clone();
  map.repeat.set(Math.max(1,Math.round(w/16)),Math.max(1,Math.round(h/22)));
  glow.repeat.copy(map.repeat);
  map.needsUpdate=glow.needsUpdate=true;
  return new THREE.MeshStandardMaterial({map,emissive:0xffffff,emissiveMap:glow,
    emissiveIntensity:night?.9:.12,roughness:F.glass?.28:.9,metalness:F.glass?.75:.05,
    envMap:envTex,envMapIntensity:F.glass?.9:.18});
}
let winTex=null;

let waterMesh=null;
const beacons=[], clouds=[];
function blinkBeacons(){
  const t=performance.now()/1000;
  for(const b of beacons){ const on=Math.sin(t*2.2+b.ph)>0;
    b.m.emissiveIntensity=on?4:.3; b.g.opacity=on?.9:.05; }
}
function driftClouds(dt){
  for(const c of clouds){ c.position.x+=dt*c.userData.v;
    if(c.position.x>1500)c.position.x=-1500; }
}
function buildCity(){
  makeTextures();
  winTex=FACADES[1].glow;
  // ground — weathered concrete base
  const gndTex=CONCRETE.clone(); gndTex.repeat.set(90,90); gndTex.needsUpdate=true;
  const gnd=new THREE.Mesh(new THREE.PlaneGeometry(WORLD*2,WORLD*2),
    new THREE.MeshStandardMaterial({map:gndTex,color:0x8f96a3,roughness:.96}));
  gnd.rotation.x=-Math.PI/2; gnd.receiveShadow=true; scene.add(gnd);
  // Detroit River — animated reflective water
  waterMesh=new THREE.Mesh(new THREE.PlaneGeometry(WORLD*2,230),
    new THREE.MeshStandardMaterial({map:waterTex,color:0x9fc4e0,roughness:.12,metalness:.85,
      envMap:envTex,envMapIntensity:1.1,transparent:true,opacity:.96}));
  waterMesh.rotation.x=-Math.PI/2; waterMesh.position.set(0,.06,765); scene.add(waterMesh);
  // riverwalk embankment
  const walkTex=CONCRETE.clone(); walkTex.repeat.set(60,2); walkTex.needsUpdate=true;
  const walk=new THREE.Mesh(new THREE.BoxGeometry(WORLD*2,2,16),
    new THREE.MeshStandardMaterial({map:walkTex,color:0xa8aeb8,roughness:.9}));
  walk.position.set(0,1,642); walk.receiveShadow=true; walk.castShadow=true; scene.add(walk);
  // roads
  const lineMat=new THREE.MeshStandardMaterial({color:0xc9a200,roughness:.6});
  const edgeMat=new THREE.MeshStandardMaterial({color:0xd7dce2,roughness:.6});
  const crossMat=new THREE.MeshStandardMaterial({color:0xe4e8ee,roughness:.7});
  function road(x,z,w,l){
    const tex=ASPHALT.clone(); tex.repeat.set(Math.max(1,w/9),Math.max(1,l/9)); tex.needsUpdate=true;
    const r=new THREE.Mesh(new THREE.PlaneGeometry(w,l),
      new THREE.MeshStandardMaterial({map:tex,roughness:.94}));
    r.rotation.x=-Math.PI/2; r.position.set(x,.1,z); r.receiveShadow=true; scene.add(r);
    const n=Math.floor(l/24);
    for(let i=0;i<n;i++){ const d=new THREE.Mesh(new THREE.PlaneGeometry(.55,3.4),lineMat);
      d.rotation.x=-Math.PI/2; d.position.set(x,.13,z-l/2+12+i*24); scene.add(d); }
    [-1,1].forEach(s=>{ const e=new THREE.Mesh(new THREE.PlaneGeometry(.5,l),edgeMat);
      e.rotation.x=-Math.PI/2; e.position.set(x+s*(w/2-.8),.12,z); scene.add(e); });
  }
  function roadH(x,z,w,l){
    const tex=ASPHALT.clone(); tex.repeat.set(Math.max(1,w/9),Math.max(1,l/9)); tex.needsUpdate=true;
    const r=new THREE.Mesh(new THREE.PlaneGeometry(w,l),
      new THREE.MeshStandardMaterial({map:tex,roughness:.94}));
    r.rotation.x=-Math.PI/2; r.position.set(x,.1,z); r.receiveShadow=true; scene.add(r);
    const n=Math.floor(w/24);
    for(let i=0;i<n;i++){ const d=new THREE.Mesh(new THREE.PlaneGeometry(3.4,.55),lineMat);
      d.rotation.x=-Math.PI/2; d.position.set(x-w/2+12+i*24,.13,z); scene.add(d); }
    [-1,1].forEach(s=>{ const e=new THREE.Mesh(new THREE.PlaneGeometry(w,.5),edgeMat);
      e.rotation.x=-Math.PI/2; e.position.set(x,.12,z+s*(l/2-.8)); scene.add(e); });
  }
  function crosswalk(x,z,horiz,n=8){
    for(let i=0;i<n;i++){ const s=new THREE.Mesh(new THREE.PlaneGeometry(horiz?2.2:7,horiz?7:2.2),crossMat);
      s.rotation.x=-Math.PI/2;
      s.position.set(horiz?x-14+i*4:x,.14,horiz?z:z-14+i*4); scene.add(s); }
  }
  function sidewalk(x,z,w,l){
    const tex=CONCRETE.clone(); tex.repeat.set(w/7,l/7); tex.needsUpdate=true;
    const s=new THREE.Mesh(new THREE.BoxGeometry(w,.5,l),
      new THREE.MeshStandardMaterial({map:tex,color:0xb9bfc9,roughness:.92}));
    s.position.set(x,.25,z); s.receiveShadow=true; s.castShadow=true; scene.add(s);
  }
  // Woodward = main N-S + flanking sidewalks
  road(0,-60,34,1500);
  sidewalk(-23,-60,10,1500); sidewalk(23,-60,10,1500);
  // cross streets
  roadH(0,40,900,26); roadH(0,-120,1000,24); roadH(0,-300,1100,24); roadH(60,-560,1200,30); roadH(-260,-140,700,22);
  // N-S secondary
  road(-180,-160,20,1100); road(180,-160,20,1100); road(-420,-160,20,900); road(420,-160,20,900);
  // crosswalks on Woodward intersections
  [40,-120,-300].forEach(z=>{crosswalk(-9,z,true);crosswalk(9,z,true);});
  crosswalk(0,-548,false,10);
  // buildings grid (skip road corridors) — textured facades + rooftops
  const bGeo=new THREE.BoxGeometry(1,1,1);
  let count=0, si=0;
  for(let gx=-5;gx<=5;gx++)for(let gz=-6;gz<=3;gz++){
    const bx=gx*110+(gx%2?14:-14), bz=gz*110-160;
    if(Math.abs(bx)<52)continue; if(Math.abs(bz-40)<44&&Math.abs(bx)<480)continue;
    if(Math.abs(bz+120)<40&&Math.abs(bx)<520)continue; if(Math.abs(bz+300)<40)continue; if(Math.abs(bz+560)<44)continue;
    if(bz>500)continue;
    if(Math.random()<.16)continue; // surface lots
    const w=34+Math.random()*40, d=34+Math.random()*40;
    const tall=Math.hypot(bx,bz+60)<260;
    const h=tall?90+Math.random()*130:18+Math.random()*70;
    const m=new THREE.Mesh(bGeo,facadeMat(si++,w,h));
    m.scale.set(w,h,d); m.position.set(bx,h/2,bz);
    m.castShadow=true; m.receiveShadow=true; scene.add(m); lamps.push(m); count++;
    // wedding-cake setbacks on towers
    let topY=h, topW=w, topD=d;
    if(h>95){
      const t2h=h*.3, t2w=w*.66, t2d=d*.66;
      const t2=new THREE.Mesh(bGeo,facadeMat(si++,t2w,t2h));
      t2.scale.set(t2w,t2h,t2d); t2.position.set(bx,h+t2h/2,bz);
      t2.castShadow=true; t2.receiveShadow=true; scene.add(t2); lamps.push(t2);
      topY=h+t2h; topW=t2w; topD=t2d;
      if(h>130){
        const t3h=h*.18, t3w=t2w*.62, t3d=t2d*.62;
        const t3=new THREE.Mesh(bGeo,facadeMat(si++,t3w,t3h));
        t3.scale.set(t3w,t3h,t3d); t3.position.set(bx,h+t2h+t3h/2,bz);
        t3.castShadow=true; scene.add(t3); lamps.push(t3);
        topY=h+t2h+t3h; topW=t3w; topD=t3d;
      }
    }
    const cap=new THREE.Mesh(bGeo,new THREE.MeshStandardMaterial({color:0x2a2f38,roughness:.9}));
    cap.scale.set(topW+1,1.6,topD+1); cap.position.set(bx,topY+.8,bz); cap.castShadow=true; scene.add(cap);
    for(let k=0;k<3;k++){ if(Math.random()<.6){ const ac=new THREE.Mesh(bGeo,
        new THREE.MeshStandardMaterial({color:0x9aa1ab,roughness:.7,metalness:.4}));
      const aw=2+Math.random()*3; ac.scale.set(aw,1.6+Math.random(),aw);
      ac.position.set(bx+(Math.random()-.5)*(topW-8),topY+2,bz+(Math.random()-.5)*(topD-8));
      ac.castShadow=true; scene.add(ac); } }
    if(topY>105){ // FAA obstruction beacon
      const bm2=new THREE.Mesh(new THREE.SphereGeometry(1.4,8,6),
        new THREE.MeshStandardMaterial({color:0x220000,emissive:0xff0000,emissiveIntensity:3}));
      bm2.position.set(bx,topY+5,bz); scene.add(bm2);
      const bg=glowSprite(0xff2222,9,.8); bg.position.set(bx,topY+5,bz); scene.add(bg);
      beacons.push({m:bm2.material,g:bg.material,ph:Math.random()*6});
    }
    if(count>170)break;
  }
  parkingLots();
  landmarks(); streetlights(); props(); cityDressing(); windsor();
}
function cityDressing(){
  // billboards with local flavor
  function billboard(x,z,ry,l0,l1,fg='#ffb300'){
    const tex=canvasTex(256,128,(g,w,h)=>{
      g.fillStyle='#0d1526';g.fillRect(0,0,w,h);
      g.strokeStyle=fg;g.lineWidth=6;g.strokeRect(5,5,w-10,h-10);
      g.fillStyle=fg;g.textAlign='center';g.font='bold 30px Arial';
      g.fillText(l0,w/2,l1?54:74);
      if(l1){g.fillStyle='#fff';g.font='bold 23px Arial';g.fillText(l1,w/2,94);}
    });
    const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=ry;
    const poleM=new THREE.MeshStandardMaterial({color:0x2a2f36,roughness:.6,metalness:.5});
    [-6,6].forEach(off=>{const p=new THREE.Mesh(new THREE.CylinderGeometry(.5,.6,13,8),poleM);
      p.position.set(off,6.5,0);p.castShadow=true;g.add(p);});
    const panel=new THREE.Mesh(new THREE.BoxGeometry(17,8.5,.6),
      new THREE.MeshStandardMaterial({map:tex,emissive:0xffffff,emissiveMap:tex,
        emissiveIntensity:night?.75:.15,roughness:.6,userData:{d:.15,n:.75}}));
    panel.position.y=17;panel.castShadow=true;g.add(panel);
    scene.add(g);
  }
  billboard(-42,-460,0,'DETROIT','VS EVERYBODY');
  billboard(44,220,Math.PI,'CONEY ISLAND','CHILI • FRIES • SHAKES','#ff5a5a');
  billboard(-300,-40,Math.PI/2,'MOTOWN','HITS-VILLE U.S.A.','#7db4ff');
  // green street-name signs
  function streetsign(x,z,text){
    const tex=canvasTex(256,40,(g,w,h)=>{
      g.fillStyle='#0a6e2e';g.fillRect(0,0,w,h);
      g.strokeStyle='#fff';g.lineWidth=3;g.strokeRect(2,2,w-4,h-4);
      g.fillStyle='#fff';g.textAlign='center';g.font='bold 24px Arial';g.textBaseline='middle';
      g.fillText(text,w/2,h/2+1);
    });
    const g=new THREE.Group();g.position.set(x,0,z);
    const p=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,9,6),
      new THREE.MeshStandardMaterial({color:0x3a4048,roughness:.5,metalness:.6}));
    p.position.y=4.5;p.castShadow=true;g.add(p);
    const plate=new THREE.Mesh(new THREE.BoxGeometry(7,1.1,.15),
      new THREE.MeshStandardMaterial({map:tex,roughness:.5}));
    plate.position.y=8.4;g.add(plate);
    const plate2=plate.clone();plate2.rotation.y=Math.PI;plate2.position.y=8.4;g.add(plate2);
    scene.add(g);
  }
  streetsign(14,52,'WOODWARD AVE');
  streetsign(-14,-108,'MICHIGAN AVE');
  streetsign(48,-548,'8 MILE RD');
  streetsign(-248,-128,'BRIDGE TO CANADA');
  // drifting clouds
  for(let i=0;i<12;i++){
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:SMOKETEX,color:0xffffff,transparent:true,
      opacity:.5+Math.random()*.25,depthWrite:false}));
    const sc=280+Math.random()*220;
    s.scale.set(sc,sc*.45,1);
    s.position.set((Math.random()-.5)*2600,430+Math.random()*220,(Math.random()-.5)*2600);
    s.userData={v:3+Math.random()*5,o:s.material.opacity};
    scene.add(s); clouds.push(s);
  }
  // rain puddles + manhole covers on Woodward
  const pudM=new THREE.MeshStandardMaterial({color:0x11161c,roughness:.05,metalness:.9,
    envMap:envTex,envMapIntensity:1,transparent:true,opacity:.85});
  [[-9,-40],[8,-190],[-7,-350],[9,180],[-10,330],[6,-520]].forEach(([x,z])=>{
    const p=new THREE.Mesh(new THREE.PlaneGeometry(7+Math.random()*5,4+Math.random()*3),pudM);
    p.rotation.x=-Math.PI/2;p.rotation.z=Math.random()*3;p.position.set(x,.115,z);scene.add(p); });
  const mhM=new THREE.MeshStandardMaterial({color:0x14161a,roughness:.8});
  for(let z=-600;z<380;z+=130){ const m=new THREE.Mesh(new THREE.CircleGeometry(1.1,16),mhM);
    m.rotation.x=-Math.PI/2;m.position.set((z/130)%2?4:-4,.12,z);scene.add(m); }
}
function parkingLots(){
  const stallMat=new THREE.MeshStandardMaterial({color:0xd7dce2,roughness:.7});
  [[-80,120],[95,-200],[200,120]].forEach(([x,z])=>{
    const tex=ASPHALT.clone(); tex.repeat.set(6,4); tex.needsUpdate=true;
    const lot=new THREE.Mesh(new THREE.PlaneGeometry(70,44),
      new THREE.MeshStandardMaterial({map:tex,roughness:.95}));
    lot.rotation.x=-Math.PI/2; lot.position.set(x,.11,z); lot.receiveShadow=true; scene.add(lot);
    for(let i=0;i<9;i++){ const s=new THREE.Mesh(new THREE.PlaneGeometry(.4,9),stallMat);
      s.rotation.x=-Math.PI/2; s.position.set(x-32+i*8,.13,z); scene.add(s); }
  });
}
function landmarks(){
  // Renaissance Center — glass cylinders EAST of Woodward so the strip stays open
  const grp=new THREE.Group(); grp.position.set(110,0,-60);
  const glassMat=new THREE.MeshPhysicalMaterial({color:0x8fb8d8,roughness:.12,metalness:.85,
    envMap:envTex,envMapIntensity:1.2,emissive:0xbfe0ff,emissiveMap:winTex,emissiveIntensity:.35,
    clearcoat:1,clearcoatRoughness:.1,userData:{d:.35,n:1.2}});
  const center=new THREE.Mesh(new THREE.CylinderGeometry(28,28,220,24),glassMat); center.position.y=110; center.castShadow=true; grp.add(center);
  for(let i=0;i<6;i++){ const a=i/6*Math.PI*2; const c=new THREE.Mesh(new THREE.CylinderGeometry(13,13,130,18),glassMat);
    c.position.set(Math.cos(a)*42,65,Math.sin(a)*42); c.castShadow=true; grp.add(c); }
  const podium=new THREE.Mesh(new THREE.BoxGeometry(150,14,110),
    new THREE.MeshStandardMaterial({map:CONCRETE,color:0xb9bfc9,roughness:.85}));
  podium.position.y=7; podium.castShadow=true; podium.receiveShadow=true; grp.add(podium);
  scene.add(grp);
  label('GM RENAISSANCE CENTER',110,235,-60,0xffb300);
  // Michigan Central — brick facade
  const mc=new THREE.Mesh(new THREE.BoxGeometry(90,60,30),facadeMat(0,90,60));
  mc.position.set(-260,30,-260); mc.castShadow=true; mc.receiveShadow=true; scene.add(mc);
  const mcRoof=new THREE.Mesh(new THREE.BoxGeometry(92,3,32),new THREE.MeshStandardMaterial({color:0x2a2f38,roughness:.9}));
  mcRoof.position.set(-260,61,-260); mcRoof.castShadow=true; scene.add(mcRoof);
  label('MICHIGAN CENTRAL',-260,78,-260,0xffffff);
  // Ambassador Bridge towers + cables + lit deck
  const bm=new THREE.MeshStandardMaterial({color:0x8e2f2f,roughness:.55,metalness:.3});
  [-340,-220].forEach(x=>{ const t=new THREE.Mesh(new THREE.BoxGeometry(10,110,10),bm); t.position.set(x,55,-140); t.castShadow=true; scene.add(t); });
  const deck=new THREE.Mesh(new THREE.BoxGeometry(170,5,24),new THREE.MeshStandardMaterial({map:ASPHALT,color:0xffffff,roughness:.9}));
  deck.position.set(-280,22,-140); deck.castShadow=true; scene.add(deck);
  const cableMat=new THREE.LineBasicMaterial({color:0xdddddd,transparent:true,opacity:.7});
  [-11,11].forEach(off=>{ const pts=[];
    for(let i=0;i<=20;i++){ const x=-360+i*8; const sag=Math.pow((i-10)/10,2)*38; pts.push(new THREE.Vector3(x,96-sag,-140+off)); }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),cableMat)); });
  for(let x=-350;x<=-210;x+=20){ const dot=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOWTEX,color:0xffe9a8,transparent:true,opacity:.9,depthWrite:false}));
    dot.scale.set(3,3,1); dot.position.set(x,28,-140+11); scene.add(dot); }
  label('AMBASSADOR BRIDGE',-280,130,-140,0xff5555);
  // 8 Mile sign — real gantry
  const gantryM=new THREE.MeshStandardMaterial({color:0x3a4048,roughness:.6,metalness:.6});
  [-14,14].forEach(off=>{ const post=new THREE.Mesh(new THREE.BoxGeometry(1.4,17,1.4),gantryM);
    post.position.set(60+off,8.5,-560); post.castShadow=true; scene.add(post); });
  const beam=new THREE.Mesh(new THREE.BoxGeometry(32,2.4,.8),gantryM); beam.position.set(60,16.5,-560); beam.castShadow=true; scene.add(beam);
  label('8 MILE RD',60,26,-560,0x00c2ff);
  // Campus Martius park — grass + fountain
  const grassTex=GRASS.clone(); grassTex.repeat.set(8,8); grassTex.needsUpdate=true;
  const park=new THREE.Mesh(new THREE.CylinderGeometry(34,34,1.2,28),
    new THREE.MeshStandardMaterial({map:grassTex,roughness:1}));
  park.position.set(90,.6,40); park.receiveShadow=true; scene.add(park);
  const fountain=new THREE.Mesh(new THREE.CylinderGeometry(6,7,2.4,18),
    new THREE.MeshStandardMaterial({color:0x9aa4ae,roughness:.4,metalness:.5}));
  fountain.position.set(90,1.6,40); fountain.castShadow=true; scene.add(fountain);
  const jet=new THREE.Mesh(new THREE.CylinderGeometry(.5,3,7,10),
    new THREE.MeshStandardMaterial({color:0xbfe0ff,transparent:true,opacity:.55,roughness:.1,metalness:.2}));
  jet.position.set(90,6,40); scene.add(jet);
  label('CAMPUS MARTIUS',90,20,40,0x7dff9a);
  // Joe Louis Fist — bronze monument
  const bronze=new THREE.MeshStandardMaterial({color:0x3d3227,roughness:.45,metalness:.85,envMap:envTex,envMapIntensity:.7});
  const arm=new THREE.Mesh(new THREE.CylinderGeometry(4,6,42,12),bronze); arm.position.set(-90,21,80); arm.rotation.z=.6; arm.castShadow=true; scene.add(arm);
  const fist=new THREE.Mesh(new THREE.SphereGeometry(9,14,12),bronze); fist.position.set(-105,44,80); fist.scale.set(1,1.25,.95); fist.castShadow=true; scene.add(fist);
  const knuckles=new THREE.Mesh(new THREE.BoxGeometry(11,4,8),bronze); knuckles.position.set(-105,50,80); knuckles.castShadow=true; scene.add(knuckles);
  const plinth=new THREE.Mesh(new THREE.BoxGeometry(16,3,16),new THREE.MeshStandardMaterial({color:0xb9bfc9,roughness:.85}));
  plinth.position.set(-90,1.5,80); plinth.castShadow=true; plinth.receiveShadow=true; scene.add(plinth);
  label('THE FIST',-104,62,80,0xffffff);
  // Spirit of Detroit-ish tower: Penobscot
  const pen=new THREE.Mesh(new THREE.BoxGeometry(40,170,40),facadeMat(3,40,170));
  pen.position.set(-70,85,-5); pen.castShadow=true; pen.receiveShadow=true; scene.add(pen); label('PENOBSCOT',-70,180,-5,0xffd27a);
}
function label(text,x,y,z,color=0xffffff){
  const c=document.createElement('canvas');c.width=512;c.height=64;const g=c.getContext('2d');
  g.fillStyle='rgba(0,0,0,.55)';g.fillRect(0,0,512,64);g.fillStyle='#fff';g.font='bold 34px Arial';g.textAlign='center';g.textBaseline='middle';
  g.fillText(text,256,34);
  const t=new THREE.CanvasTexture(c);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false}));
  s.scale.set(90,11,1); s.position.set(x,y,z); scene.add(s);
}
function streetlights(){
  const poleG=new THREE.CylinderGeometry(.45,.65,14,8), headG=new THREE.SphereGeometry(1,10,8);
  const poleM=new THREE.MeshStandardMaterial({color:0x1c2129,roughness:.55,metalness:.6});
  lampHeadMat=new THREE.MeshStandardMaterial({color:0x444444,emissive:0xffdf9e,emissiveIntensity:night?3.4:.25});
  function lamp(x,z){
    const g=new THREE.Group(); g.position.set(x,0,z);
    const p=new THREE.Mesh(poleG,poleM); p.position.y=7; p.castShadow=true; g.add(p);
    const armM=new THREE.Mesh(new THREE.CylinderGeometry(.28,.28,4,6),poleM);
    armM.rotation.z=Math.PI/2; armM.position.y=13.8; g.add(armM);
    const h=new THREE.Mesh(headG,lampHeadMat); h.position.set(1.8,13.6,0); g.add(h);
    const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOWTEX,color:0xffdf9e,transparent:true,opacity:night?.75:.12,depthWrite:false}));
    halo.scale.set(7,7,1); halo.position.copy(h.position); g.add(halo); halo.userData.isHalo=true; g.userData.halo=halo;
    scene.add(g); return g;
  }
  window.__lamps=[];
  for(let z=-640;z<420;z+=80)for(const x of[-22,22]) window.__lamps.push(lamp(x,z));
  for(let x=-560;x<=640;x+=80){ if(Math.abs(x)<32)continue; if(Math.abs(Math.abs(x)-180)<16)continue; if(Math.abs(Math.abs(x)-420)<16)continue;
    for(const z of[24,56,-134,-106]) window.__lamps.push(lamp(x,z));
  }
}
function props(){
  // traffic signals at Woodward intersections
  const poleM=new THREE.MeshStandardMaterial({color:0x22262c,roughness:.5,metalness:.65});
  const boxM=new THREE.MeshStandardMaterial({color:0x0c0e12,roughness:.6});
  [40,-120,-300].forEach(z=>{
    [-1,1].forEach(s=>{
      const g=new THREE.Group(); g.position.set(s*21,0,z+8);
      const p=new THREE.Mesh(new THREE.CylinderGeometry(.4,.5,11,8),poleM); p.position.y=5.5; p.castShadow=true; g.add(p);
      const arm=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,7,6),poleM); arm.rotation.z=Math.PI/2; arm.position.set(-s*3,10.4,0); g.add(arm);
      const head=new THREE.Mesh(new THREE.BoxGeometry(1.4,3.6,1.2),boxM); head.position.set(-s*6,9.4,0); g.add(head);
      const cols=[0xff2222,0xffb300,0x22ff66];
      cols.forEach((c,i)=>{
        const on=(i===2)||(night&&i===0);
        const bulb=new THREE.Mesh(new THREE.SphereGeometry(.42,10,8),
          new THREE.MeshStandardMaterial({color:0x111111,emissive:c,emissiveIntensity:on?2.6:.06}));
        bulb.position.set(-s*6,10.4-i*1.1,.65); g.add(bulb);
        if(c===0x22ff66)signalGreenMats.push(bulb.material);
      });
      scene.add(g);
    });
  });
  // street trees — Woodward sidewalks + park
  const trunkM=new THREE.MeshStandardMaterial({color:0x4a3a28,roughness:1});
  const leafM=new THREE.MeshStandardMaterial({color:0x2f6b35,roughness:1});
  const leafM2=new THREE.MeshStandardMaterial({color:0x3f8040,roughness:1});
  function tree(x,z,s=1){
    const g=new THREE.Group(); g.position.set(x,0,z);
    const t=new THREE.Mesh(new THREE.CylinderGeometry(.5*s,.8*s,5*s,7),trunkM); t.position.y=2.5*s; t.castShadow=true; g.add(t);
    const f1=new THREE.Mesh(new THREE.IcosahedronGeometry(3.4*s,1),leafM); f1.position.y=7*s; f1.castShadow=true; g.add(f1);
    const f2=new THREE.Mesh(new THREE.IcosahedronGeometry(2.3*s,1),leafM2); f2.position.set(1.4*s,8.6*s,.8*s); f2.castShadow=true; g.add(f2);
    const f3=new THREE.Mesh(new THREE.IcosahedronGeometry(1.8*s,1),leafM); f3.position.set(-1.6*s,8*s,-1*s); f3.castShadow=true; g.add(f3);
    g.rotation.y=Math.random()*6; scene.add(g);
  }
  for(let z=-620;z<400;z+=64){ if(Math.abs(z-40)<26||Math.abs(z+120)<24||Math.abs(z+300)<24)continue;
    tree(-30,z,.8+Math.random()*.4); tree(30,z,.8+Math.random()*.4); }
  for(let i=0;i<10;i++){ const a=i/10*Math.PI*2; tree(90+Math.cos(a)*26,40+Math.sin(a)*26,.9+Math.random()*.5); }
  tree(60,120,1.1); tree(-70,-30,1); tree(150,-140,1.2);
  // fire hydrants + bus stop flavor
  const hydM=new THREE.MeshStandardMaterial({color:0xc22a1e,roughness:.5});
  [[-20,90],[20,-60],[-20,-220]].forEach(([x,z])=>{
    const hyd=new THREE.Mesh(new THREE.CylinderGeometry(.5,.6,1.4,8),hydM);
    hyd.position.set(x,.9,z); hyd.castShadow=true; scene.add(hyd);
  });
}
function windsor(){
  // across the river: Windsor skyline
  for(let i=0;i<14;i++){ const h=30+Math.random()*80;
    const b=new THREE.Mesh(new THREE.BoxGeometry(30,h,30),facadeMat((i%4),30,h));
    b.position.set(-420+i*64,h/2,880); scene.add(b); }
  label('WINDSOR, CANADA',0,110,880,0x88ccff);
  label('DETROIT RIVER',200,12,765,0x88ccff);
}

// ---------- Car mesh (PBR showroom build) ----------
/* ---------- customization store ---------- */
const DEFAULT_CUSTOM={finish:'gloss',rim:'silver',rimStyle:'sport',spoiler:'stock',neon:'#00c2ff',neonOn:true,tint:'medium',plate:'313 DET'};
let customs={};
try{customs=JSON.parse(localStorage.getItem('det313custom')||'{}');}catch{customs={};}
function getCustom(carId){
  const spec=CARS.find(c=>c.id===carId);
  return {paint:spec?spec.color:'#e10600',...DEFAULT_CUSTOM,...(customs[carId]||{})};
}
function setCustom(carId,patch){
  customs[carId]={...(customs[carId]||{}),...patch};
  try{localStorage.setItem('det313custom',JSON.stringify(customs));}catch{}
}
const RIM_COLORS={silver:0xd8dee6,black:0x15171c,gold:0xd8a920,bronze:0x8c5a2b,white:0xf2f4f6,red:0xb01010};
const TINTS={light:{c:0x33475e,r:.08},medium:{c:0x101c2a,r:.06},limo:{c:0x04070c,r:.05}};
const FINISHES={gloss:{r:.3,m:.65,cc:1,eD:1.15,eN:.35},metallic:{r:.22,m:.88,cc:1,eD:1.35,eN:.45},matte:{r:.78,m:.15,cc:0,eD:.4,eN:.15}};

function paintMaterial(color,finish='gloss'){
  const F=FINISHES[finish]||FINISHES.gloss;
  const m=new THREE.MeshPhysicalMaterial({color:new THREE.Color(color),roughness:F.r,metalness:F.m,
    clearcoat:F.cc,clearcoatRoughness:.08,envMap:envTex,envMapIntensity:F.eD});
  m.userData.eD=F.eD; m.userData.eN=F.eN; return m;
}
function glassMaterial(tint='medium'){
  const T=TINTS[tint]||TINTS.medium;
  const m=new THREE.MeshPhysicalMaterial({color:T.c,roughness:T.r,metalness:.9,
    envMap:envTex,envMapIntensity:1.5,clearcoat:1});
  m.userData.eD=1.5; m.userData.eN=.5; return m;
}
function chromeMaterial(){ const m=new THREE.MeshStandardMaterial({color:0xd8dee6,roughness:.25,metalness:1,envMap:envTex,envMapIntensity:1.2}); m.userData.eD=1.2; m.userData.eN=.45; return m; }
function rimMaterial(name){ const m=new THREE.MeshStandardMaterial({color:RIM_COLORS[name]??0xd8dee6,roughness:name==='black'?.5:.28,metalness:name==='black'?.6:1,envMap:envTex,envMapIntensity:1.1}); m.userData.eD=1.1; m.userData.eN=.4; return m; }
function trimMaterial(){ return new THREE.MeshStandardMaterial({color:0x0b0d12,roughness:.55,metalness:.35}); }
function shadowify(g){ g.traverse(o=>{ if(o.isMesh){o.castShadow=true;} }); }
function makeWheel(r,style='sport',rimName='silver'){
  // steer group -> spinner (tire + treads + rim) + static caliper
  const steer=new THREE.Group(), spin=new THREE.Group(); steer.add(spin);
  const tireM=new THREE.MeshStandardMaterial({color:0x0b0b0c,roughness:.94});
  const tire=new THREE.Mesh(new THREE.TorusGeometry(r*.66,r*.34,12,26),tireM);
  tire.rotation.y=Math.PI/2; tire.castShadow=true; spin.add(tire);
  // tread blocks make the spin readable
  const treadM=new THREE.MeshStandardMaterial({color:0x131314,roughness:.95});
  for(let i=0;i<12;i++){ const a=i/12*Math.PI*2;
    const t=new THREE.Mesh(new THREE.BoxGeometry(.4,.1,.3),treadM);
    t.position.set(0,Math.cos(a)*r*.94,Math.sin(a)*r*.94); t.rotation.x=-a; spin.add(t); }
  const disc=new THREE.Mesh(new THREE.CylinderGeometry(r*.6,r*.6,.3,14),
    new THREE.MeshStandardMaterial({color:0x777d84,roughness:.35,metalness:.85}));
  disc.rotation.z=Math.PI/2; spin.add(disc);
  const rimM=rimMaterial(rimName);
  if(style==='dish'){
    const dish=new THREE.Mesh(new THREE.CylinderGeometry(r*.8,r*.8,.36,20),rimM);
    dish.rotation.z=Math.PI/2; spin.add(dish);
  } else {
    const n=style==='star'?7:5;
    for(let i=0;i<n;i++){ const sp=new THREE.Mesh(new THREE.BoxGeometry(.38,style==='star'?.11:.16,r*1.02),rimM);
      sp.rotation.x=i/n*Math.PI*2; spin.add(sp); }
  }
  const lip=new THREE.Mesh(new THREE.TorusGeometry(r*.8,.06,8,22),rimM);
  lip.rotation.y=Math.PI/2; spin.add(lip);
  // static red caliper over the disc
  const cal=new THREE.Mesh(new THREE.BoxGeometry(.22,.34,.2),
    new THREE.MeshStandardMaterial({color:0xb01010,roughness:.4,metalness:.3}));
  cal.position.set(0,.1,-r*.42); steer.add(cal);
  steer.userData.spin=spin;
  return steer;
}
function glowSprite(color,scale,opacity=.8){
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOWTEX,color,transparent:true,opacity,depthWrite:false}));
  s.scale.set(scale,scale,1); return s;
}
const plateTexCache={};
function plateTexture(text){
  const key=(text||'313 DET').toUpperCase().slice(0,8);
  if(plateTexCache[key])return plateTexCache[key];
  const t=canvasTex(128,32,(g,w,h)=>{
    g.fillStyle='#e9edf2';g.fillRect(0,0,w,h);
    g.fillStyle='#123a7d';g.fillRect(0,0,w,7);
    g.fillStyle='#0a1a33';g.font='bold 16px Arial';g.textAlign='center';g.textBaseline='middle';
    g.fillText(key||'313 DET',w/2,h/2+3);
  });
  plateTexCache[key]=t; return t;
}
function disposeRide(){
  if(!playerMesh)return;
  playerMesh.traverse(o=>{ if(o.isMesh){ o.geometry.dispose();
    (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{ if(m.map&&m.map!==PLATETEX&&!Object.values(plateTexCache).includes(m.map))m.map.dispose?.(); m.dispose(); }); } });
}
function buildCarMesh(spec,custom){
  const C={paint:spec.color,...DEFAULT_CUSTOM,...(typeof custom==='string'?{paint:custom}:(custom||{}))};
  const grp=new THREE.Group();
  const paint=paintMaterial(C.paint,C.finish), dark=trimMaterial(), glass=glassMaterial(C.tint), chrome=chromeMaterial();
  const RB=(w,h,d,r)=>new RoundedBoxGeometry(w,h,d,3,Math.min(r,.24*Math.min(w,h,d)));
  let L=4.6,W=2,bodyH=.62,ride=.62;
  if(spec.body==='suv'||spec.body==='truck'||spec.body==='suv2'){bodyH=.95;L=5.1;ride=.78;}
  if(spec.body==='super'){bodyH=.5;L=4.5;ride=.55;}
  const tall=spec.body==='suv'||spec.body==='truck'||spec.body==='suv2';
  // lower body + sculpted hood + bumpers (soft edges)
  const body=new THREE.Mesh(RB(W,bodyH,L,.14),paint); body.position.y=ride+bodyH/2-.2; grp.add(body);
  const hood=new THREE.Mesh(RB(W*.92,bodyH*.5,L*.3,.1),paint); hood.position.set(0,body.position.y+bodyH*.55,L/2-L*.16); grp.add(hood);
  const bumpF=new THREE.Mesh(RB(W*1.0,.42,.7,.12),dark); bumpF.position.set(0,.42,L/2+.25); grp.add(bumpF);
  const bumpR=bumpF.clone(); bumpR.position.set(0,.42,-L/2-.25); grp.add(bumpR);
  // front splitter + rear diffuser with fins
  const split=new THREE.Mesh(new THREE.BoxGeometry(W*1.04,.09,.9),dark); split.position.set(0,.2,L/2+.4); grp.add(split);
  const diff=new THREE.Mesh(new THREE.BoxGeometry(W*.9,.3,.5),dark); diff.position.set(0,.3,-L/2-.35); grp.add(diff);
  for(let i=-1;i<=1;i++){ const fin=new THREE.Mesh(new THREE.BoxGeometry(.07,.3,.5),dark);
    fin.position.set(i*W*.28,.3,-L/2-.35); grp.add(fin); }
  const skirtM=new THREE.Mesh(new THREE.BoxGeometry(.14,.22,L*.62),dark);
  const sk1=skirtM.clone(); sk1.position.set(-W/2-.02,.34,0); grp.add(sk1);
  const sk2=skirtM.clone(); sk2.position.set(W/2+.02,.34,0); grp.add(sk2);
  // grille + intakes
  const grille=new THREE.Mesh(RB(W*.62,.3,.12,.04),
    new THREE.MeshStandardMaterial({color:0x05070a,roughness:.4,metalness:.6}));
  grille.position.set(0,.72,L/2+.55); grp.add(grille);
  [-1,1].forEach(s=>{ const vent=new THREE.Mesh(RB(.34,.24,.1,.04),dark);
    vent.position.set(s*(W/2-.3),.62,L/2+.55); grp.add(vent); });
  if(spec.body==='muscle'){ const scoop=new THREE.Mesh(RB(.7,.16,.9,.05),paint);
    scoop.position.set(0,body.position.y+bodyH*.62,L/2-1.1); grp.add(scoop); }
  // glasshouse + sunroof
  const cabH=tall?.78:.6, cabL=tall?L*.5:L*.4;
  const cab=new THREE.Mesh(RB(W*.8,cabH,cabL,.14),glass);
  cab.position.set(0,body.position.y+bodyH/2+cabH/2-.12,-L*.04); grp.add(cab);
  const roof=new THREE.Mesh(RB(W*.82,.09,cabL*.96,.03),paint);
  roof.position.set(0,cab.position.y+cabH/2+.02,-L*.04); grp.add(roof);
  const sun=new THREE.Mesh(new THREE.PlaneGeometry(W*.5,cabL*.5),glass);
  sun.rotation.x=-Math.PI/2; sun.position.set(0,roof.position.y+.051,-L*.04); grp.add(sun);
  // spoiler options
  const spoiler=C.spoiler||'stock';
  const wingM=new THREE.MeshStandardMaterial({color:0x0d0f14,roughness:.35,metalness:.6});
  if(spoiler==='wing'){
    const blade=new THREE.Mesh(RB(W*.95,.09,.5,.03),wingM); blade.position.set(0,cab.position.y+.62,-L/2-.25); grp.add(blade);
    [-1,1].forEach(s=>{ const up=new THREE.Mesh(new THREE.BoxGeometry(.09,.55,.3),wingM);
      up.position.set(s*W*.36,cab.position.y+.32,-L/2-.25); grp.add(up);
      const ep=new THREE.Mesh(new THREE.BoxGeometry(.06,.34,.62),wingM);
      ep.position.set(s*(W*.48),cab.position.y+.62,-L/2-.25); grp.add(ep); });
  } else if(spoiler==='lip'||(spoiler==='stock'&&(spec.body==='super'||spec.body==='muscle'||spec.body==='sedan'))){
    const sp=new THREE.Mesh(RB(W*.88,.09,.4,.03),spoiler==='lip'?wingM:paint);
    sp.position.set(0,cab.position.y+.08,-L/2-.2); grp.add(sp);
    if(spoiler!=='lip')[-1,1].forEach(s=>{ const st=new THREE.Mesh(new THREE.BoxGeometry(.1,.3,.1),dark);
      st.position.set(s*W*.32,cab.position.y-.08,-L/2-.2); grp.add(st); });
  }
  if(spec.body==='truck'){ const bed=new THREE.Mesh(RB(W*.86,.5,1.5,.06),dark);
    bed.position.set(0,body.position.y+.3,-L/2+.8); grp.add(bed); }
  // mirrors + handles + plate + exhausts
  [-1,1].forEach(s=>{
    const stalk=new THREE.Mesh(new THREE.BoxGeometry(.22,.08,.08),dark); stalk.position.set(s*(W/2+.08),cab.position.y-.1,L*.14); grp.add(stalk);
    const mir=new THREE.Mesh(new THREE.BoxGeometry(.16,.22,.3),paint); mir.position.set(s*(W/2+.2),cab.position.y-.08,L*.14); grp.add(mir);
    const hnd=new THREE.Mesh(new THREE.BoxGeometry(.04,.07,.34),chrome); hnd.position.set(s*(W/2+.01),body.position.y+.12,L*.02); grp.add(hnd);
  });
  const plate=new THREE.Mesh(new THREE.PlaneGeometry(.9,.24),
    new THREE.MeshStandardMaterial({map:plateTexture(C.plate),roughness:.5}));
  plate.position.set(0,.5,-L/2-.62); plate.rotation.y=Math.PI; grp.add(plate);
  const exM=chrome;
  const tips=spec.body==='super'?[-.75,-.35,.35,.75]:[-.55,.55];
  tips.forEach(x=>{ const ex=new THREE.Mesh(new THREE.CylinderGeometry(.09,.11,.45,10),exM);
    ex.rotation.x=Math.PI/2; ex.position.set(x,.32,-L/2-.5); grp.add(ex);
    const tip=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,.05,10),
      new THREE.MeshStandardMaterial({color:0x000000,roughness:.8}));
    tip.rotation.x=Math.PI/2; tip.position.set(x,.32,-L/2-.72); grp.add(tip); });
  // projector headlights: lens + twin projectors + glow + cones
  const hlM=new THREE.MeshStandardMaterial({color:0xdfeeff,emissive:0xd6ecff,emissiveIntensity:2.2,roughness:.12});
  const projM=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:3.4,roughness:.1});
  headCones=[];
  [-1,1].forEach(s=>{
    const h=new THREE.Mesh(RB(.52,.2,.12,.04),hlM); h.position.set(s*(W/2-.36),.82,L/2+.55); grp.add(h);
    [-.11,.11].forEach(off=>{ const pr=new THREE.Mesh(new THREE.CircleGeometry(.07,12),projM);
      pr.position.set(s*(W/2-.36)+off,.82,L/2+.615); grp.add(pr); });
    const gs=glowSprite(0xcfe6ff,.85,night?.5:.2); gs.position.set(s*(W/2-.36),.8,L/2+.62); grp.add(gs); headGlows.push(gs);
    const cone=new THREE.Mesh(new THREE.ConeGeometry(1.15,8,14,1,true),
      new THREE.MeshBasicMaterial({color:0xbdd8ff,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
    cone.rotation.x=-Math.PI/2-.04; cone.position.set(s*(W/2-.36),.85,L/2+4.5); grp.add(cone); headCones.push(cone);
  });
  // taillight bar + glow (brightens on brake)
  tailMat=new THREE.MeshStandardMaterial({color:0x330000,emissive:0xff1a1a,emissiveIntensity:2.2,roughness:.3});
  const tb=new THREE.Mesh(new THREE.BoxGeometry(W*.8,.2,.1),tailMat); tb.position.set(0,.92,-L/2-.55); grp.add(tb);
  const tg=glowSprite(0xff2222,2.2,.55); tg.position.set(0,.92,-L/2-.75); grp.add(tg); tailGlow=tg;
  // wheels
  const wr=tall?.52:.44;
  wheels={f:[],r:[]};
  const wy=wr, wx=W/2-.02, wz=L/2-1.0;
  [[-wx,wy,wz,'f'],[wx,wy,wz,'f'],[-wx,wy,-wz,'r'],[wx,wy,-wz,'r']].forEach(([x,y,z,a])=>{
    const w=makeWheel(wr,C.rimStyle,C.rim); w.position.set(x,y,z); grp.add(w);
    (a==='f'?wheels.f:wheels.r).push(w);
  });
  // soft contact shadow grounds the car + neon underglow
  const contact=new THREE.Mesh(new THREE.PlaneGeometry(W+2.4,L+3.2),
    new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.5,alphaMap:GLOWTEX,depthWrite:false}));
  contact.rotation.x=-Math.PI/2; contact.position.y=.045; grp.add(contact);
  underglow=new THREE.Mesh(new THREE.PlaneGeometry(W+1.2,L+1.2),
    new THREE.MeshBasicMaterial({color:new THREE.Color(C.neon||'#00c2ff'),transparent:true,opacity:C.neonOn?(night?.45:.15):0,depthWrite:false}));
  underglow.visible=!!C.neonOn;
  underglow.rotation.x=-Math.PI/2; underglow.position.y=.07; grp.add(underglow);
  // headlight beam
  headlight=new THREE.SpotLight(0xcfe4ff, night?2500:400, 130, .48, .55, 1.2);
  headlight.position.set(0,1.2,L/2);
  const tgt=new THREE.Object3D(); tgt.position.set(0,0,L/2+30); grp.add(tgt); headlight.target=tgt; grp.add(headlight);
  shadowify(grp);
  return grp;
}
let headCones=[], headGlows=[], tailMat=null, tailGlow=null;
function buildTrafficMesh(color){
  const g=new THREE.Group();
  const paint=paintMaterial(color), glass=glassMaterial(), dark=trimMaterial();
  const b=new THREE.Mesh(new THREE.BoxGeometry(2,.85,4.4),paint); b.position.y=.85; g.add(b);
  const c=new THREE.Mesh(new THREE.BoxGeometry(1.6,.62,2.1),glass); c.position.y=1.55; g.add(c);
  const hlM=new THREE.MeshStandardMaterial({color:0xdfeeff,emissive:0xd6ecff,emissiveIntensity:2.2});
  const tlM=new THREE.MeshStandardMaterial({color:0x330000,emissive:0xff1a1a,emissiveIntensity:1.8});
  [-1,1].forEach(s=>{
    const h=new THREE.Mesh(new THREE.BoxGeometry(.42,.2,.1),hlM); h.position.set(s*.65,.85,2.22); g.add(h);
    const t=new THREE.Mesh(new THREE.BoxGeometry(.42,.2,.1),tlM); t.position.set(s*.65,.9,-2.22); g.add(t);
    const gs=glowSprite(0xcfe6ff,.9,night?.7:.2); gs.position.set(s*.65,.85,2.4); g.add(gs);
  });
  const wg=new THREE.CylinderGeometry(.4,.4,.32,12), wm=new THREE.MeshStandardMaterial({color:0x0c0c0c,roughness:.9});
  const hubM=chromeMaterial();
  [[-1,.4,1.4],[1,.4,1.4],[-1,.4,-1.4],[1,.4,-1.4]].forEach(([x,y,z])=>{
    const w=new THREE.Mesh(wg,wm);w.rotation.z=Math.PI/2;w.position.set(x,y,z);g.add(w);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,.34,8),hubM);hub.rotation.z=Math.PI/2;hub.position.set(x,y,z);g.add(hub);});
  const plate=new THREE.Mesh(new THREE.PlaneGeometry(.8,.2),new THREE.MeshStandardMaterial({map:PLATETEX,roughness:.5}));
  plate.position.set(0,.5,-2.26); plate.rotation.y=Math.PI; g.add(plate);
  shadowify(g);
  return g;
}
function buildCopMesh(){
  const g=buildTrafficMesh(0x16233f);
  const barBase=new THREE.Mesh(new THREE.BoxGeometry(1.3,.14,.45),trimMaterial()); barBase.position.set(0,1.95,0); g.add(barBase);
  const barR=new THREE.Mesh(new THREE.BoxGeometry(.6,.24,.4),new THREE.MeshStandardMaterial({color:0x220000,emissive:0xff0000,emissiveIntensity:3}));
  barR.position.set(-.33,2.05,0); g.add(barR);
  const barB=new THREE.Mesh(new THREE.BoxGeometry(.6,.24,.4),new THREE.MeshStandardMaterial({color:0x000022,emissive:0x2244ff,emissiveIntensity:3}));
  barB.position.set(.33,2.05,0); g.add(barB);
  const gr=glowSprite(0xff0000,2.4,.8); gr.position.set(-.33,2.05,0); g.add(gr);
  const gb=glowSprite(0x3355ff,2.4,.8); gb.position.set(.33,2.05,0); g.add(gb);
  g.userData.bar=barR; g.userData.barB=barB; g.userData.glowR=gr; g.userData.glowB=gb;
  return g;
}

// ---------- Smoke / skids / snow ----------
function initParticles(){
  for(let i=0;i<160;i++){ const m=new THREE.Sprite(new THREE.SpriteMaterial({map:SMOKETEX,transparent:true,opacity:0,depthWrite:false,color:0xc9ced8}));
    m.scale.set(1,1,1); scene.add(m); smokePool.push({m,life:0}); }
}
function puff(x,y,z,big=1){
  const p=smokePool[smokeIdx++%smokePool.length]; p.life=1; p.m.position.set(x+(Math.random()-.5),y+Math.random()*.5,z+(Math.random()-.5));
  p.m.scale.set(1.5*big,1.5*big,1); p.m.material.opacity=.7;
}
function addSkid(x,z,heading){
  if(skids.length>600){const o=skids.shift();scene.remove(o);}
  const m=new THREE.Mesh(new THREE.PlaneGeometry(.5,2.2),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.55}));
  m.rotation.x=-Math.PI/2; m.rotation.z=-heading; m.position.set(x,.13,z); scene.add(m); skids.push(m);
}
function toggleSnow(on){
  snowOn=on;
  if(on&&!snow){ const n=1200,pos=new Float32Array(n*3);
    for(let i=0;i<n;i++){pos[i*3]=(Math.random()-.5)*600;pos[i*3+1]=Math.random()*120;pos[i*3+2]=(Math.random()-.5)*600;}
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3));
    snow=new THREE.Points(g,new THREE.PointsMaterial({color:0xffffff,size:.7,transparent:true,opacity:.85})); scene.add(snow);
  }
  if(snow)snow.visible=on;
}

// ---------- Game flow ----------
function resetPlayer(zoneId){
  const z=ZONES.find(z=>z.id===zoneId)||ZONES[0];
  player={ x:z.spawn[0], z:z.spawn[1], heading:Math.PI, vx:0, vz:0, steer:0 };
  if(playerMesh){playerMesh.position.set(player.x,0,player.z);playerMesh.rotation.y=player.heading;}
  camPos.set(player.x-Math.sin(player.heading)*-12,5,player.z-Math.cos(player.heading)*-12);
}
function spawnRide(){
  if(playerMesh){scene.remove(playerMesh);disposeRide();}
  const spec=CARS[game.carIdx];
  playerMesh=buildCarMesh(spec,getCustom(spec.id)); scene.add(playerMesh);
  resetPlayer(game.zone);
  if(renderer)applyEnv();
}
function refreshPreview(){
  if(!renderer||!scene)return;
  if(playerMesh){scene.remove(playerMesh);disposeRide();}
  const spec=CARS[game.carIdx];
  playerMesh=buildCarMesh(spec,getCustom(spec.id)); scene.add(playerMesh);
  const z=ZONES.find(z=>z.id===game.zone)||ZONES[0];
  player={x:z.spawn[0],z:z.spawn[1],heading:.7,vx:0,vz:0,steer:0};
  playerMesh.position.set(player.x,0,player.z); playerMesh.rotation.y=player.heading;
  if(renderer)applyEnv();
}
function spawnTraffic(){
  traffic.forEach(t=>scene.remove(t.m)); traffic=[];
  const colors=[0x888899,0x334455,0x553333,0x335533,0x999966,0x222831,0x6a6a7a,0x882222];
  const loops=[
    {x:0,z:-120,horiz:true,len:480},{x:60,z:-560,horiz:true,len:560},
    {x:-180,z:-160,horiz:false,len:520},{x:180,z:-160,horiz:false,len:520},{x:0,z:40,horiz:true,len:420},
  ];
  for(let i=0;i<9;i++){ const L=loops[i%loops.length];
    const m=buildTrafficMesh(colors[i%colors.length]); scene.add(m);
    traffic.push({m,loop:L,t:Math.random(),speed:(9+Math.random()*6)*(Math.random()<.5?1:-1)}); }
  cops.forEach(c=>scene.remove(c.m)); cops=[];
  for(let i=0;i<2;i++){ const m=buildCopMesh(); scene.add(m); cops.push({m,x:-100-i*40,z:100+i*30,vx:0,vz:0,active:false}); }
}

function startGame(){
  audio(); spawnRide(); spawnTraffic();
  game.state='playing'; game.total=0; game.combo=0; game.comboT=0; game.wanted=0; game.elapsed=0;
  game.tLeft=game.mode==='time'?120:game.mode==='chase'?180:9999;
  $('#menu').classList.add('hidden'); $('#over').classList.add('hidden'); $('#preview-bar').classList.add('hidden'); $('#hud').classList.remove('hidden');
  $('#mode-tag').textContent=game.mode==='free'?'FREE HAJWALA':game.mode==='time'?'DRIFT KING — 2:00':'COP CHASE';
  startEngine(); Radio.play(Radio.idx); showMsg(game.mode==='free'?'HAJWALA! DRIFT!':game.mode==='time'?'BEAT THE CLOCK!':'OUTRUN DPD!',2200);
  game.countdown=0;
}
function endGame(reason){
  game.state='over'; stopEngine(); skidAudio(0);
  const best=Math.max(game.best,Math.floor(game.total)); game.best=best; localStorage.setItem('det313best',best);
  $('#over-title').textContent=reason||'SESSION OVER';
  $('#o-score').textContent=Math.floor(game.total).toLocaleString();
  $('#o-best').textContent=best.toLocaleString();
  $('#o-drift').textContent=maxDrift.toFixed(1)+'°';
  $('#hud').classList.add('hidden'); $('#over').classList.remove('hidden');
}
function showMsg(t,ms=1500){ const m=$('#msg'); m.textContent=t; m.classList.add('show'); clearTimeout(m._t); m._t=setTimeout(()=>m.classList.remove('show'),ms); }

let maxDrift=0;

// ---------- Physics step ----------
function step(dt){
  const spec=CARS[game.carIdx];
  const fwdX=Math.sin(player.heading), fwdZ=Math.cos(player.heading);
  const up = keys['arrowup']||keys['w']||touch.gas, down=keys['arrowdown']||keys['s']||touch.brake;
  const left=keys['arrowleft']||keys['a']||touch.left, right=keys['arrowright']||keys['d']||touch.right;
  const hb=keys[' ']||touch.hb;
  const steerIn=(left?-1:0)+(right?1:0);
  player.steer=lerp(player.steer,steerIn,1-Math.exp(-10*dt));
  const vfx=player.vx, vfz=player.vz;
  const fSpeed=vfx*fwdX+vfz*fwdZ;
  const mph=Math.abs(fSpeed)*2.237;
  // steering authority grows with drift ("better than Hajwala": counter-steer help)
  const driftAid=hb?1.5:1.1;
  const turn=2.1*spec.drift*driftAid*clamp(Math.abs(fSpeed)/12,0,1)*(fSpeed<-.5?-1:1);
  player.heading-=player.steer*turn*dt*(hb?1.25:1);
  // engine
  const nFwdX=Math.sin(player.heading), nFwdZ=Math.cos(player.heading);
  let acc=0;
  if(up)acc+=spec.accel;
  if(down){ if(fSpeed>2)acc-=spec.accel*1.4; else acc-=spec.accel*.55; } // reverse
  const topMph=spec.top*2.237/2.237, topMs=spec.top*0.44704*1.55;
  if(fSpeed>topMs&&up)acc-= (fSpeed-topMs)*3;
  player.vx+=nFwdX*acc*dt; player.vz+=nFwdZ*acc*dt;
  // grip split: decompose into forward/lateral
  let f=(player.vx*nFwdX+player.vz*nFwdZ);
  let lx=player.vx-nFwdX*f, lz=player.vz-nFwdZ*f;
  const grip=hb?1.4:(down&&f>5?4.5:spec.grip);
  const decay=Math.exp(-grip*dt); lx*=decay; lz*=decay;
  // drag
  f*=Math.exp(-.35*dt);
  if(!up&&!down)f*=Math.exp(-.5*dt);
  player.vx=nFwdX*f+lx; player.vz=nFwdZ*f+lz;
  player.x+=player.vx*dt; player.z+=player.vz*dt;
  // world bounds (soft wall + river)
  player.x=clamp(player.x,-680,680); player.z=clamp(player.z,-700,640);
  if(player.z>640){player.z=640;player.vz*=-.4;}
  // drift metrics
  const spd=Math.hypot(player.vx,player.vz);
  const spMph=spd*2.237;
  let dAng=0;
  if(spd>4){ const dot=(player.vx*nFwdX+player.vz*nFwdZ)/spd; dAng=Math.acos(clamp(dot,-1,1))*180/Math.PI; }
  maxDrift=Math.max(maxDrift,dAng);
  const drifting=dAng>11&&spd>9;
  // smoke + skids
  if(drifting){ const bx=player.x-nFwdX*1.6, bz=player.z-nFwdZ*1.6;
    puff(bx-Math.cos(player.heading)*.9,.5,bz+Math.sin(player.heading)*.9,1+spd/30);
    puff(bx+Math.cos(player.heading)*.9,.5,bz-Math.sin(player.heading)*.9,1+spd/30);
    if(Math.random()<.8)addSkid(bx+(Math.random()-.5)*1.4,bz+(Math.random()-.5)*1.4,player.heading);
  }
  skidAudio(drifting?clamp((dAng-10)/25,0,1)*clamp(spd/25,0,1):0);
  // brake lights flare under braking / handbrake
  const braking=!!(down||hb);
  if(tailMat)tailMat.emissiveIntensity=braking?5.5:2.2;
  if(tailGlow)tailGlow.material.opacity=braking?.95:.55;
  engineUpdate(clamp(spd/50,0,1),up?1:0);
  // scoring (Hajwala style, juiced)
  game.nearCD-=dt;
  if(drifting){
    const gain=spMph*dAng*dt*.55*(game.mode==='time'?1.25:1);
    game.combo+=gain; game.comboT=2.2;
    game.wanted=clamp(game.wanted+dt*(game.mode==='chase'?3:1.1),0,5);
  } else { game.comboT-=dt; if(game.comboT<=0&&game.combo>0){ bankCombo(); } }
  if(game.combo>0&&game.comboT<=0)bankCombo();
  // near miss traffic
  for(const t of traffic){ const dx=t.m.position.x-player.x,dz=t.m.position.z-player.z,d=Math.hypot(dx,dz);
    if(d<5.5&&spMph>55&&game.nearCD<=0){ game.combo+=220; game.nearCD=1.2; showMsg('NEAR MISS +220',900); } }
  // mesh sync
  playerMesh.position.set(player.x,0,player.z); playerMesh.rotation.y=player.heading;
  const wSpin=f*dt*2.2;
  [...wheels.f,...wheels.r].forEach(w=>{ if(w.userData.spin)w.userData.spin.rotation.x+=wSpin; });
  wheels.f.forEach(w=>w.rotation.y=player.steer*.5);
  // timer / modes
  game.elapsed+=dt;
  if(game.mode!=='free'){ game.tLeft-=dt;
    if(game.tLeft<=0){ game.tLeft=0; bankCombo(true); endGame(game.mode==='chase'?'YOU SURVIVED DPD!':'TIME!'); return; } }
  if(game.mode==='chase'){ // heat decays slowly, cops active
    game.wanted=clamp(game.wanted-dt*.25,0,5);
    if(game.wanted>=5){ bankCombo(true); endGame('BUSTED BY DPD!'); return; }
  }
  // HUD
  $('#speed').innerHTML=Math.round(spMph)+'<small> MPH</small>';
  $('#total-score').textContent=Math.floor(game.total).toLocaleString();
  const cb=$('#combo');
  if(game.combo>30){ cb.textContent='DRIFT +'+Math.floor(game.combo)+'  ×'+(1+Math.floor(game.combo/1500)); cb.parentElement.style.display='block';
    cb.classList.toggle('hot',game.combo>1200); $('#drift-tag').style.display='block';
  } else { cb.parentElement.style.display='none'; $('#drift-tag').style.display='none'; if(game.combo>0&&game.comboT<.4)bankCombo(); }
  const w=Math.floor(game.wanted);
  $('#wanted').textContent=game.mode==='chase'||game.wanted>.5?'★'.repeat(w)+'☆'.repeat(5-w)+' DPD':'';
  const mm=Math.floor(Math.max(0,game.tLeft)/60), ss=Math.floor(Math.max(0,game.tLeft)%60);
  $('#timer').textContent=game.mode==='free'?'313 • DETROIT':(mm+':'+String(ss).padStart(2,'0'));
  $('#timer').style.display=game.mode==='free'?'block':'block';
}
function bankCombo(force=false){
  if(game.combo<10){game.combo=0;return;}
  const mult=1+Math.floor(game.combo/1500);
  const pts=Math.floor(game.combo*mult);
  game.total+=pts; game.combo=0; game.comboT=0;
  if(pts>400)showMsg('+'+pts.toLocaleString(),1100);
}

// ---------- AI ----------
function stepAI(dt){
  for(const t of traffic){
    t.t+=dt*t.speed/t.loop.len;
    if(t.t>1)t.t-=1; if(t.t<0)t.t+=1;
    const L=t.loop, off=(t.t<.5?6:-6);
    let x,z,hd;
    if(L.horiz){ x=L.x-L.len/2+t.t*L.len; z=L.z+off; hd=t.speed>0?Math.PI/2:-Math.PI/2; }
    else { z=L.z-L.len/2+t.t*L.len; x=L.x+off; hd=t.speed>0?0:Math.PI; }
    t.m.position.set(x,0,z); t.m.rotation.y=hd;
    // collide with player: push
    const dx=x-player.x,dz=z-player.z;
    if(Math.hypot(dx,dz)<4.2){ player.vx-=dx*3*dt; player.vz-=dz*3*dt; t.speed*=.99; }
  }
  if(game.mode==='chase'||game.wanted>1.5){
    for(const c of cops){
      const dx=player.x-c.x,dz=player.z-c.z,d=Math.hypot(dx,dz)||1;
      const sp=game.mode==='chase'?26+game.elapsed*.05:20;
      c.vx=lerp(c.vx,dx/d*sp,1-Math.exp(-1.6*dt)); c.vz=lerp(c.vz,dz/d*sp,1-Math.exp(-1.6*dt));
      c.x+=c.vx*dt; c.z+=c.vz*dt;
      c.m.position.set(c.x,0,c.z); c.m.rotation.y=Math.atan2(c.vx,c.vz);
      const ph=Math.floor(performance.now()/280)%2;
      if(c.m.userData.bar)c.m.userData.bar.material.emissiveIntensity=ph?4:.2;
      if(c.m.userData.barB)c.m.userData.barB.material.emissiveIntensity=ph?.2:4;
      if(c.m.userData.glowR)c.m.userData.glowR.material.opacity=ph?.9:.08;
      if(c.m.userData.glowB)c.m.userData.glowB.material.opacity=ph?.08:.9;
      if(d<5){ // PIT
        player.vx+=c.vx*.25*dt*10; player.vz+=c.vz*.25*dt*10;
        game.wanted=clamp(game.wanted+dt*1.5,0,5);
        if(Math.random()<.02)showMsg('DPD PIT!',800);
      }
    }
  } else cops.forEach(c=>{c.m.position.set(c.x,0,c.z);});
}

// ---------- Camera ----------
function stepCam(dt){
  const specs={0:{d:11,h:4.6},1:{d:7.5,h:2.6},2:{d:17,h:8}}[camMode];
  const bx=player.x-Math.sin(player.heading)*specs.d, bz=player.z-Math.cos(player.heading)*specs.d;
  const k=1-Math.exp(-5*dt);
  camPos.x=lerp(camPos.x,bx,k); camPos.y=lerp(camPos.y,specs.h,k); camPos.z=lerp(camPos.z,bz,k);
  const spd=Math.hypot(player.vx,player.vz);
  const shake=clamp(spd/45,0,1)*(Math.abs(player.steer));
  camera.position.set(camPos.x+(Math.random()-.5)*shake*.5,camPos.y+(Math.random()-.5)*shake*.3,camPos.z+(Math.random()-.5)*shake*.5);
  camLook.set(player.x+Math.sin(player.heading)*8,1.4,player.z+Math.cos(player.heading)*8);
  camera.lookAt(camLook);
  camera.fov=lerp(camera.fov,62+clamp(spd/45,0,1)*22,1-Math.exp(-3*dt)); camera.updateProjectionMatrix();
}
function drawMinimap(){
  const c=$('#minimap'); if(!c)return; const g=c.getContext('2d');
  g.clearRect(0,0,170,170); g.fillStyle='rgba(8,12,20,.9)'; g.fillRect(0,0,170,170);
  const s=v=>85+v/WORLD*85;
  g.strokeStyle='#2c3a55'; g.lineWidth=5;
  g.beginPath();g.moveTo(s(-650),s(40));g.lineTo(s(650),s(40));g.stroke();
  g.beginPath();g.moveTo(s(-650),s(-120));g.lineTo(s(650),s(-120));g.stroke();
  g.beginPath();g.moveTo(s(-650),s(-560));g.lineTo(s(650),s(-560));g.stroke();
  g.beginPath();g.moveTo(s(0),s(-700));g.lineTo(s(0),s(640));g.stroke();
  g.fillStyle='#00c2ff'; traffic.forEach(t=>{g.fillRect(s(t.m.position.x)-2,s(t.m.position.z)-2,4,4);});
  g.fillStyle='#ff4444'; cops.forEach(c=>{g.fillRect(s(c.x)-2,s(c.z)-2,4,4);});
  // player arrow rotated by heading
  g.save(); g.translate(s(player.x),s(player.z)); g.rotate(-player.heading+Math.PI);
  g.fillStyle='#ffb300'; g.beginPath(); g.moveTo(0,-7); g.lineTo(5,5); g.lineTo(-5,5); g.closePath(); g.fill(); g.restore();
}

// ---------- Boot ----------
const touch={gas:false,brake:false,left:false,right:false,hb:false};
function bindInput(){
  addEventListener('keydown',e=>{ keys[e.key.toLowerCase()]=true;
    if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase()))e.preventDefault();
    if(e.key.toLowerCase()==='c')camMode=(camMode+1)%3;
    if(e.key.toLowerCase()==='r')resetPlayer(game.zone);
    if(e.key.toLowerCase()==='m')Radio.toggle();
    if(e.key.toLowerCase()==='p'||e.key==='Escape')togglePause();
    if(e.key.toLowerCase()==='n')Radio.next();
  });
  addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;});
  const map={tGas:'gas',tBrake:'brake',tLeft:'left',tRight:'right',tHb:'hb'};
  for(const[id,k]of Object.entries(map)){ const el=document.getElementById(id); if(!el)continue;
    const on=e=>{e.preventDefault();touch[k]=true;}, off=e=>{e.preventDefault();touch[k]=false;};
    el.addEventListener('pointerdown',on); el.addEventListener('pointerup',off); el.addEventListener('pointerleave',off); el.addEventListener('pointercancel',off); }
}
function togglePause(){
  if(game.state==='playing'){game.state='paused';$('#pause').classList.remove('hidden');skidAudio(0);}
  else if(game.state==='paused'){game.state='playing';$('#pause').classList.add('hidden');}
}

function buildMenu(){
  const cg=$('#car-grid'); cg.innerHTML='';
  CARS.forEach((c,i)=>{ const b=document.createElement('button'); b.className='car'+(i===game.carIdx?' active':'');
    b.innerHTML=`<div class="swatch" data-year="${c.year}" style="background:linear-gradient(135deg,${c.color},#111)"></div><b>${c.name}</b><small>${c.desc}</small>
    <div class="stat"><i style="--v:${c.top/100*100}%"></i><i style="--v:${c.accel/32*100}%"></i><i style="--v:${c.grip/9*100}%"></i></div>`;
    b.onclick=()=>{game.carIdx=i;game.color=getCustom(c.id).paint;syncColors();buildMenu();uiSpec();buildCustomUI();refreshPreview();}; cg.appendChild(b); });
  const zg=$('#zone-grid'); zg.innerHTML='';
  ZONES.forEach(z=>{ const b=document.createElement('button'); b.className='opt'+(game.zone===z.id?' active':''); b.textContent=z.name;
    b.onclick=()=>{game.zone=z.id;buildMenu();uiSpec();refreshPreview();}; zg.appendChild(b); });
  const mg=$('#mode-grid'); mg.innerHTML='';
  [['free','FREE HAJWALA'],['time','DRIFT KING 2:00'],['chase','COP CHASE']].forEach(([id,nm])=>{
    const b=document.createElement('button'); b.className='opt'+(game.mode===id?' active':''); b.textContent=nm;
    b.onclick=()=>{game.mode=id;buildMenu();uiSpec();}; mg.appendChild(b); });
  const pl=$('#plist'); pl.innerHTML='';
  TRACKS.forEach((t,i)=>{ const d=document.createElement('div'); d.className='track'+(i===Radio.idx?' active':'');
    d.innerHTML=`<div class="n">${i+1}</div><div><b>${t.name}</b><small>${t.insp} • ${t.sub}</small></div>`;
    d.onclick=()=>Radio.play(i); pl.appendChild(d); });
  syncColors(); uiSpec();
}
function uiSpec(){ const z=ZONES.find(z=>z.id===game.zone); $('#zone-desc').textContent=z?z.desc:'';
  const c=CARS[game.carIdx]; $('#car-desc').innerHTML=`<b>${c.name}</b> — ${c.desc} &nbsp;•&nbsp; Top ${Math.round(c.top*1.55)} MPH`;
}
function buildCustomUI(){
  const el=$('#custom-ui'); if(!el)return;
  const spec=CARS[game.carIdx], id=spec.id, c=getCustom(id);
  const NEONS=['#00c2ff','#ff00e5','#00ff88','#ffb300','#ff2222','#ffffff'];
  el.innerHTML=
   `<div class="crow"><span>FINISH</span><div class="opt-row" id="cu-finish"></div></div>
    <div class="crow"><span>RIMS</span><div class="opt-row" id="cu-rimstyle"></div><div class="colors mini" id="cu-rim"></div></div>
    <div class="crow"><span>SPOILER</span><div class="opt-row" id="cu-spoiler"></div></div>
    <div class="crow"><span>WINDOW TINT</span><div class="opt-row" id="cu-tint"></div></div>
    <div class="crow"><span>NEON UNDERGLOW</span><div class="colors mini" id="cu-neon"></div><div class="opt-row" id="cu-neonon"></div></div>
    <div class="crow"><span>LICENSE PLATE</span><input id="plate-in" maxlength="8" value="${(c.plate||'').replace(/"/g,'')}"/>
    <div class="opt-row"><button class="opt" id="plate-go">APPLY</button><button class="opt" id="cu-rand">🎲 RANDOM</button><button class="opt" id="cu-reset">RESET</button></div></div>`;
  const opt=(host,items,cur,fn)=>{const h=el.querySelector(host);items.forEach(([v,n])=>{
    const b=document.createElement('button');b.className='opt'+(cur===v?' active':'');b.textContent=n;
    b.onclick=()=>{setCustom(id,{[fn]:v});refreshPreview();buildCustomUI();};h.appendChild(b);});};
  opt('#cu-finish',[['gloss','GLOSS'],['metallic','METALLIC'],['matte','MATTE']],c.finish,'finish');
  opt('#cu-rimstyle',[['sport','SPORT'],['star','STAR'],['dish','DISH']],c.rimStyle,'rimStyle');
  opt('#cu-spoiler',[['stock','STOCK'],['none','NONE'],['lip','LIP'],['wing','GT WING']],c.spoiler,'spoiler');
  opt('#cu-tint',[['light','LIGHT'],['medium','MEDIUM'],['limo','LIMO']],c.tint,'tint');
  opt('#cu-neonon',[[true,'NEON ON'],[false,'NEON OFF']],c.neonOn,'neonOn');
  const rh=el.querySelector('#cu-rim');
  Object.entries(RIM_COLORS).forEach(([name,num])=>{
    const b=document.createElement('button');
    b.style.background='#'+num.toString(16).padStart(6,'0');
    if(name===c.rim)b.className='active';
    b.title=name; b.onclick=()=>{setCustom(id,{rim:name});refreshPreview();buildCustomUI();}; rh.appendChild(b); });
  const nh=el.querySelector('#cu-neon');
  NEONS.forEach(cc=>{ const b=document.createElement('button'); b.style.background=cc;
    if(cc.toLowerCase()===String(c.neon).toLowerCase())b.className='active';
    b.onclick=()=>{setCustom(id,{neon:cc,neonOn:true});refreshPreview();buildCustomUI();}; nh.appendChild(b); });
  el.querySelector('#plate-go').onclick=()=>{
    const v=(el.querySelector('#plate-in').value||'').toUpperCase().slice(0,8)||'313 DET';
    setCustom(id,{plate:v}); refreshPreview(); buildCustomUI(); };
  el.querySelector('#cu-rand').onclick=()=>{
    const pick=a=>a[Math.random()*a.length|0];
    const plats=['8 MILE','313 DET','MOTOWN','DRIFT','CONEY','D-TOWN','HEMI','TURBO'];
    setCustom(id,{finish:pick(['gloss','metallic','matte']),rim:pick(Object.keys(RIM_COLORS)),
      rimStyle:pick(['sport','star','dish']),spoiler:pick(['stock','lip','wing']),
      neon:pick(NEONS),neonOn:true,tint:pick(['light','medium','limo']),plate:pick(plats)});
    refreshPreview(); buildCustomUI(); };
  el.querySelector('#cu-reset').onclick=()=>{
    delete customs[id];
    try{localStorage.setItem('det313custom',JSON.stringify(customs));}catch{}
    game.color=spec.color; syncColors(); refreshPreview(); buildCustomUI(); };
}

function syncColors(){
  const cols=['#e10600','#00c2ff','#ffb300','#111111','#4caf50','#ff6a00','#ffffff','#7b2ff7'];
  const w=$('#color-row'); if(!w)return; w.innerHTML='';
  cols.forEach(c=>{ const b=document.createElement('button'); b.style.background=c; b.className=c===game.color?'active':'';
    b.onclick=()=>{game.color=c;setCustom(CARS[game.carIdx].id,{paint:c});syncColors();refreshPreview();}; w.appendChild(b); });
}

let sunDirVec=new THREE.Vector3(0,1,0);
function setupSky(){
  sky=new Sky(); sky.scale.setScalar(2400); scene.add(sky);
  // stars
  const n=700, pos=new Float32Array(n*3);
  for(let i=0;i<n;i++){ const a=Math.random()*Math.PI*2, e=Math.random()*Math.PI*.48+.03, r=2250;
    pos[i*3]=Math.cos(a)*Math.cos(e)*r; pos[i*3+1]=Math.sin(e)*r; pos[i*3+2]=Math.sin(a)*Math.cos(e)*r; }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  stars=new THREE.Points(g,new THREE.PointsMaterial({color:0xcfe0ff,size:2.1,sizeAttenuation:false,transparent:true,opacity:0,depthWrite:false}));
  scene.add(stars);
  // moon
  moonSpr=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOWTEX,color:0xe8f1ff,transparent:true,opacity:0,depthWrite:false}));
  moonSpr.scale.set(220,220,1); scene.add(moonSpr);
}
function updateSky(){
  const u=sky.material.uniforms;
  const elev=night?-9:22, azim=night?300:62;
  const phi=THREE.MathUtils.degToRad(90-elev), theta=THREE.MathUtils.degToRad(azim);
  sunDirVec.setFromSphericalCoords(1,phi,theta);
  u.sunPosition.value.copy(sunDirVec);
  u.turbidity.value=night?2:5;
  u.rayleigh.value=night?.5:1.2;
  u.mieCoefficient.value=night?.002:.003;
  u.mieDirectionalG.value=.85;
  // key light follows time of day
  if(night){ sunLight.color.setHex(0x8fb4ff); sunLight.intensity=.5;
    sunDirVec.setFromSphericalCoords(1,THREE.MathUtils.degToRad(50),THREE.MathUtils.degToRad(300)); }
  else { sunLight.color.setHex(0xfff0da); sunLight.intensity=2.2; }
  stars.material.opacity=night?.9:0;
  moonSpr.material.opacity=night?.95:0;
  moonSpr.position.set(player?player.x:0,1500,player?player.z-1800:-1800);
}
function applyEnv(){
  scene.fog=new THREE.Fog(night?0x05070d:0x9fb0c4,200,2200);
  if(sunLight)sunLight.intensity=night?.5:2.2;
  if(hemiLight)hemiLight.intensity=night?.18:.7;
  renderer.toneMappingExposure=night?.55:.55;
  updateSky();
  if(bloomPass){bloomPass.strength=night?.9:.35;bloomPass.threshold=night?.7:.9;}
  scene.traverse(o=>{ if(o.isMesh&&o.material&&o.material.emissiveMap&&o.material.emissiveIntensity!==undefined){
    const u=o.material.userData;
    o.material.emissiveIntensity=night?(u.n??.95):(u.d??.12);
  }});
  if(lampHeadMat)lampHeadMat.emissiveIntensity=night?3.4:.25;
  if(window.__lamps)window.__lamps.forEach(l=>{ if(l.userData.halo)l.userData.halo.material.opacity=night?.7:.1; });
  if(headlight)headlight.intensity=night?2500:400;
  clouds.forEach(c=>c.material.opacity=night?.1:c.userData.o);
  if(playerMesh)playerMesh.traverse(o=>{ if(o.isMesh){
    (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{
      if(m.userData&&m.userData.eD!==undefined)m.envMapIntensity=night?m.userData.eN:m.userData.eD; });}});
  headCones.forEach(c=>c.material.opacity=night?.12:0);
  headGlows.forEach(g=>g.material.opacity=night?.5:.2);
  if(underglow&&underglow.visible)underglow.material.opacity=night?.45:.15;
  if(waterMesh)waterMesh.material.color.setHex(night?0x0a1626:0x9fc4e0);
}

function onResize(){
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
  if(composer){composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(innerWidth,innerHeight);}
}
function setQuality(q){
  quality=q; usePost=(q==='high');
  renderer.setPixelRatio(q==='high'?Math.min(devicePixelRatio,2):1);
  renderer.shadowMap.enabled=(q==='high');
  if(sunLight)sunLight.castShadow=(q==='high');
  scene.traverse(o=>{ if(o.isMesh&&o.material){
    (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.needsUpdate=true); } });
  onResize();
  const b=$('#quality-btn');
  if(b){b.textContent=q==='high'?'✨':'⚡';b.classList.toggle('off',q!=='high');
    b.title=q==='high'?'Graphics: HIGH — click for LOW':'Graphics: LOW — click for HIGH';}
}

export function boot(){
  const canvas=$('#game-canvas');
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(innerWidth,innerHeight);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=.62;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene(); scene.background=new THREE.Color(0xafbdd0); scene.fog=new THREE.Fog(0xafbdd0,150,1500);
  camera=new THREE.PerspectiveCamera(66,innerWidth/innerHeight,.1,5000);
  camera.position.set(0,6,-20);
  // image-based lighting for paint / glass / chrome
  const pmrem=new THREE.PMREMGenerator(renderer);
  envTex=pmrem.fromScene(new RoomEnvironment(renderer),.06).texture;
  const hemi=new THREE.HemisphereLight(0xbdd2f0,0x3a332a,.55); scene.add(hemi); hemiLight=hemi;
  const sun=new THREE.DirectionalLight(0xfff0da,2.6);
  sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.left=-120; sun.shadow.camera.right=120;
  sun.shadow.camera.top=120; sun.shadow.camera.bottom=-120;
  sun.shadow.camera.near=50; sun.shadow.camera.far=1000;
  sun.shadow.bias=-0.0006; sun.shadow.radius=5;
  scene.add(sun); scene.add(sun.target); sunLight=sun;
  scene.add(new THREE.AmbientLight(0x8a97ad,.25));
  // Detroit glow
  const glow=new THREE.PointLight(0x00c2ff,5000,600); glow.position.set(110,120,-60); scene.add(glow);
  setupSky();
  buildCity(); initParticles();
  applyEnv();
  player={x:0,z:40,heading:Math.PI,vx:0,vz:0,steer:0};
  playerMesh=buildCarMesh(CARS[0],getCustom(CARS[0].id)); scene.add(playerMesh);
  resetPlayer('downtown'); spawnTraffic();
  // cinematic post: bloom for neon / sun / headlights
  composer=new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  bloomPass=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.35,.55,.9);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  bindInput(); buildMenu(); buildCustomUI(); uiRadio();
  game.color=getCustom(CARS[game.carIdx].id).paint; syncColors(); refreshPreview();
  clock=new THREE.Clock();
  addEventListener('resize',onResize);
  // buttons
  $('#start-btn').onclick=()=>{audio();startGame();};
  $('#preview-btn').onclick=()=>{
    $('#menu').classList.add('hidden'); $('#preview-bar').classList.remove('hidden');
    $('#preview-name').textContent=CARS[game.carIdx].name; };
  const backToGarage=()=>{ $('#preview-bar').classList.add('hidden'); $('#menu').classList.remove('hidden'); };
  $('#preview-back').onclick=backToGarage;
  $('#preview-go').onclick=()=>{ $('#preview-bar').classList.add('hidden'); audio(); startGame(); };
  $('#resume-btn').onclick=togglePause; $('#quit-btn').onclick=()=>{location.reload();};
  $('#again-btn').onclick=()=>{audio();startGame();}; $('#menu-btn').onclick=()=>location.reload();
  $('#pause-btn').onclick=togglePause; $('#cam-btn').onclick=()=>camMode=(camMode+1)%3;
  $('#reset-btn').onclick=()=>resetPlayer(game.zone);
  $('#quality-btn').onclick=()=>setQuality(quality==='high'?'low':'high');
  setQuality('high');
  $('#mute-btn').onclick=()=>{ if(!masterGain)return; masterGain.gain.value=masterGain.gain.value>.1?0:.8; $('#mute-btn').textContent=masterGain.gain.value>.1?'🔊':'🔇'; };
  $('#rb-play').onclick=()=>Radio.toggle(); $('#rb-next').onclick=()=>Radio.next(); $('#rb-prev').onclick=()=>Radio.prev();
  $('#vol').oninput=e=>{ if(musicGain)musicGain.gain.value=e.target.value/100; };
  $('#snow-btn').onclick=e=>{ toggleSnow(!snowOn); e.target.classList.toggle('active',snowOn); };
  $('#night-btn').onclick=e=>{ night=!night; applyEnv(); e.target.classList.toggle('active',night); };
  $('#spotify-btn').onclick=()=>window.open('https://open.spotify.com/search/Detroit%20rap%20Eminem%20Tee%20Grizzley%2042%20Dugg%20Big%20Sean','_blank');
  $('#yt-btn').onclick=()=>window.open('https://www.youtube.com/results?search_query=detroit+rap+playlist+eminem+tee+grizzley+42+dugg+sada+baby','_blank');
  // viz anim
  setInterval(()=>{ const v=$('#viz'); if(!v||!Radio.playing)return;
    [...v.children].forEach(b=>b.style.height=(4+Math.random()*18)+'px'); },120);
  renderer.setAnimationLoop(tick);
  // hide loader
  setTimeout(()=>$('#loader').classList.add('hidden'),700);
}

let vizT=0;
function tick(){
  const dt=Math.min(clock.getDelta(),.033);
  // auto quality: drop to LOW on weak GPUs (measured in menu)
  if(!autoQTuned&&game.state==='menu'){ fpsAcc+=dt; fpsN++;
    if(fpsN>=110){ autoQTuned=true; if(fpsAcc/fpsN>1/17&&quality==='high')setQuality('low'); } }
  if(game.state==='playing'){
    step(dt); stepAI(dt); stepCam(dt); drawMinimap();
    // smoke update
    for(const p of smokePool){ if(p.life>0){ p.life-=dt*.9; p.m.material.opacity=Math.max(0,p.life*.6);
      p.m.position.y+=dt*2; const s=p.m.scale.x+dt*4; p.m.scale.set(s,s,1); } }
    // snow fall
    if(snow&&snow.visible){ const pos=snow.geometry.attributes.position;
      for(let i=0;i<pos.count;i++){ let y=pos.getY(i)-dt*14; if(y<0)y=120; pos.setY(i,y); }
      pos.needsUpdate=true;
      snow.position.x=player.x; snow.position.z=player.z; }
    // river shimmer
    if(waterTex){ waterTex.offset.x+=dt*.015; waterTex.offset.y+=dt*.004; }
    driftClouds(dt); blinkBeacons();
    // sun shadow frustum follows the car
    if(sunLight&&sunLight.castShadow){
      sunLight.position.set(player.x+sunDirVec.x*380,sunDirVec.y*380,player.z+sunDirVec.z*380);
      sunLight.target.position.set(player.x,0,player.z);
      sunLight.target.updateMatrixWorld();
    }
  } else if(game.state==='menu'){
    // showroom: slow orbit around your customized ride
    const t=performance.now()/1000;
    if(playerMesh){
      const px=playerMesh.position.x, pz=playerMesh.position.z;
      camera.position.set(px+Math.sin(t*.22)*8.5,2.9+Math.sin(t*.13)*.4,pz+Math.cos(t*.22)*8.5);
      camera.lookAt(px,1.1,pz);
      camPos.copy(camera.position);
    }
    if(waterTex)waterTex.offset.x+=dt*.015;
    driftClouds(dt);
  }
  if(usePost&&composer)composer.render(); else renderer.render(scene,camera);
}
