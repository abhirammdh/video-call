const socket = io();
let localStream;
let remoteStream;
let peerConnection;
let roomId = 'room1';
let username = 'User 1';
let isMutedAudio = false;
let isMutedVideo = false;

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const localName = document.getElementById('localName');
const remoteName = document.getElementById('remoteName');
const statusEl = document.getElementById('status');
const usernameInput = document.getElementById('username');
const roomInput = document.getElementById('roomId');
const joinBtn = document.getElementById('joinBtn');
const startCallBtn = document.getElementById('startCallBtn');
const endCallBtn = document.getElementById('endCallBtn');
const muteAudioBtn = document.getElementById('muteAudio');
const muteVideoBtn = document.getElementById('muteVideo');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const preJoin = document.querySelector('.pre-join');
const callControls = document.getElementById('callControls');

// 720p constraints for slow networks
const mediaConstraints = {
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 }
  },
  audio: true
};

// Enhanced ICE servers (added freeturn.net for redundancy)
const iceServers = {
  iceServers: [
    // STUN
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // Original TURN
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
      credentialType: 'password'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
      credentialType: 'password'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
      credentialType: 'password'
    },
    // Extra free TURN (freeturn.net – low-bandwidth but reliable for tests)
    {
      urls: 'turn:turn.freeturn.net:80?transport=udp',
      username: 'laravel',
      credential: 'laravel',
      credentialType: 'password'
    },
    {
      urls: 'turn:turn.freeturn.net:443?transport=tcp',
      username: 'laravel',
      credential: 'laravel',
      credentialType: 'password'
    }
  ]
};

function updateStatus(message, type = 'info') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function toggleControls() {
  preJoin.style.display = 'none';
  callControls.style.display = 'flex';
}

function showPreJoin() {
  preJoin.style.display = 'flex';
  callControls.style.display = 'none';
}

// Inputs
usernameInput.addEventListener('input', (e) => { username = e.target.value || 'User 1'; });
roomInput.addEventListener('input', (e) => { roomId = e.target.value || 'room1'; });

// Join (with 720p constraints)
joinBtn.addEventListener('click', async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
    localVideo.srcObject = localStream;
    localName.textContent = username;
    console.log('Local 720p stream acquired:', localStream.getTracks().length, 'tracks');
    
    socket.emit('join-call', { roomId, username });
    updateStatus('Joined room. Waiting for others... (720p mode)', 'connecting');
    joinBtn.disabled = true;
    toggleControls();
    startCallBtn.disabled = true;
  } catch (err) {
    console.error('Media error:', err);
    updateStatus('Camera/mic access denied. Check permissions.', 'error');
  }
});

// Controls (unchanged)
muteAudioBtn.addEventListener('click', () => {
  isMutedAudio = !isMutedAudio;
  localStream.getAudioTracks()[0].enabled = !isMutedAudio;
  muteAudioBtn.querySelector('span').textContent = isMutedAudio ? 'Unmute' : 'Mute';
  muteAudioBtn.classList.toggle('danger', isMutedAudio);
});

muteVideoBtn.addEventListener('click', () => {
  isMutedVideo = !isMutedVideo;
  localStream.getVideoTracks()[0].enabled = !isMutedVideo;
  muteVideoBtn.querySelector('span').textContent = isMutedVideo ? 'Video On' : 'Video';
  muteVideoBtn.classList.toggle('danger', isMutedVideo);
});

fullscreenBtn.addEventListener('click', () => {
  const videos = document.querySelector('.videos');
  if (!document.fullscreenElement) {
    videos.requestFullscreen().catch(err => console.error('Fullscreen error:', err));
  } else {
    document.exitFullscreen();
  }
});

