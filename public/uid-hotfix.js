(function(){
  function newSid(){ return (Date.now().toString(36)+Math.random().toString(36).slice(2,8)); }
  function getGroupIdFromURL(){
    try {
      var u=new URL(location.href);
      return u.searchParams.get('g') || null;
    } catch(_) { return null; }
  }

  // Global unlock
  window.unlockWithUID = function(val){
    try{
      var inp = document.getElementById('uidInput');
      val = (val||'').trim();
      window.__lastUID = val;

      // 必须是 8 位数字
      if(!/^\d{8}$/.test(val)){
        if(inp){
          inp.classList.add('invalid');
          inp.classList.add('shake');
          setTimeout(()=>{ try{ inp.classList.remove('shake'); }catch(_){ } }, 450);
        }
        toast('INVALID_UID');
        return;
      }

      var uid = val;
      localStorage.setItem('hs_uid', uid);

      // 生成 sid
      var sidKey = 'hs_sid_' + uid;
      var sid = localStorage.getItem(sidKey);
      if(!sid){
        sid = newSid();
        localStorage.setItem(sidKey, sid);
      }
      // 同步写入三处，避免不一致
      localStorage.setItem('hs_sid', sid);
      localStorage.setItem('hs_sid_', sid);

      // 状态复位
      localStorage.setItem('hs_ended','0');

      // UI: 打开聊天框
      var modal = document.getElementById('uidModal');
      var comp = document.getElementById('composer');
      if(modal) modal.style.display='none';
      if(comp) comp.style.display='flex';

      // 通知服务端：uid + continue
      fetch('/api/status',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body: JSON.stringify({sessionId:sid, action:'uid', uid, groupId:getGroupIdFromURL()})
      }).then(()=>{
        return fetch('/api/status',{
          method:'POST',
          headers:{'content-type':'application/json'},
          body: JSON.stringify({sessionId:sid, action:'continue', groupId:getGroupIdFromURL()})
        });
      });

      showToast('connected','Connected');
    }catch(e){
      console.error('unlock fatal', e);
      alert('Unlock fatal: '+(e && e.message || e));
    }
  };

  // ------- 兜底发送 --------
  function qs(id){ return document.getElementById(id); }
  function addUserBubble(text){
    var msgs=qs('msgs'); if(!msgs) return;
    var wrap=document.createElement('div');
    wrap.className='msg me';
    var span=document.createElement('div');
    span.textContent=text;
    wrap.appendChild(span);
    msgs.appendChild(wrap);
    msgs.scrollTop=msgs.scrollHeight;
  }
  function addAgentBubble(text){
    var msgs=qs('msgs'); if(!msgs) return;
    var wrap=document.createElement('div');
    wrap.className='msg';
    var av=document.createElement('img'); av.className='avatar'; av.src='/agent.png';
    wrap.appendChild(av);
    var span=document.createElement('div'); span.textContent=text;
    wrap.appendChild(span);
    msgs.appendChild(wrap);
    msgs.scrollTop=msgs.scrollHeight;
  }

  function sendFallback(){
    var input=qs('input'), btn=qs('send');
    if(!input || !btn) return;
    if(!btn.__hfix_bound){
      btn.addEventListener('click', function(){
        var text=input.value.trim();
        if(!text) return;
        input.value='';
        addUserBubble(text);
        var sid = localStorage.getItem('hs_sid') || '';
        fetch('/api/send',{
          method:'POST',
          headers:{'content-type':'application/json'},
          body: JSON.stringify({sessionId:sid, text:text, groupId:getGroupIdFromURL()})
        }).then(r=>r.json()).then(res=>{
          if(res && res.reply){ addAgentBubble(res.reply); }
        });
      });
      btn.__hfix_bound=true;
    }
    if(!input.__hfix_enter){
      input.addEventListener('keydown',function(e){
        if(e.key==='Enter' && !e.shiftKey){
          e.preventDefault(); btn.click();
        }
      });
      input.__hfix_enter=true;
    }
  }

  // ------- 图片上传 --------
  function bindFileUpload(){
    var fileInput=qs('file');
    if(!fileInput || fileInput.__hfix_bound) return;
    fileInput.addEventListener('change', function(){
      var f=fileInput.files[0];
      if(!f) return;
      var sid=localStorage.getItem('hs_sid')||'';
      var fd=new FormData();
      fd.append('image', f);
      fd.append('sessionId', sid);
      fd.append('caption','');
      fd.append('groupId', getGroupIdFromURL());
      fetch('/api/send-image',{method:'POST', body:fd});
    });
    fileInput.__hfix_bound=true;
  }

  // ------- 结束聊天 --------
  function bindEndButton(){
    var btnEnd=qs('btn-end');
    if(!btnEnd || btnEnd.__hfix_bound) return;
    btnEnd.addEventListener('click', function(){
      var sid=localStorage.getItem('hs_sid')||'';
      fetch('/api/status',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body: JSON.stringify({sessionId:sid, action:'end', reason:'manual', groupId:getGroupIdFromURL()})
      }).then(()=>{ try{ setEnded(true); }catch(_){ } });
    });
    btnEnd.__hfix_bound=true;
  }

  // ------- 自动打招呼 Hello --------
  function autoHello(){
    var msgs=qs('msgs'), comp=qs('composer');
    if(!msgs || !comp) return;
    if(msgs.children.length>0) return;
    var wrap=document.createElement('div');
    wrap.className='msg';
    var av=document.createElement('img'); av.className='avatar'; av.src='/agent.png';
    wrap.appendChild(av);
    var span=document.createElement('div'); span.textContent='Hello';
    wrap.appendChild(span);
    msgs.appendChild(wrap);
    msgs.scrollTop=msgs.scrollHeight;
  }

  // Init after DOM ready
  function init(){
    sendFallback();
    bindFileUpload();
    bindEndButton();
    autoHello();
  }
  if(document.readyState!=='loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
