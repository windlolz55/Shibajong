// --- 應用程式與 UI 邏輯 (app.js) ---

const screens = {
    lobby: document.getElementById('lobby-screen'),
    waiting: document.getElementById('waiting-room-screen'),
    game: document.getElementById('game-screen'),
    settlement: document.getElementById('settlement-screen')
};

let progressInterval;
function startLoadingProgress() {
    const textSpan = document.getElementById('lobby-progress-text');
    const tipDiv = document.getElementById('lobby-wait-tip');
    if(tipDiv) tipDiv.style.display = 'block';
    
    if(textSpan) {
        textSpan.style.color = '#10b981';
        textSpan.innerText = '(0%)';
        let progress = 0;
        progressInterval = setInterval(() => {
            if(progress < 99) {
                progress += (99 - progress) * 0.08;
                textSpan.innerText = '(' + Math.floor(progress) + '%)';
            }
        }, 1000);
    }
}

function stopLoadingProgress(success) {
    const textSpan = document.getElementById('lobby-progress-text');
    const tipDiv = document.getElementById('lobby-wait-tip');
    if(progressInterval) clearInterval(progressInterval);
    
    if(textSpan) {
        if (success) {
            textSpan.innerText = '(100%)';
            setTimeout(() => {
                textSpan.innerText = '';
                if(tipDiv) tipDiv.style.display = 'none';
            }, 500);
        } else {
            textSpan.style.color = '#ef4444';
            textSpan.innerText = '(失敗)';
            setTimeout(() => {
                textSpan.innerText = '';
                if(tipDiv) tipDiv.style.display = 'none';
            }, 2000);
        }
    }
}

const UI = {
    playerName: document.getElementById('player-name'),
    botSpeed: document.getElementById('bot-speed'),
    btnSinglePlayer: document.getElementById('btn-single-player'),
    roomCodeInput: document.getElementById('room-code-input'),
    btnCreate: document.getElementById('btn-create-room'),
    btnJoin: document.getElementById('btn-join-room'),
    btnAddBot: document.getElementById('btn-add-bot'),
    btnStart: document.getElementById('btn-start-game'),
    botDifficulty: document.getElementById('bot-difficulty'),
    gameSpeedSelect: document.getElementById('game-speed-select'),
    btnLeaveWaiting: document.getElementById('btn-leave-waiting'),
    lobbyStatus: document.getElementById('lobby-status'),
    displayRoomCode: document.getElementById('display-room-code'),
    playerList: document.getElementById('waiting-player-list'),
    playerCount: document.getElementById('player-count'),
    btnStartGame: document.getElementById('btn-start-game'),
    btnBackHome: document.getElementById('btn-back-home'),
    btnForceDraw: document.getElementById('btn-force-draw'),
    btnForceWin: document.getElementById('btn-force-win'),
    btnToggleMute: document.getElementById('btn-toggle-mute'),
    volumeSlider: document.getElementById('volume-slider'),
    adminPanel: document.getElementById('admin-panel'),
    btnAdminLogin: document.getElementById('btn-admin-login'),
    adminStatus: document.getElementById('admin-status'),
    btnTaiRef: document.getElementById('btn-tai-ref'),
    btnCloseTai: document.getElementById('btn-close-tai'),
    taiRefPanel: document.getElementById('tai-ref-panel'),
    btnEmote: document.getElementById('btn-emote'),
    chatPanel: document.getElementById('chat-panel'),
    deckCount: document.getElementById('deck-count'),
    turnText: document.getElementById('turn-text'),
    turnTimer: document.getElementById('turn-timer'),
    discardPool: document.getElementById('discard-pool'),
    actionBar: document.getElementById('action-bar'),
    actionBarHandle: document.getElementById('action-bar-handle'),
    actionButtons: document.querySelector('.action-buttons'),
    chowOptionsContainer: document.getElementById('chow-options'),
    settlementContent: document.getElementById('settlement-content'),
    btnNextRound: document.getElementById('btn-next-round'),
    hands: {
        bottom: document.getElementById('hand-bottom'),
        right: document.getElementById('hand-right'),
        top: document.getElementById('hand-top'),
        left: document.getElementById('hand-left')
    },
    melds: {
        bottom: document.getElementById('meld-bottom'),
        right: document.getElementById('meld-right'),
        top: document.getElementById('meld-top'),
        left: document.getElementById('meld-left')
    },
    infos: {
        bottom: document.getElementById('info-bottom'),
        right: document.getElementById('info-right'),
        top: document.getElementById('info-top'),
        left: document.getElementById('info-left')
    }
};

window.addEventListener('DOMContentLoaded', () => {
    ChatManager.init();

    // 初始化音量滑桿與控制按鈕
    const volumeSlider = document.getElementById('volume-slider');
    if (volumeSlider) {
        volumeSlider.value = Math.round(gameVolume * 100);
        volumeSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            setGameVolume(val);
        });
    }
    const btnToggleMute = document.getElementById('btn-toggle-mute');
    if (btnToggleMute) {
        btnToggleMute.addEventListener('click', toggleMute);
    }
    updateVolumeUI(Math.round(gameVolume * 100));

    try {
        const savedName = localStorage.getItem('mj_playerName');
        if (savedName && UI.playerName) {
            UI.playerName.value = savedName;
        }
        if (localStorage.getItem('mj_admin_auth') === 'true') {
            window.isAdmin = true;
            if (UI.adminStatus) UI.adminStatus.style.display = 'block';
        }
    } catch (e) {
        console.warn("localStorage not available:", e);
    }

    // 檢查網址是否帶有房間參數 ?room=XXXX
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const roomParam = urlParams.get('room');
        if (roomParam && UI.roomCodeInput) {
            UI.roomCodeInput.value = roomParam.trim();
            if (UI.lobbyStatus) {
                UI.lobbyStatus.innerText = `已自動帶入邀請房間 [${roomParam.trim()}]，點擊加入即可！`;
            }
        }
    } catch (e) {
        console.warn("URLSearchParams parse error:", e);
    }
});

let network = null;
let audioCtx = null;
let gameVolume = 1.0;
let previousVolume = 1.0;
let isMuted = false;
let currentTimerInterval = null;
window.isAdmin = false;
try {
    if (localStorage.getItem('mj_admin_auth') === 'true') {
        window.isAdmin = true;
    }
} catch (e) {}

// 從 localStorage 讀取儲存的音量偏好
try {
    const savedVol = localStorage.getItem('mj_volume');
    if (savedVol !== null) {
        const parsed = parseInt(savedVol, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
            gameVolume = parsed / 100;
            previousVolume = gameVolume > 0 ? gameVolume : 1.0;
            isMuted = (gameVolume === 0);
        }
    }
} catch (e) {
    console.warn("localStorage read mj_volume error:", e);
}

// --- Helper Functions ---
function updateVolumeUI(percent) {
    const slider = document.getElementById('volume-slider');
    if (slider && parseInt(slider.value, 10) !== percent) {
        slider.value = percent;
    }
    const muteBtn = document.getElementById('btn-toggle-mute');
    if (muteBtn) {
        if (percent === 0) {
            muteBtn.innerText = '🔇';
            muteBtn.setAttribute('title', '已靜音 (點擊恢復音量)');
        } else if (percent < 50) {
            muteBtn.innerText = '🔉';
            muteBtn.setAttribute('title', `音量: ${percent}% (點擊靜音)`);
        } else {
            muteBtn.innerText = '🔊';
            muteBtn.setAttribute('title', `音量: ${percent}% (點擊靜音)`);
        }
    }
}

function setGameVolume(percent, save = true) {
    percent = Math.max(0, Math.min(100, Math.round(percent)));
    gameVolume = percent / 100;
    isMuted = (percent === 0);
    if (percent > 0) {
        previousVolume = gameVolume;
    }
    updateVolumeUI(percent);

    if (isMuted && window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }

    if (save) {
        try {
            localStorage.setItem('mj_volume', percent.toString());
        } catch (e) {}
    }
}

function toggleMute() {
    if (gameVolume > 0) {
        previousVolume = gameVolume;
        setGameVolume(0);
    } else {
        const restoreVol = previousVolume > 0 ? Math.round(previousVolume * 100) : 100;
        setGameVolume(restoreVol);
    }
}

function formatTileDisplayName(tile) {
    if (!tile) return '';
    const digitToZh = {1:'一', 2:'二', 3:'三', 4:'四', 5:'五', 6:'六', 7:'七', 8:'八', 9:'九'};
    if (tile.type === '萬' || tile.type === '筒' || tile.type === '條') {
        return (digitToZh[tile.value] || tile.value) + tile.type;
    } else {
        let name = tile.value;
        if (name === '東' || name === '南' || name === '西' || name === '北') name += '風';
        return name;
    }
}

