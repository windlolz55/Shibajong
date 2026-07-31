// --- 網路連線邏輯 (network.js) ---

class MahjongNetwork {
    constructor(onStateUpdate, onPlayerListUpdate, onGameStart, botSpeed = 5000) {
        this.peer = null;
        this.connections = []; // For Host
        this.hostConnection = null; // For Client
        this.isHost = false;
        this.myPlayerIndex = -1;
        this.playerName = '';
        
        this.game = null;
        
        this.onStateUpdate = onStateUpdate;
        this.onPlayerListUpdate = onPlayerListUpdate;
        this.onGameStart = onGameStart;
        this.botSpeed = botSpeed;
        this.gameLength = 'infinite';
        
        this.globalTimer = null;
        this.lastTurnEpoch = -1;
    }

    createRoom(playerName, gameLength = 'infinite') {
        this.playerName = playerName;
        this.isHost = true;
        this.myPlayerIndex = 0;
        this.gameLength = gameLength;
        this.game = new MahjongGame(gameLength);
        this.game.players.push({ name: playerName, index: 0, id: 'host', isBot: false });

        return new Promise((resolve, reject) => {
            if (this.isLocalSinglePlayer) {
                return resolve('local');
            }

            const roomId = Math.floor(1000 + Math.random() * 9000).toString();
            const fullRoomId = 'shibajong_tw_' + roomId;
            
            const peerConfig = {
                host: 'shibajong.onrender.com',
                port: 443,
                secure: true,
                config: {
                    'iceServers': [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                        {
                            urls: 'turn:openrelay.metered.ca:80',
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        },
                        {
                            urls: 'turn:openrelay.metered.ca:443',
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        }
                    ]
                }
            };
            
            this.peer = new Peer(fullRoomId, peerConfig);

            this.peer.on('open', (id) => resolve(roomId));
            this.peer.on('connection', (conn) => {
                if (this.game.players.length >= 4) {
                    conn.send({ type: 'error', message: '房間已滿' });
                    setTimeout(() => conn.close(), 500);
                    return;
                }
                this.connections.push(conn);
                this.setupHostConnectionEvents(conn);
            });
            this.peer.on('error', (err) => reject(err));
        });
    }

    joinRoom(roomId, playerName) {
        this.playerName = playerName;
        this.isHost = false;

        return new Promise((resolve, reject) => {
            const peerConfig = {
                host: 'shibajong.onrender.com',
                port: 443,
                secure: true,
                config: {
                    'iceServers': [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                        {
                            urls: 'turn:openrelay.metered.ca:80',
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        },
                        {
                            urls: 'turn:openrelay.metered.ca:443',
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        }
                    ]
                }
            };
            
            this.peer = new Peer(peerConfig);
            this.peer.on('open', (id) => {
                const fullRoomId = 'shibajong_tw_' + roomId;
                this.hostConnection = this.peer.connect(fullRoomId);
                this.hostConnection.on('open', () => {
                    this.hostConnection.send({ type: 'join', playerName: this.playerName });
                    resolve();
                });
                this.hostConnection.on('close', () => {
                    if (!sessionStorage.getItem('disconnectMsg')) {
                        sessionStorage.setItem('disconnectMsg', '房主已離開遊戲，連線中斷。');
                    }
                    location.reload();
                });
                this.setupClientConnectionEvents(this.hostConnection);
            });
            this.peer.on('error', (err) => reject(err));
            this.peer.on('disconnected', () => {
                sessionStorage.setItem('disconnectMsg', '已與伺服器斷線。');
                location.reload();
            });
        });
    }

    addBot() {
        if (!this.isHost || this.game.players.length >= 4) return;
        const newPlayerIndex = this.game.players.length;
        const botNames = ['電腦 Alpha', '電腦 Beta', '電腦 Gamma'];
        this.game.players.push({ 
            name: botNames[newPlayerIndex - 1], 
            index: newPlayerIndex, 
            id: 'bot_' + newPlayerIndex, 
            isBot: true,
            isReady: true 
        });
        this.broadcast({ type: 'update_players', players: this.game.players, settings: { botSpeed: this.botSpeed, gameLength: this.gameLength } });
        this.onPlayerListUpdate(this.game.players, { botSpeed: this.botSpeed, gameLength: this.gameLength });
    }

