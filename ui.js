// --- UI 畫面渲染邏輯 (ui.js) ---
function getTileSvgUrl(type, value) {
    const baseUrl = 'tiles/';
    if (type === '萬') return `${baseUrl}${(7 + parseInt(value)).toString().padStart(2, '0')}-characters-${value}.svg`;
    if (type === '筒') return `${baseUrl}${(16 + parseInt(value)).toString().padStart(2, '0')}-circles-${value}.svg`;
    if (type === '條') return `${baseUrl}${(25 + parseInt(value)).toString().padStart(2, '0')}-bamboos-${value}.svg`;
    if (type === '風') {
        const windMap = { '東': '04-east-wind.svg', '南': '05-south-wind.svg', '西': '06-west-wind.svg', '北': '07-north-wind.svg' };
        return `${baseUrl}${windMap[value] || ''}`;
    }
    if (type === '箭') {
        const dragonMap = { '中': '03-red-dragon.svg', '發': '02-green-dragon.svg', '白': '01-white-dragon.svg' };
        return `${baseUrl}${dragonMap[value] || ''}`;
    }
    if (type === '花') {
        const flowerMap = { '春': '35-spring.svg', '夏': '36-summer.svg', '秋': '37-autumn.svg', '冬': '38-winter.svg', '梅': '39-plum.svg', '蘭': '40-orchid.svg', '竹': '42-bamboo.svg', '菊': '41-chrysanthemum.svg' };
        return `${baseUrl}${flowerMap[value] || ''}`;
    }
    return '';
}
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

