// Free SFW AI Studio — procedural canvas art, no login, no gems, unlimited
const $ = s => document.querySelector(s);
const grid = $('#grid'), preview = $('#preview');
const PALS = {
  neon:['#ff2d78','#00c2ff','#7c3aed','#00ffab','#111'],
  sunset:['#ff6a00','#ffb300','#ff2d78','#4a1030','#111'],
  ocean:['#00c2ff','#0077ff','#00ffab','#062a4a','#06121f'],
  forest:['#4caf50','#aeea00','#00695c','#123312','#0a0f0a'],
  mono:['#ffffff','#aaaaaa','#555555','#222222','#000000']
};
const SAMPLES = [
  ['neon cyberpunk warrior portrait, glowing visor','cyberpunk'],
  ['fantasy elven guardian, forest light','fantasy'],
  ['anime star pilot, pastel cockpit','anime'],
  ['regal portrait, golden armor','portrait'],
  ['retro comic hero, halftone city','comic'],
  ['sci-fi explorer, alien dunes','sci-fi'],
  ['cyberpunk street dancer, rain neon','cyberpunk'],
  ['fantasy dragon keeper, embers','fantasy'],
  ['anime moon shrine maiden','anime'],
  ['portrait of a star navigator','portrait'],
  ['comic space patrol landing','comic'],
  ['sci-fi greenhouse station','sci-fi'],
];

function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){return function(){seed=Math.imul(seed^seed>>>15,seed|1);seed^=seed+Math.imul(seed^seed>>>7,seed|61);return((seed^seed>>>14)>>>0)/4294967296}}
function drawArt(cv, prompt, style, palName, detail=6){
  const ctx=cv.getContext('2d'); const W=cv.width,H=cv.height;
  const R=rng(hash(prompt+style+palName));
  const pal=PALS[palName]||PALS.neon;
  // bg gradient
  const g=ctx.createLinearGradient(0,0,W,H);
  g.addColorStop(0,pal[4]);g.addColorStop(.5,pal[R()*4|0]);g.addColorStop(1,pal[4]);
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  // orbs / bokeh
  for(let i=0;i<20+R()*20;i++){const x=R()*W,y=R()*H,r=10+R()*90;const gg=ctx.createRadialGradient(x,y,0,x,y,r);const c=pal[R()*pal.length|0];gg.addColorStop(0,c+'cc');gg.addColorStop(1,'transparent');ctx.fillStyle=gg;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill()}
  // figure silhouette (SFW abstract portrait)
  const cx=W*(.3+R()*.4), cy=H*.42, hw=W*(.16+R()*.1), hh=H*(.2+R()*.08);
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,.55)';
  ctx.beginPath();ctx.ellipse(cx,cy,hw,hh,0,0,7);ctx.fill(); // head
  ctx.beginPath();ctx.moveTo(cx-hw*.9,cy+hh*.8);ctx.quadraticCurveTo(cx,cy+hh*2.2,cx+hw*.9,cy+hh*.8);ctx.lineTo(cx+hw*1.4,H);ctx.lineTo(cx-hw*1.4,H);ctx.closePath();ctx.fill();
  ctx.clip();
  // face light bands by style
  for(let i=0;i<detail*8;i++){ctx.fillStyle=pal[R()*pal.length|0]+'';ctx.globalAlpha=.25+R()*.5;const y=cy-hh+R()*hh*3;ctx.fillRect(cx-hw*1.5,y,W*.02+R()*W*.08,2+R()*8)}
  ctx.restore();ctx.globalAlpha=1;
  // scanlines / halftone for comic
  if(style==='comic'||style==='anime'){ctx.fillStyle='rgba(255,255,255,.08)';for(let y=0;y<H;y+=6)ctx.fillRect(0,y,W,1)}
  // vignette + title
  const v=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.3,W/2,H/2,Math.max(W,H)*.75);
  v.addColorStop(0,'transparent');v.addColorStop(1,'rgba(0,0,0,.65)');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
  ctx.fillStyle='rgba(255,255,255,.85)';ctx.font=`700 ${Math.max(14,W*.045)}px sans-serif`;
  ctx.fillText(style.toUpperCase(),16,H-16);
}

