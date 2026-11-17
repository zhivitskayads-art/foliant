let currentBookId = 1;
let currentChapterNum = 1;

// 1. Быстрый перевод выделенного слова (MyMemory API через наш Backend)
async function translateSelectedText() {
    const selection = window.getSelection().toString().trim();
    if (!selection) return;

    const popup = document.getElementById('translation-popup');
    popup.innerText = 'Переводим...';
    popup.style.display = 'block';

    try {
        const response = await fetch(`/api/translate?text=${encodeURIComponent(selection)}&pair=en|ru`);
        const data = await response.json();
        popup.innerHTML = `<strong>${data.original}</strong>: ${data.translation}`;
    } catch (e) {
        popup.innerText = 'Ошибка соединения с сервисом перевода';
    }
}

// 2. Древо персонажей без спойлеров
async function loadCharacterTree() {
    const response = await fetch(`/api/books/${currentBookId}/character-tree?current_chapter=${currentChapterNum}`);
    const data = await response.json();

    const treeContainer = document.getElementById('character-tree-view');
    treeContainer.innerHTML = '';

    data.characters.forEach(char => {
        const charCard = document.createElement('div');
        charCard.className = 'character-card';

        let biosHtml = char.bio_timeline.map(b => `<li>(Глава ${b.chapter}): ${b.snippet}</li>`).join('');
        if (!biosHtml) biosHtml = '<li>Персонаж пока не совершил ключевых действий</li>';

        charCard.innerHTML = `
            <h4>${char.name} <small>(${char.role || 'Персонаж'})</small></h4>
            <ul class="bio-list">${biosHtml}</ul>
        `;
        treeContainer.appendChild(charCard);
    });
}

// 3. Звук перелистывания страницы и смена тем
const pageFlipAudio = new Audio('https://assets.mixkit.co/active_storage/sfx/2405/2405-preview.mp3');

function changeTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
}

function playPageTurn() {
    pageFlipAudio.currentTime = 0;
    pageFlipAudio.play().catch(() => {});
}

// 4. Синхронизированный плеер аудиокниги и плейлиста
function initImmersiveAudio(audiobookSrc, playlistSrc) {
    const playerBox = document.getElementById('immersive-player');
    if (!audiobookSrc && !playlistSrc) {
        playerBox.style.display = 'none';
        return;
    }
    playerBox.style.display = 'flex';
    if (audiobookSrc) document.getElementById('audiobook-element').src = audiobookSrc;
    if (playlistSrc) document.getElementById('playlist-element').src = playlistSrc;
}