// save as server.js (replace your old file)
// npm install express ws axios fca-mafiya

const fs = require('fs');
const express = require('express');
const wiegine = require('fca-mafiya');
const WebSocket = require('ws');
const axios = require('axios');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 22133;

// Session management
const sessions = new Map();

// Generate session ID
function generateSessionId() {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `R4J${timestamp}${random}`;
}

// Configuration template
function createConfig() {
    return {
        prefix: '',
        delay: 5,
        running: false,
        api: null,
        repeat: true,
        sessionId: '',
        startTime: null
    };
}

// Message data template
function createMessageData() {
    return {
        threadID: '',
        messages: [],
        currentIndex: 0,
        loopCount: 0
    };
}

// WebSocket server
let wss;

// HTML Control Panel (updated with Raj Mishra theme and session management)
const htmlControlPanel = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Raj Mishra - Web Convo Chat Loop</title>
<style>
  *{box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif}
  html,body{height:100%;margin:0;background:linear-gradient(135deg, #ffffff 0%, #e8f5e8 50%, #c8e6c9 100%)}
  
  body{
    background: linear-gradient(135deg, #ffffff 0%, #e8f5e8 50%, #c8e6c9 100%);
    position: relative;
    overflow-y: auto;
  }
  body::before {
    content: "";
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-image: url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z' fill='%23007e33' fill-opacity='0.05' fill-rule='evenodd'/%3E%3C/svg%3E");
    z-index: -1;
  }
  
  header{
    padding: 20px 25px;
    display: flex;
    align-items: center;
    gap: 16px;
    border-bottom: 2px solid rgba(0, 126, 51, 0.2);
    background: linear-gradient(90deg, #007e33, #00c851);
    color: white;
    box-shadow: 0 4px 12px rgba(0, 126, 51, 0.3);
  }
  header h1{
    margin: 0;
    font-size: 22px;
    font-weight: 600;
    text-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }
  header .sub{
    font-size: 14px;
    margin-left: auto;
    opacity: 0.9;
  }
  
  .container{
    max-width: 1000px;
    margin: 25px auto;
    padding: 20px;
  }
  
  .panel{
    background: white;
    border: 1px solid #e0e0e0;
    padding: 20px;
    border-radius: 12px;
    margin-bottom: 20px;
    box-shadow: 0 6px 15px rgba(0, 126, 51, 0.1);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .panel:hover {
    box-shadow: 0 8px 20px rgba(0, 126, 51, 0.15);
    transform: translateY(-2px);
  }
  
  label{
    font-size: 14px;
    color: #007e33;
    font-weight: 500;
    margin-bottom: 5px;
    display: block;
  }
  
  .row{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
  }
  
  .full{
    grid-column: 1/3;
  }
  
  input[type="text"], input[type="number"], textarea, select, .fake-file {
    width: 100%;
    padding: 12px 15px;
    border-radius: 8px;
    border: 1px solid #c8e6c9;
    background: #f9fffa;
    color: #2e7d32;
    outline: none;
    transition: all 0.3s;
    font-size: 14px;
  }
  
  input[type="text"]:focus, input[type="number"]:focus, textarea:focus, select:focus {
    border-color: #007e33;
    box-shadow: 0 0 0 3px rgba(0, 126, 51, 0.2);
    background: white;
  }
  
  .fake-file{
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  
  button{
    padding: 12px 20px;
    border-radius: 8px;
    border: 0;
    cursor: pointer;
    font-weight: 600;
    font-size: 14px;
    transition: all 0.3s;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }
  
  #start-btn{
    background: linear-gradient(to right, #007e33, #00c851);
    color: white;
  }
  
  #start-btn:hover:not(:disabled){
    background: linear-gradient(to right, #006227, #00a344);
    transform: translateY(-2px);
    box-shadow: 0 6px 8px rgba(0, 0, 0, 0.15);
  }
  
  #stop-btn{
    background: linear-gradient(to right, #ff4444, #cc0000);
    color: white;
  }
  
  #stop-btn:hover:not(:disabled){
    background: linear-gradient(to right, #cc0000, #990000);
    transform: translateY(-2px);
    box-shadow: 0 6px 8px rgba(0, 0, 0, 0.15);
  }
  
  #check-status-btn {
    background: linear-gradient(to right, #ff9800, #ff5722);
    color: white;
  }
  
  #check-status-btn:hover:not(:disabled) {
    background: linear-gradient(to right, #e68900, #e64a19);
    transform: translateY(-2px);
    box-shadow: 0 6px 8px rgba(0, 0, 0, 0.15);
  }
  
  button:disabled{
    opacity: 0.6;
    cursor: not-allowed;
    transform: none !important;
  }
  
  .log{
    height: 300px;
    overflow: auto;
    background: #f1f8e9;
    border-radius: 8px;
    padding: 15px;
    font-family: 'Courier New', monospace;
    color: #2e7d32;
    border: 1px solid #c8e6c9;
    font-size: 13px;
  }
  
  small{
    color: #689f38;
    font-size: 12px;
  }
  
  .cookie-opts{
    display: flex;
    gap: 15px;
    align-items: center;
    margin: 10px 0;
  }
  
  .cookie-opts label{
    color: #007e33;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  
  .session-info {
    background: linear-gradient(135deg, #e3f2fd, #f3e5f5);
    padding: 15px;
    border-radius: 8px;
    border-left: 4px solid #007e33;
    margin: 15px 0;
  }
  
  .session-id {
    font-family: monospace;
    background: #007e33;
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-weight: bold;
    display: inline-block;
    margin: 5px 0;
  }
  
  @media (max-width: 768px){
    .row{
      grid-template-columns: 1fr;
    }
    .full{
      grid-column: auto;
    }
    header {
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
    }
    header .sub {
      margin-left: 0;
    }
  }
  
  .music-player {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: white;
    border-radius: 50px;
    padding: 10px 20px;
    box-shadow: 0 4px 15px rgba(0, 126, 51, 0.3);
    display: flex;
    align-items: center;
    gap: 10px;
    z-index: 100;
  }
  
  .music-info {
    font-size: 12px;
    color: #007e33;
    font-weight: 500;
  }
  
  .music-controls {
    display: flex;
    gap: 5px;
  }
  
  .music-btn {
    background: #007e33;
    color: white;
    border: none;
    border-radius: 50%;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 12px;
  }
  
  .status-panel {
    background: linear-gradient(135deg, #fff3e0, #fbe9e7);
    padding: 15px;
    border-radius: 8px;
    border-left: 4px solid #ff9800;
    margin: 10px 0;
  }
</style>
</head>
<body>
  <header>
    <h1>Raj Mishra - Web Convo Chat Loop</h1>
    <div class="sub">Session Management • Loop Mode • Dabang Music</div>
  </header>

  <div class="container">
    <div class="panel">
      <div style="display:flex;gap:15px;align-items:flex-start;flex-wrap:wrap">
        <div style="flex:1">
          <div>
            <strong style="color:#007e33">Cookie option:</strong>
            <div class="cookie-opts">
              <label><input type="radio" name="cookie-mode" value="file" checked> Upload file</label>
              <label><input type="radio" name="cookie-mode" value="paste"> Paste cookies</label>
            </div>
          </div>

          <div id="cookie-file-wrap">
            <label for="cookie-file">Upload cookie file (.txt or .json)</label>
            <input id="cookie-file" type="file" accept=".txt,.json">
            <small>Choose cookie file to upload</small>
          </div>

          <div id="cookie-paste-wrap" style="display:none;margin-top:10px">
            <label for="cookie-paste">Paste cookies here</label>
            <textarea id="cookie-paste" rows="6" placeholder="Paste cookies JSON or raw text"></textarea>
            <small>Use this if you want to paste cookies instead of uploading a file</small>
          </div>
        </div>

        <div style="min-width:260px">
          <label for="thread-id">Thread/Group ID</label>
          <input id="thread-id" type="text" placeholder="Enter thread/group ID">

          <div style="margin-top:12px">
            <label for="delay">Delay (seconds)</label>
            <input id="delay" type="number" value="5" min="1">
            <small>Delay between messages</small>
          </div>
        </div>
      </div>

      <div class="row" style="margin-top:15px">
        <div>
          <label for="prefix">Message Prefix (optional)</label>
          <input id="prefix" type="text" placeholder="Prefix before each message">
          <small>Optional text to add before each message</small>
        </div>

        <div>
          <label for="message-file">Messages File (.txt)</label>
          <input id="message-file" type="file" accept=".txt">
          <small>One message per line. Messages will loop when finished.</small>
        </div>

        <div class="full" style="margin-top:15px">
          <div class="controls">
            <button id="start-btn">Start Sending</button>
            <button id="stop-btn" disabled>Stop Sending</button>
            <button id="check-status-btn">Check Status</button>
            <div style="margin-left:auto;align-self:center;color:#007e33;font-weight:500" id="status">Status: Ready</div>
          </div>
        </div>
      </div>
      
      <!-- Session Management -->
      <div class="session-info" id="session-info" style="display:none">
        <strong style="color:#007e33">Your Session ID:</strong>
        <div class="session-id" id="session-id-display"></div>
        <small>Use this ID to check status or stop your session anytime</small>
        
        <div style="margin-top:10px">
          <label for="session-id-input">Enter Session ID:</label>
          <input id="session-id-input" type="text" placeholder="Enter R4J session ID">
          <button id="stop-by-id-btn" style="margin-top:5px">Stop by Session ID</button>
        </div>
      </div>
    </div>

    <div class="panel">
      <h3 style="margin-top:0;color:#007e33">Activity Log & Session Status</h3>
      <div class="log" id="log-container"></div>
    </div>
  </div>

  <!-- Music Player -->
  <div class="music-player">
    <div class="music-info">Playing: Dabang - Tere Mast Mast Do Nain</div>
    <div class="music-controls">
      <button class="music-btn" id="play-btn">▶</button>
      <button class="music-btn" id="pause-btn">❚❚</button>
      <button class="music-btn" id="stop-music-btn">■</button>
    </div>
  </div>

  <!-- Audio Element for Dabang Song -->
  <audio id="hindi-song" loop>
    <source src="https://archive.org/download/tere-mast-mast-do-nain/TereMastMastDoNain.mp3" type="audio/mpeg">
    Your browser does not support the audio element.
  </audio>

<script>
  const socketProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(socketProtocol + '//' + location.host);

  const logContainer = document.getElementById('log-container');
  const statusDiv = document.getElementById('status');
  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const checkStatusBtn = document.getElementById('check-status-btn');
  const sessionInfoDiv = document.getElementById('session-info');
  const sessionIdDisplay = document.getElementById('session-id-display');
  const sessionIdInput = document.getElementById('session-id-input');
  const stopByIdBtn = document.getElementById('stop-by-id-btn');

  const cookieFileInput = document.getElementById('cookie-file');
  const cookiePaste = document.getElementById('cookie-paste');
  const threadIdInput = document.getElementById('thread-id');
  const delayInput = document.getElementById('delay');
  const prefixInput = document.getElementById('prefix');
  const messageFileInput = document.getElementById('message-file');

  const cookieFileWrap = document.getElementById('cookie-file-wrap');
  const cookiePasteWrap = document.getElementById('cookie-paste-wrap');

  // Music player elements
  const audio = document.getElementById('hindi-song');
  const playBtn = document.getElementById('play-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const stopMusicBtn = document.getElementById('stop-music-btn');

  let currentSessionId = null;

  function addLog(text){
    const d = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.textContent = '['+d+'] ' + text;
    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  socket.onopen = () => {
    addLog('Connected to server websocket');
    statusDiv.textContent = 'Status: Connected';
  };
  
  socket.onmessage = (ev) => {
    try{
      const data = JSON.parse(ev.data);
      if(data.type === 'log') addLog(data.message);
      if(data.type === 'status'){
        statusDiv.textContent = data.running ? 'Status: Sending Messages' : 'Status: Connected';
        startBtn.disabled = data.running;
        stopBtn.disabled = !data.running;
      }
      if(data.type === 'sessionId') {
        currentSessionId = data.sessionId;
        sessionIdDisplay.textContent = currentSessionId;
        sessionInfoDiv.style.display = 'block';
        addLog('Session started with ID: ' + currentSessionId);
        addLog('Save this Session ID to check status or stop later: ' + currentSessionId);
      }
      if(data.type === 'sessionStatus') {
        if(data.exists) {
          addLog('Session ' + data.sessionId + ' status: ' + (data.running ? 'RUNNING' : 'STOPPED'));
          if(data.messageCount) {
            addLog('Messages sent: ' + data.messageCount + ', Loops: ' + data.loopCount);
          }
        } else {
          addLog('Session ' + data.sessionId + ' not found');
        }
      }
    }catch(e){
      addLog('Received: ' + ev.data);
    }
  };
  
  socket.onclose = () => addLog('WebSocket disconnected');
  socket.onerror = (e) => addLog('WebSocket error');

  // Cookie mode toggle
  document.querySelectorAll('input[name="cookie-mode"]').forEach(r=>{
    r.addEventListener('change',(ev)=>{
      if(ev.target.value === 'file'){
        cookieFileWrap.style.display = 'block';
        cookiePasteWrap.style.display = 'none';
      }else{
        cookieFileWrap.style.display = 'none';
        cookiePasteWrap.style.display = 'block';
      }
    });
  });

  // Music controls - Dabang song
  playBtn.addEventListener('click', () => {
    audio.play().catch(e => {
      addLog('Note: Audio playback requires user interaction first. Click play again.');
    });
    addLog('Dabang song started - Tere Mast Mast Do Nain');
  });
  
  pauseBtn.addEventListener('click', () => {
    audio.pause();
    addLog('Music paused');
  });
  
  stopMusicBtn.addEventListener('click', () => {
    audio.pause();
    audio.currentTime = 0;
    addLog('Music stopped');
  });

  // Input focus effects
  const focusable = [cookieFileInput, cookiePaste, threadIdInput, delayInput, prefixInput, messageFileInput, sessionIdInput];
  focusable.forEach(elem => {
    elem.addEventListener('focus', function() {
      this.style.transform = 'scale(1.02)';
      this.style.boxShadow = '0 0 0 3px rgba(0, 126, 51, 0.2)';
    });
    
    elem.addEventListener('blur', function() {
      this.style.transform = '';
      this.style.boxShadow = '';
    });
  });

  startBtn.addEventListener('click', ()=>{
    const cookieMode = document.querySelector('input[name="cookie-mode"]:checked').value;
    if(cookieMode === 'file' && cookieFileInput.files.length === 0){
      addLog('Please choose cookie file or switch to paste option.');
      return;
    }
    if(cookieMode === 'paste' && cookiePaste.value.trim().length === 0){
      addLog('Please paste cookies in the textarea.');
      return;
    }
    if(!threadIdInput.value.trim()){
      addLog('Please enter Thread/Group ID');
      return;
    }
    if(messageFileInput.files.length === 0){
      addLog('Please choose messages file (.txt)');
      return;
    }

    const cookieModeValue = cookieMode;
    const cookieReader = new FileReader();
    const msgReader = new FileReader();

    const startSend = (cookieContent, messageContent) => {
      socket.send(JSON.stringify({
        type: 'start',
        cookieContent,
        messageContent,
        threadID: threadIdInput.value.trim(),
        delay: parseInt(delayInput.value) || 5,
        prefix: prefixInput.value.trim(),
        cookieMode: cookieModeValue
      }));
    };

    msgReader.onload = (e) => {
      const messageContent = e.target.result;
      if(cookieMode === 'paste'){
        startSend(cookiePaste.value, messageContent);
      }else{
        cookieReader.readAsText(cookieFileInput.files[0]);
        cookieReader.onload = (ev) => {
          startSend(ev.target.result, messageContent);
        };
        cookieReader.onerror = () => addLog('Failed to read cookie file');
      }
    };
    msgReader.readAsText(messageFileInput.files[0]);
  });

  stopBtn.addEventListener('click', ()=>{
    if(currentSessionId) {
      socket.send(JSON.stringify({type:'stop', sessionId: currentSessionId}));
    } else {
      addLog('No active session to stop');
    }
  });

  checkStatusBtn.addEventListener('click', () => {
    if(currentSessionId) {
      socket.send(JSON.stringify({type:'checkStatus', sessionId: currentSessionId}));
    } else {
      addLog('No active session to check');
    }
  });

  stopByIdBtn.addEventListener('click', () => {
    const sessionId = sessionIdInput.value.trim();
    if(sessionId && sessionId.startsWith('R4J')) {
      socket.send(JSON.stringify({type:'stop', sessionId: sessionId}));
      sessionIdInput.value = '';
    } else {
      addLog('Please enter a valid R4J session ID');
    }
  });

  // Also allow checking status by session ID
  sessionIdInput.addEventListener('keypress', (e) => {
    if(e.key === 'Enter') {
      const sessionId = sessionIdInput.value.trim();
      if(sessionId && sessionId.startsWith('R4J')) {
        socket.send(JSON.stringify({type:'checkStatus', sessionId: sessionId}));
      }
    }
  });

  addLog('Raj Mishra Control Panel Ready');
  addLog('Dabang song loaded - Tere Mast Mast Do Nain');
  addLog('Click play to start the music');
</script>
</body>
</html>
`;

// Start message sending function with session management
function startSending(cookieContent, messageContent, threadID, delay, prefix, ws) {
    const sessionId = generateSessionId();
    
    // Create new session
    const session = {
        config: createConfig(),
        messageData: crea
