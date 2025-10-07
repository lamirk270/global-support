(function(){
  // ===== Background (保持你原有视觉，不改样式) =====
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

  // 先初始化 uid，再用于 sidKey()
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

  // --- typing indicator state ---
  let TYPING = { el:null, timer:null, dots:1, hideTimer:null };

  // ---- secure resume token (per device) ----
  function getResumeToken(){
    let t = localStorage.getItem(RESUME_KEY);
    if(!t){
      t = (Date.now().toString(36)+Math.random().toString(36).slice(2,12));
      localStorage.setItem(RESUME_KEY, t);
    }
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
        else if(m.type==='img'){
          if(m.url){ addImage(m.url, m.caption||'', m.me); }
          else { addMsg((m.me?'(You) ':'')+'[image]', m.me); }
        }
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

  function showResumePill(){
    const pill = document.createElement('div');
    pill.className = 'resume-pill';
    pill.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7-11-7z" /></svg><span>Resume</span>';
    pill.addEventListener('click', ()=>{
      fetch('/api/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:sid,action:'continue'})}).then(()=>{
        setEnded(false);
        composer.style.display='flex';
        showToast('resumed','Resumed');
        pill.remove();
        resetIdle();
      });
    });
    msgs.appendChild(pill);
    msgs.scrollTop=msgs.scrollHeight;
  }

  function showToast(kind, text){
    const icons = {
      connected: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="url(#g)"/><path d="M7 12l3 3 7-7" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      resumed:   '<svg viewBox="0 0 24 24"><defs><linearGradient id="gp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6ea9ff"/><stop offset="1" stop-color="#8b5cff"/></linearGradient></defs><path d="M21 12a9 9 0 1 1-2.64-6.36" stroke="url(#gp)" stroke-width="2" fill="none"/><path d="M21 5v6h-6" stroke="url(#gp)" stroke-width="2" fill="none"/></svg>',
      ended:     '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="#ff5a6b" stroke-width="2" fill="none"/><path d="M12 5v7" stroke="#ff5a6b" stroke-width="2"/></svg>',
      toolarge:  '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2L12 3z" fill="#f7c948"/><path d="M12 9v5" stroke="#1b2738" stroke-width="2"/><circle cx="12" cy="16" r="1.2" fill="#1b2738"/></svg>',
      failed:    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#ff5a6b"/><path d="M8 8l8 8M16 8l-8 8" stroke="#fff" stroke-width="2"/></svg>'
    };
    toast.innerHTML = (icons[kind]||'') + (text? '<span style="margin-left:8px">'+text+'</span>':'');
    toast.style.animation = 'none'; toast.offsetHeight;
    toast.classList.add('show');
    if(kind==='toolarge'){ toast.style.animation = 'shake .5s ease'; setTimeout(()=>toast.classList.remove('show'), 2400); }
    else { setTimeout(()=>toast.classList.remove('show'), 2400); }
  }

  // === 将纯文本里的 URL / 邮箱转为 <a>（安全：不执行 HTML，仅拼装节点） ===
  function makeLinkifiedFragment(text) {
    const frag = document.createDocumentFragment();
    const urlRegex = /((https?:\/\/|www\.)[^\s]+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

    let last = 0, m;
    while ((m = urlRegex.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const raw = m[0];
      let href, label = raw;
      if (raw.includes('@') && !raw.startsWith('www.')) {
        href = 'mailto:' + raw;
      } else {
        href = raw.startsWith('http') ? raw : ('https://' + raw);
      }
      const a = document.createElement('a');
      a.href = href;
      a.textContent = label;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'msg-link';
      frag.appendChild(a);
      last = m.index + raw.length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }

  function addMsg(text,me){
    const d=document.createElement('div'); d.className='msg'+(me?' me':'');
    if(!me){ const av=document.createElement('img'); av.src=AGENT_AVATAR; av.className='avatar'; d.appendChild(av); }
    const span=document.createElement('div');
    span.appendChild(makeLinkifiedFragment(text));
    d.appendChild(span);
    msgs.appendChild(d); msgs.scrollTop=msgs.scrollHeight; 
    if(!REPLAY){ try{ pushHistory({type:'text', text, me:!!me}); }catch(e){} }
  }

  function addAgentCard(contentNode){
    const d=document.createElement('div'); d.className='msg';
    const av=document.createElement('img'); av.src=AGENT_AVATAR; av.className='avatar'; d.appendChild(av);
    const box=document.createElement('div'); box.appendChild(contentNode); d.appendChild(box);
    msgs.appendChild(d); msgs.scrollTop=msgs.scrollHeight;
    return d;
  }

  function addImage(url,caption,me){
    const wrap=document.createElement('div'); wrap.className='msg'+(me?' me':'');
    if(!me){ const av=document.createElement('img'); av.src=AGENT_AVATAR; av.className='avatar'; wrap.appendChild(av); }
    const box=document.createElement('div'); const img=document.createElement('img'); img.src=url; img.alt=caption||''; box.appendChild(img);
    if(caption){ const c=document.createElement('div'); c.className='caption'; c.textContent=caption; box.appendChild(c); }
    wrap.appendChild(box); msgs.appendChild(wrap); msgs.scrollTop=msgs.scrollHeight; 
    if(!REPLAY){ try{ pushHistory({type:'img', url:(me?null:url), caption, me:!!me}); }catch(e){} }
  }

  // ===== 正在输入：显示/隐藏 =====
  function showTyping(){
    if (TYPING.el) return;
    const d = document.createElement('div');
    d.className = 'msg';
    const av = document.createElement('img'); av.src = AGENT_AVATAR; av.className = 'avatar'; d.appendChild(av);
    const span = document.createElement('div'); span.textContent = '...'; d.appendChild(span);
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
    TYPING.el = span;
    TYPING.dots = 1;
    TYPING.timer = setInterval(()=>{ TYPING.dots = (TYPING.dots % 3) + 1; TYPING.el.textContent='.'.repeat(TYPING.dots); }, 400);
    clearTimeout(TYPING.hideTimer); TYPING.hideTimer = setTimeout(hideTyping, 10000);
  }
  function hideTyping(){
    if (TYPING.timer) { clearInterval(TYPING.timer); TYPING.timer=null; }
    if (TYPING.hideTimer) { clearTimeout(TYPING.hideTimer); TYPING.hideTimer=null; }
    if (TYPING.el) {
      const wrap = TYPING.el.parentElement;
      if (wrap && wrap.parentElement) wrap.parentElement.removeChild(wrap);
    }
    TYPING.el = null;
  }

  // ===== 准确国旗（嵌入 SVG），供语言按钮使用 =====
  // ===== 准确国旗（嵌入 SVG），供语言按钮使用 =====
const FLAGS = {
  // 美国 (English)
  US: `<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' viewBox='0 0 7410 3900'>
    <rect width='7410' height='3900' fill='#b22234'/>
    <path d='M0,450H7410v300H0zm0,600H7410v300H0zm0,600H7410v300H0zm0,600H7410v300H0zm0,600H7410v300H0zm0,600H7410v300H0' fill='#fff'/>
    <rect width='2964' height='2100' fill='#3c3b6e'/>
    <g fill='#fff'>
      <g id='s'>
        <g id='s2'>
          <g id='s3'>
            <g id='s4'>
              <g id='s5'>
                <polygon points='247,90 323,307 118,175 376,175 171,307'/>
              </g>
              <use xlink:href='#s5' x='247'/>
              <use xlink:href='#s5' x='494'/>
              <use xlink:href='#s5' x='741'/>
              <use xlink:href='#s5' x='988'/>
            </g>
            <use xlink:href='#s4' y='210'/>
            <use xlink:href='#s4' y='420'/>
            <use xlink:href='#s4' y='630'/>
            <use xlink:href='#s4' y='840'/>
            <use xlink:href='#s4' y='1050'/>
          </g>
          <use xlink:href='#s3' x='123'/>
        </g>
        <use xlink:href='#s2' y='210'/>
      </g>
    </g>
  </svg>`,

  // 中国 (简体中文)
  CN: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 20'><rect width='30' height='20' fill='#DE2910'/><polygon points='5,2 6,4.9 9,4.9 6.5,6.7 7.6,9.5 5,7.8 2.4,9.5 3.5,6.7 1,4.9 4,4.9' fill='#FFDE00'/><g fill='#FFDE00' transform='translate(5,5)'><polygon transform='rotate(23) translate(3,0)' points='0,-.6 .6,0 0,.6 -.6,0'/><polygon transform='rotate(45) translate(4,1)' points='0,-.6 .6,0 0,.6 -.6,0'/><polygon transform='rotate(0) translate(4,-1)' points='0,-.6 .6,0 0,.6 -.6,0'/><polygon transform='rotate(-23) translate(3,2)' points='0,-.6 .6,0 0,.6 -.6,0'/></g></svg>`,

  // 香港 (繁体中文用香港区旗)
  HK: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'>
    <rect width='3' height='2' fill='#BA0000'/>
    <g transform='translate(1.5,1) scale(.32)' fill='#fff'>
      <g id='petal'>
        <path d='M0,-80 C25,-58,25,-20,0,0 C-25,-20,-25,-58,0,-80Z'/>
      </g>
      <use href='#petal' transform='rotate(72)'/>
      <use href='#petal' transform='rotate(144)'/>
      <use href='#petal' transform='rotate(216)'/>
      <use href='#petal' transform='rotate(288)'/>
    </g>
  </svg>`,

  // 印度 (हिन्दी)
  IN: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'><rect width='3' height='2' fill='#ffffff'/><rect width='3' height='.6667' y='0' fill='#FF9933'/><rect width='3' height='.6667' y='1.3333' fill='#138808'/><circle cx='1.5' cy='1' r='.18' fill='none' stroke='#000088' stroke-width='.02'/><g stroke='#000088' stroke-width='.01'><line x1='1.5' y1='1' x2='1.5' y2='.82'/><line x1='1.5' y1='1' x2='1.64' y2='.86'/><line x1='1.5' y1='1' x2='1.68' y2='1'/><line x1='1.5' y1='1' x2='1.64' y2='1.14'/><line x1='1.5' y1='1' x2='1.5' y2='1.18'/><line x1='1.5' y1='1' x2='1.36' y2='1.14'/><line x1='1.5' y1='1' x2='1.32' y2='1'/><line x1='1.5' y1='1' x2='1.36' y2='.86'/></g></svg>`,

  // 泰国 (ไทย)
  TH: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'><rect width='3' height='2' fill='#A51931'/><rect y='.3333' width='3' height='1.3334' fill='#fff'/><rect y='.6667' width='3' height='.6666' fill='#2D2A4A'/></svg>`
};

function flagDataURL(key){
  const svg = FLAGS[key] || '';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// ===== 语言配置 =====
const LANGS = [
  { code:'en',    label:'English',     flag:'US', greet:'Hello! How can I help you?' },
  { code:'zh-CN', label:'简体中文',     flag:'CN', greet:'你好，有什么可以帮您？' },
  { code:'zh-TW', label:'繁體中文',     flag:'HK', greet:'你好，有什麼可以幫您？' }, // 改用香港区旗
  { code:'hi',    label:'हिन्दी',       flag:'IN', greet:'नमस्ते! मैं आपकी कैसे मदद कर सकता/सकती हूँ?' },
  { code:'th',    label:'ไทย',          flag:'TH', greet:'สวัสดีครับ/ค่ะ มีอะไรให้ช่วยไหมครับ/คะ?' }
];

  function langStorageKey(){ return 'hs_lang_' + sid; }

  function addAgentRichCard(titleText, buttons){
    // 外层容器（与客服气泡一致）
    const wrap = document.createElement('div');
    wrap.className='msg';
    const av=document.createElement('img'); av.src=AGENT_AVATAR; av.className='avatar'; wrap.appendChild(av);

    // 玻璃卡片
    const card = document.createElement('div');
    card.style.background='linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.06))';
    card.style.backdropFilter='blur(10px)';
    card.style.border='1px solid rgba(255,255,255,.18)';
    card.style.borderRadius='16px';
    card.style.padding='14px 14px 12px';
    card.style.boxShadow='0 10px 30px rgba(10,20,60,.25)';
    card.style.color='#fff';
    card.style.minWidth='240px';
    card.style.maxWidth='320px';
    card.style.animation='langCardIn .35s ease both';
    // 标题
    const title = document.createElement('div');
    title.textContent = titleText;
    title.style.fontWeight='700';
    title.style.letterSpacing='.3px';
    title.style.fontSize='14px';
    title.style.marginBottom='10px';
    card.appendChild(title);

    // 按钮区域（grid）
    const grid = document.createElement('div');
    grid.style.display='grid';
    grid.style.gridTemplateColumns='repeat(2,minmax(0,1fr))';
    grid.style.gap='10px';

    buttons.forEach((b,i)=>{
      const btn=document.createElement('button');
      btn.type='button';
      btn.style.display='flex'; btn.style.alignItems='center'; btn.style.gap='8px';
      btn.style.padding='10px 12px';
      btn.style.border='1px solid rgba(255,255,255,.22)';
      btn.style.background='rgba(255,255,255,.08)';
      btn.style.borderRadius='12px';
      btn.style.cursor='pointer';
      btn.style.color='#fff';
      btn.style.fontSize='12px';
      btn.style.fontWeight='600';
      btn.style.letterSpacing='.2px';
      btn.style.boxShadow='0 6px 16px rgba(10,20,60,.18)';
      btn.style.transition='transform .18s ease, background .18s ease, border-color .18s ease, box-shadow .18s ease';
      btn.style.animation=`btnFadeIn .3s ease ${0.05*i}s both`;

      const img=document.createElement('img');
      img.src=flagDataURL(b.flag);
      img.width=20; img.height=14;
      img.style.borderRadius='3px'; img.style.boxShadow='0 2px 8px rgba(0,0,0,.25)';
      btn.appendChild(img);

      const label=document.createElement('span');
      label.textContent=b.label;
      btn.appendChild(label);

      btn.onmouseenter=()=>{ btn.style.transform='translateY(-2px)'; btn.style.background='rgba(255,255,255,.14)'; btn.style.borderColor='rgba(255,255,255,.35)'; btn.style.boxShadow='0 10px 24px rgba(10,20,60,.28)'; };
      btn.onmouseleave=()=>{ btn.style.transform='translateY(0)';     btn.style.background='rgba(255,255,255,.08)'; btn.style.borderColor='rgba(255,255,255,.22)'; btn.style.boxShadow='0 6px 16px rgba(10,20,60,.18)'; };

      btn.onclick = b.onClick;
      grid.appendChild(btn);
    });

    card.appendChild(grid);
    wrap.appendChild(card);
    msgs.appendChild(wrap); msgs.scrollTop=msgs.scrollHeight;

    // 临时插入关键帧（仅本组件使用）
    const kf = document.createElement('style');
    kf.textContent = `
      @keyframes langCardIn { from { opacity:0; transform: translateY(6px) scale(.98);} to { opacity:1; transform: translateY(0) scale(1);} }
      @keyframes btnFadeIn { from { opacity:0; transform: translateY(4px);} to { opacity:1; transform: translateY(0);} }
    `;
    document.head.appendChild(kf);
    return wrap;
  }

  function greetByLanguage(code){
    const found = LANGS.find(l=>l.code===code) || LANGS[0];
    // RTL 处理：本列表暂不含阿语，均 LTR，直接用 addMsg
    addMsg(found.greet, false);
  }

  function showLanguagePicker(){
    // 组装按钮数据与点击逻辑
    const buttons = LANGS.map(l=>({
      label: `${l.label}`,
      flag: l.flag,
      onClick: ()=>{
        try{ cardWrap.remove(); }catch(e){}
        showTyping();
        setTimeout(()=>{
          hideTyping();
          localStorage.setItem(langStorageKey(), l.code);
          greetByLanguage(l.code);
        }, 650);
      }
    }));
    const cardWrap = addAgentRichCard('Choose your Language', buttons);
    return cardWrap;
  }

  // 进入聊天：先短加载，再弹语言选择；若当会话已选过语言，则直接按语言问候
  function startLanguageFlowOnce(){
    const chosen = localStorage.getItem(langStorageKey());
    if(chosen){
      greetByLanguage(chosen);
      return;
    }
    showTyping();
    setTimeout(()=>{ hideTyping(); showLanguagePicker(); }, 700);
  }

  function setEnded(v){
    ended=!!v; localStorage.setItem(ENDED_KEY, ended?'1':'0');
    composer.style.display=ended?'none':'flex';
    if(ended){ showToast('ended','Session ended'); showResumePill(); }
  }

  function resetIdle(){
    if(idleTimer) clearTimeout(idleTimer);
    idleTimer=setTimeout(()=>{
      if(!ended){
        ended = true; localStorage.setItem(ENDED_KEY,'1');
        hideTyping();
        fetch('/api/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:sid,action:'end',reason:'auto-inactive-15m'})});
        setEnded(true);
      }
    }, INACTIVE_MS);
  }

  function requireUID(){ composer.style.display='none'; uidModal.style.display='flex'; uidInput.focus(); }

  // UID 校验：必须 8 位数字；错误时提示并不进入
  function unlockWithUID(val){
    uid=(val||'').trim(); 
    if(!/^\d{8}$/.test(uid)){
      invalidUIDFeedback(); 
      showToast('failed','INVALID_UID'); 
      return; 
    }
    localStorage.setItem(UID_KEY, uid);
    uidModal.style.display='none';
    composer.style.display='flex';
    fetch('/api/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:sid,action:'uid',uid})}).then(()=>{
      return fetch('/api/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:sid,action:'continue'})});
    }).then(()=>{
      localStorage.setItem(ENDED_KEY,'0'); 
      setEnded(false); 
      composer.style.display='flex'; 
      showToast('connected','Connected'); 
      loadHistory();
      startLanguageFlowOnce();
      resetIdle();
    });
  }
  // 暴露给 HTML 的 onclick
  window.unlockWithUID = unlockWithUID;

  if(uid){ 
    composer.style.display=ended?'none':'flex';  
    loadHistory(); 
    if(!ended){ startLanguageFlowOnce(); }
    if(ended){ showResumePill(); } 
  } else { 
    requireUID(); 
  }

  uidOk.addEventListener('click',()=>unlockWithUID(uidInput.value));
  uidInput.addEventListener('keydown',(e)=>{ if(e.key==='Enter') unlockWithUID(uidInput.value); });

  const params=new URLSearchParams(location.search); const g=params.get('g')||'';
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = scheme + '://' + location.host + '/ws?sid=' + encodeURIComponent(sid) + (g? '&g=' + encodeURIComponent(g):'');
  const ws = new WebSocket(wsUrl);
  ws.onmessage=(ev)=>{
    try{
      const data=JSON.parse(ev.data);
      if(data.type==='FROM_AGENT_TEXT'){
        hideTyping();
        addMsg(data.text,false);
        if(!REPLAY){ try{ pushHistory({type:'text', text:data.text, me:false}); }catch(e){} }
        resetIdle();
      } else if(data.type==='FROM_AGENT_IMAGE'){
        hideTyping();
        addImage(data.url,data.caption,false);
        if(!REPLAY){ try{ pushHistory({type:'img', url:data.url, caption:data.caption, me:false}); }catch(e){} }
        resetIdle();
      }
    }catch(e){}
  };

  function send(){
    if(ended) return;
    const text=input.value.trim();
    if(!text) return;
    input.value='';
    addMsg(text,true);
    showTyping();
    fetch('/api/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:sid,text})}).catch(()=>{});
    resetIdle();
  }
  sendBtn.onclick=send;
  input.addEventListener('keydown',(e)=>{ if(e.key==='Enter') send(); });

  fileInput.addEventListener('change',()=>{
    const f=fileInput.files[0]; if(!f) return;
    if(f.size>8*1024*1024){ showToast('toolarge','Too large (8MB)'); fileInput.value=''; return; }
    const fd=new FormData(); fd.append('image',f); fd.append('sessionId',sid); fd.append('caption','');
    addImage(URL.createObjectURL(f),'',true);
    showTyping();
    fetch('/api/send-image',{method:'POST',body:fd}).catch(()=>showToast('failed','Failed')).finally(()=> fileInput.value='');
    resetIdle();
  });

  // 结束对话：防多次点击与重复通知
  btnEnd.addEventListener('click',()=>{
    if(ended) return;                
    ended = true;                    
    localStorage.setItem(ENDED_KEY,'1');
    btnEnd.style.pointerEvents='none';
    hideTyping();
    fetch('/api/status',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({sessionId:sid,action:'end',reason:'manual'})
    }).finally(()=>setEnded(true));
  });

  function invalidUIDFeedback(){
    try{
      uidInput.classList.remove('shake');
      uidInput.classList.add('invalid','shake');
      setTimeout(()=>uidInput.classList.remove('shake'),450);
    }catch(e){}
  }
})();