// --- 聊天室與快捷語音管理員 (ChatManager) ---
const ChatManager = {
    messages: [],
    unreadCount: 0,
    isPanelOpen: false,
    myLastEmoteTime: 0,

    init() {
        // 等待室發送
        const waitingSendBtn = document.getElementById('btn-waiting-chat-send');
        const waitingInput = document.getElementById('waiting-chat-input');
        if (waitingSendBtn && waitingInput) {
            waitingSendBtn.addEventListener('click', () => this.sendMessageFrom(waitingInput));
            waitingInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.sendMessageFrom(waitingInput);
                }
            });
        }

        // 遊戲內發送
        const gameSendBtn = document.getElementById('btn-in-game-chat-send');
        const gameInput = document.getElementById('in-game-chat-input');
        if (gameSendBtn && gameInput) {
            gameSendBtn.addEventListener('click', () => this.sendMessageFrom(gameInput));
            gameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.sendMessageFrom(gameInput);
                }
            });
        }

        // 遊戲內分頁切換 (聊天 / 快捷)
        const tabChat = document.getElementById('tab-btn-chat');
        const tabQuick = document.getElementById('tab-btn-quick');
        const contentChat = document.getElementById('chat-tab-content');
        const contentQuick = document.getElementById('quick-tab-content');

        if (tabChat && tabQuick && contentChat && contentQuick) {
            tabChat.addEventListener('click', () => {
                tabChat.classList.add('active');
                tabQuick.classList.remove('active');
                contentChat.style.display = 'block';
                contentQuick.style.display = 'none';
            });
            tabQuick.addEventListener('click', () => {
                tabQuick.classList.add('active');
                tabChat.classList.remove('active');
                contentChat.style.display = 'none';
                contentQuick.style.display = 'block';
            });
        }

        // 快捷罐頭點擊與翻頁
        const chatPanel = document.getElementById('chat-panel');
        if (chatPanel) {
            chatPanel.addEventListener('click', (e) => {
                const target = e.target;
                if (target.id === 'btn-emote-next') {
                    const p1 = document.getElementById('emote-page-1');
                    const p2 = document.getElementById('emote-page-2');
                    if (p1) p1.style.display = 'none';
                    if (p2) p2.style.display = 'flex';
                    return;
                }
                if (target.id === 'btn-emote-prev') {
                    const p1 = document.getElementById('emote-page-1');
                    const p2 = document.getElementById('emote-page-2');
                    if (p1) p1.style.display = 'flex';
                    if (p2) p2.style.display = 'none';
                    return;
                }

                if (target.classList.contains('btn-emote-option')) {
                    const now = Date.now();
                    if (now - this.myLastEmoteTime < 3000) {
                        const timeLeft = Math.ceil((3000 - (now - this.myLastEmoteTime)) / 1000);
                        if (window.showNotification) window.showNotification(`發言冷卻中，請等 ${timeLeft} 秒`, true);
                        return;
                    }
                    this.myLastEmoteTime = now;

                    const text = target.getAttribute('data-text');
                    if (text && network) {
                        network.sendAction('emote', { text: text }); // 快捷語音發送牌桌動作，不寫入聊天室對話紀錄
                    }
                    this.togglePanel(false);
                }
            });
        }

        // 關閉按鈕
        const btnClose = document.getElementById('btn-close-chat');
        if (btnClose) {
            btnClose.addEventListener('click', () => this.togglePanel(false));
        }

        // 浮動開啟按鈕
        if (UI.btnEmote) {
            UI.btnEmote.addEventListener('click', () => {
                const panel = document.getElementById('chat-panel');
                const isOpen = panel && panel.style.display !== 'none';
                this.togglePanel(!isOpen);
                if (UI.taiRefPanel) UI.taiRefPanel.style.display = 'none';
            });
        }
    },

    togglePanel(open) {
        const chatPanel = document.getElementById('chat-panel');
        if (!chatPanel) return;
        this.isPanelOpen = open;
        chatPanel.style.display = open ? 'flex' : 'none';
        if (open) {
            this.unreadCount = 0;
            this.updateBadge();
            this.scrollToBottom('in-game-chat-messages');
        }
    },

    updateBadge() {
        const badge = document.getElementById('chat-unread-badge');
        if (!badge) return;
        if (this.unreadCount > 0) {
            badge.innerText = this.unreadCount > 99 ? '99+' : this.unreadCount;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    },

    sendMessageFrom(inputEl) {
        if (!inputEl) return;
        const text = inputEl.value.trim();
        if (!text) return;
        if (!network) return;

        network.sendChatMessage(text);
        inputEl.value = '';
    },

    addMessage(msgData) {
        this.messages.push(msgData);

        const escapeHtml = (str) => {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        };

        const isSelf = network && (
            (network.myPlayerIndex >= 0 && msgData.playerIndex === network.myPlayerIndex) ||
            (network.playerName && msgData.sender === network.playerName)
        );

        const msgHtml = `
            <div class="chat-msg-item ${isSelf ? 'self' : 'other'}">
                <div class="chat-msg-meta">
                    <span class="chat-msg-sender">${escapeHtml(msgData.sender || '玩家')}</span>
                    <span class="chat-msg-time">${escapeHtml(msgData.time || '')}</span>
                </div>
                <div class="chat-msg-bubble">${escapeHtml(msgData.text)}</div>
            </div>
        `;

        // 渲染至等待室
        const waitingBox = document.getElementById('waiting-chat-messages');
        if (waitingBox) {
            waitingBox.insertAdjacentHTML('beforeend', msgHtml);
            this.scrollToBottom('waiting-chat-messages');
        }

        // 渲染至遊戲內聊天
        const gameBox = document.getElementById('in-game-chat-messages');
        if (gameBox) {
            gameBox.insertAdjacentHTML('beforeend', msgHtml);
            this.scrollToBottom('in-game-chat-messages');
        }

        // 增加未讀計數（若面板未開啟）
        if (!this.isPanelOpen) {
            this.unreadCount++;
            this.updateBadge();
        }
    },

    scrollToBottom(elementId) {
        const el = document.getElementById(elementId);
        if (el) {
            setTimeout(() => {
                el.scrollTop = el.scrollHeight;
            }, 50);
        }
    },

    reset() {
        this.messages = [];
        this.unreadCount = 0;
        this.updateBadge();
        const waitingBox = document.getElementById('waiting-chat-messages');
        if (waitingBox) waitingBox.innerHTML = '<div class="chat-system-msg">歡迎加入房間！可以在此打字溝通</div>';
        const gameBox = document.getElementById('in-game-chat-messages');
        if (gameBox) gameBox.innerHTML = '<div class="chat-system-msg">歡迎來到牌局！</div>';
    }
};

// --- Socket / Room Logic ---

if (UI.btnTaiRef) {
    UI.btnTaiRef.addEventListener('click', () => {
        UI.taiRefPanel.style.display = UI.taiRefPanel.style.display === 'none' ? 'block' : 'none';
        const chatPanel = document.getElementById('chat-panel');
        if (chatPanel) chatPanel.style.display = 'none'; // 互斥開啟
    });
}

if (UI.btnCloseTai) {
    UI.btnCloseTai.addEventListener('click', () => {
        UI.taiRefPanel.style.display = 'none';
    });
}

window.showEmote = function(playerIndex, text, isEmote = false) {
    if (!network) {
        return;
    }
    
    // 如果不在牌局遊戲畫面中（例如在等待室或大廳），牌桌氣泡與語音絕對不觸發，避免出現在畫面左上角
    const gameScreen = document.getElementById('game-screen');
    if (!gameScreen || gameScreen.classList.contains('hidden') || gameScreen.style.display === 'none') {
        return;
    }
    
    let myIndex = network.myPlayerIndex;
    if (myIndex === undefined || myIndex === -1) myIndex = 0;
    
    // Explicitly parse to numbers just in case
    const offset = (Number(playerIndex) - Number(myIndex) + 4) % 4;
    const positions = ['bottom', 'right', 'top', 'left'];
    const position = positions[offset];
    
    const infoId = `info-${position}`;
    const infoEl = document.getElementById(infoId);
    if (!infoEl) return;
    
    const rect = infoEl.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    
    // Create speech bubble
    const bubble = document.createElement('div');
    bubble.className = 'emote-bubble';
    bubble.innerText = text;
    bubble.style.zIndex = '99999'; // FORCE ON TOP OF EVERYTHING
    
    // Append to document.body to avoid ALL container issues
    document.body.appendChild(bubble);
    
    // Force reflow
    void bubble.offsetWidth;
    
    // Use fixed positioning based on the bounding rect of infoEl
    bubble.style.position = 'fixed';
    
    let topPos = rect.top - bubble.offsetHeight - 10;
    
    // If it goes off the top of the screen (top player), place it BELOW the player info
    if (topPos < 10) {
        topPos = rect.bottom + 10;
        bubble.style.setProperty('--tail-top', '-6px');
        bubble.style.setProperty('--tail-border', 'transparent transparent rgba(255, 255, 255, 0.95) transparent');
    }
    
    bubble.style.top = topPos + 'px';
    
    if (position === 'left') {
        bubble.style.left = rect.left + 'px';
        bubble.style.transform = 'translateY(10px)';
    } else if (position === 'right') {
        bubble.style.left = 'auto';
        bubble.style.right = (window.innerWidth - rect.right) + 'px';
        bubble.style.transform = 'translateY(10px)';
    } else {
        bubble.style.left = (rect.left + rect.width / 2) + 'px';
    }
    
    bubble.classList.add('show');
    if (position === 'left' || position === 'right') {
        bubble.style.transform = 'translateY(0)'; // override show transform
    }
    
    // 只有在點選「快捷語音」按鈕時才播放專屬音效或 TTS 語音朗讀 (一般聊天室打字不會發出任何聲音)
    if (isEmote && typeof isMuted !== 'undefined' && !isMuted && gameVolume > 0) {
        const playAudioFile = (file) => {
            const audio = new Audio(file);
            audio.volume = gameVolume;
            audio.play().catch(e => console.error("Audio play failed:", e));
        };
        if (text === '度！') {
            playAudioFile('du.mp3');
        } else if (text === 'dllm') {
            playAudioFile('dllm.mp3');
        } else if (text === '陽光彩虹小白馬') {
            playAudioFile('Sunshine, Rainbow, White Pony.mp3');
        } else if (text === '葳葳孟孟') {
            playAudioFile('Wei & Meng.mp3');
        } else if (text === '對不起 我沒打好' || text === '對不起我沒打好') {
            playAudioFile('sorry.mp3');
        } else if (text === '太爽不算 再來一把' || text === '太爽不算再來一把') {
            playAudioFile('On cloud nine1.mp3');
        } else if (text === '贏了沒爽 再來一把' || text === '贏了沒爽再來一把') {
            playAudioFile('On cloud nine2.mp3');
        } else if (window.speechSynthesis) {
            // 沒有專屬 mp3 音效的快捷語音使用 TTS 報讀
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'zh-TW';
            utterance.rate = 1.1;
            utterance.volume = gameVolume;
            window.speechSynthesis.speak(utterance);
        }
    }
    
    setTimeout(() => {
        bubble.classList.remove('show');
        setTimeout(() => {
            if (bubble.parentElement) bubble.parentElement.removeChild(bubble);
        }, 300);
    }, 3000);
};

if (UI.btnAdminLogin) {
    UI.btnAdminLogin.addEventListener('click', () => {
        if (window.isAdmin) {
            if (confirm('您目前已登入管理員模式。\n要登出管理員身份嗎？')) {
                window.isAdmin = false;
                try { localStorage.removeItem('mj_admin_auth'); } catch (e) {}
                if (UI.adminStatus) UI.adminStatus.style.display = 'none';
                if (UI.adminPanel) UI.adminPanel.style.display = 'none';
                alert('已登出管理員模式');
            }
            return;
        }
        const pw = prompt('請輸入管理員密碼：');
        if (pw === 'kittenz') {
            window.isAdmin = true;
            try { localStorage.setItem('mj_admin_auth', 'true'); } catch (e) {}
            if (UI.adminStatus) UI.adminStatus.style.display = 'block';
            alert('管理員模式已啟用，已為您自動儲存登入狀態！');
            if (network && UI.adminPanel) {
                UI.adminPanel.style.display = 'flex';
            }
        } else if (pw !== null) {
            alert('密碼錯誤');
        }
    });
}