    removePlayer(index) {
        if (!this.isHost || index === 0) return;
        
        if (this.game.gameState !== 'INIT') {
            // Game already started, mark as disconnected but do not remove
            this.game.players[index].isConnected = false;
            this.broadcast({ type: 'update_players', players: this.game.players, settings: { botSpeed: this.botSpeed, gameLength: this.gameLength } });
            this.onPlayerListUpdate(this.game.players, { botSpeed: this.botSpeed, gameLength: this.gameLength });
            return;
        }

        this.game.players.splice(index, 1);
        this.game.players.forEach((p, i) => p.index = i);
        this.broadcast({ type: 'update_players', players: this.game.players, settings: { botSpeed: this.botSpeed, gameLength: this.gameLength } });
        this.onPlayerListUpdate(this.game.players, { botSpeed: this.botSpeed, gameLength: this.gameLength });
    }

    setupHostConnectionEvents(conn) {
        conn.on('data', (data) => {
            if (data.type === 'join') {
                try {
                    let targetIndex = -1;
                    
                    // 檢查是否有同名玩家，允許重連
                    const reqName = String(data.playerName).trim().toLowerCase();
                    targetIndex = this.game.players.findIndex(p => 
                        p.name.trim().toLowerCase() === reqName && 
                        !p.isBot && 
                        p.index !== 0
                    );

                    if (targetIndex !== -1) {
                        // 玩家重連，更新 ID
                        this.game.players[targetIndex].id = conn.peer;
                        this.game.players[targetIndex].isConnected = true;
                        
                        conn.send({ type: 'assign_index', index: targetIndex });
                        
                        if (this.game.gameState !== 'INIT') {
                            conn.send({ type: 'game_start' });
                        }
                        
                        this.broadcast({ type: 'update_players', players: this.game.players, settings: { botSpeed: this.botSpeed, gameLength: this.gameLength } });
                        this.onPlayerListUpdate(this.game.players, { botSpeed: this.botSpeed, gameLength: this.gameLength });
                        if (window.showNotification) window.showNotification(`${data.playerName} 已重新連線`);
                        
                        if (this.game.gameState !== 'INIT') {
                            this.broadcastGameState(); // 補發最新狀態
                        }
                    } else if (this.game.gameState === 'INIT' && this.game.players.length < 4) {
                        // 新玩家加入
                        const newPlayerIndex = this.game.players.length;
                        this.game.players.push({ 
                            name: data.playerName, 
                            index: newPlayerIndex, 
                            id: conn.peer, 
                            isBot: false, 
                            isReady: false,
                            isConnected: true 
                        });
                        conn.send({ type: 'assign_index', index: newPlayerIndex });
                        this.broadcast({ type: 'update_players', players: this.game.players, settings: { botSpeed: this.botSpeed, gameLength: this.gameLength } });
                        this.onPlayerListUpdate(this.game.players, { botSpeed: this.botSpeed, gameLength: this.gameLength });
                        if (window.showNotification) window.showNotification(`${data.playerName} 加入房間`);
                    } else {
                        // 房間已滿或遊戲已開始，拒絕加入
                        const names = this.game.players.map(p => p.name).join(', ');
                        conn.send({ type: 'error', message: `找不到符合的斷線玩家名稱 [${data.playerName}]。目前房內玩家：${names}` });
                        setTimeout(() => conn.close(), 2000);
                    }
                } catch (e) {
                    console.error(e);
                    conn.send({ type: 'error', message: '房主發生內部錯誤：' + e.message });
                    setTimeout(() => conn.close(), 2000);
                }
            } 
            else if (data.type === 'action') {
                this.handlePlayerAction(data.action, data.payload, data.playerIndex);
            }
            else if (data.type === 'ready') {
                const player = this.game.players.find(p => p.id === conn.peer);
                if (player) {
                    player.isReady = !player.isReady;
                    this.broadcast({ type: 'update_players', players: this.game.players, settings: { botSpeed: this.botSpeed, gameLength: this.gameLength } });
                    this.onPlayerListUpdate(this.game.players, { botSpeed: this.botSpeed, gameLength: this.gameLength });
                }
            }
        });
        
        conn.on('close', () => {
            const playerIndex = this.game.players.findIndex(p => p.id === conn.peer);
            if (playerIndex !== -1) {
                const playerName = this.game.players[playerIndex].name;
                if (window.showNotification) window.showNotification(`${playerName} 已離開房間`, true);
                this.removePlayer(playerIndex);
            }
        });
    }

    setupClientConnectionEvents(conn) {
        conn.on('data', (data) => {
            if (data.type === 'assign_index') this.myPlayerIndex = data.index;
            else if (data.type === 'update_players') this.onPlayerListUpdate(data.players, data.settings);
            else if (data.type === 'game_start') this.onGameStart();
            else if (data.type === 'state_update') this.onStateUpdate(data.state, this.myPlayerIndex);
            else if (data.type === 'game_state') {
                this.onStateUpdate(data.state, this.myPlayerIndex);
            }
            else if (data.type === 'emote_event') {
                if (window.showEmote) window.showEmote(data.playerIndex, data.text);
            }
            else if (data.type === 'error') {
                sessionStorage.setItem('disconnectMsg', '加入失敗：' + data.message);
                conn.close(); // 主動關閉
            }
        });
    }

