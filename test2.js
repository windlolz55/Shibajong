const TILE_TYPES = { CHAR: 'W', DOT: 'T', BAM: 'S', WIND: 'F', DRAGON: 'J', FLOWER: 'H' };
function isHuPattern(counts, setsNeeded, hasPair) {
    const keys = Object.keys(counts).filter(k => counts[k] > 0).sort();
    if (keys.length === 0) return setsNeeded === 0 && hasPair;

    const k = keys[0];

    if (!hasPair && counts[k] >= 2) {
        counts[k] -= 2;
        if (isHuPattern(counts, setsNeeded, true)) { counts[k] += 2; return true; }
        counts[k] += 2;
    }

    if (counts[k] >= 3) {
        counts[k] -= 3;
        if (isHuPattern(counts, setsNeeded - 1, hasPair)) { counts[k] += 3; return true; }
        counts[k] += 3;
    }

    if (k.startsWith(TILE_TYPES.CHAR) || k.startsWith(TILE_TYPES.DOT) || k.startsWith(TILE_TYPES.BAM)) {
        const parts = k.split('_');
        const type = parts[0];
        const val = parseInt(parts[1]);
        const k2 = type + '_' + (val + 1);
        const k3 = type + '_' + (val + 2);
        
        if (counts[k] > 0 && counts[k2] > 0 && counts[k3] > 0) {
            counts[k]--; counts[k2]--; counts[k3]--;
            if (isHuPattern(counts, setsNeeded - 1, hasPair)) {
                counts[k]++; counts[k2]++; counts[k3]++; return true;
            }
            counts[k]++; counts[k2]++; counts[k3]++;
        }
    }
    return false;
}

function checkCanHu(handCopy) {
    let counts = {};
    handCopy.forEach(t => {
        let key = t.type + '_' + t.value;
        counts[key] = (counts[key] || 0) + 1;
    });
    let setsNeeded = Math.floor(handCopy.length / 3);
    return isHuPattern(counts, setsNeeded, false);
}

const createTile = (type, value) => ({ type, value });
const newHand = [
    createTile(TILE_TYPES.CHAR, 1), createTile(TILE_TYPES.CHAR, 2), createTile(TILE_TYPES.CHAR, 3),
    createTile(TILE_TYPES.CHAR, 4), createTile(TILE_TYPES.CHAR, 5), createTile(TILE_TYPES.CHAR, 6),
    createTile(TILE_TYPES.DOT, 1), createTile(TILE_TYPES.DOT, 2), createTile(TILE_TYPES.DOT, 3),
    createTile(TILE_TYPES.DOT, 7), createTile(TILE_TYPES.DOT, 8), createTile(TILE_TYPES.DOT, 9),
    createTile(TILE_TYPES.BAM, 4), createTile(TILE_TYPES.BAM, 5),
    createTile(TILE_TYPES.BAM, 2), createTile(TILE_TYPES.BAM, 2)
];

// Test BAM 3
let handCopy = [...newHand, createTile(TILE_TYPES.BAM, 3)];
console.log('Can Hu BAM 3:', checkCanHu(handCopy));

// Test BAM 6
handCopy = [...newHand, createTile(TILE_TYPES.BAM, 6)];
console.log('Can Hu BAM 6:', checkCanHu(handCopy));
