const $=s=>document.querySelector(s);
const PRESETS={
"Data hazards":"addi x1, x0, 5\naddi x2, x0, 7\nadd x3, x1, x2\nsub x4, x3, x1\nsw x4, 0(x0)",
"Load-use stall":"addi x1, x0, 9\nsw x1, 0(x0)\nlw x2, 0(x0)\nadd x3, x2, x2\nadd x4, x3, x2",
"Loop with branch":"addi x1, x0, 3\naddi x2, x0, 0\nloop: add x2, x2, x1\naddi x1, x1, -1\nbne x1, x0, loop\nsw x2, 0(x0)"
};
const SG=['IF','ID','EX','MEM','WB'];
const R=t=>{const m=/^x(\d+)$/i.exec(t||'');if(!m||+m[1]>31)throw Error('Bad register "'+t+'". Use x0 to x31.');return +m[1]};
function parse(src){
  const labels={},raw=[];
  for(let l of src.split('\n')){l=l.replace(/#.*/,'').trim();let m;while((m=/^(\w+):\s*(.*)$/.exec(l))){labels[m[1]]=raw.length;l=m[2]}if(l)raw.push(l)}
  return raw.map(t=>{
    const [op,...a]=t.split(/[\s,()]+/).filter(Boolean);
    const I={op:op.toLowerCase(),text:t,rd:null,rs1:null,rs2:null,imm:0};
    const n=k=>{if(a.length<k)throw Error('Missing operand in "'+t+'"')};
    if(['add','sub','and','or'].includes(I.op)){n(3);I.rd=R(a[0]);I.rs1=R(a[1]);I.rs2=R(a[2])}
    else if(I.op=='addi'){n(3);I.rd=R(a[0]);I.rs1=R(a[1]);I.imm=+a[2]}
    else if(I.op=='lw'){n(3);I.rd=R(a[0]);I.imm=+a[1];I.rs1=R(a[2])}
    else if(I.op=='sw'){n(3);I.rs2=R(a[0]);I.imm=+a[1];I.rs1=R(a[2])}
    else if(I.op=='beq'||I.op=='bne'){n(3);I.rs1=R(a[0]);I.rs2=R(a[1]);if(!(a[2] in labels))throw Error('Unknown label "'+a[2]+'"');I.tgt=labels[a[2]]}
    else if(I.op!='nop')throw Error('Unsupported instruction "'+op+'"');
    if(isNaN(I.imm))throw Error('Bad number in "'+t+'"');
    return I});
}
const wr=I=>I.rd!=null&&I.rd!==0;
const srcs=I=>[I.rs1,I.rs2].filter(r=>r!=null&&r!==0);
const alu=(op,a,b)=>op=='sub'?(a-b)|0:op=='and'?a&b:op=='or'?a|b:(a+b)|0;
const init=()=>({cyc:0,pc:0,regs:Array(32).fill(0),mem:{},L:{IF:null,ID:null,EX:null,MEM:null,WB:null},rows:[],ev:[],done:false,ret:0,stalls:0,flushes:0});

// Pure simulator core: step(state) -> new state. No DOM access.
function step(S,P,fwd){
  const s=JSON.parse(JSON.stringify(S)),o=s.L,n={IF:null,ID:null,EX:null,MEM:null,WB:null},c=s.cyc,log=t=>s.ev.push({c:c+1,t});
  const cell=(x,st,k)=>{s.rows[x.id].cells[c+1]={s:st,k:k||''}};
  const fetch=()=>{if(s.pc>=P.length)return null;if(s.rows.length>=120){if(!s.capped){s.capped=1;log('Stopped fetching after 120 instructions.')}return null}
    const x={id:s.rows.length,i:s.pc};s.rows.push({id:x.id,i:x.i,cells:{}});s.pc++;return x};
  if(o.WB){const I=P[o.WB.i];if(wr(I))s.regs[I.rd]=o.WB.val;s.ret++}
  if(o.MEM){const x=o.MEM,I=P[x.i];x.val=x.res;if(I.op=='lw')x.val=s.mem[x.res]||0;if(I.op=='sw')s.mem[x.res]=x.sd;n.WB=x}
  let flush=false;
  if(o.EX){const x=o.EX,I=P[x.i];let a=x.a,b=x.b;
    const fw=(r,v)=>{if(r==null||r===0)return v;const m=o.MEM,w=o.WB;let from=null,val=v;
      if(m&&wr(P[m.i])&&P[m.i].rd===r){from='MEM';val=m.res}
      else if(w&&wr(P[w.i])&&P[w.i].rd===r){from='WB';val=w.val}
      if(from){const ce=s.rows[x.id].cells[c];ce.f=(ce.f?ce.f+' ':'')+'x'+r+' from '+from;log('Forwarded x'+r+' from '+from+' into "'+I.text+'"')}
      return val};
    if(fwd){a=fw(I.rs1,a);b=fw(I.rs2,b)}
    if(I.op=='lw'||I.op=='sw'){x.res=a+I.imm;x.sd=b}
    else if(I.op=='beq'||I.op=='bne'){if(I.op=='beq'?a==b:a!=b){flush=true;s.pc=I.tgt;log('Branch taken in "'+I.text+'": flushing 2 instructions')}}
    else if(I.op!='nop')x.res=alu(I.op,a,I.op=='addi'?I.imm:b);
    n.MEM=x}
  let stall=false;
  if(o.ID&&!flush){const I=P[o.ID.i];
    for(const r of srcs(I)){const e=o.EX&&wr(P[o.EX.i])&&P[o.EX.i].rd===r,m=o.MEM&&wr(P[o.MEM.i])&&P[o.MEM.i].rd===r;
      if(fwd?(e&&P[o.EX.i].op=='lw'):(e||m)){stall=true;log('Stall: "'+I.text+'" waits for x'+r)}}}
  if(flush){s.flushes+=2;n.IF=null;n.ID=null;[o.IF,o.ID].forEach(x=>x&&cell(x,'✕','flush'));n.IF=fetch()}
  else if(stall){s.stalls++;n.ID=o.ID;n.IF=o.IF}
  else{if(o.ID){const x=o.ID,I=P[x.i];x.a=I.rs1!=null?s.regs[I.rs1]:0;x.b=I.rs2!=null?s.regs[I.rs2]:0;n.EX=x}
    n.ID=o.IF;n.IF=fetch()}
  SG.forEach(st=>{const x=n[st];if(x)cell(x,st,stall&&(st=='IF'||st=='ID')?'stall':'')});
  s.cyc=c+1;s.L=n;s.ev=s.ev.slice(-60);
  s.done=SG.every(k=>!n[k])&&(s.pc>=P.length||!!s.capped);
  return s;
}

let P=[],S=init(),hist=[],timer=null;
const fwdOn=()=>$('#fwd').checked;
function reset(){stop();$('#err').textContent='';
  try{P=parse($('#src').value)}catch(e){$('#err').textContent=e.message;return}
  S=init();hist=[];render()}
function stop(){if(timer){clearInterval(timer);timer=null}$('#run').textContent='Run'}
function next(){if(S.done||!P.length){stop();return}hist.push(S);if(hist.length>400)hist.shift();S=step(S,P,fwdOn());render();if(S.done)stop()}
function back(){stop();if(hist.length){S=hist.pop();render()}}
function render(){
  $('#stages').innerHTML=SG.map(k=>{const x=S.L[k];
    if(!x)return `<div class="st empty"><b>${k}</b><span>idle</span></div>`;
    const ce=S.rows[x.id].cells[S.cyc]||{};
    return `<div class="st ${k} ${ce.k=='stall'?'stall':''}"><b>${k}${ce.k=='stall'?' (held)':''}</b><span>${esc(P[x.i].text)}</span></div>`}).join('');
  const cols=Math.max(S.cyc,12);
  let h='<tr><th></th>';for(let i=1;i<=cols;i++)h+=`<th class="${i==S.cyc?'cur':''}">${i}</th>`;h+='</tr>';
  for(const r of S.rows){h+=`<tr><td class="lab">${esc(P[r.i].text)}</td>`;
    for(let i=1;i<=cols;i++){const ce=r.cells[i];
      h+=ce?`<td class="c ${ce.s=='✕'?'':ce.s} ${ce.k} ${i==S.cyc?'cur':''}" title="${ce.f?'Forwarded: '+ce.f:''}">${ce.s}${ce.f?'<i>⇢</i>':''}</td>`:`<td class="c ${i==S.cyc?'cur':''}"></td>`}
    h+='</tr>'}
  $('#tl').innerHTML=h;
  const w=$('#wrap');w.scrollLeft=Math.max(0,(S.cyc-9)*36);
  const cpi=S.ret?(S.cyc/S.ret).toFixed(2):'–';
  $('#metrics').innerHTML=[['Cycle',S.cyc],['Retired',S.ret],['CPI',cpi],['Stall cycles',S.stalls],['Flushed',S.flushes]].map(([a,b])=>`<div>${a}<b>${b}</b></div>`).join('');
  const pv=hist.length?hist[hist.length-1].regs:S.regs;
  $('#regs').innerHTML=S.regs.map((v,i)=>`<div class="${v?'nz':''} ${v!==pv[i]?'ch':''}"><span>x${i}</span><span>${v}</span></div>`).join('');
  const mk=Object.keys(S.mem).filter(k=>S.mem[k]);
  $('#mem').textContent=mk.length?'Memory: '+mk.map(k=>`[${k}]=${S.mem[k]}`).join('  '):'Memory: all zero';
  $('#log').innerHTML=S.ev.slice().reverse().slice(0,30).map(e=>`<li><b>Cycle ${e.c}</b> ${esc(e.t)}</li>`).join('')||'<li>Press Step to start.</li>';
  $('#step').disabled=S.done;$('#back').disabled=!hist.length;
}
const esc=t=>String(t).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
$('#preset').innerHTML=Object.keys(PRESETS).map(k=>`<option>${k}</option>`).join('');
$('#preset').onchange=()=>{$('#src').value=PRESETS[$('#preset').value];reset()};
$('#step').onclick=()=>{stop();next()};
$('#back').onclick=back;$('#reset').onclick=reset;
$('#run').onclick=()=>{if(timer){stop();return}if(S.done)reset();$('#run').textContent='Pause';timer=setInterval(next,450)};
$('#fwd').onchange=reset;
$('#src').oninput=()=>{clearTimeout(window._d);window._d=setTimeout(reset,500)};
document.addEventListener('keydown',e=>{if(e.target.tagName=='TEXTAREA'||e.target.tagName=='SELECT')return;if(e.key=='ArrowRight'){stop();next()}if(e.key=='ArrowLeft')back()});
$('#src').value=PRESETS["Data hazards"];reset();
