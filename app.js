/* Device data contract (BLE UART, newline-terminated JSON):
   {"t":123,"ecg":512,"ppg":2048,"pcg":-3}   samples (any subset)
   {"hr":72,"spo2":97,"sys":118,"dia":76,"bat":88}   summary ~1/s (sys/dia optional)
   App sends "START\n" / "STOP\n". */
var NUS="6e400001-b5a3-f393-e0a9-d50e24dcca9e",RX="6e400002-b5a3-f393-e0a9-d50e24dcca9e",TX="6e400003-b5a3-f393-e0a9-d50e24dcca9e";
var $=function(s){return document.querySelector(s)},$$=function(s){return document.querySelectorAll(s)};
function ls(k,d){try{var v=localStorage.getItem(k);return v===null?d:JSON.parse(v)}catch(e){return d}}
function lw(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
var S={hr:null,spo2:null,bat:null,sys:null,dia:null,q:null,src:"",wave:[],conn:false,live:false};
var user=ls("user",{name:"there"}),doc=ls("doc",{name:"",email:""}),hist=ls("hist",[]);
var dev=null,rxChar=null,simTimer=null,partial="";

function toast(m){var t=$("#toast");t.textContent=m;t.classList.add("on");clearTimeout(toast.h);toast.h=setTimeout(function(){t.classList.remove("on")},2400)}
function go(id){
  $$(".scr").forEach(function(s){s.classList.toggle("on",s.id===id)});
  $$(".pill button").forEach(function(b){if(b.dataset.n===id)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});
  if(id!=="check")stopCheck();window.scrollTo(0,0);ui();
}
document.addEventListener("click",function(e){var b=e.target.closest("[data-go]");if(b)go(b.dataset.go)});

/* ---------- state -> UI ---------- */
function resText(){
  if(S.hr==null)return "No reading yet. Connect your device or use the Check tab.";
  if(S.hr<50)return "Heart rate is below the usual resting range (50–100). If you feel unwell, contact a doctor.";
  if(S.hr>100)return "Heart rate is above the usual resting range (50–100). Rest and re-check; contact a doctor if you feel unwell.";
  return "Heart rate is within the usual resting range. This is an estimate, not a diagnosis.";
}
function ui(){
  var ini=(user.name||"J").trim().charAt(0).toUpperCase()||"J";
  $("#avBtn").textContent=ini;$("#av2").textContent=ini;$("#nm").textContent=user.name;$("#nm2").textContent=user.name;
  var h=S.hr==null?"--":Math.round(S.hr);
  $("#liveHr").textContent=h;$("#rhV").textContent=h;$("#dHr").textContent=h;
  $("#batV").textContent=S.bat==null?"--%":Math.round(S.bat)+"%";
  var n=S.bat==null?0:Math.round(S.bat/20);for(var i=1;i<=5;i++)$("#b"+i).className=i<=n?"f":"";
  $("#bpV").textContent=S.sys!=null&&S.dia!=null?Math.round(S.sys)+"/"+Math.round(S.dia):"--/--";
  $("#spV").textContent=S.spo2==null?"--":Math.round(S.spo2);
  var c1=540.4,c2=389.6;$("#r1").style.strokeDashoffset=S.spo2==null?c1:c1*(1-S.spo2/100);
  $("#r2").style.strokeDashoffset=S.q==null?c2:c2*(1-Math.min(1,S.q));
  $("#tagQ").textContent="Signal "+(S.q==null?"--":Math.round(S.q*100)+"%");$("#tagS").textContent="Source "+(S.src||"--");$("#srcChip").textContent=S.src||"No source";
  $("#resTxt").textContent=resText();
  var last=hist[hist.length-1];$("#lastCheck").textContent=last?"Last check: "+new Date(last.ts).toLocaleString([],{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"No check yet";
  $("#connT").textContent=S.conn?(S.live?"Demo running · Stop":"Connected · Disconnect"):"Connect";
  $("#docN").textContent=doc.name||"Add your doctor";$("#docR").textContent=doc.email||"Tap the circle to set name and email";
  $("#docAv").textContent=(doc.name||"D").charAt(0).toUpperCase();
  var hl=$("#hist");hl.innerHTML="";
  hist.slice(-6).reverse().forEach(function(x){var d=document.createElement("div");d.className="hist";
    d.innerHTML="<span>"+new Date(x.ts).toLocaleDateString([],{day:"numeric",month:"short"})+" · "+x.src+"</span><b>"+x.hr+" bpm"+(x.spo2!=null?" · "+x.spo2+"%":"")+(x.sys!=null?" · "+x.sys+"/"+x.dia:"")+"</b>";hl.appendChild(d)});
  if(!hist.length)hl.innerHTML='<p class="mut">Saved readings appear here.</p>';
}
setInterval(ui,500);
$("#avBtn").onclick=function(){var n=prompt("Your name",user.name==="there"?"":user.name);if(n!==null){user.name=n.trim()||"there";lw("user",user);ui()}};
$("#docAv").onclick=function(){var n=prompt("Doctor name",doc.name);if(n===null)return;var e=prompt("Doctor email",doc.email);doc={name:n.trim(),email:(e||"").trim()};lw("doc",doc);ui()};
function summary(){return hist.slice(-5).map(function(x){return new Date(x.ts).toLocaleString()+": HR "+x.hr+" bpm"+(x.spo2!=null?", SpO2 "+x.spo2+"%":"")+(x.sys!=null?", BP "+x.sys+"/"+x.dia:"")+" ("+x.src+")"}).join("\n")}
$("#docSend").onclick=function(){
  if(!hist.length){toast("Save a reading first");return}
  if(!doc.email){toast("Add your doctor’s email first");$("#docAv").click();return}
  location.href="mailto:"+encodeURIComponent(doc.email)+"?subject="+encodeURIComponent("HAMDARD readings from "+user.name)+"&body="+encodeURIComponent("Recent screening estimates (not a diagnosis):\n\n"+summary());
};
function saveReading(src){
  if(S.hr==null){toast("No reading to save yet");return}
  hist.push({ts:Date.now(),hr:Math.round(S.hr),spo2:S.spo2==null?null:Math.round(S.spo2),sys:S.sys==null?null:Math.round(S.sys),dia:S.dia==null?null:Math.round(S.dia),src:src||S.src||"device"});
  hist=hist.slice(-200);lw("hist",hist);ui();toast("Reading saved");
}
$("#saveR").onclick=function(){saveReading()};
$("#csvR").onclick=function(){
  if(!hist.length){toast("Nothing to export yet");return}
  var rows=["time,hr_bpm,spo2,sys,dia,source"].concat(hist.map(function(x){return [new Date(x.ts).toISOString(),x.hr,x.spo2==null?"":x.spo2,x.sys==null?"":x.sys,x.dia==null?"":x.dia,x.src].join(",")}));
  var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([rows.join("\n")],{type:"text/csv"}));a.download="hamdard_readings.csv";a.click();
};

/* ---------- device data (BLE or simulator) ---------- */
function onLine(line){
  line=line.trim();if(!line)return;var o;try{o=JSON.parse(line)}catch(e){return}
  if(typeof o.ecg==="number"||typeof o.ppg==="number"){S.wave.push(typeof o.ecg==="number"?o.ecg:o.ppg);if(S.wave.length>600)S.wave.shift()}
  ["hr","spo2","sys","dia","bat"].forEach(function(k){if(typeof o[k]==="number")S[k]=o[k]});
  if(typeof o.hr==="number"&&S.q==null)S.q=0.9;
  S.src=S.live?"Demo":"Device";
}
function onChunk(t){partial+=t;var p=partial.split("\n");partial=p.pop();p.forEach(onLine)}
async function bleConnect(){
  if(!navigator.bluetooth){toast("Bluetooth not available here. Use Chrome on Android, or try demo data.");return}
  try{
    stopSim();
    dev=await navigator.bluetooth.requestDevice({filters:[{services:[NUS]}],optionalServices:[NUS]});
    dev.addEventListener("gattserverdisconnected",function(){S.conn=false;S.live=false;ui();toast("Device disconnected")});
    var srv=await dev.gatt.connect(),svc=await srv.getPrimaryService(NUS),tx=await svc.getCharacteristic(TX);
    rxChar=await svc.getCharacteristic(RX);var dec=new TextDecoder();
    tx.addEventListener("characteristicvaluechanged",function(e){onChunk(dec.decode(e.target.value))});
    await tx.startNotifications();S.conn=true;S.live=false;S.src="Device";ui();toast("Connected to "+(dev.name||"device"));
    try{await rxChar.writeValue(new TextEncoder().encode("START\n"))}catch(e){}
  }catch(e){toast("Could not connect: "+(e.message||e))}
}
function bleDisconnect(){if(dev&&dev.gatt&&dev.gatt.connected)dev.gatt.disconnect();S.conn=false;ui()}
function startSim(){
  if(S.conn&&!S.live)bleDisconnect();
  var t=0;S.conn=true;S.live=true;S.src="Demo";S.bat=88;
  simTimer=setInterval(function(){
    for(var k=0;k<5;k++){t+=10;var s=t/1000,p=(s*1.2)%1;
      var ecg=Math.round(512+380*Math.exp(-Math.pow(p-0.3,2)/0.0006)-90*Math.exp(-Math.pow(p-0.27,2)/0.0004)+40*Math.exp(-Math.pow(p-0.55,2)/0.01)+8*Math.random());
      onChunk('{"t":'+t+',"ecg":'+ecg+'}\n')}
    if(Math.round(t/50)%20===0)onChunk('{"hr":'+(70+Math.round(Math.random()*4))+',"spo2":'+(97+Math.round(Math.random()))+',"sys":'+(116+Math.round(Math.random()*6))+',"dia":'+(75+Math.round(Math.random()*4))+',"bat":88}\n');
  },50);ui();
}
function stopSim(){if(simTimer){clearInterval(simTimer);simTimer=null}if(S.live){S.live=false;S.conn=false}}
$("#icoBle").onclick=bleConnect;
$("#icoSim").onclick=function(){if(S.live){stopSim();ui();toast("Demo stopped")}else{startSim();toast("Demo data running")}};
$("#conn").onclick=function(){if(S.live){stopSim();ui()}else if(S.conn)bleDisconnect();else bleConnect()};

/* ---------- phone camera check ---------- */
var FS=30,DUR=30,stream,track,rec=[],running=false,t0=0,raf=0,vid=$("#v"),pc=$("#px").getContext("2d",{willReadFrequently:true});
async function startCheck(){
  $("#cMsg").textContent="Starting camera...";
  try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:640},height:{ideal:480},frameRate:{ideal:30}},audio:false})}
  catch(e){$("#cMsg").textContent="Camera blocked. Allow camera access (the page must be https).";return}
  track=stream.getVideoTracks()[0];try{await track.applyConstraints({advanced:[{torch:true}]})}catch(e){$("#cMsg").textContent="Flash control unavailable. Use Chrome on Android."}
  vid.srcObject=stream;await vid.play();stopSim();S.conn=false;
  rec=[];running=true;t0=performance.now();$("#cGo").firstChild.textContent="Stop";loopCheck();
}
function stopCheck(){
  if(!running)return;running=false;cancelAnimationFrame(raf);
  if(track){try{track.applyConstraints({advanced:[{torch:false}]})}catch(e){}}
  if(stream)stream.getTracks().forEach(function(t){t.stop()});
  $("#cGo").firstChild.textContent="Start check";
  if(rec.length>FS*10){var r=analyse(rec.slice(-FS*DUR));if(r&&r.q>=0.5){S.hr=r.hr;S.q=r.q;S.spo2=null;S.sys=null;S.dia=null;S.src="Phone";S.wave=r.z.slice(-600);saveReading("Phone");$("#cMsg").textContent="Done. Result saved.";go("diag");return}}
  $("#cMsg").textContent="Signal was too weak. Try again, pressing lightly and keeping still.";
}
function loopCheck(){
  if(!running)return;var now=performance.now(),el=(now-t0)/1000;
  pc.drawImage(vid,0,0,16,16);var d=pc.getImageData(0,0,16,16).data,r=0,g=0,b=0,n=d.length/4;
  for(var i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2]}r/=n;g/=n;b/=n;
  var finger=r>120&&g<0.75*r;if(finger)rec.push({t:now-t0,r:r,g:g});
  $("#cT").textContent=Math.max(0,DUR-Math.floor(el));
  if(!finger)$("#cMsg").textContent="Cover the camera and flash fully with your fingertip.";
  else if(rec.length<=FS*8)$("#cMsg").textContent="Hold still...";
  else if(Math.floor(el*2)%2===0){var a=analyse(rec.slice(-FS*10));if(a){$("#cQ").style.width=(a.q*100)+"%";window.__z=a.z;$("#cMsg").textContent=a.q>=0.5?("Good signal · about "+Math.round(a.hr)+" bpm"):"Weak signal. Press lightly and keep still."}}
  if(el>=DUR){stopCheck();return}raf=requestAnimationFrame(loopCheck);
}
function prep(s){
  if(s.length<FS*4)return null;var t=s.map(function(a){return a.t}),T0=t[0],N=Math.floor((t[t.length-1]-T0)/1000*FS),o={r:[],g:[]},j=0;
  for(var k=0;k<N;k++){var tk=T0+k*1000/FS;while(j<t.length-2&&t[j+1]<tk)j++;var f=(tk-t[j])/Math.max(t[j+1]-t[j],1);
    o.r.push(s[j].r+(s[j+1].r-s[j].r)*f);o.g.push(s[j].g+(s[j+1].g-s[j].g)*f)}
  var best=null,bs=-1;["r","g"].forEach(function(c){var x=o[c],m=x.reduce(function(a,b){return a+b},0)/x.length,sd=Math.sqrt(x.reduce(function(a,b){return a+(b-m)*(b-m)},0)/x.length);if(sd>bs){bs=sd;best=c}});
  function ma(a,w){var q=[],sm=0;for(var i=0;i<a.length;i++){sm+=a[i];if(i>=w)sm-=a[i-w];q.push(sm/Math.min(i+1,w))}return q}
  var x=o[best],base=ma(x,FS),y=x.map(function(v,i){return v-base[i]});return ma(y,4).slice(FS);
}
function analyse(s){
  var z=prep(s);if(!z||z.length<FS*5)return null;var m=z.reduce(function(a,b){return a+b},0)/z.length;z=z.map(function(v){return v-m});
  var lo=Math.floor(FS*60/180),hi=Math.ceil(FS*60/40),rs=[];
  for(var L=lo-1;L<=hi+1;L++){var a=0,b1=0,b2=0;for(var i=0;i+L<z.length;i++){a+=z[i]*z[i+L];b1+=z[i]*z[i];b2+=z[i+L]*z[i+L]}rs[L]=a/Math.sqrt(b1*b2+1e-9)}
  var best=lo,mx=-1;for(var L=lo;L<=hi;L++)if(rs[L]>mx){mx=rs[L];best=L}
  for(var L=lo;L<best;L++)if(rs[L]>rs[L-1]&&rs[L]>=rs[L+1]&&rs[L]>=0.85*mx){best=L;break}
  var a1=rs[best-1],b=rs[best],c=rs[best+1],d=a1-2*b+c,off=d!==0?0.5*(a1-c)/d:0;
  return {hr:60*FS/(best+off),q:Math.max(0,Math.min(1,mx)),z:z};
}
$("#cGo").onclick=function(){running?stopCheck():startCheck()};

/* ---------- waveforms ---------- */
function draw(cv,data,col,w){
  var x=cv.getContext("2d"),W=cv.width,H=cv.height;x.clearRect(0,0,W,H);if(!data||data.length<2)return;
  var d=data.slice(-w),mn=Math.min.apply(null,d),mx=Math.max.apply(null,d),rg=(mx-mn)||1;
  x.strokeStyle=col;x.lineWidth=3;x.lineJoin="round";x.beginPath();
  d.forEach(function(v,i){var px=i/(w-1)*W,py=H-6-(v-mn)/rg*(H-12);if(i)x.lineTo(px,py);else x.moveTo(px,py)});x.stroke();
}
(function loop(){
  var onS=function(id){return $("#"+id).classList.contains("on")};
  if(onS("home"))draw($("#wMini"),S.wave,"#0E1512",300);
  if(onS("diag"))draw($("#wBig"),S.wave,"#1F6F8B",500);
  if(onS("check"))draw($("#wChk"),window.__z,"#D6244B",180);
  requestAnimationFrame(loop);
})();
ui();
