// Minimal clean game script (game_clean.js)
// Shows QKD status box (top-left) and entangled-pair preview (bottom-left).

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const state = {
  time: 0,
  keys: {},
  scene: 'battle',
  tank: { x: 100, y: 420, w: 56, h: 30, vx: 0, vy: 0, angle: 0 },
  drone: { x: 480, y: 120, r: 18 },
  qkd: { active: false, result: null, mouseX: 0, mouseY: 0, hoverIndex: -1, previewCount: 24, previewAnimStart: 0 },
  laserOn: false,
  status: 'Idle',
  eve: false,
  cipherHex: '',
  received: '',
};

const statusEl = document.getElementById('status');
const e91Log = document.getElementById('e91Log');

window.addEventListener('keydown', e => state.keys[e.code] = true);
window.addEventListener('keyup', e => state.keys[e.code] = false);
canvas.addEventListener('mousemove', (e) => { const r = canvas.getBoundingClientRect(); state.qkd.mouseX = e.clientX - r.left; state.qkd.mouseY = e.clientY - r.top; });
canvas.addEventListener('mouseleave', () => state.qkd.hoverIndex = -1);

function updateHudStatus(){ if (!statusEl) return; let s = 'Status: ' + state.status; if (state.qkd.result) s += ` | QBER ${(state.qkd.result.qber*100).toFixed(2)}% | S ${state.qkd.result.S.toFixed(2)}`; statusEl.textContent = s; }

function update(dt){ state.time += dt; if (state.scene === 'battle') updateBattle(dt); }

function updateBattle(dt){ const t = state.tank; const d = dt/16.67; if (state.keys['ArrowLeft']) t.vx = (t.vx||0) - 0.01*d; if (state.keys['ArrowRight']) t.vx = (t.vx||0) + 0.01*d; if (state.keys['ArrowUp']) t.vy = (t.vy||0) - 0.004*d; if (state.keys['ArrowDown']) t.vy = (t.vy||0) + 0.004*d; t.vx = (t.vx||0)*0.92; t.vy = (t.vy||0)*0.92; t.x = Math.max(40, Math.min(canvas.width-40-t.w, t.x + (t.vx||0)*d*60)); t.y = Math.max(300, Math.min(canvas.height-40-t.h, t.y + (t.vy||0)*d*60));
  const underDrone = Math.abs((t.x + t.w/2) - state.drone.x) < 24; state.laserOn = underDrone;
  if (state.laserOn && !state.qkd.active) {
    state.qkd.active = true; state.status = 'Establishing E91...'; updateHudStatus();
    setTimeout(()=>{ const result = QKD.simulateE91Detailed({ pairCount:1024, evePresent: state.eve, logLimit:24 }); state.qkd.result = result; state.qkd.previewAnimStart = state.time; window.__qkd_key_bits = result.aliceKey; state.status = result.breach ? 'BREACH' : 'Secure'; if (e91Log) e91Log.textContent = result.logs.join('\n'); updateHudStatus(); }, 800);
  }
  if (!state.qkd._lastPreviewChangeTime) state.qkd._lastPreviewChangeTime = 0;
  if (state.keys['BracketRight'] && (state.time - state.qkd._lastPreviewChangeTime) > 180) { state.qkd.previewCount = Math.min(48,(state.qkd.previewCount||12)+6); state.qkd._lastPreviewChangeTime = state.time; }
  if (state.keys['BracketLeft'] && (state.time - state.qkd._lastPreviewChangeTime) > 180) { state.qkd.previewCount = Math.max(6,(state.qkd.previewCount||12)-6); state.qkd._lastPreviewChangeTime = state.time; }
}

