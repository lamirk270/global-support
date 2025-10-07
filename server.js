import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import multer from 'multer';
import TelegramBot from 'node-telegram-bot-api';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_GROUP_ID = process.env.TELEGRAM_GROUP_ID;
if (!BOT_TOKEN) { throw new Error('Missing TELEGRAM_BOT_TOKEN'); }
if (!DEFAULT_GROUP_ID) { throw new Error('Missing TELEGRAM_GROUP_ID'); }

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();
app.use(bodyParser.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

const sessions = new Map(); // sid -> { ws, ended, uid }
const wss = new WebSocketServer({ noServer: true });
function send(ws, payload){ try{ ws.send(JSON.stringify(payload)); }catch(_){} }

app.get('/healthz', (_,res)=>res.send('ok'));

app.post('/api/send', async (req,res)=>{
  const { sessionId, text, groupId } = req.body || {};
  if(!sessionId || !text) return res.status(400).json({ok:false});
  const s = sessions.get(sessionId) || {};
  if(s.ended) return res.status(403).json({ok:false});
  const gid = groupId || DEFAULT_GROUP_ID;
  const tag = `#S${sessionId}`;
  const uidLine = s.uid ? ` (UID: ${s.uid})` : '';
  const header = `${tag}${uidLine} from visitor:`;
  await bot.sendMessage(gid, `${header}\n${text}`);
  res.json({ok:true});
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
app.post('/api/send-image', upload.single('image'), async (req,res)=>{
  const { sessionId, caption, groupId } = req.body || {};
  if(!sessionId || !req.file) return res.status(400).json({ok:false});
  const s = sessions.get(sessionId) || {};
  if(s.ended) return res.status(403).json({ok:false});
  const gid = groupId || DEFAULT_GROUP_ID;
  const tag = `#S${sessionId}`;
  const uidLine = s.uid ? ` (UID: ${s.uid})` : '';
  const header = `${tag}${uidLine} from visitor (image):`;
  await bot.sendPhoto(gid, req.file.buffer, { caption: `${header}\n${caption||''}`.trim() });
  res.json({ok:true});
});

app.post('/api/status', async (req,res)=>{
  const { sessionId, action, uid, groupId, reason } = req.body || {};
  if(!sessionId || !action) return res.status(400).json({ok:false});
  const gid = groupId || DEFAULT_GROUP_ID;
  let s = sessions.get(sessionId);
  if(!s){ s = { ws:null, ended:false, uid:null }; sessions.set(sessionId, s); }
  if(action==='end'){
    s.ended = true;
    await bot.sendMessage(gid, `#S${sessionId}${s.uid?` (UID: ${s.uid})`:''} ended${reason?` (${reason})`:''}`);
  }else if(action==='continue'){
    s.ended = false;
    await bot.sendMessage(gid, `#S${sessionId}${s.uid?` (UID: ${s.uid})`:''} resumed`);
  }else if(action==='uid'){
    s.uid = (uid||'').trim();
    await bot.sendMessage(gid, `#S${sessionId} UID submitted: ${s.uid}`);
  }
  res.json({ok:true, ended:s.ended, uid:s.uid});
});

bot.on('message', async (msg)=>{
  const reply = msg.reply_to_message;
  if(!reply) return;
  const pick = (reply.text || reply.caption || '').match(/#S(\w+)/);
  if(!pick) return;
  const sessionId = pick[1];
  const s = sessions.get(sessionId);
  if(!s || !s.ws) return;
  if(msg.text){
    // typing protocol
    const t = (msg.text||'').trim();
    if(t === ':typing:') { send(s.ws,{type:'FROM_AGENT_TYPING', on:true}); return; }
    if(t === ':stop:') { send(s.ws,{type:'FROM_AGENT_TYPING', on:false}); return; }
    send(s.ws, { type:'FROM_AGENT_TEXT', text: msg.text });
  }else if(msg.photo && msg.photo.length){
    try{
      const best = msg.photo[msg.photo.length-1];
      const file = await bot.getFile(best.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
      send(s.ws, { type:'FROM_AGENT_IMAGE', url:fileUrl, caption: msg.caption || '' });
    }catch(_){}
  }
});

const server = app.listen(process.env.PORT || 3000, ()=>console.log('88U BluePurple v8 running'));
server.on('upgrade',(req,socket,head)=>{
  const url = new URL(req.url, 'http://localhost');
  if(url.pathname !== '/ws') return socket.destroy();
  const sid = url.searchParams.get('sid');
  const gid = url.searchParams.get('g') || DEFAULT_GROUP_ID;
  if(!sid || !gid) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws)=>{
    const prev = sessions.get(sid) || { ended:false, uid:null };
    sessions.set(sid, { ws, ended: prev.ended, uid: prev.uid });
    ws.on('close', ()=>{ const s = sessions.get(sid); if(s) s.ws = null; });
  });
});
