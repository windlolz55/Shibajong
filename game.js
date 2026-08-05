// --- 麻將核心邏輯 (game.js) ---

const TILE_TYPES = {
    CHAR: '萬', DOT: '筒', BAM: '條', 
    WIND: '風', DRAGON: '箭', FLOWER: '花'
};

const WIND_NAMES = ['東', '南', '西', '北'];
const DRAGON_NAMES = ['中', '發', '白'];
const FLOWER_NAMES = ['春', '夏', '秋', '冬', '梅', '蘭', '竹', '菊'];

class MahjongGame {
    constructor(gameLength = 'infinite', stakeConfig = '100_20_3000') {
        this.deck = [];
        this.players = []; 
        this.hands = [[], [], [], []];
        this.melds = [[], [], [], []];
        this.discardPool = [];
        this.currentTurn = 0;
        this.dealerIndex = 0;
        
        // 底台與初始資金設定
        this.stakeConfig = stakeConfig; // '100_20_3000' 或 '50_20_1500'
        let baseScore = 100, taiScore = 20, initialScore = 3000;
        if (stakeConfig === '50_20_1500' || stakeConfig === '50_20_5000') {
            baseScore = 50;
            taiScore = 20;
            initialScore = 1500;
        } else if (stakeConfig === '100_20_3000' || stakeConfig === '100_20_10000') {
            baseScore = 100;
            taiScore = 20;
            initialScore = 3000;
        }
        this.baseScore = baseScore;
        this.taiScore = taiScore;
        this.initialScore = initialScore;
        this.scores = [initialScore, initialScore, initialScore, initialScore];
        
        this.gameState = 'INIT';
        this.pendingActions = [];
        this.winner = null;
        this.settlementData = null;
        
        this.turnEpoch = 0;
        this.actionEvent = null;
        this.isKongReplacement = false;
        
        // 宣告聽牌狀態
        this.tenpaiStatus = [false, false, false, false];
        this.tenpaiType = [null, null, null, null]; // 'TIAN', 'DI', 'NORMAL'
        
        this.gameLength = gameLength; // '1_round', '1_match', 'infinite'
        this.roundWind = 0; // 0=East, 1=South, 2=West, 3=North
        this.initialDealer = 0; // Host is usually 0
        this.dealerCount = 0; // 連莊次數 (optional, nice to have for UI)
        this.isMatchOver = false;
        
        this.generateDeck();
    }

    getSvgUrl(type, value) {
        // 使用本機修改過的 tiles 資料夾 (已將字牌的藍色改為黑色，完美還原台灣傳統字體)
        const baseUrl = 'tiles/';
        if (type === TILE_TYPES.CHAR) {
            return `${baseUrl}${(7 + value).toString().padStart(2, '0')}-characters-${value}.svg`;
        }
        if (type === TILE_TYPES.DOT) {
            return `${baseUrl}${(16 + value).toString().padStart(2, '0')}-circles-${value}.svg`;
        }
        if (type === TILE_TYPES.BAM) {
            return `${baseUrl}${(25 + value).toString().padStart(2, '0')}-bamboos-${value}.svg`;
        }
        if (type === TILE_TYPES.WIND) {
            const windMap = { '東': '04-east-wind.svg', '南': '05-south-wind.svg', '西': '06-west-wind.svg', '北': '07-north-wind.svg' };
            return `${baseUrl}${windMap[value]}`;
        }
        if (type === TILE_TYPES.DRAGON) {
            const dragonMap = { '中': '03-red-dragon.svg', '發': '02-green-dragon.svg', '白': '01-white-dragon.svg' };
            return `${baseUrl}${dragonMap[value]}`;
        }
        if (type === TILE_TYPES.FLOWER) {
            const flowerMap = { '春': '35-spring.svg', '夏': '36-summer.svg', '秋': '37-autumn.svg', '冬': '38-winter.svg', '梅': '39-plum.svg', '蘭': '40-orchid.svg', '竹': '42-bamboo.svg', '菊': '41-chrysanthemum.svg' };
            return `${baseUrl}${flowerMap[value]}`;
        }
        return '';
    }

    generateDeck() {
        this.deck = [];
        for (let i = 1; i <= 9; i++) {
            for (let j = 0; j < 4; j++) {
                this.deck.push({ id: `CHAR_${i}_${j}`, type: TILE_TYPES.CHAR, value: i, svgUrl: this.getSvgUrl(TILE_TYPES.CHAR, i) });
                this.deck.push({ id: `DOT_${i}_${j}`, type: TILE_TYPES.DOT, value: i, svgUrl: this.getSvgUrl(TILE_TYPES.DOT, i) });
                this.deck.push({ id: `BAM_${i}_${j}`, type: TILE_TYPES.BAM, value: i, svgUrl: this.getSvgUrl(TILE_TYPES.BAM, i) });
            }
        }
        WIND_NAMES.forEach((wind, index) => {
            for (let j = 0; j < 4; j++) {
                this.deck.push({ id: `WIND_${index}_${j}`, type: TILE_TYPES.WIND, value: wind, svgUrl: this.getSvgUrl(TILE_TYPES.WIND, wind) });
            }
        });
        DRAGON_NAMES.forEach((dragon, index) => {
            for (let j = 0; j < 4; j++) {
                this.deck.push({ id: `DRAGON_${index}_${j}`, type: TILE_TYPES.DRAGON, value: dragon, svgUrl: this.getSvgUrl(TILE_TYPES.DRAGON, dragon) });
            }
        });
        FLOWER_NAMES.forEach((flower, index) => {
            this.deck.push({ id: `FLOWER_${index}_0`, type: TILE_TYPES.FLOWER, value: flower, svgUrl: this.getSvgUrl(TILE_TYPES.FLOWER, flower) });
        });
    }

    shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    startNewRound() {
        this.generateDeck();
        this.shuffleDeck();
        this.dealCards();
        this.turnEpoch++;
    }

    dealCards() {
        this.hands = [[], [], [], []];
        this.melds = [[], [], [], []];
        this.discardPool = [];
        this.winner = null;
        this.settlementData = null;
        this.tenpaiStatus = [false, false, false, false];
        this.tenpaiType = [null, null, null, null];
        
        for (let i = 0; i < 16; i++) {
            for (let p = 0; p < 4; p++) {
                this.hands[p].push(this.deck.pop());
            }
        }
        this.hands[this.dealerIndex].push(this.deck.pop());
        this.currentTurn = this.dealerIndex;
        
        // 處理開局補花
        for (let p = 0; p < 4; p++) {
            this.processFlowers(p);
            this.sortHand(this.hands[p]);
        }
        this.gameState = 'PLAYING';
    }

    processFlowers(playerIndex) {
        let hasFlower = true;
        while (hasFlower && this.deck.length > 16) {
            hasFlower = false;
            const hand = this.hands[playerIndex];
            const flowerIndex = hand.findIndex(t => t.type === TILE_TYPES.FLOWER);
            
            if (flowerIndex !== -1) {
                const flowerTile = hand.splice(flowerIndex, 1)[0];
                let flowerMeld = this.melds[playerIndex].find(m => m.type === 'FLOWER');
                if (!flowerMeld) {
                    flowerMeld = { type: 'FLOWER', tiles: [] };
                    this.melds[playerIndex].push(flowerMeld);
                }
                flowerMeld.tiles.push(flowerTile);
                hand.push(this.deck.pop()); // 補一張牌
                hasFlower = true;
            }
        }
    }

    sortHand(hand) {
        const typeOrder = { [TILE_TYPES.CHAR]: 1, [TILE_TYPES.DOT]: 2, [TILE_TYPES.BAM]: 3, [TILE_TYPES.WIND]: 4, [TILE_TYPES.DRAGON]: 5, [TILE_TYPES.FLOWER]: 6 };
        hand.sort((a, b) => {
            if (typeOrder[a.type] !== typeOrder[b.type]) return typeOrder[a.type] - typeOrder[b.type];
            if (typeof a.value === 'number') return a.value - b.value;
            return a.value.localeCompare(b.value, 'zh-TW');
        });
    }

    drawTile(playerIndex) {
        if (this.deck.length <= 16) {
            this.handleDrawGame(); // 流局
            return null;
        }
        this.hands[playerIndex].push(this.deck.pop());
        this.processFlowers(playerIndex); // 補花
        return this.hands[playerIndex][this.hands[playerIndex].length - 1];
    }

