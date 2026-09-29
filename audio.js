// --- 音效與語音處理邏輯 (audio.js) ---

// 統一管理遊戲音效
const AudioManager = {
    playEmoteAudio: function(text, gameVolume, isMuted) {
        if (isMuted || gameVolume <= 0) return;

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
        } else if (text === '沒救 繼續沉淪' || text === '沒救繼續沉淪') {
            playAudioFile('Hopeless.mp3');
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
};

window.AudioManager = AudioManager;
