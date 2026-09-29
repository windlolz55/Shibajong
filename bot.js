// --- 電腦 AI 對手邏輯 (bot.js) ---

// 透過 Object.assign 動態將 Bot 邏輯掛載到 MahjongGame.prototype
// 確保不破壞原有 game.js 結構，且網路連線端能正常呼叫
if (typeof MahjongGame !== 'undefined') {
    Object.assign(MahjongGame.prototype, {
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
        },

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
        },

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
        },

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
    });
}