    checkSelfDraw(playerIndex) {
        return this.gameState === 'PLAYING' && this.currentTurn === playerIndex && this.checkCanHu(playerIndex);
    }

    checkTianDiTingEligibility() {
        const eligible = [false, false, false, false];
        const noMelds = this.melds.every(m => m.filter(meld => meld.type !== 'FLOWER').length === 0);
        if (!noMelds) return eligible;

        for (let i = 0; i < 4; i++) {
            if (i === this.dealerIndex && this.discardPool.length === 0) {
                // 莊家打第一張前：天聽
                eligible[i] = 'TIAN';
            } else if (i !== this.dealerIndex) {
                if (this.hands[i].length === 16 && this.discardPool.length === 0) {
                    // 閒家尚未摸牌前 (莊家剛發完牌)：天聽
                    eligible[i] = 'TIAN';
                } else if (this.hands[i].length === 17 && this.discardPool.length < 4) {
                    // 閒家無人吃碰且摸了第一張牌後 (準備打出第一張牌前)：地聽
                    eligible[i] = 'DI';
                }
            }
        }
        return eligible;
    }

    declareTenpai(playerIndex) {
        if (this.tenpaiStatus[playerIndex]) return;
        
        const eligible = this.checkTianDiTingEligibility();
        const type = eligible[playerIndex];
        if (!type) return; // 不符合天聽地聽資格就不允許宣告
        
        this.tenpaiStatus[playerIndex] = true;
        this.tenpaiType[playerIndex] = type;
        
        // 觸發新事件
        this.actionEvent = { playerIndex, type: '聽牌', timestamp: Date.now() };
    }

    discardTile(playerIndex, tileId) {
        if (this.gameState !== 'PLAYING' || this.currentTurn !== playerIndex) return null;

        const hand = this.hands[playerIndex];
        const tileIndex = hand.findIndex(t => t.id === tileId);
        
        if (tileIndex !== -1) {
            this.isKongReplacement = false; // 清除槓上開花狀態
            const tile = hand.splice(tileIndex, 1)[0];
            this.discardPool.push(tile);
            this.sortHand(hand);
            
            this.actionEvent = { playerIndex, type: 'discard', tile, timestamp: Date.now() };
            
            this.gameState = 'WAIT_ACTION';
            this.pendingActions = [];

            for (let i = 0; i < 4; i++) {
                if (i === playerIndex) continue;
                
                let canHu = this.checkCanHu(i, tile);
                let canKong = this.checkCanKong(i, tile);
                let canPong = this.checkCanPong(i, tile);
                let canChow = this.checkCanChow(i, tile, playerIndex);

                if (canHu || canKong || canPong || canChow) {
                    this.pendingActions.push({
                        playerIndex: i,
                        canHu, canKong, canPong, canChow,
                        responded: false,
                        selectedAction: null,
                        payload: null
                    });
                }
            }

            if (this.pendingActions.length === 0) {
                this.gameState = 'PLAYING';
                this.nextTurn();
                this.drawTile(this.currentTurn);
            } else {
                this.turnEpoch++;
            }
            return tile;
        }
        return null;
    }

    checkCanPong(playerIndex, tile) {
        if (this.tenpaiStatus[playerIndex]) return false;
        const count = this.hands[playerIndex].filter(t => t.type === tile.type && t.value === tile.value).length;
        return count >= 2;
    }

    checkCanKong(playerIndex, tile) {
        if (this.tenpaiStatus[playerIndex]) return false;
        const count = this.hands[playerIndex].filter(t => t.type === tile.type && t.value === tile.value).length;
        return count >= 3;
    }

    getSelfKongOptions(playerIndex) {
        if (this.tenpaiStatus[playerIndex]) return [];
        let options = [];
        const hand = this.hands[playerIndex];
        const melds = this.melds[playerIndex];
        
        // 1. 暗槓 (Concealed Kong): hand has 4 of the same tile
        let counts = {};
        hand.forEach(t => {
            let key = `${t.type}_${t.value}`;
            counts[key] = (counts[key] || 0) + 1;
            if (counts[key] === 4) {
                options.push({ type: 'ANKONG', tile: t });
            }
        });

        // 2. 加槓 (Promoted Kong): hand has 1 tile that matches a PONG in melds
        melds.forEach(m => {
            if (m.type === 'PONG') {
                const pongTile = m.tiles[0];
                const matchInHand = hand.find(t => t.type === pongTile.type && t.value === pongTile.value);
                if (matchInHand) {
                    options.push({ type: 'JIAKONG', tile: matchInHand });
                }
            }
        });
        return options;
    }

    checkCanChow(playerIndex, tile, fromPlayerIndex) {
        if (this.tenpaiStatus[playerIndex]) return false;
        if ((fromPlayerIndex + 1) % 4 !== playerIndex) return false;
        if ([TILE_TYPES.WIND, TILE_TYPES.DRAGON, TILE_TYPES.FLOWER].includes(tile.type)) return false;

        const hand = this.hands[playerIndex];
        const val = tile.value;
        const type = tile.type;

        let h_m2 = hand.find(t => t.type === type && t.value === val - 2);
        let h_m1 = hand.find(t => t.type === type && t.value === val - 1);
        let h_p1 = hand.find(t => t.type === type && t.value === val + 1);
        let h_p2 = hand.find(t => t.type === type && t.value === val + 2);

        let options = [];
        if (h_m2 && h_m1) options.push([h_m2, h_m1]);
        if (h_m1 && h_p1) options.push([h_m1, h_p1]);
        if (h_p1 && h_p2) options.push([h_p1, h_p2]);

        return options.length > 0 ? options : false;
    }

    checkCanHu(playerIndex, newTile = null) {
        let handCopy = [...this.hands[playerIndex]];
        if (newTile) handCopy.push(newTile);
        handCopy = handCopy.filter(t => t.type !== TILE_TYPES.FLOWER);
        this.sortHand(handCopy);
        
        let counts = {};
        handCopy.forEach(t => {
            let key = `${t.type}_${t.value}`;
            counts[key] = (counts[key] || 0) + 1;
        });

        // 計算需要的組合數 (以手牌數量為準，避免 melds 數量計算錯誤)
        let setsNeeded = Math.floor(handCopy.length / 3);
        return this.isHuPattern(counts, setsNeeded, false);
    }

    isHuPattern(counts, setsNeeded, hasPair) {
        const keys = Object.keys(counts).filter(k => counts[k] > 0).sort();
        if (keys.length === 0) return setsNeeded === 0 && hasPair;

        const k = keys[0];

        if (!hasPair && counts[k] >= 2) {
            counts[k] -= 2;
            if (this.isHuPattern(counts, setsNeeded, true)) { counts[k] += 2; return true; }
            counts[k] += 2;
        }

        if (counts[k] >= 3) {
            counts[k] -= 3;
            if (this.isHuPattern(counts, setsNeeded - 1, hasPair)) { counts[k] += 3; return true; }
            counts[k] += 3;
        }

        if (k.startsWith(TILE_TYPES.CHAR) || k.startsWith(TILE_TYPES.DOT) || k.startsWith(TILE_TYPES.BAM)) {
            const [type, valStr] = k.split('_');
            const val = parseInt(valStr);
            const k2 = `${type}_${val + 1}`;
            const k3 = `${type}_${val + 2}`;
            
            if (counts[k] > 0 && counts[k2] > 0 && counts[k3] > 0) {
                counts[k]--; counts[k2]--; counts[k3]--;
                if (this.isHuPattern(counts, setsNeeded - 1, hasPair)) {
                    counts[k]++; counts[k2]++; counts[k3]++; return true;
                }
                counts[k]++; counts[k2]++; counts[k3]++;
            }
        }
        return false;
    }

    respondAction(playerIndex, actionStr, payload = null) {
        if (this.gameState !== 'WAIT_ACTION') return;

        let pending = this.pendingActions.find(p => p.playerIndex === playerIndex);
        if (pending && !pending.responded) {
            pending.responded = true;
            pending.selectedAction = actionStr;
            pending.payload = payload;
        }

        if (this.pendingActions.every(p => p.responded)) {
            this.resolvePendingActions();
        }
    }