if (UI.btnToggleMute) {
    UI.btnToggleMute.addEventListener('click', toggleMute);
}

window.showNotification = function(message, isError = false) {
    const container = document.getElementById('notification-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `notification-toast ${isError ? 'error' : ''}`;
    toast.innerText = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 4000); // 顯示 4 秒後消失
};

function speakText(text) {
    if (isMuted || gameVolume <= 0 || !window.speechSynthesis) return;
    window.speechSynthesis.cancel(); // 停止先前的語音
    // 使用 setTimeout 避免在 cancel 後立即 speak 導致 Chromium 引擎中斷
    setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-TW';
        utterance.rate = 1.2;
        utterance.volume = gameVolume;
        window.speechSynthesis.speak(utterance);
    }, 50);
}

function playDiscardSound() {
    if (isMuted || gameVolume <= 0) return;
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05);

    gainNode.gain.setValueAtTime(1 * gameVolume, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01 * gameVolume, audioCtx.currentTime + 0.05);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
}

function playWinSound(isSelfDraw) {
    if (isMuted || gameVolume <= 0) return;
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const now = audioCtx.currentTime;

        // 1. 低音震波 (Impact Bass)
        const subOsc = audioCtx.createOscillator();
        const subGain = audioCtx.createGain();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(160, now);
        subOsc.frequency.exponentialRampToValueAtTime(30, now + 0.65);
        subGain.gain.setValueAtTime(1.0 * gameVolume, now);
        subGain.gain.exponentialRampToValueAtTime(0.001 * gameVolume, now + 0.65);
        subOsc.connect(subGain);
        subGain.connect(audioCtx.destination);
        subOsc.start(now);
        subOsc.stop(now + 0.65);

        // 2. 宏亮勝利和弦 (Triumphant Fanfare)
        const freqs = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
        freqs.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
            const noteStart = now + (idx * 0.035);
            osc.frequency.setValueAtTime(freq, noteStart);
            
            gain.gain.setValueAtTime(0.25 * gameVolume, noteStart);
            gain.gain.exponentialRampToValueAtTime(0.001 * gameVolume, noteStart + 1.2);
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(noteStart);
            osc.stop(noteStart + 1.2);
        });

        // 3. 高頻閃耀華麗琶音 (Sparkling Arpeggio)
        const sparkle = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
        sparkle.forEach((freq, i) => {
            const sOsc = audioCtx.createOscillator();
            const sGain = audioCtx.createGain();
            sOsc.type = 'sine';
            const sStart = now + 0.22 + (i * 0.05);
            sOsc.frequency.setValueAtTime(freq, sStart);
            sGain.gain.setValueAtTime(0.18 * gameVolume, sStart);
            sGain.gain.exponentialRampToValueAtTime(0.001 * gameVolume, sStart + 0.45);
            sOsc.connect(sGain);
            sGain.connect(audioCtx.destination);
            sOsc.start(sStart);
            sOsc.stop(sStart + 0.45);
        });
    } catch(e) {
        console.error("playWinSound error:", e);
    }
}

function playDrawSound() {
    if (isMuted || gameVolume <= 0) return;
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.45);
        gain.gain.setValueAtTime(0.4 * gameVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.01 * gameVolume, now + 0.45);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.45);
    } catch(e) {
        console.error("playDrawSound error:", e);
    }
}

function hideWinCelebration() {
    const overlay = document.getElementById('win-celebration-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
    document.querySelectorAll('.player-area').forEach(el => el.classList.remove('winner-highlight'));
}

function triggerWinCelebration(state, myIndex) {
    const s = state.settlementData;
    if (!s) return;

    const overlay = document.getElementById('win-celebration-overlay');
    const badgeEl = document.getElementById('win-celebration-badge');
    const infoEl = document.getElementById('win-celebration-info');

    // 移除舊的贏家高亮
    document.querySelectorAll('.player-area').forEach(el => el.classList.remove('winner-highlight'));

    if (s.isDraw) {
        if (badgeEl) badgeEl.innerText = '流局';
        if (infoEl) infoEl.innerText = '荒牌流局，莊家連莊！';
        playDrawSound();
        speakText('流局');
    } else {
        const winner = state.players[s.winner];
        const isSelfDraw = s.isSelfDraw;
        const badgeText = isSelfDraw ? '自摸' : '胡';
        
        let relationStr = '';
        if (s.winner !== myIndex) {
            const relOffset = (s.winner - myIndex + 4) % 4;
            if (relOffset === 1) relationStr = ' (下家)';
            else if (relOffset === 2) relationStr = ' (對家)';
            else if (relOffset === 3) relationStr = ' (上家)';
        }

        if (badgeEl) {
            badgeEl.innerText = badgeText;
            // 重新觸發彈出縮放動畫
            badgeEl.parentElement.style.animation = 'none';
            badgeEl.parentElement.offsetHeight; // trigger reflow
            badgeEl.parentElement.style.animation = null;
        }
        if (infoEl) {
            infoEl.innerText = `${winner.name}${relationStr} ${isSelfDraw ? '自摸！' : '胡牌！'}`;
        }

        // 高亮胡牌贏家所屬方位
        const positions = ['bottom', 'right', 'top', 'left'];
        const winnerPos = positions[(s.winner - myIndex + 4) % 4];
        if (UI.infos[winnerPos] && UI.infos[winnerPos].parentElement) {
            UI.infos[winnerPos].parentElement.classList.add('winner-highlight');
        }

        // 播放震撼勝利音效與語音
        playWinSound(isSelfDraw);
        speakText(isSelfDraw ? '自摸！' : '胡牌！');
    }

    if (overlay) {
        overlay.classList.remove('hidden');
    }
}

function getBotSpeed() {
    const val = parseInt(UI.botSpeed.value);
    return isNaN(val) ? 6000 : val;
}

function showScreen(screenName) {
    Object.keys(screens).forEach(key => {
        const s = screens[key];
        // 如果是結算畫面，不要隱藏 game-screen，讓他當背景
        if (screenName === 'settlement' && key === 'game') {
            s.classList.remove('hidden');
        } else {
            s.classList.add('hidden');
        }
    });
    screens[screenName].classList.remove('hidden');
}

UI.btnSinglePlayer.addEventListener('click', async () => {
    const name = UI.playerName.value.trim() || 'Host';
    try { localStorage.setItem('mj_playerName', name); } catch(e) {}
    UI.lobbyStatus.innerText = '正在建立單機遊戲...';
    ChatManager.reset();
    
    const gameLength = document.getElementById('game-length-select-lobby').value;
    const stakeConfig = document.getElementById('game-stake-select-lobby').value;
    
    network = new MahjongNetwork(updateGameState, updatePlayerList, startGameUI, getBotSpeed(), (msg) => ChatManager.addMessage(msg));
    network.isLocalSinglePlayer = true;
    try {
        await network.createRoom(name, gameLength, stakeConfig);
        for(let i=0; i<3; i++) {
            network.addBot();
        }
        network.startGame();
    } catch (err) {
        UI.lobbyStatus.innerText = '建立失敗：' + err.message;
    }
});

UI.btnCreate.addEventListener('click', async () => {
    const name = UI.playerName.value.trim() || 'Host';
    try { localStorage.setItem('mj_playerName', name); } catch(e) {}
    UI.lobbyStatus.innerText = '正在建立房間...';
    UI.btnCreate.disabled = true;
    startLoadingProgress();
    ChatManager.reset();
    
    const gameLength = document.getElementById('game-length-select-lobby').value;
    const stakeConfig = document.getElementById('game-stake-select-lobby').value;
    
    network = new MahjongNetwork(updateGameState, updatePlayerList, startGameUI, getBotSpeed(), (msg) => ChatManager.addMessage(msg));
    network.isLocalSinglePlayer = false;
    try {
        const roomId = await network.createRoom(name, gameLength, stakeConfig);
        stopLoadingProgress(true);
        UI.displayRoomCode.innerText = roomId;

        // 同步更新網址，讓房主也能直接從網址列複製
        try {
            const newUrl = window.location.origin + window.location.pathname + '?room=' + roomId;
            window.history.replaceState(null, '', newUrl);
        } catch (e) {}

        showScreen('waiting');
        updatePlayerList(network.game.players, { botSpeed: network.botSpeed, gameLength: network.gameLength, stakeConfig: network.stakeConfig });
    } catch (err) {
        stopLoadingProgress(false);
        UI.lobbyStatus.innerText = '建立房間失敗：' + err.message;
        UI.btnCreate.disabled = false;
    }
});

UI.btnJoin.addEventListener('click', async () => {
    const name = UI.playerName.value.trim() || 'Client';
    const code = UI.roomCodeInput.value.trim();
    if (!code) return (UI.lobbyStatus.innerText = '請輸入房間代碼');
    
    try { localStorage.setItem('mj_playerName', name); } catch(e) {}
    UI.lobbyStatus.innerText = '正在加入房間...';
    UI.btnJoin.disabled = true;
    startLoadingProgress();
    ChatManager.reset();

    network = new MahjongNetwork(updateGameState, updatePlayerList, startGameUI, getBotSpeed(), (msg) => ChatManager.addMessage(msg));
    network.isLocalSinglePlayer = false;
    try {
        await network.joinRoom(code, name);
        stopLoadingProgress(true);
        UI.displayRoomCode.innerText = code;

        // 同步更新網址
        try {
            const newUrl = window.location.origin + window.location.pathname + '?room=' + code;
            window.history.replaceState(null, '', newUrl);
        } catch (e) {}

        showScreen('waiting');
    } catch (err) {
        stopLoadingProgress(false);
        UI.lobbyStatus.style.color = '#ef4444';
        UI.lobbyStatus.innerText = err.message;
        if (window.showNotification) window.showNotification(err.message, true);
        UI.btnJoin.disabled = false;
    }
});

UI.btnStart.addEventListener('click', () => {
    if (network && network.isHost) {
        network.startGame();
    } else if (network && !network.isHost) {
        network.hostConnection.send({ type: 'ready' });
    }
});

UI.botDifficulty.addEventListener('change', (e) => {
    if (network && network.game) {
        network.game.botDifficulty = e.target.value;
        if (network.isHost) network.broadcastGameState();
    }
});

UI.gameSpeedSelect.addEventListener('change', (e) => {
    if (network) {
        network.botSpeed = parseInt(e.target.value);
        if (network.isHost) network.broadcastGameState();
    }
});

const gameLengthSelect = document.getElementById('game-length-select');
if (gameLengthSelect) {
    gameLengthSelect.addEventListener('change', (e) => {
        if (network && network.game) {
            network.gameLength = e.target.value;
            network.game.gameLength = e.target.value;
            if (network.isHost) network.broadcastGameState();
        }
    });
}

UI.btnAddBot.addEventListener('click', () => {
    if (network && network.isHost) network.addBot();
});

function updatePlayerList(players, settings) {
    UI.playerList.innerHTML = '';
    players.forEach(p => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.alignItems = 'center';
        
        let status = '';
        if (p.index === 0) status = ' (房主)';
        else if (p.isBot) status = ' (電腦)';
        else status = ' (玩家)';
        
        const textSpan = document.createElement('span');
        textSpan.innerText = p.name + status;
        textSpan.style.flexGrow = '1';
        
        if (p.isReady || p.isBot || p.index === 0) {
            textSpan.style.color = '#4ade80';
        } else {
            textSpan.style.color = '#f87171';
        }
        
        li.appendChild(textSpan);
        
        if (network && network.isHost && p.index !== 0 && network.game.gameState === 'INIT') {
            const kickBtn = document.createElement('button');
            kickBtn.innerText = '❌';
            kickBtn.style.background = 'none';
            kickBtn.style.border = 'none';
            kickBtn.style.cursor = 'pointer';
            kickBtn.style.fontSize = '1.2rem';
            kickBtn.style.width = 'auto'; // Fix width 100% issue!
            kickBtn.style.padding = '0 10px';
            kickBtn.style.marginLeft = 'auto';
            kickBtn.onclick = () => {
                network.kickPlayer(p.index);
            };
            li.appendChild(kickBtn);
        }
        
        UI.playerList.appendChild(li);
    });
    UI.playerCount.innerText = players.length;

    if (network.isHost) {
        if (players.length < 4) {
            UI.btnAddBot.classList.remove('hidden');
            UI.btnStart.classList.add('hidden');
            document.getElementById('waiting-status').innerText = '等待其他玩家加入... 或加入電腦';
        } else {
            UI.btnAddBot.classList.add('hidden');
            UI.btnStart.classList.remove('hidden');
            document.getElementById('waiting-status').innerText = '人數已滿，可以開始了！';
            UI.btnStart.innerText = '開始遊戲';
        }
    } else {
        UI.btnAddBot.classList.add('hidden');
        UI.btnStart.classList.remove('hidden');
        
        const myPlayer = players.find(p => p.index === network.myPlayerIndex);
        if (myPlayer && myPlayer.isReady) {
            UI.btnStart.innerText = '取消準備';
            UI.btnStart.style.backgroundColor = '#f59e0b'; // Amber for cancel
        } else {
            UI.btnStart.innerText = '準備完成';
            UI.btnStart.style.backgroundColor = '#10b981'; // Green for ready
        }
        
        document.getElementById('waiting-status').innerText = '等待房主開始遊戲...';
    }

    if (settings) {
        let roomSettingsDiv = document.getElementById('room-settings-display');
        if (!roomSettingsDiv) {
            roomSettingsDiv = document.createElement('div');
            roomSettingsDiv.id = 'room-settings-display';
            roomSettingsDiv.style.background = 'rgba(0,0,0,0.3)';
            roomSettingsDiv.style.padding = '15px';
            roomSettingsDiv.style.borderRadius = '8px';
            roomSettingsDiv.style.marginTop = '15px';
            roomSettingsDiv.style.marginBottom = '15px';
            roomSettingsDiv.style.textAlign = 'left';
            
            const waitingStatus = document.getElementById('waiting-status');
            if (waitingStatus) {
                waitingStatus.parentNode.insertBefore(roomSettingsDiv, waitingStatus);
            }
        }
        
        let lengthText = "無限局";
        if (settings.gameLength === '1_round') lengthText = "一圈 (四局)";
        if (settings.gameLength === '1_match') lengthText = "一將 (十六局)";

        let speedText = settings.botSpeed + " 毫秒";
        if (settings.botSpeed == 0) speedText = "你是0 (0秒)";
        else if (settings.botSpeed == 3000) speedText = "極速 (3秒)";
        else if (settings.botSpeed == 5000) speedText = "標準 (5秒)";
        else if (settings.botSpeed == 10000) speedText = "慢 (10秒)";

        let stakeRateText = "100 底 / 20 台";
        let initialFundText = "$3,000";
        if (settings.stakeConfig === '50_20_1500' || settings.stakeConfig === '50_20_5000') {
            stakeRateText = "50 底 / 20 台";
            initialFundText = "$1,500";
        } else if (settings.stakeConfig === '100_20_3000' || settings.stakeConfig === '100_20_10000') {
            stakeRateText = "100 底 / 20 台";
            initialFundText = "$3,000";
        }
        
        roomSettingsDiv.innerHTML = `
            <h3 style="margin-top: 0; margin-bottom: 12px; color: #cbd5e1; font-size: 1.05rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px;">房間設定</h3>
            <div style="display: flex; justify-content: space-between; margin: 6px 0; color: #94a3b8; font-size: 0.9rem;">
                <span>底台設定：</span>
                <span style="color: #4ade80; font-weight: bold;">${stakeRateText}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin: 6px 0; color: #94a3b8; font-size: 0.9rem;">
                <span>初始資金：</span>
                <span style="color: #facc15; font-weight: bold;">${initialFundText}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin: 6px 0; color: #94a3b8; font-size: 0.9rem;">
                <span>出牌時間：</span>
                <span style="color: #fff; font-weight: bold;">${speedText}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin: 6px 0; color: #94a3b8; font-size: 0.9rem;">
                <span>遊戲長度：</span>
                <span style="color: #fff; font-weight: bold;">${lengthText}</span>
            </div>
        `;
        roomSettingsDiv.style.display = 'block';
    }
}

