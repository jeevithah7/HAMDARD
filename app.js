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
  var wasChecking=$("#check").classList.contains("on");
  $$(".scr").forEach(function(s){s.classList.toggle("on",s.id===id)});
  $$(".pill button").forEach(function(b){if(b.dataset.n===id)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});
  document.querySelector(".app").classList.toggle("checking",id==="check");
  if(id==="check"){if(!wasChecking)prepareCheck()}else{stopCheck(false)}
  window.scrollTo(0,0);ui();
}
document.addEventListener("click",function(e){var b=e.target.closest("[data-go]");if(b)go(b.dataset.go)});
document.addEventListener("click",function(e){if(e.target.closest("[data-back]"))go("home")});

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
  if($("#nameIn")&&!$("#nameIn").matches(":focus"))$("#nameIn").value=user.name==="there"?"":user.name;
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
  if(S.conn)$("#devSt").textContent=S.live?"Demo data is running (simulated).":"Connected to "+(dev&&dev.name?dev.name:"your device")+ ".";
  else $("#devSt").textContent="No device connected.";
  if(S.bat!=null&&S.conn){$("#devBat").hidden=false;$("#devBat").textContent="Battery: "+Math.round(S.bat)+"%";}
  else $("#devBat").hidden=true;
  if($("#pSim"))$("#pSim").textContent=S.live?"Stop demo data":"Start demo data";
  var hl=$("#hist");hl.innerHTML="";
  hist.slice(-6).reverse().forEach(function(x){var d=document.createElement("div");d.className="hist";
    d.innerHTML="<span>"+new Date(x.ts).toLocaleDateString([],{day:"numeric",month:"short"})+" · "+x.src+"</span><b>"+x.hr+" bpm"+(x.spo2!=null?" · "+x.spo2+"%":"")+(x.sys!=null?" · "+x.sys+"/"+x.dia:"")+"</b>";hl.appendChild(d)});
  if(!hist.length)hl.innerHTML='<p class="mut">Saved readings appear here.</p>';
}
setInterval(ui,500);
$("#docAv").onclick=function(){var n=prompt("Doctor name",doc.name);if(n===null)return;var e=prompt("Doctor email",doc.email);doc={name:n.trim(),email:(e||"").trim()};lw("doc",doc);ui()};
function summary(){return hist.slice(-5).map(function(x){return new Date(x.ts).toLocaleString()+": HR "+x.hr+" bpm"+(x.spo2!=null?", SpO2 "+x.spo2+"%":"")+(x.sys!=null?", BP "+x.sys+"/"+x.dia:"")+" ("+x.src+")"}).join("\n")}
$("#docSend").onclick=function(){
  if(!hist.length){toast("Save a reading first");return}
  if(!doc.email){toast("Add your doctor’s email first");$("#docAv").click();return}
  location.href="mailto:"+encodeURIComponent(doc.email)+"?subject="+encodeURIComponent("HAMDARD readings from "+user.name)+"&body="+encodeURIComponent("Recent screening estimates (not a diagnosis):\n\n"+summary());
};
function saveReading(src){
  if(S.live){toast("Demo readings cannot be saved");return}
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

/* ---------- profile ---------- */
$("#nameSave").onclick=function(){
  var n=$("#nameIn").value.trim();
  if(!n){toast("Enter a name");return}
  user.name=n;lw("user",user);ui();toast("Name saved");
};
var devMode=ls("devMode",false);
$("#devMode").checked=devMode;
$("#devTools").hidden=!devMode;
$("#devMode").onchange=function(){
  devMode=$("#devMode").checked;lw("devMode",devMode);$("#devTools").hidden=!devMode;
};
$("#pBle").onclick=bleConnect;
$("#pDis").onclick=function(){if(S.live){stopSim()}else bleDisconnect();ui()};
$("#pSim").onclick=function(){
  if(S.live){stopSim();$("#pSim").textContent="Start demo data";toast("Demo stopped")}
  else{startSim();$("#pSim").textContent="Stop demo data";toast("Demo data running")}
  ui();
};
$("#pDel").onclick=function(){
  if(!hist.length){toast("No saved readings");return}
  if(confirm("Delete all saved readings?")){hist=[];lw("hist",hist);ui();toast("Saved readings deleted")}
};

/* ---------- phone camera check ---------- */
var FS=30,MAX_SCAN_SECONDS=30,stream,track,rec=[],running=false,cameraStarting=false,cameraRequest=0,t0=0,raf=0,lastAnalysisAt=0,signalLossAt=null,stableSignalCount=0,lastStableBpm=null,torchAvailable=false,vid=document.createElement("video"),pc=$("#px").getContext("2d",{willReadFrequently:true}),preview=$("#camPreview"),previewCtx=preview.getContext("2d");
vid.id="v";vid.playsInline=true;vid.muted=true;vid.setAttribute("playsinline","");vid.setAttribute("muted","");vid.setAttribute("aria-hidden","true");
function scanUi(state,title,message,signal,foot){
  $("#check").dataset.scanState=state;
  $("#check .scanReadout").dataset.quality=state==="failed"?"poor":state==="scanning"?"good":"";
  $("#cCancel").textContent=state==="idle"?"Start Scan":state==="failed"?"Retry Scan":"Cancel Scan";
  $("#scanTitle").textContent=title;
  $("#cMsg").textContent=message;
  $("#cSignal").textContent=signal;
  $("#cFoot").textContent=foot;
}
function prepareCheck(){
  scanUi("idle","Ready to scan","Tap Start Scan to open the camera, then cover the rear lens with your fingertip.","Camera off · ready","Camera stays off until you start scanning");
  rec=[];lastAnalysisAt=0;signalLossAt=null;stableSignalCount=0;lastStableBpm=null;
  $("#cHr").textContent="--";
  $("#cQ").style.width="0%";
  $("#sensor").classList.remove("active");
  previewCtx.clearRect(0,0,preview.width,preview.height);
  window.__z=null;
}
async function startCheck(){
  if(running||cameraStarting)return;
  cameraStarting=true;
  var request=++cameraRequest;
  var activeStream=null,activeTrack=null;
  scanUi("requesting_permission","Initializing camera","Allow rear camera access when prompted.","Connecting · 0%","Preparing camera");
  rec=[];lastAnalysisAt=0;signalLossAt=null;stableSignalCount=0;lastStableBpm=null;
  $("#cHr").textContent="--";
  $("#cQ").style.width="0%";
  window.__z=null;
  $("#sensor").classList.remove("active");
  previewCtx.clearRect(0,0,preview.width,preview.height);
  try{
    activeStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:640},height:{ideal:480},frameRate:{ideal:30}},audio:false});
    if(request!==cameraRequest||!$("#check").classList.contains("on")){activeStream.getTracks().forEach(function(t){t.stop()});return}
    activeTrack=activeStream.getVideoTracks()[0];
    if(!activeTrack)throw new Error("No camera video track available");
    var cameraCaps=activeTrack.getCapabilities?activeTrack.getCapabilities():{};
    torchAvailable=!!cameraCaps.torch;
    if(torchAvailable){
      try{await activeTrack.applyConstraints({advanced:[{torch:true}]})}catch(e){torchAvailable=false}
    }
    if(request!==cameraRequest||!$("#check").classList.contains("on")){activeStream.getTracks().forEach(function(t){t.stop()});return}
    stream=activeStream;track=activeTrack;
    vid.srcObject=activeStream;await vid.play();
    if(request!==cameraRequest||!$("#check").classList.contains("on")){activeStream.getTracks().forEach(function(t){t.stop()});return}
    stopSim();S.conn=false;
    rec=[];running=true;t0=performance.now();lastAnalysisAt=0;signalLossAt=null;$("#sensor").classList.add("active");scanUi("positioning","Place your finger over the rear camera",torchAvailable?"Cover the camera and flash with your fingertip.":"Cover the camera lens in bright, steady lighting.","Awaiting contact · 0%","Waiting for lens coverage");loopCheck();
  }catch(e){
    if(request===cameraRequest){
      if(activeStream)activeStream.getTracks().forEach(function(t){t.stop()});
      if(stream===activeStream){stream=null;track=null}
      vid.pause();vid.srcObject=null;
      previewCtx.clearRect(0,0,preview.width,preview.height);
      scanUi("failed","Camera unavailable","Allow camera access and make sure this page is using HTTPS.","Unavailable","Camera access required");
    }else if(activeStream){
      activeStream.getTracks().forEach(function(t){t.stop()});
    }
  }finally{
    if(request===cameraRequest)cameraStarting=false;
  }
}
function stopCheck(analyze){
  var wasRunning=running;
  cameraRequest++;
  cameraStarting=false;
  running=false;cancelAnimationFrame(raf);
  $("#sensor").classList.remove("active");
  if(stream)stream.getTracks().forEach(function(t){t.stop()});
  stream=null;track=null;vid.pause();vid.srcObject=null;previewCtx.clearRect(0,0,preview.width,preview.height);
  pc.clearRect(0,0,16,16);
  window.__z=null;
  if(!wasRunning||analyze===false)return;
  scanUi("failed","Could not obtain a reliable reading","We couldn't get a stable pulse. Cover the rear lens fully and keep your fingertip still, then try again.","No stable signal","No reliable pulse detected");
  $("#cHr").textContent="--";
  $("#cQ").style.width="0%";
}
function finishCheck(result){
  stopCheck(false);
  S.hr=result.hr;S.q=result.q;S.spo2=null;S.sys=null;S.dia=null;S.src="Phone";S.wave=result.z.slice(-600);
  saveReading("Phone");
  go("diag");
}
function recentSamples(samples,seconds){
  if(samples.length<2)return samples;
  var cutoff=samples[samples.length-1].t-seconds*1000;
  return samples.filter(function(sample){return sample.t>=cutoff});
}
function loopCheck(){
  if(!running)return;var now=performance.now(),el=(now-t0)/1000;
  if(vid.readyState>=2&&vid.videoWidth&&vid.videoHeight){
    var side=Math.min(vid.videoWidth,vid.videoHeight),sx=(vid.videoWidth-side)/2,sy=(vid.videoHeight-side)/2;
    previewCtx.drawImage(vid,sx,sy,side,side,0,0,preview.width,preview.height);
  }
  pc.drawImage(vid,0,0,16,16);var d=pc.getImageData(0,0,16,16).data,r=0,g=0,b=0,n=d.length/4;
  for(var i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2]}r/=n;g/=n;b/=n;
  var finger=r>120&&g<0.75*r;
  if(finger){rec.push({t:now-t0,r:r,g:g});signalLossAt=null}
  else{
    if(signalLossAt===null)signalLossAt=now;
    if(now-signalLossAt>500){rec=[];stableSignalCount=0;lastStableBpm=null;lastAnalysisAt=0}
  }
  var signalSeconds=rec.length>1?(rec[rec.length-1].t-rec[0].t)/1000:0;
  if(!finger){
    scanUi("positioning","Place your finger over the rear camera",torchAvailable?"Center your fingertip over the lens and flash.":"Center your fingertip over the rear lens in bright, steady lighting.","Awaiting contact · 0%","Waiting for lens coverage");
    $("#cHr").textContent="--";
    $("#cQ").style.width="0%";
  }else if(signalSeconds<8){
    var acquiring=Math.min(99,Math.round(signalSeconds/8*100));
    scanUi("detecting","Hold your finger steady","Keep your fingertip covering the lens while we acquire a pulse signal.","Acquiring · "+acquiring+"%","Finger detected · acquiring signal");
    $("#cQ").style.width=acquiring+"%";
  }else if(now-lastAnalysisAt>=500){
    lastAnalysisAt=now;
    var a=analyse(recentSamples(rec,10));
    if(a){
      window.__z=a.z;
      var quality=Math.round(a.q*100);
      $("#cQ").style.width=quality+"%";
      if(a.q>=0.5){
        stableSignalCount=lastStableBpm!==null&&Math.abs(a.hr-lastStableBpm)<=8?stableSignalCount+1:1;
        lastStableBpm=a.hr;
        scanUi("scanning","Measuring your pulse","Signal acquired. Keep your fingertip steady while we verify the reading.","Strong · "+quality+"%","Verifying pulse signal");
        $("#cHr").textContent=Math.round(a.hr);
        if(stableSignalCount>=3){finishCheck(a);return}
      }else{
        stableSignalCount=0;lastStableBpm=null;
        scanUi("detecting","Hold steady","Weak signal. Press lightly and keep still.","Acquiring · "+quality+"%","Improving optical signal");
        $("#cHr").textContent="--";
      }
    }else{
      stableSignalCount=0;lastStableBpm=null;
    }
  }
  if(el>=MAX_SCAN_SECONDS){stopCheck();return}raf=requestAnimationFrame(loopCheck);
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
$("#cCancel").onclick=function(){
  if(running||cameraStarting){stopCheck(false);prepareCheck();return}
  startCheck();
};

