const melds = [[], [], [], []];
const dealerIndex = 0;
const discardPool = [];
const hands = [
    { length: 17 },
    { length: 17 },
    { length: 16 },
    { length: 16 }
];

function checkTianDiTingEligibility() {
    const eligible = [false, false, false, false];
    const noMelds = melds.every(m => m.length === 0);
    if (!noMelds) return eligible;

    for (let i = 0; i < 4; i++) {
        if (i === dealerIndex && discardPool.length === 0) {
            eligible[i] = 'TIAN';
        } else if (i !== dealerIndex) {
            if (hands[i].length === 16 && discardPool.length === 0) {
                eligible[i] = 'TIAN';
            } else if (hands[i].length === 17 && discardPool.length < 4) {
                eligible[i] = 'DI';
            }
        }
    }
    return eligible;
}

console.log(checkTianDiTingEligibility());