startCallBtn.addEventListener('click', async () => {
  console.log('Starting 720p call in room:', roomId);
  updateStatus('Connecting... (may take 30s on slow net)', 'connecting');
  peerConnection = new RTCPeerConnection(iceServers);
  
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  
  peerConnection.ontrack = (event) => {
    console.log('Received remote 720p track:', event.streams[0].getTracks().length, 'tracks');
    remoteStream = event.streams[0];
    remoteVideo.srcObject = remoteStream;
    updateStatus('Connected! (720p video streaming)', 'connected');
    endCallBtn.style.display = 'block';
    fullscreenBtn.disabled = false;
  };
  
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', { candidate: event.candidate, roomId });
    }
  };
  
  peerConnection.onconnectionstatechange = () => {
    console.log('Peer state:', peerConnection.connectionState);
    if (peerConnection.connectionState === 'connected') updateStatus('P2P connected! Video should appear.', 'connected');
    if (peerConnection.connectionState === 'failed') {
      updateStatus('Connection failed (NAT issue?). Restart call?', 'error');
      startCallBtn.disabled = false; // Allow retry
    }
  };
  
  peerConnection.oniceconnectionstatechange = () => {
    const state = peerConnection.iceConnectionState;
    console.log('ICE state:', state);
    if (state === 'connected' || state === 'completed') {
      updateStatus('ICE connected via TURN! Video incoming...', 'connected');
    } else if (state === 'failed') {
      console.error('ICE failed – try different network or restart.');
      updateStatus('ICE failed (slow net?). Retry call.', 'error');
      startCallBtn.disabled = false;
    } else if (state === 'disconnected') {
      updateStatus('Network hiccup – reconnecting...', 'connecting');
    }
  };
  
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('offer', { offer, roomId });
  
  startCallBtn.disabled = true;
  endCallBtn.disabled = false;
});

endCallBtn.addEventListener('click', () => {
  console.log('Ending call...');
  if (peerConnection) peerConnection.close();
  if (localStream) localStream.getTracks().forEach(track => track.stop());
  if (remoteStream) remoteStream.getTracks().forEach(track => track.stop());
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  updateStatus('Call ended', 'info');
  showPreJoin();
  joinBtn.disabled = false;
  startCallBtn.disabled = true;
  endCallBtn.style.display = 'none';
  fullscreenBtn.disabled = true;
  isMutedAudio = isMutedVideo = false;
  muteAudioBtn.querySelector('span').textContent = 'Mute';
  muteVideoBtn.querySelector('span').textContent = 'Video';
});

// Socket events (unchanged except logs)
socket.on('user-joined', (data) => {
  console.log('User joined:', data.username);
  remoteName.textContent = data.username;
  startCallBtn.disabled = false;
  updateStatus(`${data.username} joined. Start the call? (720p ready)`, 'connecting');
  socket.emit('status-update', { type: 'user-ready', message: `${username} is ready` });
});

socket.on('offer', async (data) => {
  console.log('Offer from:', data.senderName);
  if (!peerConnection) {
    peerConnection = new RTCPeerConnection(iceServers);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    
    peerConnection.ontrack = (event) => {
      remoteStream = event.streams[0];
      remoteVideo.srcObject = remoteStream;
      updateStatus('Connected! (720p incoming)', 'connected');
      endCallBtn.style.display = 'block';
      fullscreenBtn.disabled = false;
    };
    
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) socket.emit('ice-candidate', { candidate: event.candidate, roomId });
    };
    
    peerConnection.onconnectionstatechange = () => {
      console.log('Peer state:', peerConnection.connectionState);
      if (peerConnection.connectionState === 'connected') updateStatus('P2P connected!', 'connected');
      if (peerConnection.connectionState === 'failed') updateStatus('Failed – retry?', 'error');
    };
    
    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection.iceConnectionState;
      console.log('ICE state:', state);
      if (state === 'connected' || state === 'completed') updateStatus('ICE success!', 'connected');
      else if (state === 'failed') {
        updateStatus('ICE failed – restart call.', 'error');
        startCallBtn.disabled = false;
      }
    };
  }
  
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('answer', { answer, roomId });
});

socket.on('answer', async (data) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  console.log('Answer set – waiting for ICE...');
});

socket.on('ice-candidate', async (candidate) => {
  if (candidate) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    console.log('Added ICE candidate');
  }
});

socket.on('status-update', (data) => {
  updateStatus(data.message, data.type || 'info');
});