    resolvePendingActions() {
        let hu = this.pendingActions.find(p => p.selectedAction === 'HU');
        let pk = this.pendingActions.find(p => ['PONG', 'KONG'].includes(p.selectedAction));
        let chow = this.pendingActions.find(p => p.selectedAction === 'CHOW');

        let tile = this.discardPool.pop(); 

        if (hu) {
            this.hands[hu.playerIndex].push(tile);
            this.handleWinGame(hu.playerIndex, this.currentTurn); // 放槍者是 currentTurn
        } else if (pk) {
            this.gameState = 'PLAYING';
            this.currentTurn = pk.playerIndex;
            if (pk.selectedAction === 'PONG') this.executePong(pk.playerIndex, tile);
            else this.executeKong(pk.playerIndex, tile);
            this.turnEpoch++;
        } else if (chow) {
            this.gameState = 'PLAYING';
            this.currentTurn = chow.playerIndex;
            this.executeChow(chow.playerIndex, tile, chow.payload);
            this.turnEpoch++;
        } else {
            this.discardPool.push(tile); 
            this.gameState = 'PLAYING';
            this.nextTurn();
            this.drawTile(this.currentTurn);
        }
    }

    executePong(playerIndex, tile) {
        let hand = this.hands[playerIndex];
        let matches = hand.filter(t => t.type === tile.type && t.value === tile.value);
        this.hands[playerIndex] = hand.filter(t => !(t.id === matches[0].id || t.id === matches[1].id));
        this.melds[playerIndex].push({ type: 'PONG', tiles: [matches[0], matches[1], tile] });
        this.actionEvent = { playerIndex, type: '碰', tile, timestamp: Date.now() };
    }

    executeKong(playerIndex, tile) {
        let hand = this.hands[playerIndex];
        let matches = hand.filter(t => t.type === tile.type && t.value === tile.value);
        this.hands[playerIndex] = hand.filter(t => !(t.id === matches[0].id || t.id === matches[1].id || t.id === matches[2].id));
        this.melds[playerIndex].push({ type: 'KONG', tiles: [matches[0], matches[1], matches[2], tile] });
        this.actionEvent = { playerIndex, type: '槓', tile, timestamp: Date.now() };
        this.isKongReplacement = true; // 進入槓上開花狀態
        this.drawTile(playerIndex); 
    }

    executeSelfKong(playerIndex, kongType, tile) {
        let hand = this.hands[playerIndex];
        let matches = hand.filter(t => t.type === tile.type && t.value === tile.value);
        
        if (kongType === 'ANKONG') {
            this.hands[playerIndex] = hand.filter(t => t.type !== tile.type || t.value !== tile.value);
            this.melds[playerIndex].push({ type: 'ANKONG', tiles: matches });
            this.actionEvent = { playerIndex, type: '暗槓', tile, timestamp: Date.now() };
        } else if (kongType === 'JIAKONG') {
            let pongMeld = this.melds[playerIndex].find(m => m.type === 'PONG' && m.tiles[0].type === tile.type && m.tiles[0].value === tile.value);
            if (pongMeld) {
                pongMeld.type = 'KONG';
                pongMeld.tiles.push(tile);
                this.hands[playerIndex] = hand.filter(t => t.id !== tile.id);
                this.actionEvent = { playerIndex, type: '加槓', tile, timestamp: Date.now() };
            }
        }
        this.isKongReplacement = true; // 進入槓上開花狀態
        this.drawTile(playerIndex);
    }
    executeChow(playerIndex, tile, payloadTiles) {
        let hand = this.hands[playerIndex];
        this.hands[playerIndex] = hand.filter(t => !(t.id === payloadTiles[0].id || t.id === payloadTiles[1].id));
        // 台灣麻將規則：吃牌時，吃進來的牌置於副露組正中間，自己手牌的兩張置於左右兩側
        let handTiles = [payloadTiles[0], payloadTiles[1]];
        handTiles.sort((a, b) => a.value - b.value);
        let newMeld = [handTiles[0], tile, handTiles[1]];
        this.melds[playerIndex].push({ type: 'CHOW', tiles: newMeld });
        this.actionEvent = { playerIndex, type: '吃', tile, timestamp: Date.now() };
    }

    nextTurn() {
        this.currentTurn = (this.currentTurn + 1) % 4;
        this.turnEpoch++;
    }

    handleWinGame(winnerIndex, loserIndex) {
        this.gameState = 'GAME_OVER';
        this.winner = winnerIndex;
        
        const isSelfDraw = (winnerIndex === loserIndex); // 自摸
        // 無論是自摸還是別人放槍，這張胡的牌都會被加到 winner 的 hands 最後面
        const winningTile = this.hands[winnerIndex][this.hands[winnerIndex].length - 1];
        const isWinnerDealer = (winnerIndex === this.dealerIndex);
        
        // 莊家與連莊額外台數 (莊家 1 台 + 連 N 拉 N 2N 台)
        const dealerStreakTai = 1 + (this.dealerCount * 2);
        
        const taiData = this.calculateTai(winnerIndex, winningTile, isSelfDraw, loserIndex);
        
        this.settlementData = {
            winner: winnerIndex,
            loser: loserIndex,
            isSelfDraw: isSelfDraw,
            scoreChanges: [0, 0, 0, 0],
            taiDetails: taiData.details,
            totalTai: taiData.totalTai,
            baseScore: this.baseScore,
            taiScore: this.taiScore,
            dealer: this.dealerIndex,
            dealerStreakTai: (isSelfDraw && !isWinnerDealer) ? dealerStreakTai : 0,
            dealerCount: this.dealerCount,
            timestamp: Date.now()
        };

        if (isSelfDraw) {
            if (isWinnerDealer) {
                // 1. 莊家自摸：三家閒家均需多賠莊家台與連莊台 (calculateTai 內已包含)
                const winAmount = this.baseScore + (taiData.totalTai * this.taiScore);
                for (let i = 0; i < 4; i++) {
                    if (i !== winnerIndex) {
                        this.scores[i] -= winAmount;
                        this.scores[winnerIndex] += winAmount;
                        this.settlementData.scoreChanges[i] = -winAmount;
                        this.settlementData.scoreChanges[winnerIndex] += winAmount;
                    }
                }
            } else {
                // 2. 閒家自摸：另外兩家閒家只賠基礎台數，只有莊家需多賠 (莊家1台 + 連N拉N 2N台)
                const baseAmount = this.baseScore + (taiData.totalTai * this.taiScore);
                const dealerTai = taiData.totalTai + dealerStreakTai;
                const dealerAmount = this.baseScore + (dealerTai * this.taiScore);
                
                for (let i = 0; i < 4; i++) {
                    if (i === winnerIndex) continue;
                    
                    const amount = (i === this.dealerIndex) ? dealerAmount : baseAmount;
                    this.scores[i] -= amount;
                    this.scores[winnerIndex] += amount;
                    this.settlementData.scoreChanges[i] = -amount;
                    this.settlementData.scoreChanges[winnerIndex] += amount;
                }
            }
        } else {
            // 放槍 (抓沖)
            // 若莊家放槍 或 莊家胡人，calculateTai 內已包含 (莊家1台 + 連N拉N)
            // 若閒家放槍給閒家，calculateTai 內不含任何莊家台
            const scoreChange = this.baseScore + (taiData.totalTai * this.taiScore);
            this.scores[loserIndex] -= scoreChange;
            this.scores[winnerIndex] += scoreChange;
            this.settlementData.scoreChanges[loserIndex] = -scoreChange;
            this.settlementData.scoreChanges[winnerIndex] = scoreChange;
        }

        // 莊家連莊邏輯
        if (winnerIndex === this.dealerIndex) {
            this.dealerCount++; // 連莊
            this.settlementData.dealerChanged = false;
        } else {
            this.dealerIndex = (this.dealerIndex + 1) % 4; // 下莊
            this.dealerCount = 0;
            this.settlementData.dealerChanged = true;
            if (this.dealerIndex === this.initialDealer) {
                this.roundWind++;
            }
        }
        
        this.cheatTianTing = false;
        this.checkMatchOver();
    }
    
