// --- 網路連線邏輯 (network.js) ---

class MahjongNetwork {
    constructor(onStateUpdate, onPlayerListUpdate, onGameStart, botSpeed = 5000, onChatMessage = null) {
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
        this.onChatMessage = onChatMessage;
        this.botSpeed = botSpeed;
        this.gameLength = 'infinite';
        this.stakeConfig = '100_20_3000';
        
        this.globalTimer = null;
        this.lastTurnEpoch = -1;

        this.clientWatchdog = null;
        this._lastHostPing = Date.now();
        this._isClientDisconnected = false;

        // 全域引用，便於視窗/手機頁面生命週期 (pagehide/beforeunload) 事件觸發清理
        if (typeof window !== 'undefined') {
            window.currentMahjongNetwork = this;
        }
    }

    handleClientDisconnect(msg = '與房主連線已中斷。') {
        if (this._isClientDisconnected) return;
        this._isClientDisconnected = true;
        if (this.clientWatchdog) {
            clearInterval(this.clientWatchdog);
            this.clientWatchdog = null;
        }
        if (!sessionStorage.getItem('disconnectMsg')) {
            sessionStorage.setItem('disconnectMsg', msg);
        }
        try { if (this.hostConnection) this.hostConnection.close(); } catch(e) {}
        try { if (this.peer) this.peer.destroy(); } catch(e) {}
        location.reload();
    }

    getPeerConfig() {
        return {
            host: 'shibajong.onrender.com',
            port: 443,
            secure: true,
            config: {
                'iceServers': [
                    // Google STUN 伺服器節點群
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' },
                    // Cloudflare STUN 伺服器 (全球 Anycast 高速節點，支援 IPv4 / IPv6)
                    { urls: 'stun:stun.cloudflare.com:3478' },
                    // 其他高品質 STUN 備援節點
                    { urls: 'stun:stun.nextcloud.com:443' },
                    { urls: 'stun:stun.nextcloud.com:3478' },
                    { urls: 'stun:stun.syncthing.net:3478' },
                    { urls: 'stun:stun.voip.blackberry.com:3478' },
                    // Shibajong 專屬專用 TURN 中繼轉發伺服器 (Metered)
                    { urls: 'stun:stun.relay.metered.ca:80' },
                    {
                        urls: 'turn:global.relay.metered.ca:80',
                        username: '3a7eaf93d51404bb7968b721',
                        credential: 'NyZ8F/6u3VF0pChG'
                    },
                    {
                        urls: 'turn:global.relay.metered.ca:80?transport=tcp',
                        username: '3a7eaf93d51404bb7968b721',
                        credential: 'NyZ8F/6u3VF0pChG'
                    },
                    {
                        urls: 'turn:global.relay.metered.ca:443',
                        username: '3a7eaf93d51404bb7968b721',
                        credential: 'NyZ8F/6u3VF0pChG'
                    },
                    {
                        urls: 'turns:global.relay.metered.ca:443?transport=tcp',
                        username: '3a7eaf93d51404bb7968b721',
                        credential: 'NyZ8F/6u3VF0pChG'
                    }
                ],
                'iceCandidatePoolSize': 10
            }
        };
    }