/* ---------- waveforms ---------- */
function drawFingerprint(){
  var cv=$("#fingerPrint");
  if(!cv)return;
  var x=cv.getContext("2d"),W=cv.width,H=cv.height,cx=W/2,cy=H*.49;
  var geo=cv.__ridgeGeometry;
  if(!geo){
    geo={ridges:[],nodes:[]};
    var rx=W*.37,ry=H*.43;
    for(var ring=0;ring<8;ring++){
      var rX=9+ring*10.2,rY=12+ring*12.8,pts=[];
      var start=ring%2===0?-Math.PI*.85:Math.PI*.15,span=ring<2?Math.PI*1.72:Math.PI*1.88;
      for(var s=0;s<=72;s++){
        var theta=start+s/72*span,organic=1+.045*Math.sin(theta*3+ring*.7)+.025*Math.cos(theta*5-ring*.4);
        pts.push({x:cx+Math.cos(theta)*rX*organic+Math.sin(theta)*2.5,y:cy-12+Math.sin(theta)*rY*organic});
      }
      geo.ridges.push({points:pts,accent:ring===2||ring===6});
      geo.nodes.push(pts[0]);
    }
    for(var shell=0;shell<13;shell++){
      var factor=.44+shell/13*.56,shellRx=rx*factor,shellRy=ry*factor,segments=shell%3===0?2:3,gap=.14+(shell%4)*.02,base=(shell*.52)%(Math.PI*2),part=(Math.PI*2-segments*gap)/segments;
      for(var seg=0;seg<segments;seg++){
        var a0=base+seg*(part+gap),a1=a0+part,outer=[];
        for(var step=0;step<=40;step++){
          var a=a0+step/40*(a1-a0),ny=Math.sin(a),taper=ny<0?1+.12*ny:1-.04*ny,flatten=ny>.45?1-.14*(ny-.45):1,micro=1+.018*Math.sin(a*6+shell);
          outer.push({x:cx+Math.cos(a)*shellRx*taper*micro,y:cy+ny*shellRy*flatten*micro});
        }
        geo.ridges.push({points:outer,accent:shell%5===0});
        if(seg===0&&shell>=2&&shell<=10&&shell%2===0)geo.nodes.push(outer[Math.floor(outer.length*.56)]);
      }
    }
    cv.__ridgeGeometry=geo;
    var base=document.createElement("canvas");base.width=W;base.height=H;
    var bx=base.getContext("2d");
    bx.save();bx.beginPath();bx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);bx.clip();
    geo.ridges.forEach(function(ridge){
      bx.beginPath();ridge.points.forEach(function(p,i){if(i)bx.lineTo(p.x,p.y);else bx.moveTo(p.x,p.y)});
      bx.strokeStyle=ridge.accent?"rgba(249,226,122,.58)":"rgba(207,230,184,.6)";
      bx.lineWidth=ridge.accent?1.8:1.2;bx.lineCap="round";bx.lineJoin="round";bx.stroke();
    });
    bx.restore();cv.__ridgeBase=base;
  }
  x.clearRect(0,0,W,H);
  x.save();
  x.beginPath();x.arc(cx,cy,190,0,Math.PI*2);x.clip();
  var quality=running?Math.min(1,rec.length/(FS*12)):.2;
  var glow=x.createRadialGradient(cx,cy,12,cx,cy,180);
  glow.addColorStop(0,"rgba(191,230,240,"+(.08+quality*.12)+")");
  glow.addColorStop(.6,"rgba(207,230,184,.08)");
  glow.addColorStop(1,"rgba(207,230,184,0)");
  x.fillStyle=glow;x.fillRect(0,0,W,H);
  x.drawImage(cv.__ridgeBase,0,0);
  var now=performance.now()/1000;
  if(!window.matchMedia("(prefers-reduced-motion: reduce)").matches){
    for(var p=0;p<18;p++){
      var ridge=geo.ridges[(p*7)%geo.ridges.length],u=(now*(.1+(p%4)*.018)+p*.071)%1;
      var point=ridge.points[Math.floor(u*(ridge.points.length-1))];
      x.beginPath();x.arc(point.x,point.y,1.6+(p%3)*.45,0,Math.PI*2);
      x.fillStyle=p%4===0?"rgba(249,226,122,.98)":"rgba(191,230,240,.95)";
      x.shadowColor=x.fillStyle;x.shadowBlur=8;x.fill();x.shadowBlur=0;
    }
  }
  geo.nodes.forEach(function(p,i){
    x.beginPath();x.arc(p.x,p.y,i%3===0?2:1.3,0,Math.PI*2);
    x.fillStyle=i%3===0?"rgba(249,226,122,.9)":"rgba(191,230,240,.72)";x.fill();
  });
  for(var t=0;t<60;t++){
    var a=t/60*Math.PI*2-Math.PI/2,major=t%5===0;
    x.beginPath();x.moveTo(cx+Math.cos(a)*(major?185:187),cy+Math.sin(a)*(major?185:187));x.lineTo(cx+Math.cos(a)*189,cy+Math.sin(a)*189);
    x.strokeStyle=running&&major?"rgba(191,230,240,.82)":"rgba(243,245,242,.24)";x.lineWidth=major?1.8:1;x.stroke();
  }
  x.restore();
}