    checkMatchOver() {
        if (this.gameLength === 'infinite') return;
        
        let bankrupt = this.scores.some(s => s <= 0);
        if (bankrupt) {
            this.isMatchOver = true;
            return;
        }
        
        if (this.gameLength === '1_round') {
            if (this.roundWind >= 1) this.isMatchOver = true;
        } else if (this.gameLength === '1_match') {
            if (this.roundWind >= 4) this.isMatchOver = true;
        }
    }

    handleDrawGame() {
        this.gameState = 'GAME_OVER';
        this.winner = -1; // 流局
        this.settlementData = {
            winner: -1,
            isDraw: true,
            scoreChanges: [0, 0, 0, 0],
            dealerChanged: false, // 流局連莊
            dealer: this.dealerIndex,
            dealerCount: this.dealerCount,
            baseScore: this.baseScore,
            taiScore: this.taiScore,
            timestamp: Date.now()
        };
        this.dealerCount++;
        this.cheatTianTing = false;
        this.checkMatchOver();
    }

    getAllTileTypes() {
        let types = [];
        for (let i = 1; i <= 9; i++) {
            types.push({ id: `CHAR_${i}_TEST`, type: TILE_TYPES.CHAR, value: i, svgUrl: this.getSvgUrl(TILE_TYPES.CHAR, i) });
            types.push({ id: `DOT_${i}_TEST`, type: TILE_TYPES.DOT, value: i, svgUrl: this.getSvgUrl(TILE_TYPES.DOT, i) });
            types.push({ id: `BAM_${i}_TEST`, type: TILE_TYPES.BAM, value: i, svgUrl: this.getSvgUrl(TILE_TYPES.BAM, i) });
        }
        WIND_NAMES.forEach((wind, index) => {
            types.push({ id: `WIND_${index}_TEST`, type: TILE_TYPES.WIND, value: wind, svgUrl: this.getSvgUrl(TILE_TYPES.WIND, wind) });
        });
        DRAGON_NAMES.forEach((dragon, index) => {
            types.push({ id: `DRAGON_${index}_TEST`, type: TILE_TYPES.DRAGON, value: dragon, svgUrl: this.getSvgUrl(TILE_TYPES.DRAGON, dragon) });
        });
        return types;
    }

    getWaitTiles(playerIndex) {
        let waitTiles = [];
        const allTypes = this.getAllTileTypes();
        for (let tile of allTypes) {
            if (this.checkCanHu(playerIndex, tile)) {
                waitTiles.push(tile);
            }
        }
        return waitTiles;
    }

    calculateTai(playerIndex, winningTile, isSelfDraw, loserIndex = -1) {
        let details = [];
        let totalTai = 0;
        const hand = this.hands[playerIndex];
        const melds = this.melds[playerIndex].filter(m => m.type !== 'FLOWER');
        const isDealer = playerIndex === this.dealerIndex;

        // 0. 天聽 / 地聽
        const tType = this.tenpaiType[playerIndex];
        if (tType === 'TIAN') {
            details.push({ name: '天聽', tai: 8 });
            totalTai += 8;
        } else if (tType === 'DI') {
            details.push({ name: '地聽', tai: 4 });
            totalTai += 4;
        }

        // 1. 莊家與連莊台數
        // 只有在以下情況直接計入基礎台數：
        // 1) 贏家是莊家 (莊家自摸或莊家抓沖)
        // 2) 輸家放炮者是莊家 (閒家抓沖莊家)
        // (若為閒家自摸，基礎台數不計莊家台，莊家多賠的部分由結算扣款與明細獨立處理)
        if (isDealer || (!isSelfDraw && loserIndex === this.dealerIndex)) {
            details.push({ name: '莊家', tai: 1 });
            totalTai += 1;
            
            if (this.dealerCount > 0) {
                const streakTai = this.dealerCount * 2;
                details.push({ name: `連${this.dealerCount}拉${this.dealerCount}`, tai: streakTai });
                totalTai += streakTai;
            }
        }

        // 2. 自摸 / 門清 / 門清一摸三
        const isMenQing = melds.length === 0;
        if (isMenQing && isSelfDraw) {
            details.push({ name: '門清一摸三', tai: 3 });
            totalTai += 3;
        } else {
            if (isMenQing) {
                details.push({ name: '門清', tai: 1 });
                totalTai += 1;
            }
            if (isSelfDraw) {
                details.push({ name: '自摸', tai: 1 });
                totalTai += 1;
            }
        }
        
        // 3. 獨聽
        // 此時手牌(hand)已經包含最後那張胡牌(總長17張或以上)，我們必須先把最後一張移除，才能正確計算他原本在聽什麼牌
        const originalHand = [...hand];
        originalHand.pop();
        this.hands[playerIndex] = originalHand;
        let waitTiles = this.getWaitTiles(playerIndex);
        this.hands[playerIndex] = hand; // 算完再加回來
        
        if (waitTiles.length === 1) {
            details.push({ name: '單聽', tai: 1 });
            totalTai += 1;
        }
        
        // 全求人 / 半求人
        if (melds.length === 5) {
            if (isSelfDraw) {
                details.push({ name: '半求人', tai: 1 });
                totalTai += 1;
            } else {
                details.push({ name: '全求人', tai: 2 });
                totalTai += 2;
            }
        }
        
        // 槓上開花
        if (isSelfDraw && this.isKongReplacement) {
            details.push({ name: '槓上開花', tai: 1 });
            totalTai += 1;
        }
        
        // 海底撈月 / 河底撈魚
        if (this.deck.length <= 16) {
            if (isSelfDraw) {
                details.push({ name: '海底撈月', tai: 1 });
                totalTai += 1;
            } else {
                details.push({ name: '河底撈魚', tai: 1 });
                totalTai += 1;
            }
        }

        // 分析牌型
        let allTiles = [...hand];
        if (winningTile && !hand.some(t => t.id === winningTile.id)) {
            allTiles.push(winningTile);
        }
        melds.forEach(m => allTiles.push(...m.tiles));
        allTiles = allTiles.filter(t => t.type !== TILE_TYPES.FLOWER);
        
        let counts = {};
        allTiles.forEach(t => {
            const key = `${t.type}_${t.value}`;
            counts[key] = (counts[key] || 0) + 1;
        });

        // 隱藏的刻子數量 (三暗刻/四暗刻/五暗刻)
        let concealedPongs = 0;
        let concealedHandCounts = {};
        hand.forEach(t => {
            const key = `${t.type}_${t.value}`;
            concealedHandCounts[key] = (concealedHandCounts[key] || 0) + 1;
        });
        
        // 如果是放槍，最後那張放槍的牌不能算暗刻（除非原本手牌裡就有三張）
        if (!isSelfDraw && winningTile) {
            const winKey = `${winningTile.type}_${winningTile.value}`;
            // 只有原本手牌裡就大於等於3張才是暗刻，贏的這張不算
            // 這裡 concealedHandCounts 只算原本 hand 的內容，放槍時 winningTile 還沒放進 hand，所以是對的！
        } else if (isSelfDraw) {
            // 自摸時，最後摸進的牌已經在 hand 裡面了，可以直接統計
        }
        
        Object.keys(concealedHandCounts).forEach(key => {
            if (concealedHandCounts[key] >= 3) concealedPongs++;
        });
        
        if (concealedPongs === 5) { details.push({ name: '五暗刻', tai: 8 }); totalTai += 8; }
        else if (concealedPongs === 4) { details.push({ name: '四暗刻', tai: 5 }); totalTai += 5; }
        else if (concealedPongs === 3) { details.push({ name: '三暗刻', tai: 2 }); totalTai += 2; }
        
        // 5. 四喜牌
        let windPongs = 0;
        let windPairs = 0;
        let hasSeatWind = false;
        let hasRoundWind = false;
        
        const seatWindNames = ['東', '南', '西', '北']; 
        const mySeatWind = seatWindNames[playerIndex];
        const myRoundWind = seatWindNames[this.roundWind % 4];
        
        WIND_NAMES.forEach(w => {
            const c = counts[`${TILE_TYPES.WIND}_${w}`] || 0;
            if (c >= 3) {
                windPongs++;
                if (w === mySeatWind) hasSeatWind = true;
                if (w === myRoundWind) hasRoundWind = true;
            }
            else if (c === 2) windPairs++;
        });
        
        if (windPongs === 4) {
            details.push({ name: '大四喜', tai: 16 });
            totalTai += 16;
        } else if (windPongs === 3 && windPairs === 1) {
            details.push({ name: '小四喜', tai: 8 });
            totalTai += 8;
        }
        
        // 門風刻與圈風刻 (如果不是大四喜，通常小四喜也會疊加門風/圈風刻，這裡獨立判斷給台)
        if (windPongs < 4) {
            if (hasSeatWind) { details.push({ name: '門風刻', tai: 1 }); totalTai += 1; }
            if (hasRoundWind) { details.push({ name: '圈風刻', tai: 1 }); totalTai += 1; }
        }
        
        // 三元牌
        let dragonPongs = 0;
        let dragonPairs = 0;
        
        DRAGON_NAMES.forEach(d => {
            const c = counts[`${TILE_TYPES.DRAGON}_${d}`] || 0;
            if (c >= 3) dragonPongs++;
            else if (c === 2) dragonPairs++;
        });
        
        if (dragonPongs === 3) {
            details.push({ name: '大三元', tai: 8 });
            totalTai += 8;
        } else if (dragonPongs === 2 && dragonPairs === 1) {
            details.push({ name: '小三元', tai: 4 });
            totalTai += 4;
        } else if (dragonPongs > 0) {
            details.push({ name: '三元刻', tai: dragonPongs });
            totalTai += dragonPongs;
        }
        
        // 6. 一色台
        const hasChar = allTiles.some(t => t.type === TILE_TYPES.CHAR);
        const hasDot = allTiles.some(t => t.type === TILE_TYPES.DOT);
        const hasBam = allTiles.some(t => t.type === TILE_TYPES.BAM);
        const hasHonor = allTiles.some(t => t.type === TILE_TYPES.WIND || t.type === TILE_TYPES.DRAGON);

        if (!hasChar && !hasDot && !hasBam) {
            details.push({ name: '字一色', tai: 16 });
            totalTai += 16;
        } else if ((hasChar ? 1 : 0) + (hasDot ? 1 : 0) + (hasBam ? 1 : 0) === 1) {
            if (hasHonor) {
                details.push({ name: '混一色', tai: 4 });
                totalTai += 4;
            } else {
                details.push({ name: '清一色', tai: 8 });
                totalTai += 8;
            }
        }
        
        // 7. 平胡與碰碰胡
        const countValues = Object.values(counts);
        const hasChow = melds.some(m => m.type === 'CHOW');
        const isPengPengHu = !hasChow && countValues.every(c => c >= 3 || c === 2) && countValues.filter(c => c === 2).length === 1;
        
        if (isPengPengHu) {
            details.push({ name: '碰碰胡', tai: 4 });
            totalTai += 4;
        }
        
        const hasPong = melds.some(m => m.type === 'PONG' || m.type === 'KONG');
        if (!hasPong && !hasHonor && countValues.every(c => c < 3) && waitTiles.length > 1) {
            details.push({ name: '平胡', tai: 2 });
            totalTai += 2;
        }

        // 10. 正花
        const flowerMeld = this.melds[playerIndex].find(m => m.type === 'FLOWER');
        if (flowerMeld) {
            const seatIndex = playerIndex; 
            const FLOWER_NAMES = ['春', '夏', '秋', '冬', '梅', '蘭', '竹', '菊'];
            const matchingFlowers = [FLOWER_NAMES[seatIndex], FLOWER_NAMES[seatIndex + 4]];
            flowerMeld.tiles.forEach(t => {
                if (matchingFlowers.includes(t.value)) {
                    details.push({ name: `正花 (${t.value})`, tai: 1 });
                    totalTai += 1;
                }
            });
        }

        return { totalTai, details };
    }

