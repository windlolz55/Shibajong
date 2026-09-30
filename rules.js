// --- 遊戲規則、胡牌與台數邏輯 (rules.js) ---
if (typeof MahjongGame !== 'undefined') {
    Object.assign(MahjongGame.prototype, {
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

,
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

    });
}