    broadcast(data) {
        if (!this.isHost) return;
        this.connections.forEach(conn => {
            if (conn.open) conn.send(data);
        });
    }

    kickPlayer(targetIndex) {
        if (!this.isHost || targetIndex === 0 || this.game.gameState !== 'INIT') return;
        
        const playerToKick = this.game.players[targetIndex];
        if (!playerToKick) return;

        if (!playerToKick.isBot) {
            const conn = this.connections.find(c => c.peer === playerToKick.id);
            if (conn) {
                conn.send({ type: 'error', message: '你已被房主踢出房間。' });
                setTimeout(() => conn.close(), 500);
                this.connections = this.connections.filter(c => c.peer !== playerToKick.id);
            }
        }
        
        this.game.players.splice(targetIndex, 1);
        
        for (let i = 0; i < this.game.players.length; i++) {
            const p = this.game.players[i];
            p.index = i;
            if (!p.isBot && i !== 0) {
                const c = this.connections.find(conn => conn.peer === p.id);
                if (c) c.send({ type: 'assign_index', index: i });
            }
        }
        
        this.broadcast({ type: 'update_players', players: this.game.players, settings: { botSpeed: this.botSpeed, gameLength: this.gameLength } });
        this.onPlayerListUpdate(this.game.players, { botSpeed: this.botSpeed, gameLength: this.gameLength });
    }

    startGame() {
        if (!this.isHost || this.game.players.length !== 4) return;
        
        const allReady = this.game.players.every(p => p.id === 'host' || p.isBot || p.isReady);
        if (!allReady && !this.isLocalSinglePlayer) {
            alert('所有玩家必須準備完成才能開始遊戲！');
            return;
        }

        this.game.startNewRound();
        this.broadcast({ type: 'game_start' });
        this.onGameStart();
        this.broadcastGameState();
    }

    handlePlayerAction(action, payload, playerIndex) {
        if (!this.isHost) return;

        if (action === 'discard') {
            const tileId = typeof payload === 'string' ? payload : payload.tileId;
            const tile = this.game.discardTile(playerIndex, tileId);
            if (!tile) return;
            this.broadcastGameState();
        } 
        else if (action === 'declare_tenpai') {
            this.game.declareTenpai(playerIndex);
            this.broadcastGameState();
        }
        else if (action === 'respond') {
            this.game.respondAction(playerIndex, payload.actionStr, payload.data);
            this.broadcastGameState();
        } else if (action === 'self_draw_hu') {
            this.game.handleSelfDraw(playerIndex);
            this.broadcastGameState();
        } else if (action === 'self_kong') {
            this.game.executeSelfKong(playerIndex, payload.type, payload.tile);
            this.broadcastGameState();
        } else if (action === 'next_round') {
            if (this.game.gameState === 'GAME_OVER' && !this.game.isMatchOver) {
                this.game.startNewRound();
                this.broadcastGameState();
            }
        } else if (action === 'force_end') {
            if (this.game.gameState !== 'GAME_OVER') {
                this.game.forceEndRound(payload);
                this.broadcastGameState();
            }
        } else if (action === 'apply_cheat') {
            this.game.applyCheatHand(playerIndex, payload.type);
            this.broadcastGameState();
        } else if (action === 'emote') {
            this.broadcast({ type: 'emote_event', playerIndex: playerIndex, text: payload.text });
            if (window.showEmote) window.showEmote(playerIndex, payload.text);
        }
    }

    sendAction(action, payload) {
        if (this.isHost) {
            this.handlePlayerAction(action, payload, this.myPlayerIndex);
        } else {
            this.hostConnection.send({
                type: 'action',
                action: action,
                payload: payload,
                playerIndex: this.myPlayerIndex
            });
        }
    }