    handleSelfDraw(playerIndex) {
        if (this.checkSelfDraw(playerIndex)) {
            this.handleWinGame(playerIndex, playerIndex);
        }
    }

    forceEndRound(actionType) {
        this.gameState = 'GAME_OVER';
        this.pendingActions = [];
        const originalTurn = this.currentTurn;
        this.currentTurn = -1;
        if (actionType === 'draw') {
            this.handleDrawGame();
        } else {
            const winner = typeof actionType === 'number' ? actionType : (this.dealerIndex + 1) % 4;
            
            // 取得該玩家聽的牌，確保結算台數時是用正確的牌胡牌
            const waitTiles = this.getWaitTiles(winner);
            const wTile = waitTiles.length > 0 ? waitTiles[0] : { type: '萬', value: 1 };
            const winningTileObj = { id: `CHEAT_WIN_${Date.now()}`, type: wTile.type, value: wTile.value, svgUrl: this.getSvgUrl(wTile.type, wTile.value) };
            
            // 如果原本輪到贏家，那就是自摸；否則就是胡別人的
            const isSelfDraw = originalTurn === winner;
            const loser = isSelfDraw ? winner : (originalTurn === -1 ? (winner + 1) % 4 : originalTurn);
            
            // 把這張牌塞進手牌或廢牌堆，讓 handleWinGame 能抓到
            if (isSelfDraw) {
                this.hands[winner].push(winningTileObj);
            } else {
                this.discardPool.push(winningTileObj);
            }
            
            this.handleWinGame(winner, loser);
        }
    }

    getState() {
        let selfDrawFlags = [false, false, false, false];
        let selfKongOptions = [[], [], [], []];
        let waitTilesList = [[], [], [], []];
        if (this.gameState === 'PLAYING') {
            selfDrawFlags[this.currentTurn] = this.checkCanHu(this.currentTurn);
            selfKongOptions[this.currentTurn] = this.getSelfKongOptions(this.currentTurn);
        }
        
        if (this.gameState === 'PLAYING' || this.gameState === 'WAIT_ACTION') {
            for (let i = 0; i < 4; i++) {
                if (this.currentTurn === i && this.hands[i].length % 3 === 2) {
                    // 如果是該玩家的回合 (手牌有 17 張或 14 張等)，暫時移出最後摸的牌來算聽牌
                    const tempTile = this.hands[i].pop();
                    waitTilesList[i] = this.getWaitTiles(i);
                    this.hands[i].push(tempTile);
                } else {
                    waitTilesList[i] = this.getWaitTiles(i);
                }
            }
        }

        return {
            gameState: this.gameState,
            deckCount: Math.max(0, this.deck.length - 16),
            hands: this.hands,
            melds: this.melds,
            discardPool: this.discardPool,
            currentTurn: this.currentTurn,
            dealerIndex: this.dealerIndex,
            players: this.players,
            scores: this.scores,
            winner: this.winner,
            pendingActions: this.pendingActions,
            settlementData: this.settlementData,
            actionEvent: this.actionEvent,
            turnEpoch: this.turnEpoch,
            selfDrawFlags: selfDrawFlags,
            selfKongOptions: selfKongOptions,
            waitTiles: waitTilesList,
            tenpaiStatus: this.tenpaiStatus,
            isTianDiTingEligible: this.checkTianDiTingEligibility(),
            gameLength: this.gameLength,
            stakeConfig: this.stakeConfig,
            baseScore: this.baseScore,
            taiScore: this.taiScore,
            initialScore: this.initialScore,
            roundWind: this.roundWind,
            isMatchOver: this.isMatchOver,
            dealerCount: this.dealerCount
        };
    }

    // --- AI Logic ---
    // --- Advanced AI Logic Helpers ---
    evaluateTileWeight(hand, tile) {
        let count = hand.filter(t => t.type === tile.type && t.value === tile.value).length;
        if (count >= 2) return 100 + count;

        let weight = 0;
        if (tile.type === TILE_TYPES.WIND || tile.type === TILE_TYPES.DRAGON || tile.type === TILE_TYPES.FLOWER) {
            return 10;
        }
        
        let hasPrev2 = hand.some(t => t.type === tile.type && t.value === tile.value - 2);
        let hasPrev1 = hand.some(t => t.type === tile.type && t.value === tile.value - 1);
        let hasNext1 = hand.some(t => t.type === tile.type && t.value === tile.value + 1);
        let hasNext2 = hand.some(t => t.type === tile.type && t.value === tile.value + 2);

        if (hasPrev1 && hasNext1) weight += 50; 
        if (hasPrev2 && hasPrev1) weight += 50; 
        if (hasNext1 && hasNext2) weight += 50; 
        
        if (hasPrev1 || hasNext1) weight += 30; 
        if (hasPrev2 || hasNext2) weight += 20; 
        
        if (tile.value >= 3 && tile.value <= 7) weight += 15;
        else weight += 11;
        
        return weight;
    }