const btnCopyRoomLink = document.getElementById('btn-copy-room-link');
if (btnCopyRoomLink) {
    btnCopyRoomLink.addEventListener('click', async () => {
        const code = UI.displayRoomCode.innerText.trim();
        if (!code) return;
        const inviteUrl = window.location.origin + window.location.pathname + '?room=' + code;
        const inviteText = `🀄 快來陪我打麻將！\n房間代碼：${code}\n點擊下方連結立即加入房間：\n${inviteUrl}`;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(inviteText);
            } else {
                const tempInput = document.createElement('textarea');
                tempInput.value = inviteText;
                document.body.appendChild(tempInput);
                tempInput.select();
                document.execCommand('copy');
                document.body.removeChild(tempInput);
            }
            const origText = btnCopyRoomLink.innerText;
            btnCopyRoomLink.innerText = '✅ 已複製邀請訊息！';
            btnCopyRoomLink.style.background = '#10b981';
            btnCopyRoomLink.style.color = '#fff';
            btnCopyRoomLink.style.borderColor = '#10b981';
            if (window.showNotification) window.showNotification('已複製邀請訊息至剪貼簿！');
            setTimeout(() => {
                btnCopyRoomLink.innerText = origText;
                btnCopyRoomLink.style.background = 'rgba(56, 189, 248, 0.15)';
                btnCopyRoomLink.style.color = '#38bdf8';
                btnCopyRoomLink.style.borderColor = '#38bdf8';
            }, 2000);
        } catch (err) {
            prompt('請手動複製邀請訊息：', inviteText);
        }
    });
}

if (UI.btnLeaveWaiting) {
    UI.btnLeaveWaiting.addEventListener('click', () => {
        window.location.href = window.location.origin + window.location.pathname;
    });
}

if (UI.btnNextRound) {
    UI.btnNextRound.addEventListener('click', () => {
        showScreen('game');
        network.sendAction('next_round', null);
    });
}

if (UI.btnBackHome) {
    UI.btnBackHome.addEventListener('click', () => {
        if (confirm("確定要返回大廳嗎？連線將會中斷。")) {
            window.location.href = window.location.origin + window.location.pathname;
        }
    });
}

if (UI.btnForceDraw) {
    UI.btnForceDraw.addEventListener('click', () => {
        if (network && window.isAdmin) {
            if (confirm("確定要強制結束並流局嗎？")) {
                network.sendAction('force_end', 'draw');
            }
        }
    });
}

if (UI.btnForceWin) {
    UI.btnForceWin.addEventListener('click', () => {
        if (network && window.isAdmin) {
            if (confirm("確定要強制胡牌嗎？\n(將會強制讓「你自己」胡牌)\n若在你的回合按 = 自摸\n若在別人的回合按 = 別人放槍")) {
                const winner = network.myPlayerIndex;
                network.sendAction('force_end', winner);
            }
        }
    });
}

const cheatHandSelect = document.getElementById('cheat-hand-select');
const btnCheatApply = document.getElementById('btn-cheat-apply');
if (btnCheatApply && cheatHandSelect) {
    btnCheatApply.addEventListener('click', () => {
        if (network && window.isAdmin) {
            const cheatType = cheatHandSelect.value;
            network.sendAction('apply_cheat', { type: cheatType });
            if (window.showNotification) showNotification('已變牌成功！請點擊強制胡牌測試結算。');
        }
    });
}

function startGameUI() {
    showScreen('game');
    hideWinCelebration();
    window.lastSettlementKey = null;
    if (window.settlementTimer) {
        clearTimeout(window.settlementTimer);
        window.settlementTimer = null;
    }
    if (network) {
        UI.gameSpeedSelect.disabled = !network.isHost;
        UI.botDifficulty.disabled = !network.isHost;
        const gameLengthSelect = document.getElementById('game-length-select');
        if (gameLengthSelect) {
            gameLengthSelect.disabled = !network.isHost;
            gameLengthSelect.style.display = 'inline-block';
        }
        UI.gameSpeedSelect.style.display = 'inline-block';
        UI.botDifficulty.style.display = 'inline-block';
        
        if (network.isHost) {
            UI.gameSpeedSelect.value = network.botSpeed.toString();
            if (network.game) {
                network.game.botDifficulty = UI.botDifficulty.value;
            }
            if (gameLengthSelect && network.game) {
                gameLengthSelect.value = network.game.gameLength;
            }
        }
        
        if (UI.adminPanel) {
            UI.adminPanel.style.display = window.isAdmin ? 'flex' : 'none';
        }
    }
    if (network.isHost) {
        network.game.startNewRound();
        network.broadcastGameState();
    }
}