function drawQKDVisualization(){
  const sx=10, sy=10, sw=320, sh=100; ctx.fillStyle='rgba(0,0,0,0.85)'; ctx.fillRect(sx,sy,sw,sh); ctx.strokeStyle='#3b82f6'; ctx.strokeRect(sx,sy,sw,sh); ctx.fillStyle='#60a5fa'; ctx.font='bold 14px monospace'; ctx.fillText('E91 QKD Protocol Status', sx+10, sy+20);
  ctx.fillStyle='#e5e7eb'; ctx.font='12px monospace';
  if (state.qkd.active && state.qkd.result){ const r = state.qkd.result; ctx.fillText(`Status: ${r.breach?'BREACH':'SECURE'}`, sx+10, sy+40); ctx.fillText(`QBER: ${(r.qber*100).toFixed(2)}%`, sx+10, sy+55); ctx.fillText(`CHSH S: ${r.S.toFixed(3)}`, sx+10, sy+70); ctx.fillText(`Key: ${r.kept} bits`, sx+10, sy+85); ctx.fillStyle = r.breach? '#ef4444' : '#10b981'; ctx.beginPath(); ctx.arc(sx+sw-20, sy+20, 8,0,Math.PI*2); ctx.fill(); }
  else if (state.qkd.active) { ctx.fillText('Establishing quantum link...', sx+10, sy+40); ctx.fillText('Measuring...', sx+10, sy+55); }
  else { ctx.fillText('Waiting for tank alignment', sx+10, sy+40); ctx.fillText('Move tank under drone to start QKD', sx+10, sy+55); }

  const bx=10, bh=120, by=canvas.height-bh-10, bw=320; ctx.fillStyle='rgba(0,0,0,0.85)'; ctx.fillRect(bx,by,bw,bh); ctx.strokeStyle='#3b82f6'; ctx.strokeRect(bx,by,bw,bh); ctx.fillStyle='#60a5fa'; ctx.font='bold 12px monospace'; ctx.fillText('Entangled pairs (preview)', bx+10, by+16);
  const preview = state.qkd.result && state.qkd.result.pairsPreview ? state.qkd.result.pairsPreview : null; const PREBASES=[0,45];
  if (preview && preview.length){ const want = state.qkd.previewCount||preview.length; const use = preview.slice(0, Math.min(want, preview.length)); const pad=10; const avail=bw-pad*2; const cols=Math.min(Math.max(1,Math.floor(avail/44)), use.length); const spX=Math.floor(avail/cols); const spY=26; const stX=bx+pad; const stY=by+36; const rects=[];
    for (let i=0;i<use.length;i++){ const p=use[i]; const col=i%cols; const row=Math.floor(i/cols); const ax=stX+col*spX; const ay=stY+row*spY; const bx2=ax+18; const by2=ay; const acol=p.aliceOutcome? '#60a5fa':'#a7f3d0'; const bcol=p.bobOutcome? '#7c3aed':'#fbbf24'; let pulse=1; if(p.altered) pulse=0.6+0.4*Math.abs(Math.sin((state.time/100)*2+i)); ctx.lineWidth=2; if(p.aliceOutcome===p.bobOutcome) ctx.strokeStyle = p.basesMatch? `rgba(16,185,129,${pulse})` : `rgba(147,197,253,${pulse})`; else ctx.strokeStyle=`rgba(239,68,68,${pulse})`; ctx.beginPath(); ctx.moveTo(ax+6,ay); ctx.lineTo(bx2+6,by2); ctx.stroke(); ctx.fillStyle=acol; ctx.beginPath(); ctx.arc(ax+6,ay,6,0,Math.PI*2); ctx.fill(); ctx.fillStyle=bcol; ctx.beginPath(); ctx.arc(bx2+6,by2,6,0,Math.PI*2); ctx.fill(); if(p.aliceOutcome!==p.bobOutcome){ ctx.strokeStyle=`rgba(255,255,255,${0.6*pulse})`; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(bx2+6,by2,8,0,Math.PI*2); ctx.stroke(); } ctx.fillStyle='#cbd5e1'; ctx.font='9px monospace'; ctx.fillText(PREBASES[p.aliceBase]+'°', ax-2, ay+14); ctx.fillText(PREBASES[p.bobBase]+'°', bx2-2, by2+14); rects.push({x:ax,y:ay-8,w:36,h:18,pair:p}); }
    state.qkd.hoverIndex=-1; for (let r=0;r<rects.length;r++){ const rr=rects[r]; if (state.qkd.mouseX>=rr.x && state.qkd.mouseX<=rr.x+rr.w && state.qkd.mouseY>=rr.y && state.qkd.mouseY<=rr.y+rr.h){ state.qkd.hoverIndex=r; break; } }
    if (state.qkd.hoverIndex>=0){ const rr=rects[state.qkd.hoverIndex]; const p=rr.pair; const tipX=Math.min(bx+bw-160, state.qkd.mouseX+12); const tipY=Math.max(by+8, state.qkd.mouseY-8); ctx.fillStyle='rgba(0,0,0,0.85)'; ctx.fillRect(tipX, tipY, 150, 60); ctx.strokeStyle='#3b82f6'; ctx.strokeRect(tipX, tipY, 150, 60); ctx.fillStyle='#e5e7eb'; ctx.font='11px monospace'; ctx.fillText(`Pair ${p.index}`, tipX+8, tipY+16); ctx.fillText(`Alice base: ${PREBASES[p.aliceBase]}° -> ${p.aliceOutcome}`, tipX+8, tipY+30); ctx.fillText(`Bob   base: ${PREBASES[p.bobBase]}° -> ${p.bobOutcome}`, tipX+8, tipY+44); ctx.fillText(`Altered: ${p.altered? 'YES':'NO'}`, tipX+8, tipY+58-2); }
    ctx.fillStyle='#e5e7eb'; ctx.font='11px monospace'; ctx.fillText(`Pairs preview: ${use.length} (use [ / ] to change)`, bx+10, by+bh-8);
  } else { ctx.fillStyle='#cbd5e1'; ctx.font='11px monospace'; ctx.fillText('Pair preview: (no preview available)', bx+10, by+bh-8); }
}

function draw(){ ctx.clearRect(0,0,canvas.width,canvas.height); drawQKDVisualization(); }

let last = performance.now(); function loop(ts){ const dt = ts-last; last = ts; update(dt); draw(); requestAnimationFrame(loop); }
requestAnimationFrame(loop);