    calculateTileDanger(tile, playerIndex) {
        let danger = 0;
        let isHonor = (tile.type === TILE_TYPES.WIND || tile.type === TILE_TYPES.DRAGON);
        
        for (let i = 0; i < 4; i++) {
            if (i === playerIndex) continue;
            let exposedMelds = this.melds[i].length;
            let isDangerous = exposedMelds >= 3 || this.deck.length < 60;
            
            if (!isDangerous) continue;

            let playerDiscards = this.discardPool.filter(t => t.discardedBy === i);
            let isGenbutsu = playerDiscards.some(t => t.type === tile.type && t.value === tile.value);
            
            if (isGenbutsu) continue;

            let playerDanger = 100;

            if (isHonor) {
                let seen = this.discardPool.filter(t => t.type === tile.type && t.value === tile.value).length;
                let inHand = this.hands[playerIndex].filter(t => t.type === tile.type && t.value === tile.value).length;
                if (seen + inHand >= 3) playerDanger = 5;
                else if (seen + inHand === 2) playerDanger = 30;
                else if (seen + inHand === 1) playerDanger = 60;
                else playerDanger = 120;
            } else {
                let suiji1 = tile.value - 3;
                let suiji2 = tile.value + 3;
                let hasS1 = suiji1 >= 1 && playerDiscards.some(t => t.type === tile.type && t.value === suiji1);
                let hasS2 = suiji2 <= 9 && playerDiscards.some(t => t.type === tile.type && t.value === suiji2);
                
                if (hasS1 || hasS2) playerDanger = 40;
                else if (tile.value >= 4 && tile.value <= 6) playerDanger = 90;
                else playerDanger = 70;
            }
            danger = Math.max(danger, playerDanger);
        }
        return danger;
    }

    getBotRespondAction(pendingAction, difficulty = 'normal') {
        let actionStr = 'SKIP';
        let data = null;

        if (pendingAction.canHu) return { actionStr: 'HU', data: null }; // Always HU if possible

        if (difficulty === 'easy') {
            if (pendingAction.canPong) actionStr = 'PONG';
            else if (pendingAction.canChow) { actionStr = 'CHOW'; data = pendingAction.canChow[0]; }
        } else if (difficulty === 'normal') {
            let tile = this.discardPool[this.discardPool.length - 1];
            let danger = this.calculateTileDanger(tile, pendingAction.playerIndex);
            if (danger > 80 && Math.random() < 0.5) return { actionStr: 'SKIP', data: null }; // Basic defense hesitation

            if (pendingAction.canPong) actionStr = 'PONG';
            else if (pendingAction.canChow) { actionStr = 'CHOW'; data = pendingAction.canChow[0]; }
        } else if (difficulty === 'hard') {
            let tile = this.discardPool[this.discardPool.length - 1];
            let danger = this.calculateTileDanger(tile, pendingAction.playerIndex);
            
            // Hard AI evaluates if the meld actually helps. For now, it will meld if danger isn't extreme
            if (danger > 50) return { actionStr: 'SKIP', data: null }; // Avoid exposing hand if someone is dangerous

            if (pendingAction.canPong) actionStr = 'PONG';
            else if (pendingAction.canChow) {
                // Pick chow that leaves best weight
                actionStr = 'CHOW';
                data = pendingAction.canChow[0];
            }
        }
        return { actionStr, data };
    }

    getBotDiscardAction(playerIndex, difficulty = 'normal') {
        const hand = this.hands[playerIndex];
        let tileToDiscard = hand[Math.floor(Math.random() * hand.length)];

        if (difficulty === 'easy') {
            let isolated = hand.filter(t => this.evaluateTileWeight(hand, t) <= 15);
            if (isolated.length > 0) tileToDiscard = isolated[Math.floor(Math.random() * isolated.length)];
        } else if (difficulty === 'normal') {
            let bestDiscard = hand[0];
            let lowestWeight = 9999;
            hand.forEach(t => {
                let weight = this.evaluateTileWeight(hand, t);
                let danger = this.calculateTileDanger(t, playerIndex);
                let score = weight + (danger > 60 ? danger : 0); // Only avoid highly dangerous tiles occasionally
                if (score < lowestWeight) {
                    lowestWeight = score;
                    bestDiscard = t;
                }
            });
            tileToDiscard = bestDiscard;
        } else if (difficulty === 'hard') {
            let bestDiscard = hand[0];
            let lowestScore = 99999;
            
            // Determine if we need to defend (someone is dangerous)
            let isDefending = false;
            for (let i = 0; i < 4; i++) {
                if (i !== playerIndex && (this.melds[i].length >= 3 || this.deck.length < 50)) isDefending = true;
            }

            hand.forEach(t => {
                let weight = this.evaluateTileWeight(hand, t);
                let danger = this.calculateTileDanger(t, playerIndex);
                let score = 0;
                
                if (isDefending) {
                    // In defense mode, danger heavily outweighs hand efficiency
                    score = (danger * 100) + weight;
                } else {
                    // In offense mode, optimize for hand weight, slight penalty for danger
                    score = weight + (danger * 0.5);
                }

                if (score < lowestScore) {
                    lowestScore = score;
                    bestDiscard = t;
                }
            });
            tileToDiscard = bestDiscard;
        }

        return { tileId: tileToDiscard.id };
    }