    formatPeerError(err) {
        if (!err) return '連線失敗，請稍後再試';
        const type = err.type || '';
        const msg = err.message || String(err);
        if (type === 'peer-unavailable' || msg.includes('Could not connect to peer')) {
            return '找不到該房間（房間不存在、房主尚未開房或房間代碼輸入錯誤）';
        }
        if (type === 'invalid-id' || msg.includes('Invalid ID')) {
            return '房間代碼格式不正確';
        }
        if (type === 'unavailable-id' || msg.includes('is taken')) {
            return '該房間代碼已被佔用，請重新嘗試';
        }
        if (type === 'browser-incompatible') {
            return '您的瀏覽器不支援 WebRTC 連線';
        }
        if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
            return '無法連接至連線伺服器，請檢查網路或稍後再試';
        }
        return msg;
    }

    createRoom(playerName, gameLength = 'infinite', stakeConfig = '100_20_3000') {
        this.playerName = playerName;
        this.isHost = true;
        this.myPlayerIndex = 0;
        this.gameLength = gameLength;
        this.stakeConfig = stakeConfig;
        this.game = new MahjongGame(gameLength, stakeConfig);
        this.game.players.push({ name: playerName, index: 0, id: 'host', isBot: false });

        return new Promise((resolve, reject) => {
            if (this.isLocalSinglePlayer) {
                return resolve('local');
            }

            const roomId = Math.floor(1000 + Math.random() * 9000).toString();
            const fullRoomId = 'shibajong_tw_' + roomId;
            
            const peerConfig = this.getPeerConfig();
            this.peer = new Peer(fullRoomId, peerConfig);

            this.peer.on('open', (id) => {
                this.startHostHeartbeat();
                resolve(roomId);
            });
            this.peer.on('connection', (conn) => {
                this.connections.push(conn);
                this.setupHostConnectionEvents(conn);
            });
            this.peer.on('disconnected', () => {
                console.warn('房主與信號伺服器連線中斷，正在嘗試自動重新連接信號伺服器...');
                try {
                    if (this.peer && !this.peer.destroyed) {
                        this.peer.reconnect();
                    }
                } catch (e) {}
            });
            this.peer.on('error', (err) => {
                reject(new Error(this.formatPeerError(err)));
            });
        });
    }

    joinRoom(roomId, playerName) {
        this.playerName = playerName;
        this.isHost = false;
        this.myPlayerIndex = -1;
        this.hasJoinedSuccessfully = false;

        return new Promise((resolve, reject) => {
            let isResolved = false;
            let joinTimeout = null;

            const cleanupAndReject = (err) => {
                if (isResolved) return;
                isResolved = true;
                this.hasJoinedSuccessfully = false;
                if (joinTimeout) clearTimeout(joinTimeout);
                try {
                    if (this.hostConnection) this.hostConnection.close();
                    if (this.peer) this.peer.destroy();
                } catch(e) {}
                const friendlyMsg = this.formatPeerError(err);
                reject(new Error(friendlyMsg));
            };

            const cleanupAndResolve = (acceptedIndex) => {
                if (isResolved) return;
                isResolved = true;
                this.hasJoinedSuccessfully = true;
                if (joinTimeout) clearTimeout(joinTimeout);
                resolve(acceptedIndex);
            };

            // 設置 25 秒超時保護，避免卡在 98%
            joinTimeout = setTimeout(() => {
                cleanupAndReject(new Error('連線超時（房主可能未開房或伺服器喚醒中，請再試一次）'));
            }, 25000);

            const peerConfig = this.getPeerConfig();
            this.peer = new Peer(peerConfig);

            this.peer.on('open', (id) => {
                const fullRoomId = 'shibajong_tw_' + roomId;
                this.hostConnection = this.peer.connect(fullRoomId, {
                    reliable: true
                });

                this.hostConnection.on('open', () => {
                    this.hostConnection.send({ type: 'join', playerName: this.playerName });
                });

                this.hostConnection.on('error', (err) => {
                    if (!this.hasJoinedSuccessfully) {
                        cleanupAndReject(err || new Error('與房主連線失敗'));
                    } else {
                        this.handleClientDisconnect('與房主連線已中斷。');
                    }
                });

                this.hostConnection.on('close', () => {
                    if (!this.hasJoinedSuccessfully) {
                        cleanupAndReject(new Error('找不到該房間（房主可能已離開或代碼錯誤）'));
                    } else {
                        this.handleClientDisconnect('與房主連線已中斷。');
                    }
                });

                this.setupClientConnectionEvents(this.hostConnection, (acceptedIndex) => {
                    cleanupAndResolve(acceptedIndex);
                }, (errorMsg) => {
                    cleanupAndReject(new Error(errorMsg));
                });
            });

            this.peer.on('error', (err) => {
                cleanupAndReject(err);
            });

            this.peer.on('disconnected', () => {
                // 信號伺服器（WebSocket）短暫斷開不影響與房主的 WebRTC P2P 對局，在背景自動重連信號伺服器即可
                console.warn('客戶端與信號伺服器連線中斷，正在背景嘗試自動重連...');
                try {
                    if (this.peer && !this.peer.destroyed) {
                        this.peer.reconnect();
                    }
                } catch (e) {}
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
        this.broadcast({ type: 'update_players', players: this.game.players, settings: { botSpeed: this.botSpeed, gameLength: this.gameLength, stakeConfig: this.stakeConfig } });
        this.onPlayerListUpdate(this.game.players, { botSpeed: this.botSpeed, gameLength: this.gameLength, stakeConfig: this.stakeConfig });
    }

    removePlayer(index) {
        if (!this.isHost || index === 0) return;
        
        if (this.game.gameState !== 'INIT') {
            // Game already started, mark as disconnected but do not remove
            this.game.players[index].isConnected = false;
            this.broadcast({ type: 'update_players', players: this.game.players, settings: { botSpeed: this.botSpeed, gameLength: this.gameLength, stakeConfig: this.stakeConfig } });
            this.onPlayerListUpdate(this.game.players, { botSpeed: this.botSpeed, gameLength: this.gameLength, stakeConfig: this.stakeConfig });
            return;
        }

        this.game.players.splice(index, 1);
        this.game.players.forEach((p, i) => p.index = i);
        this.broadcast({ type: 'update_players', players: this.game.players, settings: { botSpeed: this.botSpeed, gameLength: this.gameLength, stakeConfig: this.stakeConfig } });
        this.onPlayerListUpdate(this.game.players, { botSpeed: this.botSpeed, gameLength: this.gameLength, stakeConfig: this.stakeConfig });
    }

    startHostHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => {
            if (!this.isHost) return;

            // 1. 維護房主在信號伺服器（shibajong.onrender.com）上的註冊，防止中途斷線讓其他玩家找不到房間
            if (this.peer && this.peer.disconnected && !this.peer.destroyed) {
                try {
                    this.peer.reconnect();
                } catch (e) {}
            }

            // 2. 向所有客戶端發送 P2P 心跳包維護 WebRTC DataChannel
            const now = Date.now();
            if (this.connections) {
                this.connections.forEach(conn => {
                    if (conn.open) {
                        try { conn.send({ type: 'ping' }); } catch(e) {}
                        if (conn._lastPong && now - conn._lastPong > 30000) {
                            if (conn._handleDisconnect) conn._handleDisconnect();
                        }
                    }
                });
            }
        }, 2500);
    }

    setupHostConnectionEvents(conn) {
        conn._lastPong = Date.now();
        let isDisconnected = false;
        const handleDisconnect = () => {
            if (isDisconnected) return;
            isDisconnected = true;
            const playerIndex = this.game.players.findIndex(p => p.id === conn.peer);
            if (playerIndex !== -1) {
                const playerName = this.game.players[playerIndex].name;
                if (window.showNotification) window.showNotification(`${playerName} 已離開房間`, true);
                this.removePlayer(playerIndex);
            }
            this.connections = this.connections.filter(c => c.peer !== conn.peer);
        };
        conn._handleDisconnect = handleDisconnect;

        conn.on('close', handleDisconnect);
        conn.on('error', handleDisconnect);

        // 監聽 WebRTC 底層連線狀態，快速感知客戶端離線
        const monitorClientPC = () => {
            const pc = conn.peerConnection;
            if (pc && !conn._pcMonitored) {
                conn._pcMonitored = true;
                pc.addEventListener('iceconnectionstatechange', () => {
                    if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
                        handleDisconnect();
                    } else if (pc.iceConnectionState === 'disconnected') {
                        setTimeout(() => {
                            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                                handleDisconnect();
                            }
                        }, 10000);
                    }
                });
            }
        };
        if (conn.peerConnection) monitorClientPC();
        else conn.on('open', monitorClientPC);

        conn.on('data', (data) => {
            conn._lastPong = Date.now();
            if (data.type === 'pong') {
                return;
            }
            else if (data.type === 'ping') {
                if (conn.open) {
                    try { conn.send({ type: 'pong' }); } catch(e) {}
                }
                return;
            }
            else if (data.type === 'leave') {
                handleDisconnect();
                return;
            }
            else if (data.type === 'join') {
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
                        
                        this.broadcast({ type: 'update_players', players: this.game.players, settings: { botSpeed: this.botSpeed, gameLength: this.gameLength, stakeConfig: this.stakeConfig } });
                        this.onPlayerListUpdate(this.game.players, { botSpeed: this.botSpeed, gameLength: this.gameLength, stakeConfig: this.stakeConfig });
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
                        this.broadcast({ type: 'update_players', players: this.game.players, settings: { botSpeed: this.botSpeed, gameLength: this.gameLength, stakeConfig: this.stakeConfig } });
                        this.onPlayerListUpdate(this.game.players, { botSpeed: this.botSpeed, gameLength: this.gameLength, stakeConfig: this.stakeConfig });
                        if (window.showNotification) window.showNotification(`${data.playerName} 加入房間`);
                    } else {
                        // 房間已滿或遊戲已開始，拒絕加入
                        let reason = '房間人數已滿（已達 4 人上限）';
                        if (this.game.gameState !== 'INIT') {
                            reason = '遊戲已經開始，無法中途加入';
                        }
                        const names = this.game.players.map(p => p.name).join(', ');
                        conn.send({ type: 'error', message: `${reason}！目前房內玩家：${names}` });
                        setTimeout(() => conn.close(), 1000);
                    }
                } catch (e) {
                    console.error(e);
                    conn.send({ type: 'error', message: '房主發生內部錯誤：' + e.message });
                    setTimeout(() => conn.close(), 1000);
                }
            } 
            else if (data.type === 'action') {
                this.handlePlayerAction(data.action, data.payload, data.playerIndex);
            }
            else if (data.type === 'chat_message') {
                this.broadcast(data);
                if (this.onChatMessage) this.onChatMessage(data);
            }
            else if (data.type === 'ready') {
                const player = this.game.players.find(p => p.id === conn.peer);
                if (player) {
                    player.isReady = !player.isReady;
                    this.broadcast({ type: 'update_players', players: this.game.players, settings: { botSpeed: this.botSpeed, gameLength: this.gameLength, stakeConfig: this.stakeConfig } });
                    this.onPlayerListUpdate(this.game.players, { botSpeed: this.botSpeed, gameLength: this.gameLength, stakeConfig: this.stakeConfig });
                }
            }
        });
    }

    setupClientConnectionEvents(conn, onJoined, onError) {
        this._lastHostPing = Date.now();
        this._isClientDisconnected = false;

        // 啟動客戶端心跳看門狗：若房主被手機系統殺掉或無預警離線，超時後自動觸發斷線提示並返回大廳
        if (this.clientWatchdog) clearInterval(this.clientWatchdog);
        this.clientWatchdog = setInterval(() => {
            if (!this.hasJoinedSuccessfully || this.isHost || this._isClientDisconnected) return;
            const now = Date.now();
            const elapsed = now - this._lastHostPing;
            
            // 超過 5 秒沒收到任何房主訊息，主動送 ping 探測房主是否存活
            if (elapsed > 5000 && conn.open) {
                try { conn.send({ type: 'ping' }); } catch(e) {}
            }
            
            // 超過 30 秒完全無任何房主回應，確認房主已離線
            if (elapsed > 30000) {
                console.warn('房主心跳超時（超過30秒未收到回應），判定房主離線');
                this.handleClientDisconnect('與房主連線已中斷（房主已離線）。');
            }
        }, 2000);

        // 監聽 WebRTC 底層連線狀態 (RTCPeerConnection)
        const monitorPeerConnection = () => {
            const pc = conn.peerConnection;
            if (pc && !conn._pcMonitored) {
                conn._pcMonitored = true;
                pc.addEventListener('iceconnectionstatechange', () => {
                    if (!this.hasJoinedSuccessfully) return;
                    if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
                        this.handleClientDisconnect('與房主連線已中斷。');
                    } else if (pc.iceConnectionState === 'disconnected') {
                        setTimeout(() => {
                            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                                this.handleClientDisconnect('與房主連線已中斷。');
                            }
                        }, 10000);
                    }
                });
                pc.addEventListener('connectionstatechange', () => {
                    if (!this.hasJoinedSuccessfully) return;
                    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                        this.handleClientDisconnect('與房主連線已中斷。');
                    }
                });
            }
        };

        if (conn.peerConnection) monitorPeerConnection();
        else conn.on('open', monitorPeerConnection);

        if (typeof window !== 'undefined' && !this._unloadBound) {
            this._unloadBound = true;

            // 當切換回分頁或從桌面返回時，立即發送心跳恢復連線活躍度
            const handleResume = () => {
                if (this.hostConnection && this.hostConnection.open) {
                    try {
                        this.hostConnection.send({ type: 'pong' });
                    } catch (e) {}
                }
            };
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') handleResume();
            });
            window.addEventListener('pageshow', handleResume);
            window.addEventListener('focus', handleResume);
        }

        conn.on('data', (data) => {
            this._lastHostPing = Date.now();
            if (data.type === 'ping') {
                if (conn.open) {
                    try { conn.send({ type: 'pong' }); } catch(e) {}
                }
                return;
            }
            else if (data.type === 'host_left') {
                this.handleClientDisconnect(data.message || '房主已離開遊戲。');
                return;
            }
            else if (data.type === 'assign_index') {
                this.myPlayerIndex = data.index;
                if (onJoined) onJoined(data.index);
            }
            else if (data.type === 'update_players') this.onPlayerListUpdate(data.players, data.settings);
            else if (data.type === 'game_start') this.onGameStart();
            else if (data.type === 'state_update') this.onStateUpdate(data.state, this.myPlayerIndex);
            else if (data.type === 'game_state') {
                this.onStateUpdate(data.state, this.myPlayerIndex);
            }
            else if (data.type === 'chat_message') {
                if (this.onChatMessage) this.onChatMessage(data);
            }
            else if (data.type === 'emote_event') {
                if (window.showEmote) window.showEmote(data.playerIndex, data.text, true);
            }
            else if (data.type === 'error') {
                if (onError) {
                    onError(data.message);
                } else {
                    if (window.showNotification) window.showNotification(data.message, true);
                }
                this.handleClientDisconnect(data.message);
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
        
        this.broadcast({ type: 'update_players', players: this.game.players, settings: { botSpeed: this.botSpeed, gameLength: this.gameLength, stakeConfig: this.stakeConfig } });
        this.onPlayerListUpdate(this.game.players, { botSpeed: this.botSpeed, gameLength: this.gameLength, stakeConfig: this.stakeConfig });
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
        } else if (action === 'set_custom_hand') {
            this.game.setCustomHand(playerIndex, payload.tiles);
            this.broadcastGameState();
        } else if (action === 'set_next_draw') {
            const target = (payload && payload.target === 'any') ? -1 : playerIndex;
            this.game.setRiggedNextDraw(payload ? payload.tile : null, target);
            this.broadcastGameState();
        } else if (action === 'emote') {
            this.broadcast({ type: 'emote_event', playerIndex: playerIndex, text: payload.text });
            if (window.showEmote) window.showEmote(playerIndex, payload.text, true);
        }
    }

    sendAction(action, payload) {
        if (this.isLocalSinglePlayer) {
            if (action === 'emote') {
                if (window.showEmote) window.showEmote(this.myPlayerIndex >= 0 ? this.myPlayerIndex : 0, payload.text, true);
            } else {
                this.handlePlayerAction(action, payload, this.myPlayerIndex);
            }
        } else if (this.isHost) {
            this.handlePlayerAction(action, payload, this.myPlayerIndex);
        } else {
            if (this.hostConnection && this.hostConnection.open) {
                this.hostConnection.send({
                    type: 'action',
                    action: action,
                    payload: payload,
                    playerIndex: this.myPlayerIndex
                });
            }
        }
    }

    sendChatMessage(text) {
        if (!text || !text.trim()) return;
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const chatData = {
            type: 'chat_message',
            sender: this.playerName || (this.isHost ? '房主' : '玩家'),
            playerIndex: this.myPlayerIndex >= 0 ? this.myPlayerIndex : (this.isHost ? 0 : -1),
            text: text.trim(),
            time: timeStr
        };

        if (this.isLocalSinglePlayer) {
            if (this.onChatMessage) this.onChatMessage(chatData);
        } else if (this.isHost) {
            this.broadcast(chatData);
            if (this.onChatMessage) this.onChatMessage(chatData);
        } else {
            if (this.hostConnection && this.hostConnection.open) {
                this.hostConnection.send(chatData);
            }
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
            
            if (currentPlayer.isBot) {
                // 電腦玩家：不管房間設定幾秒，都固定只保留 1.5 秒預設動作緩衝
                state.timerEnabled = true;
                if (shouldResetTimer) {
                    this.globalDeadline = Date.now() + 1500;
                }
                state.deadline = this.globalDeadline;
                state.visualDelay = shouldResetTimer ? 1500 : 0;
            } else if (isTenpai) {
                // 聽牌真人自動摸打：固定保留 1.5 秒緩衝後自動摸打
                state.timerEnabled = true;
                if (shouldResetTimer) {
                    this.globalDeadline = Date.now() + 1500;
                }
                state.deadline = this.globalDeadline;
                state.visualDelay = shouldResetTimer ? 1500 : 0;
            } else {
                // 真人玩家：依照房間設定的秒數 (this.botSpeed)
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
                state.visualDelay = shouldResetTimer ? 1500 : 0;
            } else if (!hasHumanPending) {
                // 全部都是電腦等待響應（吃碰槓胡）：不管設定幾秒，只保留 1.5 秒預設動作緩衝
                state.timerEnabled = true;
                if (shouldResetTimer) this.globalDeadline = Date.now() + 1500;
                state.deadline = this.globalDeadline;
                state.visualDelay = shouldResetTimer ? 1500 : 0;
            } else {
                // 有真人等待響應 (連線)：真人依照設定的秒數 (this.botSpeed) + 1.5 秒視覺緩衝
                state.timerEnabled = true;
                if (shouldResetTimer) this.globalDeadline = Date.now() + this.botSpeed + 1500;
                state.deadline = this.globalDeadline;
                state.visualDelay = shouldResetTimer ? 1500 : 0;
            }
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
                        // 電腦玩家或未聽牌的玩家交給 AI 決定
                        const difficulty = this.game.botDifficulty || 'normal';
                        actionData = this.game.getBotDiscardAction(state.currentTurn, difficulty);
                    }
                    this.handlePlayerAction('discard', actionData, state.currentTurn);
                }
            }, waitTime);
        }
    }
}

// 視窗/手機頁面關閉或切換離開時 (beforeunload / pagehide)，主動發送斷線封包並妥善關閉 WebRTC 連線
if (typeof window !== 'undefined' && !window._globalUnloadRegistered) {
    window._globalUnloadRegistered = true;
    const handleGlobalExit = () => {
        const net = window.currentMahjongNetwork;
        if (!net) return;
        if (net.isHost && net.connections) {
            net.connections.forEach(conn => {
                if (conn.open) {
                    try { conn.send({ type: 'host_left', message: '房主已離開遊戲。' }); } catch(e) {}
                    try { conn.close(); } catch(e) {}
                }
            });
            try { if (net.peer) net.peer.destroy(); } catch(e) {}
        } else if (!net.isHost && net.hostConnection && net.hostConnection.open) {
            try { net.hostConnection.send({ type: 'leave' }); } catch(e) {}
            try { net.hostConnection.close(); } catch(e) {}
        }
    };
    window.addEventListener('pagehide', handleGlobalExit);
    window.addEventListener('beforeunload', handleGlobalExit);
}