let items=[];
function seedGallery(){
  items=SAMPLES.map((s,i)=>{
    const c=document.createElement('canvas');c.width=360;c.height=480;
    drawArt(c,s[0],s[1],Object.keys(PALS)[i%5],5+(i%4));
    return {prompt:s[0],style:s[1],img:c.toDataURL('image/png'),ts:Date.now()-i*60000,type:i%4===3?'comic':(i%3===0?'pics':'pics')}
  });
  // user saves
  try{const saved=JSON.parse(localStorage.getItem('freeStudio')||'[]');items=[...saved,...items]}catch{}
}
function render(){
  const f=$('#styleFilter').value,q=$('#q').value.toLowerCase(),sort=$('#sortSel').value,tab=document.querySelector('.tabs .active').dataset.tab;
  let list=items.filter(it=>(f==='all'||it.style===f)&&(!q||it.prompt.toLowerCase().includes(q)));
  if(tab==='comics')list=list.filter(it=>it.style==='comic');
  if(tab==='gifs')list=list.slice(0,8); // demo: same art, animated via CSS
  if(sort==='newest')list=[...list].sort((a,b)=>b.ts-a.ts);
  if(sort==='oldest')list=[...list].sort((a,b)=>a.ts-b.ts);
  grid.innerHTML='';
  $('#empty').classList.toggle('hidden',list.length>0);
  list.forEach(it=>{
    const d=document.createElement('div');d.className='card';
    d.innerHTML=`<img loading="lazy" src="${it.img}"/><div class="meta"><b>${it.prompt}</b><div class="tags"><i>${it.style}</i><i>FREE</i><i>no login</i></div></div>`;
    d.onclick=()=>{$('#viewImg').src=it.img;$('#viewPrompt').textContent=it.prompt+' — '+it.style;$('#lightbox').classList.remove('hidden')};
    grid.appendChild(d);
  });
  $('#countMade').textContent=items.length;
}

function currentGen(){drawArt(preview,$('#prompt').value||'untamed starlight drifter',$('#genStyle').value,$('#genPal').value,+$('#genDetail').value)}

['prompt','genStyle','genPal','genDetail'].forEach(id=>$('#'+id).addEventListener('input',currentGen));
$('#genBtn').onclick=currentGen;
$('#publishBtn').onclick=()=>{
  const it={prompt:$('#prompt').value||'untamed starlight drifter',style:$('#genStyle').value,img:preview.toDataURL('image/png'),ts:Date.now(),type:'pics'};
  items.unshift(it);
  try{const saved=JSON.parse(localStorage.getItem('freeStudio')||'[]');saved.unshift(it);localStorage.setItem('freeStudio',JSON.stringify(saved.slice(0,50)))}catch{}
  render();$('#modal').classList.add('hidden');window.scrollTo({top:0,behavior:'smooth'});
};
$('#dlBtn').onclick=()=>{const a=document.createElement('a');a.download='free-ai-art.png';a.href=preview.toDataURL();a.click()};
const openM=()=>{$('#modal').classList.remove('hidden');currentGen()};
$('#createBtn').onclick=openM;$('#createBtn2').onclick=openM;
$('#closeModal').onclick=()=>$('#modal').classList.add('hidden');
$('#closeView').onclick=()=>$('#lightbox').classList.add('hidden');
$('#styleFilter').onchange=render;$('#sortSel').onchange=render;$('#q').oninput=render;
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');render()});
$('#randBtn').onclick=()=>{const s=SAMPLES[Math.random()*SAMPLES.length|0];$('#prompt').value=s[0]+', ultra detailed, cinematic light';$('#genStyle').value=s[1];openM()};
$('#catBtn').onclick=()=>$('#styleFilter').focus();
$('#slideBtn').onclick=()=>{let i=0;const cards=[...grid.children];if(!cards.length)return;setInterval(()=>{cards[i%cards.length].scrollIntoView({behavior:'smooth',block:'center'});i++},1800)};
$('#expandBtn').onclick=()=>grid.classList.toggle('grid');
$('#fullBtn').onclick=()=>document.documentElement.requestFullscreen?.();

seedGallery();render();currentGen();