function updateGameState(state, myIndex) {
    window.currentGameStateObj = state;
    
    // 如果遊戲正在進行中，確保畫面切換回遊戲區（避免非房主卡在結算畫面）
    if (state.gameState === 'PLAYING' || state.gameState === 'WAIT_ACTION') {
        showScreen('game');
        hideWinCelebration();
        if (window.settlementTimer) {
            clearTimeout(window.settlementTimer);
            window.settlementTimer = null;
        }
    }
    
    if (state.botSpeed && !network.isHost) {
        UI.gameSpeedSelect.value = state.botSpeed.toString();
    }
    if (state.botDifficulty && !network.isHost) {
        UI.botDifficulty.value = state.botDifficulty;
    }
    if (state.gameLength && !network.isHost) {
        document.getElementById('game-length-select').value = state.gameLength;
    }
    
    // Update Round Info Text (e.g. 東風東局)
    const windNames = ['東', '南', '西', '北'];
    if (state.roundWind !== undefined && state.dealerIndex !== undefined && state.gameState !== 'INIT') {
        const roundWindStr = windNames[state.roundWind % 4];
        // Calculate dealer wind relative to initial dealer (dealerCount logic handles initialDealer but let's assume Host=0 is East)
        // initialDealer is always 0 in our code currently, so dealer's wind is just dealerIndex
        const dealerWindStr = windNames[state.dealerIndex % 4];
        const roundInfoText = document.getElementById('round-info-text');
        if (roundInfoText) {
            roundInfoText.innerText = `${roundWindStr}風${dealerWindStr}局`;
        }
    }
    
    if (state.actionEvent && state.actionEvent.timestamp !== window.lastActionEventTime) {
        window.lastActionEventTime = state.actionEvent.timestamp;
        const playerName = state.players[state.actionEvent.playerIndex].name;
        const popup = document.getElementById('action-popup');
        if (popup && state.actionEvent.type !== 'discard') {
            popup.innerText = `${state.actionEvent.type}！`;
            popup.style.opacity = '1';
            popup.style.transform = 'translate(-50%, -50%) scale(0.5)';
            setTimeout(() => { popup.style.transform = 'translate(-50%, -50%) scale(1.2)'; }, 50);
            setTimeout(() => { popup.style.transform = 'translate(-50%, -50%) scale(1)'; }, 150);
            setTimeout(() => { popup.style.opacity = '0'; }, 1500);
            
            // TTS
            if (!isMuted) {
                speakText(`${state.actionEvent.type}`);
            }

            // 在吃碰槓的 1.5 秒延遲後，更新頂部的狀態文字
            setTimeout(() => {
                if (window.currentGameStateObj && window.currentGameStateObj.gameState === 'PLAYING') {
                    if (network && network.myPlayerIndex === window.currentGameStateObj.currentTurn) {
                        UI.turnText.innerText = "👉 輪到你出牌了！";
                    } else {
                        const currentPlayerInfo = window.currentGameStateObj.players[window.currentGameStateObj.currentTurn];
                        let relStr = '';
                        const offset = (window.currentGameStateObj.currentTurn - network.myPlayerIndex + 4) % 4;
                        if (offset === 1) relStr = ' (下家)';
                        else if (offset === 2) relStr = ' (對家)';
                        else if (offset === 3) relStr = ' (上家)';
                        UI.turnText.innerText = `等待 ${currentPlayerInfo.name}${relStr} 出牌...`;
                    }
                    UI.turnText.style.color = '#facc15';
                }
            }, 1500);
        }
    }

    UI.deckCount.innerText = state.deckCount;
    
    let showTimer = state.timerEnabled;
    if (state.gameState === 'WAIT_ACTION') {
        const myPending = state.pendingActions && state.pendingActions.find(p => p.playerIndex === myIndex && !p.responded);
        if (!myPending) {
            showTimer = false;
        }
    }

    // 更新倒數計時 UI
    if (showTimer && (state.remainingTimeMs !== undefined || state.deadline)) {
        clearInterval(currentTimerInterval);
        
        // If remainingTimeMs is provided by server, calculate local deadline
        const localDeadline = state.remainingTimeMs !== undefined 
                              ? Date.now() + state.remainingTimeMs 
                              : state.deadline;
                              
        const stateStartTime = Date.now();
        const updateTimer = () => {
            if (state.visualDelay) {
                const elapsed = Date.now() - stateStartTime;
                if (elapsed < state.visualDelay) {
                    UI.turnTimer.innerText = '';
                    return;
                }
            }
            let left = Math.max(0, Math.ceil((localDeadline - Date.now()) / 1000));
            UI.turnTimer.innerText = left > 0 ? left : '';
        };
        updateTimer();
        currentTimerInterval = setInterval(updateTimer, 200);
    } else {
        clearInterval(currentTimerInterval);
        UI.turnTimer.innerText = '';
    }

    if (state.gameState === 'GAME_OVER') {
        const winnerName = state.winner !== -1 ? state.players[state.winner].name : '無人';
        UI.turnText.innerText = `🚨 遊戲即將開始`;
        if (state.winner !== -1) UI.turnText.style.color = '#ef4444';
        else UI.turnText.style.color = '#94a3b8';
        UI.actionBar.classList.add('hidden');
        document.querySelector('.game-board').classList.add('game-over');
    } else if (state.gameState === 'WAIT_ACTION') {
        UI.turnText.innerText = ``; 
        document.querySelector('.game-board').classList.remove('game-over');
    } else {
        document.querySelector('.game-board').classList.remove('game-over');
    }

    const positions = ['bottom', 'right', 'top', 'left'];
    
    for (let offset = 0; offset < 4; offset++) {
        const targetPlayerIndex = (myIndex + offset) % 4;
        const pos = positions[offset];
        
        let relationStr = '';
        if (offset === 1) relationStr = ' (下家)';
        else if (offset === 2) relationStr = ' (對家)';
        else if (offset === 3) relationStr = ' (上家)';
        
        const handData = state.hands[targetPlayerIndex] || [];
        const meldData = state.melds[targetPlayerIndex] || [];
        const playerInfo = state.players[targetPlayerIndex];
        
        const isTurn = (state.gameState === 'PLAYING' && state.currentTurn === targetPlayerIndex);
        const isDealer = state.dealerIndex === targetPlayerIndex;
        
        if (playerInfo) {
            let windIndicator = '';
            if (state.dealerIndex !== undefined) {
                const windNames = ['東', '南', '西', '北'];
                const windIndex = (targetPlayerIndex - state.dealerIndex + 4) % 4;
                windIndicator = `<span style="color:#60a5fa; font-weight:bold; margin-left: 5px;">[${windNames[windIndex]}]</span>`;
            }
            
            // 若玩家已聽牌，顯示提示圖示
            const tenpaiIndicator = (state.tenpaiStatus && state.tenpaiStatus[targetPlayerIndex]) 
                ? '<span style="color:#ec4899; font-size:12px; margin-left: 5px;">📢[聽]</span>' 
                : '';
            UI.infos[pos].innerHTML = `
                <div>${playerInfo.name}${relationStr}${windIndicator} ${isDealer ? '<span style="color:#ef4444">(莊)</span>' : ''}${tenpaiIndicator}</div>
                <div style="font-size: 0.8rem; color: #facc15;">$${state.scores[targetPlayerIndex]}</div>
            `;
        }
        
        const playerArea = UI.infos[pos].parentElement;
        let isMyTurnAndCanSelfDraw = false;
        let mySelfKongOptions = [];
        let canDeclareTenpai = false;

        if (isTurn) {
            playerArea.classList.add('active');
            if (offset === 0 && state.gameState === 'PLAYING') {
                if (!window.justDiscardedText && (!state.visualDelay || state.visualDelay === 0)) {
                    UI.turnText.innerText = "👉 輪到你出牌了！";
                }
                if (!window.justDiscardedText) {
                    UI.turnText.style.color = '#facc15';
                }
                if (state.selfDrawFlags && state.selfDrawFlags[myIndex]) {
                    isMyTurnAndCanSelfDraw = true;
                }
                if (state.selfKongOptions && state.selfKongOptions[myIndex] && state.selfKongOptions[myIndex].length > 0) {
                    mySelfKongOptions = state.selfKongOptions[myIndex];
                }
            } else if (state.gameState === 'PLAYING') {
                if (!state.visualDelay || state.visualDelay === 0) {
                    UI.turnText.innerText = `等待 ${playerInfo.name}${relationStr} 出牌...`;
                }
                UI.turnText.style.color = '#facc15';
            }
        } else {
            playerArea.classList.remove('active');
        }

        // 獨立檢查是否可以宣告天聽或地聽 (因為閒家的天聽可能在莊家回合宣告)
        if (state.gameState === 'PLAYING' || state.gameState === 'WAIT_ACTION') {
            const wt = state.waitTiles && state.waitTiles[myIndex] ? state.waitTiles[myIndex] : [];
            const hasWaitTiles = wt.length > 0;
            const notDeclared = !state.tenpaiStatus || !state.tenpaiStatus[myIndex];
            const isEligible = state.isTianDiTingEligible && state.isTianDiTingEligible[myIndex];
            
            if (hasWaitTiles && notDeclared && isEligible) {
                canDeclareTenpai = true;
            }
        }

        const isMe = (offset === 0) || (state.gameState === 'GAME_OVER');
        renderHand(pos, handData, isMe, isTurn && offset === 0);
        renderMelds(pos, meldData, isMe);
        
        // 如果是我，且可以自摸、自摸槓或宣告聽牌，顯示中央面板
        if (isMyTurnAndCanSelfDraw || mySelfKongOptions.length > 0 || canDeclareTenpai) {
            if (window.resetActionBarState) window.resetActionBarState();
            UI.actionBar.classList.remove('hidden');
            UI.actionButtons.innerHTML = '';
            UI.chowOptionsContainer.innerHTML = '';
            UI.chowOptionsContainer.classList.add('hidden');
            
            if (isMyTurnAndCanSelfDraw) {
                const btnSelfDraw = addActionButton('自摸', 'btn-hu', 'HU', false);
                btnSelfDraw.addEventListener('click', () => {
                    UI.actionBar.classList.add('hidden');
                    network.sendAction('self_draw_hu', null);
                });
            }

            if (canDeclareTenpai) {
                const btnTenpai = addActionButton('📢 宣告聽牌', 'btn-tenpai', 'TENPAI', false);
                btnTenpai.style.backgroundColor = '#ec4899';
                btnTenpai.addEventListener('click', () => {
                    UI.actionBar.classList.add('hidden');
                    network.sendAction('declare_tenpai', null);
                });
            }

            if (mySelfKongOptions.length > 0) {
                const hasAnKong = mySelfKongOptions.some(o => o.type === 'ANKONG');
                const hasJiaKong = mySelfKongOptions.some(o => o.type === 'JIAKONG');
                let kongBtnText = '槓';
                if (hasAnKong && !hasJiaKong) kongBtnText = '暗槓';
                else if (!hasAnKong && hasJiaKong) kongBtnText = '加槓';
                
                const btnKong = addActionButton(kongBtnText, 'btn-kong', 'KONG', false);
                btnKong.addEventListener('click', () => {
                    showSelfKongOptions(mySelfKongOptions);
                });
            }
            
            const btnSkip = addActionButton('跳過', 'btn-skip', 'SKIP', false);
            btnSkip.addEventListener('click', () => {
                UI.actionBar.classList.add('hidden');
            });
        } else if (offset === 0 && state.gameState === 'PLAYING' && !isMyTurnAndCanSelfDraw && mySelfKongOptions.length === 0 && !canDeclareTenpai) {
             // 隱藏中央按鈕（如果有殘留的話）
             UI.actionBar.classList.add('hidden');
        }
    }

    // 新局開始或陣列為空時，重置計數
        if (state.discardPool.length === 0) {
        window.lastDiscardCount = 0;
    }

    // 檢查是否有新的牌丟出，如果有則播放聲音和語音
    if (state.discardPool.length > 0 && (window.lastDiscardCount === undefined || window.lastDiscardCount < state.discardPool.length)) {
        playDiscardSound();
        const lastTile = state.discardPool[state.discardPool.length - 1];
        
        const digitToZh = {1:'一', 2:'二', 3:'三', 4:'四', 5:'五', 6:'六', 7:'七', 8:'八', 9:'九'};
        let tileName = lastTile.type;
        if (lastTile.type === '萬' || lastTile.type === '筒' || lastTile.type === '條') {
            tileName = digitToZh[lastTile.value] + lastTile.type;
        } else {
            tileName = lastTile.value;
            if (tileName === '東' || tileName === '南' || tileName === '西' || tileName === '北') tileName += '風';
        }
        
        // 顯示誰打出了什麼牌
        const throwerIndex = state.gameState === 'WAIT_ACTION' ? state.currentTurn : (state.currentTurn - 1 + 4) % 4;
        
        let throwerName = state.players[throwerIndex] ? state.players[throwerIndex].name : '玩家';
        if (throwerIndex !== myIndex) {
            const relOffset = (throwerIndex - myIndex + 4) % 4;
            if (relOffset === 1) throwerName += ' (下家)';
            else if (relOffset === 2) throwerName += ' (對家)';
            else if (relOffset === 3) throwerName += ' (上家)';
        }
        
        if (state.gameState === 'PLAYING') {
            const currentPlayer = state.players[state.currentTurn];
            let relStr = '';
            if (network && network.myPlayerIndex !== state.currentTurn) {
                const offset = (state.currentTurn - myIndex + 4) % 4;
                if (offset === 1) relStr = ' (下家)';
                else if (offset === 2) relStr = ' (對家)';
                else if (offset === 3) relStr = ' (上家)';
            }
            
            if (state.visualDelay && state.visualDelay > 0) {
                UI.turnText.innerHTML = `${throwerName} 打出 ${tileName}`;
                UI.turnText.style.color = '#fff';
                setTimeout(() => {
                    if (window.currentGameStateObj && window.currentGameStateObj.gameState === 'PLAYING') {
                        if (network && network.myPlayerIndex === state.currentTurn) {
                            UI.turnText.innerHTML = "👉 輪到你出牌了！";
                        } else {
                            UI.turnText.innerHTML = `等待 ${currentPlayer.name}${relStr} 出牌...`;
                        }
                        UI.turnText.style.color = '#facc15';
                    }
                }, state.visualDelay);
            } else {
                if (network && network.myPlayerIndex === state.currentTurn) {
                    UI.turnText.innerHTML = "👉 輪到你出牌了！";
                } else {
                    UI.turnText.innerHTML = `等待 ${currentPlayer.name}${relStr} 出牌...`;
                }
                UI.turnText.style.color = '#facc15';
            }
        } else if (state.gameState === 'WAIT_ACTION') {
            let actionStr = "";
            const myAction = state.pendingActions && state.pendingActions.find(p => p.playerIndex === myIndex && !p.responded);
            if (myAction) {
                actionStr = "<br>=> 請選擇動作！";
            }
            UI.turnText.innerHTML = `${throwerName} 打出 ${tileName}${actionStr}`;
            UI.turnText.style.color = actionStr ? '#facc15' : '#fff';
        }

        speakText(tileName);
    }
    window.lastDiscardCount = state.discardPool.length;

    renderDiscardPool(state.discardPool);
    handlePendingActions(state, myIndex);

    // 聽牌提示 (Tenpai Hint) 邏輯
    if (state.gameState === 'PLAYING' || state.gameState === 'WAIT_ACTION') {
        // 使用 timeout 稍微延遲，避免阻塞主要 UI 渲染
        setTimeout(() => {
            const waitTiles = state.waitTiles ? state.waitTiles[myIndex] : [];
            const tilesEl = document.getElementById('tenpai-tiles');
            if (waitTiles && waitTiles.length > 0) {
                let html = '';
                const digitToZh = {1:'一', 2:'二', 3:'三', 4:'四', 5:'五', 6:'六', 7:'七', 8:'八', 9:'九'};
                waitTiles.forEach(t => {
                    let tileName = t.type;
                    if (t.type === '萬' || t.type === '筒' || t.type === '條') {
                        tileName = digitToZh[t.value] + t.type;
                    } else {
                        tileName = t.value;
                        if (tileName === '東' || tileName === '南' || tileName === '西' || tileName === '北') tileName += '風';
                    }
                    html += `
                    <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
                        <div style="width:28px; height:38px; border-radius:3px; overflow:hidden; border: 1px solid #94a3b8; background-color:#f1f5f9; display:flex; align-items:center; justify-content:center;">${getTileHTML(t)}</div>
                        <span style="font-size: 0.8rem; color: #cbd5e1; white-space: nowrap;">${tileName}</span>
                    </div>`;
                });
                tilesEl.innerHTML = html;
            } else {
                tilesEl.innerHTML = `<span style="color:#94a3b8; font-size: 0.9rem; padding: 10px;">尚未聽牌</span>`;
            }
        }, 10);
    } else {
        document.getElementById('tenpai-tiles').innerHTML = `<span style="color:#94a3b8; font-size: 0.9rem; padding: 10px;">尚未聽牌</span>`;
    }

    if (state.gameState === 'GAME_OVER' && state.settlementData) {
        const settlementKey = state.settlementData.timestamp || `${state.settlementData.winner}_${state.settlementData.isSelfDraw}_${state.dealerCount}`;
        if (window.lastSettlementKey !== settlementKey) {
            window.lastSettlementKey = settlementKey;
            
            // 1. 先在牌桌上與胡牌者位置顯示大大的「胡」/「自摸」與震撼音效
            triggerWinCelebration(state, myIndex);
            
            // 2. 延遲 2.3 秒後再平滑切入結算明細畫面
            if (window.settlementTimer) clearTimeout(window.settlementTimer);
            window.settlementTimer = setTimeout(() => {
                showSettlement(state, myIndex);
                window.settlementTimer = null;
            }, 2300);
        } else if (!window.settlementTimer) {
            // 如果已經在結算狀態中，直接顯示結算畫面
            showSettlement(state, myIndex);
        }
    }
}