function draw(cv,data,col,w,idle){
  var x=cv.getContext("2d"),W=cv.width,H=cv.height;x.clearRect(0,0,W,H);
  if(!data||data.length<2){
    if(idle){x.strokeStyle="rgba(14,21,18,.2)";x.lineWidth=2;x.beginPath();x.moveTo(0,H/2);
      for(var i=1;i<=W;i++){var y=H/2+Math.sin(i/W*Math.PI*4)*2;x.lineTo(i,y)}
      x.stroke()}
    return;
  }
  var d=data.slice(-w),mn=Math.min.apply(null,d),mx=Math.max.apply(null,d),rg=(mx-mn)||1;
  x.strokeStyle=col;x.lineWidth=3;x.lineJoin="round";x.beginPath();
  d.forEach(function(v,i){var px=i/(w-1)*W,py=H-6-(v-mn)/rg*(H-12);if(i)x.lineTo(px,py);else x.moveTo(px,py)});x.stroke();
}
(function loop(){
  var onS=function(id){return $("#"+id).classList.contains("on")};
  if(onS("check"))drawFingerprint();
  if(onS("home"))draw($("#wMini"),S.wave,"#0E1512",300);
  if(onS("diag"))draw($("#wBig"),S.wave,"#1F6F8B",500);
  if(onS("check"))draw($("#wChk"),window.__z,"#0E1512",180,true);
  requestAnimationFrame(loop);
})();
ui();