    applyCheatHand(playerIndex, cheatType) {
        this.melds[playerIndex] = [];
        this.hands[playerIndex] = [];
        
        const createTile = (type, value) => {
            return { id: `CHEAT_${Math.random().toString(36).substring(7)}`, type, value, svgUrl: this.getSvgUrl(type, value) };
        };
        
        let newHand = [];
        let newMelds = [];
        
        // 為了讓系統能正確抓到「聽牌」(waitTiles)，所有非全求人的牌型都應該只塞 16 張牌（少一張才叫聽牌）。
        // 強制胡牌時會塞一張假牌到 discardPool，或者把最後一張當作贏牌。
        switch (cheatType) {
            case 'da_si_xi':
                newHand = [
                    createTile(TILE_TYPES.WIND, '東'), createTile(TILE_TYPES.WIND, '東'), createTile(TILE_TYPES.WIND, '東'),
                    createTile(TILE_TYPES.WIND, '南'), createTile(TILE_TYPES.WIND, '南'), createTile(TILE_TYPES.WIND, '南'),
                    createTile(TILE_TYPES.WIND, '西'), createTile(TILE_TYPES.WIND, '西'), createTile(TILE_TYPES.WIND, '西'),
                    createTile(TILE_TYPES.WIND, '北'), createTile(TILE_TYPES.WIND, '北'), createTile(TILE_TYPES.WIND, '北'),
                    createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 2)
                ];
                break;
            case 'da_san_yuan':
                newHand = [
                    createTile(TILE_TYPES.DRAGON, '中'), createTile(TILE_TYPES.DRAGON, '中'), createTile(TILE_TYPES.DRAGON, '中'),
                    createTile(TILE_TYPES.DRAGON, '發'), createTile(TILE_TYPES.DRAGON, '發'), createTile(TILE_TYPES.DRAGON, '發'),
                    createTile(TILE_TYPES.DRAGON, '白'), createTile(TILE_TYPES.DRAGON, '白'), createTile(TILE_TYPES.DRAGON, '白'),
                    createTile(TILE_TYPES.CHAR, 5), createTile(TILE_TYPES.CHAR, 5), createTile(TILE_TYPES.CHAR, 5),
                    createTile(TILE_TYPES.BAM, 2), createTile(TILE_TYPES.BAM, 2), createTile(TILE_TYPES.BAM, 2),
                    createTile(TILE_TYPES.CHAR, 1)
                ];
                break;
            case 'wu_an_ke':
                newHand = [
                    createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 1),
                    createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 2),
                    createTile(TILE_TYPES.CHAR, 3), createTile(TILE_TYPES.CHAR, 3), createTile(TILE_TYPES.CHAR, 3),
                    createTile(TILE_TYPES.DOT, 1), createTile(TILE_TYPES.DOT, 1), createTile(TILE_TYPES.DOT, 1),
                    createTile(TILE_TYPES.BAM, 5), createTile(TILE_TYPES.BAM, 5), createTile(TILE_TYPES.BAM, 5),
                    createTile(TILE_TYPES.WIND, '東')
                ];
                break;
            case 'zi_yi_se':
                newHand = [
                    createTile(TILE_TYPES.WIND, '東'), createTile(TILE_TYPES.WIND, '東'), createTile(TILE_TYPES.WIND, '東'),
                    createTile(TILE_TYPES.WIND, '南'), createTile(TILE_TYPES.WIND, '南'), createTile(TILE_TYPES.WIND, '南'),
                    createTile(TILE_TYPES.DRAGON, '中'), createTile(TILE_TYPES.DRAGON, '中'), createTile(TILE_TYPES.DRAGON, '中'),
                    createTile(TILE_TYPES.DRAGON, '白'), createTile(TILE_TYPES.DRAGON, '白'), createTile(TILE_TYPES.DRAGON, '白'),
                    createTile(TILE_TYPES.WIND, '西'), createTile(TILE_TYPES.WIND, '西'), createTile(TILE_TYPES.WIND, '西'),
                    createTile(TILE_TYPES.DRAGON, '發')
                ];
                break;
            case 'qing_yi_se':
                newHand = [
                    createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 3),
                    createTile(TILE_TYPES.CHAR, 4), createTile(TILE_TYPES.CHAR, 5), createTile(TILE_TYPES.CHAR, 6),
                    createTile(TILE_TYPES.CHAR, 7), createTile(TILE_TYPES.CHAR, 8), createTile(TILE_TYPES.CHAR, 9),
                    createTile(TILE_TYPES.CHAR, 5), createTile(TILE_TYPES.CHAR, 5), createTile(TILE_TYPES.CHAR, 5),
                    createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 2),
                    createTile(TILE_TYPES.CHAR, 1)
                ];
                break;
            case 'ping_hu':
                newHand = [
                    createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 3),
                    createTile(TILE_TYPES.CHAR, 4), createTile(TILE_TYPES.CHAR, 5), createTile(TILE_TYPES.CHAR, 6),
                    createTile(TILE_TYPES.DOT, 1), createTile(TILE_TYPES.DOT, 2), createTile(TILE_TYPES.DOT, 3),
                    createTile(TILE_TYPES.DOT, 7), createTile(TILE_TYPES.DOT, 8), createTile(TILE_TYPES.DOT, 9),
                    createTile(TILE_TYPES.BAM, 4), createTile(TILE_TYPES.BAM, 5),
                    createTile(TILE_TYPES.BAM, 2), createTile(TILE_TYPES.BAM, 2)
                ];
                break;
            case 'xiao_si_xi':
                newHand = [
                    createTile(TILE_TYPES.WIND, '東'), createTile(TILE_TYPES.WIND, '東'), createTile(TILE_TYPES.WIND, '東'),
                    createTile(TILE_TYPES.WIND, '南'), createTile(TILE_TYPES.WIND, '南'), createTile(TILE_TYPES.WIND, '南'),
                    createTile(TILE_TYPES.WIND, '西'), createTile(TILE_TYPES.WIND, '西'), createTile(TILE_TYPES.WIND, '西'),
                    createTile(TILE_TYPES.WIND, '北'), createTile(TILE_TYPES.WIND, '北'), // pair
                    createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 1),
                    createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 3)
                ];
                break;
            case 'xiao_san_yuan':
                newHand = [
                    createTile(TILE_TYPES.DRAGON, '中'), createTile(TILE_TYPES.DRAGON, '中'), createTile(TILE_TYPES.DRAGON, '中'),
                    createTile(TILE_TYPES.DRAGON, '發'), createTile(TILE_TYPES.DRAGON, '發'), createTile(TILE_TYPES.DRAGON, '發'),
                    createTile(TILE_TYPES.DRAGON, '白'), createTile(TILE_TYPES.DRAGON, '白'), // pair
                    createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 1),
                    createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 2),
                    createTile(TILE_TYPES.BAM, 2), createTile(TILE_TYPES.BAM, 3)
                ];
                break;
            case 'si_an_ke':
                newHand = [
                    createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 1),
                    createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 2),
                    createTile(TILE_TYPES.CHAR, 3), createTile(TILE_TYPES.CHAR, 3), createTile(TILE_TYPES.CHAR, 3),
                    createTile(TILE_TYPES.DOT, 1), createTile(TILE_TYPES.DOT, 1), createTile(TILE_TYPES.DOT, 1),
                    createTile(TILE_TYPES.BAM, 4), createTile(TILE_TYPES.BAM, 5), createTile(TILE_TYPES.BAM, 6),
                    createTile(TILE_TYPES.WIND, '東')
                ];
                break;
            case 'san_an_ke':
                newHand = [
                    createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 1),
                    createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 2),
                    createTile(TILE_TYPES.CHAR, 3), createTile(TILE_TYPES.CHAR, 3), createTile(TILE_TYPES.CHAR, 3),
                    createTile(TILE_TYPES.DOT, 1), createTile(TILE_TYPES.DOT, 2), createTile(TILE_TYPES.DOT, 3),
                    createTile(TILE_TYPES.BAM, 4), createTile(TILE_TYPES.BAM, 5), createTile(TILE_TYPES.BAM, 6),
                    createTile(TILE_TYPES.WIND, '東')
                ];
                break;
            case 'hun_yi_se':
                newHand = [
                    createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 3),
                    createTile(TILE_TYPES.CHAR, 4), createTile(TILE_TYPES.CHAR, 5), createTile(TILE_TYPES.CHAR, 6),
                    createTile(TILE_TYPES.CHAR, 7), createTile(TILE_TYPES.CHAR, 8), createTile(TILE_TYPES.CHAR, 9),
                    createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 2),
                    createTile(TILE_TYPES.WIND, '東'), createTile(TILE_TYPES.WIND, '東'), createTile(TILE_TYPES.WIND, '東'),
                    createTile(TILE_TYPES.WIND, '南')
                ];
                break;
            case 'peng_peng_hu':
                newHand = [
                    createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 1),
                    createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 2),
                    createTile(TILE_TYPES.CHAR, 3), createTile(TILE_TYPES.CHAR, 3), createTile(TILE_TYPES.CHAR, 3),
                    createTile(TILE_TYPES.DOT, 1), createTile(TILE_TYPES.DOT, 1), createTile(TILE_TYPES.DOT, 1),
                    createTile(TILE_TYPES.BAM, 5), createTile(TILE_TYPES.BAM, 5), createTile(TILE_TYPES.BAM, 5),
                    createTile(TILE_TYPES.WIND, '東')
                ];
                break;
            case 'quan_qiu_ren':
                newHand = [
                    createTile(TILE_TYPES.WIND, '東')
                ];
                newMelds = [
                    { type: 'PONG', tiles: [createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 1)] },
                    { type: 'PONG', tiles: [createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 2)] },
                    { type: 'PONG', tiles: [createTile(TILE_TYPES.CHAR, 3), createTile(TILE_TYPES.CHAR, 3), createTile(TILE_TYPES.CHAR, 3)] },
                    { type: 'PONG', tiles: [createTile(TILE_TYPES.DOT, 5), createTile(TILE_TYPES.DOT, 5), createTile(TILE_TYPES.DOT, 5)] },
                    { type: 'PONG', tiles: [createTile(TILE_TYPES.BAM, 9), createTile(TILE_TYPES.BAM, 9), createTile(TILE_TYPES.BAM, 9)] }
                ];
                break;
            case 'hai_di':
                // 為了測試海底撈月/河底撈魚，我們把牌堆減少到 16 張，並且發給玩家一個準備胡牌的手牌
                this.deck.splice(0, Math.max(0, this.deck.length - 16));
                newHand = [
                    createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 3),
                    createTile(TILE_TYPES.CHAR, 4), createTile(TILE_TYPES.CHAR, 5), createTile(TILE_TYPES.CHAR, 6),
                    createTile(TILE_TYPES.CHAR, 7), createTile(TILE_TYPES.CHAR, 8), createTile(TILE_TYPES.CHAR, 9),
                    createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 2),
                    createTile(TILE_TYPES.WIND, '東'), createTile(TILE_TYPES.WIND, '東'), createTile(TILE_TYPES.WIND, '東'),
                    createTile(TILE_TYPES.WIND, '南')
                ];
                break;
            case 'tian_ting':
                // 給一個會聽牌的手牌，讓玩家可以按宣告聽牌測試
                newHand = [
                    createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 3),
                    createTile(TILE_TYPES.CHAR, 4), createTile(TILE_TYPES.CHAR, 5), createTile(TILE_TYPES.CHAR, 6),
                    createTile(TILE_TYPES.DOT, 1), createTile(TILE_TYPES.DOT, 2), createTile(TILE_TYPES.DOT, 3),
                    createTile(TILE_TYPES.DOT, 7), createTile(TILE_TYPES.DOT, 8), createTile(TILE_TYPES.DOT, 9),
                    createTile(TILE_TYPES.BAM, 4), createTile(TILE_TYPES.BAM, 5),
                    createTile(TILE_TYPES.BAM, 2), createTile(TILE_TYPES.BAM, 2)
                ];
                break;
            case 'dan_ting':
                // 簡單的單聽牌型（邊張/中洞/單吊）
                newHand = [
                    createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 3),
                    createTile(TILE_TYPES.CHAR, 4), createTile(TILE_TYPES.CHAR, 5), createTile(TILE_TYPES.CHAR, 6),
                    createTile(TILE_TYPES.CHAR, 7), createTile(TILE_TYPES.CHAR, 8), createTile(TILE_TYPES.CHAR, 9),
                    createTile(TILE_TYPES.BAM, 1), createTile(TILE_TYPES.BAM, 2), createTile(TILE_TYPES.BAM, 3),
                    createTile(TILE_TYPES.WIND, '東'), createTile(TILE_TYPES.WIND, '東'), createTile(TILE_TYPES.WIND, '東'),
                    createTile(TILE_TYPES.WIND, '南') // 單吊南風
                ];
                break;
            case 'san_yuan_ke':
                newHand = [
                    createTile(TILE_TYPES.DRAGON, '中'), createTile(TILE_TYPES.DRAGON, '中'), createTile(TILE_TYPES.DRAGON, '中'),
                    createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 3),
                    createTile(TILE_TYPES.CHAR, 4), createTile(TILE_TYPES.CHAR, 5), createTile(TILE_TYPES.CHAR, 6),
                    createTile(TILE_TYPES.BAM, 1), createTile(TILE_TYPES.BAM, 2), createTile(TILE_TYPES.BAM, 3),
                    createTile(TILE_TYPES.WIND, '東'), createTile(TILE_TYPES.WIND, '東'), createTile(TILE_TYPES.WIND, '東'),
                    createTile(TILE_TYPES.WIND, '南')
                ];
                break;
            case 'men_feng_ke':
                // 確保擁有自己的門風
                const myWind = playerIndex === 0 ? '東' : playerIndex === 1 ? '南' : playerIndex === 2 ? '西' : '北';
                newHand = [
                    createTile(TILE_TYPES.WIND, myWind), createTile(TILE_TYPES.WIND, myWind), createTile(TILE_TYPES.WIND, myWind),
                    createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 3),
                    createTile(TILE_TYPES.CHAR, 4), createTile(TILE_TYPES.CHAR, 5), createTile(TILE_TYPES.CHAR, 6),
                    createTile(TILE_TYPES.BAM, 1), createTile(TILE_TYPES.BAM, 2), createTile(TILE_TYPES.BAM, 3),
                    createTile(TILE_TYPES.DOT, 1), createTile(TILE_TYPES.DOT, 1), createTile(TILE_TYPES.DOT, 1),
                    createTile(TILE_TYPES.DRAGON, '白') // 單聽白板
                ];
                break;
            case 'quan_feng_ke':
                // 確保擁有圈風牌刻子
                const roundWind = this.wind || '東';
                newHand = [
                    createTile(TILE_TYPES.WIND, roundWind), createTile(TILE_TYPES.WIND, roundWind), createTile(TILE_TYPES.WIND, roundWind),
                    createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 3),
                    createTile(TILE_TYPES.CHAR, 4), createTile(TILE_TYPES.CHAR, 5), createTile(TILE_TYPES.CHAR, 6),
                    createTile(TILE_TYPES.BAM, 1), createTile(TILE_TYPES.BAM, 2), createTile(TILE_TYPES.BAM, 3),
                    createTile(TILE_TYPES.DOT, 1), createTile(TILE_TYPES.DOT, 1), createTile(TILE_TYPES.DOT, 1),
                    createTile(TILE_TYPES.DRAGON, '白') // 單聽白板
                ];
                break;
            case 'zheng_hua':
                // 確保擁有自己的正花
                const FLOWER_NAMES = ['春', '夏', '秋', '冬', '梅', '蘭', '竹', '菊'];
                const myFlower = FLOWER_NAMES[playerIndex];
                newHand = [
                    createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 3),
                    createTile(TILE_TYPES.CHAR, 4), createTile(TILE_TYPES.CHAR, 5), createTile(TILE_TYPES.CHAR, 6),
                    createTile(TILE_TYPES.BAM, 1), createTile(TILE_TYPES.BAM, 2), createTile(TILE_TYPES.BAM, 3),
                    createTile(TILE_TYPES.DOT, 1), createTile(TILE_TYPES.DOT, 2), createTile(TILE_TYPES.DOT, 3),
                    createTile(TILE_TYPES.DRAGON, '中'), createTile(TILE_TYPES.DRAGON, '中'), createTile(TILE_TYPES.DRAGON, '中'),
                    createTile(TILE_TYPES.WIND, '東') // 單吊東風
                ];
                newMelds = [
                    { type: 'FLOWER', tiles: [createTile(TILE_TYPES.FLOWER, myFlower)] }
                ];
                break;
            case 'men_qing':
                // 門清 / 一摸三 / 不求人
                newHand = [
                    createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 3),
                    createTile(TILE_TYPES.CHAR, 4), createTile(TILE_TYPES.CHAR, 5), createTile(TILE_TYPES.CHAR, 6),
                    createTile(TILE_TYPES.DOT, 1), createTile(TILE_TYPES.DOT, 2), createTile(TILE_TYPES.DOT, 3),
                    createTile(TILE_TYPES.DOT, 7), createTile(TILE_TYPES.DOT, 8), createTile(TILE_TYPES.DOT, 9),
                    createTile(TILE_TYPES.BAM, 4), createTile(TILE_TYPES.BAM, 5),
                    createTile(TILE_TYPES.BAM, 2), createTile(TILE_TYPES.BAM, 2)
                ];
                // 聽 BAM 3, 6 (沒有任何碰槓吃)
                break;
            case 'gang_shang_kai_hua':
                // 槓上開花 (測槓牌)
                newHand = [
                    createTile(TILE_TYPES.WIND, '東'), createTile(TILE_TYPES.WIND, '東'), createTile(TILE_TYPES.WIND, '東'),
                    createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 3),
                    createTile(TILE_TYPES.CHAR, 4), createTile(TILE_TYPES.CHAR, 5), createTile(TILE_TYPES.CHAR, 6),
                    createTile(TILE_TYPES.DOT, 1), createTile(TILE_TYPES.DOT, 2), createTile(TILE_TYPES.DOT, 3),
                    createTile(TILE_TYPES.DOT, 7), createTile(TILE_TYPES.DOT, 8), createTile(TILE_TYPES.DOT, 9),
                    createTile(TILE_TYPES.BAM, 5) // 單吊 BAM 5
                ];
                // 放入 5條 (替換牌), 接著是 東風 (讓玩家可以暗槓)
                this.deck.push(createTile(TILE_TYPES.BAM, 5));
                this.deck.push(createTile(TILE_TYPES.WIND, '東'));
                break;
            default:
                break;
        }
        
        if (newHand.length > 0) {
            this.hands[playerIndex] = newHand;
            if (newMelds.length > 0) {
                this.melds[playerIndex] = newMelds;
            }
            if (this.currentTurn === playerIndex && this.hands[playerIndex].length === 16) {
                // 如果目前是該玩家的回合，發給他第 17 張牌，確保他能正常打牌或槓牌
                this.hands[playerIndex].push(this.deck.pop());
                this.processFlowers(playerIndex);
            }
        }
    }

}
