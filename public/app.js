(function(){
  // ===== 背景动画 =====
  const c=document.getElementById('bg'); const ctx=c.getContext('2d');
  function resize(){ c.width=innerWidth; c.height=innerHeight; } resize(); addEventListener('resize', resize);
  const blobs = Array.from({length:4}).map((_,i)=>({x:Math.random()*c.width,y:Math.random()*c.height,r:180+Math.random()*240,dx:(Math.random()*1.2+0.3)*(Math.random()<.5?-1:1),dy:(Math.random()*1.2+0.3)*(Math.random()<.5?-1:1),h: (i*90+200)%360}));
  const particles = Array.from({length:40}).map(()=>({x:Math.random()*c.width,y:Math.random()*c.height,v: .3+Math.random()*1.2,s:1+Math.random()*2}));
  function draw(){
    ctx.clearRect(0,0,c.width,c.height);
    ctx.globalCompositeOperation='lighter';
    for(const b of blobs){
      const grd=ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r);
      const col1=`hsla(${b.h},95%,65%,.12)`; const col2=`hsla(${(b.h+60)%360},95%,55%,.06)`;
      grd.addColorStop(0,col1); grd.addColorStop(1,col2);
      ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill();
      b.x+=b.dx; b.y+=b.dy;
      if(b.x-b.r<0||b.x+b.r>c.width) b.dx*=-1;
      if(b.y-b.r<0||b.y+b.r>c.height) b.dy*=-1;
    }
    ctx.globalCompositeOperation='screen';
    ctx.fillStyle='rgba(150,180,255,.35)';
    for(const p of particles){ ctx.beginPath(); ctx.arc(p.x,p.y,p.s,0,Math.PI*2); ctx.fill(); p.y += p.v; if(p.y>c.height+10){ p.y=-10; p.x=Math.random()*c.width; } }
    requestAnimationFrame(draw);
  }
  draw();

  // ===== Chat logic =====
  const SID_KEY='hs_sid', ENDED_KEY='hs_ended', UID_KEY='hs_uid', RESUME_KEY='hs_resume';
  let LOADED=false;
  function newSid(){ return (Date.now().toString(36)+Math.random().toString(36).slice(2,8)); }

  let uid=(localStorage.getItem(UID_KEY)||'').trim();
  function sidKey(){ return SID_KEY + '_' + (uid||''); }
  let sid=null;
  function ensureSid(){ const k=sidKey(); sid=localStorage.getItem(k)||newSid(); localStorage.setItem(k,sid); }
  ensureSid();

  let ended=(localStorage.getItem(ENDED_KEY)==='1');
  const INACTIVE_MS=15*60*1000; let idleTimer=null;

  const msgs=document.getElementById('msgs'), input=document.getElementById('input'), sendBtn=document.getElementById('send');
  const fileInput=document.getElementById('file'), btnEnd=document.getElementById('btn-end'), composer=document.getElementById('composer');
  const uidModal=document.getElementById('uidModal'), uidInput=document.getElementById('uidInput'), uidOk=document.getElementById('uidOk');
  const toast=document.getElementById('toast');
  const AGENT_AVATAR='/agent.png';

  let TYPING = { el:null, timer:null, dots:1, hideTimer:null };

  function getResumeToken(){
    let t = localStorage.getItem(RESUME_KEY);
    if(!t){ t = (Date.now().toString(36)+Math.random().toString(36).slice(2,12)); localStorage.setItem(RESUME_KEY, t); }
    return t;
  }
  function histKey(){ return 'hs_hist_' + getResumeToken() + '_' + (uid||''); }
  let REPLAY=false;
  function loadHistory(){
    try{
      const raw = localStorage.getItem(histKey());
      const arr = raw ? JSON.parse(raw) : [];
      msgs.innerHTML=''; REPLAY=true; arr.forEach(m=>{
        if(m.type==='text') addMsg(m.text, m.me);
        else if(m.type==='img'){ if(m.url){ addImage(m.url, m.caption||'', m.me); } else { addMsg((m.me?'(You) ':'')+'[image]', m.me); } }
      }); REPLAY=false;
    }catch(e){}
  }
  function pushHistory(item){
    try{
      const raw = localStorage.getItem(histKey());
      const arr = raw ? JSON.parse(raw) : [];
      arr.push(item);
      while(arr.length>200) arr.shift();
      localStorage.setItem(histKey(), JSON.stringify(arr));
    }catch(e){}
  }
  function loadHistoryOnce(){ if(LOADED) return; loadHistory(); LOADED=true; }

  function showToast(kind, text){
    toast.innerHTML = text;
    toast.classList.add('show');
    setTimeout(()=>toast.classList.remove('show'), 2400);
  }

  // ===== 国旗 SVG =====
  const FLAGS = {
    US: `<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' viewBox='0 0 7410 3900'>
      <rect width='7410' height='3900' fill='#b22234'/>
      <path d='M0,450H7410v300H0zm0,600H7410v300H0zm0,600H7410v300H0zm0,600H7410v300H0zm0,600H7410v300H0zm0,600H7410v300H0' fill='#fff'/>
      <rect width='2964' height='2100' fill='#3c3b6e'/>
      <g fill='#fff'><polygon points='247,90 323,307 118,175 376,175 171,307'/></g>
    </svg>`,
    CN: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 20'><rect width='30' height='20' fill='#DE2910'/><polygon points='5,2 6,4.9 9,4.9 6.5,6.7 7.6,9.5 5,7.8 2.4,9.5 3.5,6.7 1,4.9 4,4.9' fill='#FFDE00'/></svg>`,
    HK: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'>
      <rect width='3' height='2' fill='#BA0000'/>
      <g transform='translate(1.5,1) scale(.32)' fill='#fff'>
        <g id='petal'><path d='M0,-80 C25,-58,25,-20,0,0 C-25,-20,-25,-58,0,-80Z'/></g>
        <use href='#petal' transform='rotate(72)'/>
        <use href='#petal' transform='rotate(144)'/>
        <use href='#petal' transform='rotate(216)'/>
        <use href='#petal' transform='rotate(288)'/>
      </g>
    </svg>`,
    IN: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'><rect width='3' height='2' fill='#ffffff'/><rect width='3' height='.6667' y='0' fill='#FF9933'/><rect width='3' height='.6667' y='1.3333' fill='#138808'/></svg>`,
    TH: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'><rect width='3' height='2' fill='#A51931'/><rect y='.3333' width='3' height='1.3334' fill='#fff'/><rect y='.6667' width='3' height='.6666' fill='#2D2A4A'/></svg>`
  };
  function flagDataURL(key){ return 'data:image/svg+xml;utf8,'+encodeURIComponent(FLAGS[key]||''); }

  const LANGS = [
    { code:'en',    label:'English',     flag:'US', greet:'Hello! How can I help you?' },
    { code:'zh-CN', label:'简体中文',     flag:'CN', greet:'你好，有什么可以帮您？' },
    { code:'zh-TW', label:'繁體中文',     flag:'HK', greet:'你好，有什麼可以幫您？' },
    { code:'hi',    label:'हिन्दी',       flag:'IN', greet:'नमस्ते! मैं आपकी कैसे मदद कर सकता/सकती हूँ?' },
    { code:'th',    label:'ไทย',          flag:'TH', greet:'สวัสดีครับ/ค่ะ มีอะไรให้ช่วยไหมครับ/คะ?' }
  ];

  // === 其余逻辑保持和你之前版本一致 ===
  // （消息发送、语言选择卡片、typing 动画、结束对话逻辑…）
})();