const TAI_EXPLANATIONS = {
    '莊家': '身為莊家，無論胡牌或放槍都會多計1台。',
    '自摸': '自己摸到胡牌的牌',
    '門清': '全程不吃、碰、明槓',
    '門清一摸三': '門清+自摸 (含不求人)',
    '全求人': '手牌全吃碰槓，剩1張單吊胡他人',
    '半求人': '手牌全吃碰槓，剩1張單吊自摸',
    '不求人': '門清狀態下自摸',
    '海底撈月': '全場剩16張內自摸',
    '河底撈魚': '全場剩16張內胡別人',
    '槓上開花': '槓牌後補的牌剛好自摸',
    '五暗刻': '5副非碰出的暗刻(含暗槓)',
    '四暗刻': '4副非碰出的暗刻(含暗槓)',
    '三暗刻': '3副非碰出的暗刻(含暗槓)',
    '碰碰胡': '全是刻子與一個對子',
    '平胡': '全是順子、無字牌、無花牌、非單聽',
    '大四喜': '東南西北 4 組刻子',
    '小四喜': '東南西北 3 組刻子+1 組風牌對子',
    '門風刻': '擁有自己座位的風牌刻子',
    '圈風刻': '擁有當前風圈的風牌刻子',
    '正花': '座位對應的春夏秋冬/梅蘭竹菊',
    '大三元': '中發白三種刻子',
    '小三元': '中發白兩種刻子+一種對子',
    '三元刻': '有中發白任一組刻子',
    '字一色': '全為字牌',
    '清一色': '全為同一花色且無字牌',
    '混一色': '同一花色加上字牌',
    '單聽': '僅聽單一牌張',
    '天聽': '起手配牌完畢即宣告聽牌',
    '地聽': '無人吃碰槓下，於第一巡宣告聽牌'
};