    broadcastGameState() {
        if (!this.isHost) return;
        const state = this.game.getState();
        state.botSpeed = this.botSpeed;
        state.botDifficulty = this.game.botDifficulty || 'normal';
        
        let shouldResetTimer = false;
        if (state.turnEpoch !== this.lastTurnEpoch) {
            shouldResetTimer = true;
            this.lastTurnEpoch = state.turnEpoch;
        }
        
        if (state.gameState === 'PLAYING') {
            const currentPlayer = this.game.players[state.currentTurn];
            const isTenpai = state.tenpaiStatus && state.tenpaiStatus[state.currentTurn];
            if (currentPlayer.isBot || isTenpai) {
                state.timerEnabled = true;
                const offset = 1500;
                if (shouldResetTimer) {
                    // 聽牌後人類自動摸打時間可短一點(例如1000ms)，如果是電腦則照原本設定
                    const baseTime = isTenpai && !currentPlayer.isBot ? 1000 : this.botSpeed;
                    this.globalDeadline = Date.now() + baseTime + offset;
                }
                state.deadline = this.globalDeadline;
                state.visualDelay = shouldResetTimer ? offset : 0;
            } else {
                const isRecentAction = state.actionEvent && (Date.now() - state.actionEvent.timestamp < 1000);
                const delay = (shouldResetTimer && isRecentAction) ? 1500 : 0;
                
                if (this.isLocalSinglePlayer) {
                    state.timerEnabled = false; 
                    state.visualDelay = delay;
                } else {
                    state.timerEnabled = true;
                    if (shouldResetTimer) {
                        this.globalDeadline = Date.now() + this.botSpeed + delay;
                    }
                    state.deadline = this.globalDeadline;
                    state.visualDelay = delay;
                }
            }
        } else if (state.gameState === 'WAIT_ACTION') {
            const pendingPlayers = state.pendingActions.filter(p => !p.responded);
            const hasHumanPending = pendingPlayers.some(p => !this.game.players[p.playerIndex].isBot);
            
            if (hasHumanPending && this.isLocalSinglePlayer) {
                state.timerEnabled = false; 
            } else if (!hasHumanPending) {
                state.timerEnabled = true;
                if (shouldResetTimer) this.globalDeadline = Date.now() + 1500;
                state.deadline = this.globalDeadline;
            } else {
                state.timerEnabled = true;
                if (shouldResetTimer) this.globalDeadline = Date.now() + this.botSpeed + 1500;
                state.deadline = this.globalDeadline;
            }
            state.visualDelay = shouldResetTimer ? 1500 : 0;
        } else {
            state.timerEnabled = false;
        }

        if (state.timerEnabled && state.deadline) {
            state.remainingTimeMs = state.deadline - Date.now();
        }

        this.broadcast({ type: 'game_state', state: state });
        this.onStateUpdate(state, this.myPlayerIndex);
        this.checkTurnTimer(state);
    }

    checkTurnTimer(state) {
        if (!this.isHost || state.gameState === 'GAME_OVER') {
            clearTimeout(this.globalTimer);
            return;
        }

        clearTimeout(this.globalTimer);

        if (!state.timerEnabled) return; // 無時間限制 (如單機人類回合)

        const waitTime = Math.max(0, state.deadline - Date.now());

        // 如果是等待吃碰槓胡狀態
        if (state.gameState === 'WAIT_ACTION') {
            let pendingPlayers = state.pendingActions.filter(p => !p.responded);
            if (pendingPlayers.length > 0) {
                this.globalTimer = setTimeout(() => {
                    const unresolved = state.pendingActions.filter(p => !p.responded);
                    if (unresolved.length > 0) {
                        let p = unresolved[0];
                        let actionStr = 'SKIP';
                        let data = null;
                        const player = this.game.players[p.playerIndex];
                        
                        // 如果是電腦，隨機決定
                        if (player.isBot) {
                            const difficulty = this.game.botDifficulty || 'normal';
                            const response = this.game.getBotRespondAction(p, difficulty);
                            actionStr = response.actionStr;
                            data = response.data;
                        }
                        
                        this.handlePlayerAction('respond', { actionStr, data }, p.playerIndex);
                    }
                }, waitTime);
            }
        } 
        else if (state.gameState === 'PLAYING') {
            this.globalTimer = setTimeout(() => {
                const currentPlayer = this.game.players[state.currentTurn];
                const isTenpai = state.tenpaiStatus && state.tenpaiStatus[state.currentTurn];
                
                if (state.selfDrawFlags[state.currentTurn]) {
                    // 聽牌玩家就算自動摸打，如果是自摸也會自動按胡牌
                    this.handlePlayerAction('self_draw_hu', null, state.currentTurn);
                } else {
                    let actionData;
                    if (isTenpai && !currentPlayer.isBot) {
                        // 聽牌的人類玩家，強制打出最後摸進來的那張牌
                        const hand = state.hands[state.currentTurn];
                        actionData = hand[hand.length - 1].id;
                    } else {
                        // 電腦玩家或未聽牌的玩家(不可能發生)交給 AI 決定
                        const difficulty = this.game.botDifficulty || 'normal';
                        actionData = this.game.getBotDiscardAction(state.currentTurn, difficulty);
                    }
                    this.handlePlayerAction('discard', actionData, state.currentTurn);
                }
            }, waitTime);
        }
    }
}