function showSettlement(state, myIndex) {
    hideWinCelebration();
    showScreen('settlement');
    const s = state.settlementData;
    let html = '';

    const dealerIndex = (s.dealer !== undefined) ? s.dealer : state.dealerIndex;
    const dealerCount = (s.dealerCount !== undefined) ? s.dealerCount : state.dealerCount;
    const dealerPlayer = state.players[dealerIndex];
    const baseScore = s.baseScore || state.baseScore || 100;
    const taiScore = s.taiScore || state.taiScore || 20;

    if (state.isMatchOver) {
        let bestScore = -Infinity;
        let matchWinnerName = "";
        state.players.forEach((p, index) => {
            if (state.scores[index] > bestScore) {
                bestScore = state.scores[index];
                matchWinnerName = p.name;
            }
        });
        
        let matchEndReason = "遊戲結束";
        if (state.gameLength === '1_round') matchEndReason = "一圈結束";
        if (state.gameLength === '1_match') matchEndReason = "一將結束";
        if (state.players.some(p => p.score <= 0)) matchEndReason = "有玩家破產，遊戲結束";
        
        html += `<div style="background: rgba(234, 179, 8, 0.15); border: 2px solid #eab308; padding: 20px; border-radius: 10px; margin-bottom: 25px; text-align: center;">
            <h2 style="color: #fff; margin: 0; font-size: 1.8rem;">🏆 最終贏家：<span style="color: #4ade80;">${matchWinnerName}</span> <span style="font-size: 1.2rem; color: #cbd5e1;">(${bestScore} 分)</span></h2>
        </div>`;
    }

    // 頂部資訊列：顯示底台設定
    html += `<div style="display:flex; justify-content:center; align-items:center; gap:10px; margin-bottom:15px; flex-wrap:wrap;">
        <span style="background:rgba(56,189,248,0.18); border:1px solid #38bdf8; color:#38bdf8; padding:4px 14px; border-radius:20px; font-weight:bold; font-size:0.95rem;">🎮 ${baseScore} 底 / ${taiScore} 台</span>
    </div>`;

    if (s.isDraw) {
        html += `<h2 style="color:#facc15; font-size: 1.8rem; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">流局</h2>`;
    } else {
        const winner = state.players[s.winner];
        const loser = state.players[s.loser];
        
        let titleText = `${winner.name} 胡牌！`;
        if (!s.isSelfDraw) {
            titleText += ` (${loser.name} 放槍)`;
        } else {
            titleText += ` (自摸)`;
        }
        
        html += `<h2 style="color:#facc15; font-size: 1.8rem; text-shadow: 2px 2px 4px rgba(0,0,0,0.5); margin-bottom: 20px;">${titleText}</h2>`;
        
        // 顯示胡牌者的手牌與吃碰槓 (全部平鋪，讓 flex-wrap 處理換行)
        html += `<div class="settlement-hand-display">`;
        state.melds[s.winner].forEach(meld => {
            html += `<div class="meld-group" style="display:flex; gap:2px; margin-right:10px;">`;
            meld.tiles.forEach(t => html += `<div class="tile">${getTileHTML(t)}</div>`);
            html += `</div>`;
        });
        
        html += `<div class="hand-group" style="display:flex; gap:2px;">`;
        const winnerHand = state.hands[s.winner];
        winnerHand.forEach((t, idx) => {
            if (idx === winnerHand.length - 1) {
                html += `<div class="tile drawn-tile" style="margin-left: 15px;">${getTileHTML(t)}</div>`;
            } else {
                html += `<div class="tile">${getTileHTML(t)}</div>`;
            }
        });
        html += `</div></div>`;
        
        // 顯示台數明細
        if (s.taiDetails) {
            html += `<div style="margin-top:20px; text-align:center;">`;
            
            let detailNames = "無";
            if (s.taiDetails.length > 0) {
                detailNames = s.taiDetails.map(d => {
                    const explain = TAI_EXPLANATIONS[d.name] || '無特別說明';
                    const taiStr = d.tai > 0 ? ` (${d.tai}台)` : '';
                    const baseName = d.name.split(' (')[0];
                    let explainFinal = TAI_EXPLANATIONS[baseName] || explain;
                    if (baseName.startsWith('連') && baseName.includes('拉')) explainFinal = '每連一次加2台';
                    return `<span class="tai-tooltip">${d.name}${taiStr}<span class="tai-tooltip-text">${explainFinal}</span></span>`;
                }).join('、');
            }
            if (s.dealerStreakTai && s.dealerStreakTai > 0) {
                const streakText = s.dealerCount > 0 ? `、莊家多賠 (莊家1台 + 連${s.dealerCount}拉${s.dealerCount} ${s.dealerCount*2}台)` : '、莊家多賠 (莊家1台)';
                detailNames += `<span style="color:#f87171; font-weight:bold;">${streakText}</span>`;
            }
            html += `<p style="color:#cbd5e1; margin:10px 0 15px 0; line-height:2;">台數明細：${detailNames}</p>`;

            // 詳細計算過程卡片
            if (s.isSelfDraw) {
                if (s.winner === dealerIndex) {
                    // 莊家自摸
                    const winAmount = baseScore + (s.totalTai * taiScore);
                    const winnerGain = winAmount * 3;
                    html += `<div style="background: rgba(0,0,0,0.38); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 12px 18px; margin: 15px auto; max-width: 540px; text-align: left; font-size: 0.95rem; line-height: 1.7;">
                        <div style="color: #facc15; font-weight: bold; margin-bottom: 6px; border-bottom: 1px dashed rgba(255,255,255,0.15); padding-bottom: 4px;">
                            🧮 底台計算過程（莊家自摸 ${s.totalTai} 台）：
                        </div>
                        <div style="color: #e2e8f0;">
                            • <span style="color:#93c5fd;">閒家各賠 (3位)</span>：底 ${baseScore} + (${s.totalTai}台 × ${taiScore}) = <b style="color:#ef4444;">-$${winAmount}</b> / 人
                        </div>
                        <div style="color: #4ade80; margin-top: 6px; font-weight: bold; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px;">
                            ➔ 莊家自摸總收益：${winAmount} × 3 = <span style="color:#4ade80; font-size:1.05rem;">+$${winnerGain}</span>
                        </div>
                    </div>`;
                } else {
                    // 閒家自摸
                    const baseAmount = baseScore + (s.totalTai * taiScore);
                    const dealerTai = s.totalTai + (s.dealerStreakTai || 0);
                    const dealerAmount = baseScore + (dealerTai * taiScore);
                    const winnerGain = (baseAmount * 2) + dealerAmount;
                    const dealerNote = (s.dealerCount > 0) ? `莊家1台 + 連${s.dealerCount}拉${s.dealerCount} ${s.dealerCount*2}台` : `莊家1台`;
                    html += `<div style="background: rgba(0,0,0,0.38); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 12px 18px; margin: 15px auto; max-width: 540px; text-align: left; font-size: 0.95rem; line-height: 1.7;">
                        <div style="color: #facc15; font-weight: bold; margin-bottom: 6px; border-bottom: 1px dashed rgba(255,255,255,0.15); padding-bottom: 4px;">
                            🧮 底台計算過程（閒家自摸基礎 ${s.totalTai} 台）：
                        </div>
                        <div style="color: #e2e8f0;">
                            • <span style="color:#93c5fd;">閒家賠付 (2位)</span>：底 ${baseScore} + (${s.totalTai}台 × ${taiScore}) = <b style="color:#ef4444;">-$${baseAmount}</b> / 人
                        </div>
                        <div style="color: #e2e8f0; margin-top: 3px;">
                            • <span style="color:#fcd34d;">莊家賠付 (多付${dealerNote}=${dealerTai}台)</span>：底 ${baseScore} + (${dealerTai}台 × ${taiScore}) = <b style="color:#ef4444;">-$${dealerAmount}</b>
                        </div>
                        <div style="color: #4ade80; margin-top: 6px; font-weight: bold; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px;">
                            ➔ 贏家自摸總收益：${baseAmount} × 2 + ${dealerAmount} = <span style="color:#4ade80; font-size:1.05rem;">+$${winnerGain}</span>
                        </div>
                    </div>`;
                }
            } else {
                // 放槍
                const scoreChange = baseScore + (s.totalTai * taiScore);
                const isLoserDealer = (s.loser === dealerIndex);
                const isWinnerDealer = (s.winner === dealerIndex);
                let extraFormulaNote = '';
                if (isWinnerDealer) extraFormulaNote = ' (含莊家/連莊台)';
                else if (isLoserDealer) extraFormulaNote = ' (莊家放槍多賠莊家/連莊台)';
                html += `<div style="background: rgba(0,0,0,0.38); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 12px 18px; margin: 15px auto; max-width: 540px; text-align: left; font-size: 0.95rem; line-height: 1.7;">
                    <div style="color: #facc15; font-weight: bold; margin-bottom: 6px; border-bottom: 1px dashed rgba(255,255,255,0.15); padding-bottom: 4px;">
                        🧮 底台計算過程（共 ${s.totalTai} 台${extraFormulaNote}）：
                    </div>
                    <div style="color: #e2e8f0;">
                        • <span style="color:#f87171;">放槍者 (${loser.name}) 賠付</span>：底 ${baseScore} + (${s.totalTai}台 × ${taiScore}) = <b style="color:#ef4444;">-$${scoreChange}</b>
                    </div>
                    <div style="color: #4ade80; margin-top: 6px; font-weight: bold; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px;">
                        ➔ 贏家 (${winner.name}) 收益：<span style="color:#4ade80; font-size:1.05rem;">+$${scoreChange}</span>
                    </div>
                </div>`;
            }

            html += `</div>`;
        }
    }

    html += `<table style="width:100%; text-align:left; margin-top:25px; border-collapse: collapse;">`;
    state.players.forEach((p, idx) => {
        const change = s.scoreChanges[idx];
        const color = change > 0 ? '#4ade80' : (change < 0 ? '#ef4444' : '#fff');
        const sign = change > 0 ? '+' : '';
        const isThisDealer = (idx === dealerIndex);
        const dealerTag = isThisDealer ? `<span style="background:rgba(234,179,8,0.2); color:#facc15; border:1px solid #eab308; border-radius:4px; font-size:11px; padding:1px 5px; margin-left:6px; font-weight:bold;">👑 莊</span>` : '';
        html += `<tr>
            <td style="padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.1); width:40%;">${p.name}${dealerTag}</td>
            <td style="padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.1); text-align:right; color:${color}; width:30%; font-weight:bold;">${sign}${change}</td>
            <td style="padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.1); text-align:right; color:#facc15; width:30%;">→ $${state.scores[idx]}</td>
        </tr>`;
    });
    html += `</table>`;

    if (state.isMatchOver) {
        html += `<p style="margin-top:20px; color:#ef4444; font-size: 1.2rem; font-weight: bold;">遊戲結束！</p>`;
    } else if (s.dealerChanged) {
        html += `<p style="margin-top:20px; color:#94a3b8;">下莊！下一局莊家換人。</p>`;
    } else if (!s.isDraw) {
        html += `<p style="margin-top:20px; color:#facc15;">莊家胡牌，連莊！</p>`;
    } else if (s.isDraw) {
        html += `<p style="margin-top:20px; color:#facc15;">流局，莊家連莊！</p>`;
    }

    UI.settlementContent.innerHTML = html;
    
    if (state.isMatchOver) {
        UI.btnNextRound.classList.add('hidden');
        if (!document.getElementById('btn-settlement-back')) {
            const backBtn = document.createElement('button');
            backBtn.id = 'btn-settlement-back';
            backBtn.className = 'primary';
            backBtn.innerText = '🚪 返回大廳';
            backBtn.style.background = '#ef4444';
            backBtn.addEventListener('click', () => {
                location.reload();
            });
            UI.btnNextRound.parentElement.appendChild(backBtn);
        }
    } else {
        if (network.isHost) {
            UI.btnNextRound.classList.remove('hidden');
        } else {
            UI.btnNextRound.classList.add('hidden');
            UI.settlementContent.innerHTML += `<p style="margin-top:20px; font-size:0.9rem;">等待房主開始下一局...</p>`;
        }
    }
}

// 使用 SVG 圖片產生牌面
function getTileHTML(tile) {
    if (tile.svgUrl) {
        return `<img src="${tile.svgUrl}" class="tile-img" alt="${tile.displayVal}">`;
    }
    return ''; // 如果出錯，回傳空字串
}

function renderHand(position, handData, isMe, isMyTurn) {
    const container = UI.hands[position];
    container.innerHTML = '';
    const hasDrawnTile = (handData.length % 3 === 2);
    
    handData.forEach((tile, idx) => {
        const tileDiv = document.createElement('div');
        tileDiv.className = 'tile';
        
        // 如果是剛摸到的牌（手牌數為17, 14, 11... 的最後一張），加上特殊 class 來拉開距離
        if (hasDrawnTile && idx === handData.length - 1) {
            tileDiv.classList.add('drawn-tile');
        }
        
        if (isMe) {
            tileDiv.innerHTML = getTileHTML(tile);
            if (isMyTurn) {
                tileDiv.addEventListener('click', () => {
                    network.sendAction('discard', { tileId: tile.id });
                });
            }
        } else {
            tileDiv.classList.add('hidden-tile');
        }
        container.appendChild(tileDiv);
    });
}

function renderMelds(position, meldData, isMe) {
    const container = UI.melds[position];
    container.innerHTML = '';
    
    meldData.forEach(meld => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'meld-group';
        
        meld.tiles.forEach(tile => {
            const tileDiv = document.createElement('div');
            tileDiv.className = 'tile meld-tile';
            
            // 暗槓：若不是自己 (且尚未進入結算揭牌)，對手只能看到蓋牌背面
            if (meld.type === 'ANKONG' && !isMe) {
                tileDiv.classList.add('hidden-tile');
            } else {
                tileDiv.innerHTML = getTileHTML(tile);
                if (meld.type === 'ANKONG') {
                    tileDiv.style.filter = 'brightness(0.92)';
                }
            }
            groupDiv.appendChild(tileDiv);
        });
        
        container.appendChild(groupDiv);
    });
}

function renderDiscardPool(discardPool) {
    UI.discardPool.innerHTML = '';
    discardPool.forEach(tile => {
        const tileDiv = document.createElement('div');
        tileDiv.className = 'tile discard-tile';
        tileDiv.innerHTML = getTileHTML(tile);
        UI.discardPool.appendChild(tileDiv);
    });
}

function handlePendingActions(state, myIndex) {
    const pendingActions = state.pendingActions;
    if (!pendingActions) return;
    const myAction = pendingActions.find(p => p.playerIndex === myIndex);
    
    if (myAction && !myAction.responded) {
        if (window.resetActionBarState) window.resetActionBarState();
        UI.actionBar.classList.remove('hidden');
        UI.actionButtons.innerHTML = '';
        UI.chowOptionsContainer.innerHTML = '';
        UI.chowOptionsContainer.classList.add('hidden');

        if (myAction.canHu) addActionButton('胡', 'btn-hu', 'HU');
        if (myAction.canKong) addActionButton('槓', 'btn-kong', 'KONG');
        if (myAction.canPong) addActionButton('碰', 'btn-pong', 'PONG');
        
        if (myAction.canChow) {
            const btn = addActionButton('吃', 'btn-chow', 'CHOW', false);
            btn.addEventListener('click', () => showChowOptions(myAction.canChow));
        }

        addActionButton('跳過', 'btn-skip', 'SKIP');
    } else {
        // 避免在自己回合可以自摸或暗槓時，被這個函數把 actionBar 隱藏
        let canSelfAction = false;
        if (state.gameState === 'PLAYING' || state.gameState === 'WAIT_ACTION') {
            if (state.gameState === 'PLAYING' && state.currentTurn === myIndex) {
                if ((state.selfDrawFlags && state.selfDrawFlags[myIndex]) || (state.selfKongOptions && state.selfKongOptions[myIndex] && state.selfKongOptions[myIndex].length > 0)) {
                    canSelfAction = true;
                }
            }
            if (state.waitTiles && state.waitTiles[myIndex] && state.waitTiles[myIndex].length > 0 && 
                (!state.tenpaiStatus || !state.tenpaiStatus[myIndex]) && 
                (state.isTianDiTingEligible && state.isTianDiTingEligible[myIndex])) {
                canSelfAction = true;
            }
        }
        if (!canSelfAction) {
            UI.actionBar.classList.add('hidden');
        }
    }
}

function addActionButton(label, className, actionStr, sendDirectly = true) {
    const btn = document.createElement('button');
    btn.className = `action-btn ${className}`;
    btn.innerText = label;
    
    if (sendDirectly) {
        btn.addEventListener('click', () => {
            UI.actionBar.classList.add('hidden');
            network.sendAction('respond', { actionStr: actionStr, data: null });
        });
    }
    UI.actionButtons.appendChild(btn);
    return btn;
}

function showChowOptions(options) {
    UI.actionButtons.innerHTML = ''; 
    UI.chowOptionsContainer.innerHTML = '';
    UI.chowOptionsContainer.classList.remove('hidden');
    
    options.forEach(opt => {
        const optDiv = document.createElement('div');
        optDiv.className = 'chow-option';
        
        opt.forEach(t => {
            const tileDiv = document.createElement('div');
            tileDiv.className = 'tile meld-tile';
            tileDiv.innerHTML = getTileHTML(t);
            optDiv.appendChild(tileDiv);
        });
        
        optDiv.addEventListener('click', () => {
            UI.actionBar.classList.add('hidden');
            network.sendAction('respond', { actionStr: 'CHOW', data: opt });
        });
        UI.chowOptionsContainer.appendChild(optDiv);
    });

    const cancelBtn = addActionButton('取消', 'btn-skip', 'SKIP', false);
    cancelBtn.addEventListener('click', () => {
        UI.actionBar.classList.add('hidden');
        network.sendAction('respond', { actionStr: 'SKIP', data: null });
    });
    UI.chowOptionsContainer.appendChild(cancelBtn);
}

function showSelfKongOptions(options) {
    UI.actionButtons.innerHTML = ''; 
    UI.chowOptionsContainer.innerHTML = '';
    UI.chowOptionsContainer.classList.remove('hidden');
    
    options.forEach(opt => {
        const optDiv = document.createElement('div');
        optDiv.className = 'chow-option';
        const label = opt.type === 'ANKONG' ? '暗槓' : '加槓';
        const tileName = formatTileDisplayName(opt.tile);
        optDiv.title = `${label} ${tileName}`;
        
        for (let i = 0; i < 4; i++) {
            const tileDiv = document.createElement('div');
            tileDiv.className = 'tile meld-tile';
            tileDiv.innerHTML = getTileHTML(opt.tile);
            optDiv.appendChild(tileDiv);
        }
        
        optDiv.addEventListener('click', () => {
            UI.actionBar.classList.add('hidden');
            network.sendAction('self_kong', opt);
        });
        UI.chowOptionsContainer.appendChild(optDiv);
    });

    const cancelBtn = addActionButton('取消', 'btn-skip', 'SKIP', false);
    cancelBtn.addEventListener('click', () => {
        UI.actionBar.classList.add('hidden');
    });
    UI.chowOptionsContainer.appendChild(cancelBtn);
}

// 檢查是否有斷線/錯誤訊息
const disconnectMsg = sessionStorage.getItem('disconnectMsg');
if (disconnectMsg) {
    sessionStorage.removeItem('disconnectMsg');
    if (window.showNotification) window.showNotification(disconnectMsg, true);
    if (UI.lobbyStatus) {
        UI.lobbyStatus.style.color = '#ef4444';
        UI.lobbyStatus.innerText = disconnectMsg;
    }
}
// --- Global Tooltip Boundary Fix ---
document.addEventListener('mouseover', function(e) {
    const tooltip = e.target.closest('.tai-tooltip');
    if (tooltip) {
        const text = tooltip.querySelector('.tai-tooltip-text');
        if (text) {
            // Reset to natural center position
            text.style.left = '50%';
            text.style.right = 'auto';
            text.style.transform = 'translateX(-50%)';
            
            // Wait for next frame to measure
            requestAnimationFrame(() => {
                const rect = text.getBoundingClientRect();
                if (rect.left < 10) {
                    text.style.left = '0';
                    text.style.right = 'auto';
                    text.style.transform = 'translateX(0)';
                } else if (rect.right > window.innerWidth - 10) {
                    text.style.left = 'auto';
                    text.style.right = '0';
                    text.style.transform = 'translateX(0)';
                }
            });
        }
    }
});


// --- Action Bar Draggable Controls ---
(function initDraggableActionBar() {
    const bar = document.getElementById('action-bar');
    const handle = document.getElementById('action-bar-handle');
    if (!bar) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;
    let hasCustomPos = false;

    // Pointer Drag Handler (Unified desktop mouse & mobile touch)
    function onPointerDown(e) {
        if (e.target.closest('button') || e.target.closest('.chow-option')) return;
        
        isDragging = true;
        (handle || bar).setPointerCapture(e.pointerId);
        
        const rect = bar.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = rect.left;
        initialTop = rect.top;

        // Switch from centered transform to absolute pixel position
        bar.style.transform = 'none';
        bar.style.left = `${initialLeft}px`;
        bar.style.top = `${initialTop}px`;
        bar.classList.add('is-dragging');
        hasCustomPos = true;
    }

    if (handle) {
        handle.addEventListener('pointerdown', onPointerDown);
    }
    bar.addEventListener('pointerdown', onPointerDown);

    function onPointerMove(e) {
        if (!isDragging) return;
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;
        
        // Clamp boundaries within viewport
        const rect = bar.getBoundingClientRect();
        const maxLeft = window.innerWidth - rect.width - 5;
        const maxTop = window.innerHeight - rect.height - 5;
        
        newLeft = Math.max(5, Math.min(newLeft, maxLeft));
        newTop = Math.max(5, Math.min(newTop, maxTop));
        
        bar.style.left = `${newLeft}px`;
        bar.style.top = `${newTop}px`;
    }

    function endDrag(e) {
        if (!isDragging) return;
        isDragging = false;
        try {
            (handle || bar).releasePointerCapture(e.pointerId);
        } catch (_) {}
        bar.classList.remove('is-dragging');
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    // Reset function called on new action turn
    window.resetActionBarState = function() {
        if (!hasCustomPos) {
            bar.style.left = '50%';
            bar.style.top = '50%';
            bar.style.transform = 'translate(-50%, -50%)';
        }
    };
})();

// Pre-wake Render Server on page load
fetch('https://shibajong.onrender.com').catch(e => {});

