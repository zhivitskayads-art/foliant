let currentUser = null;
let allLoadedBooks = [];
let currentBook = null;
let currentChapterId = null;
let currentChapterIndex = 1;
let currentBookChapters = [];
let currentChapterNotes = [];

let savedSelectionText = "";
let currentSelectedRange = null;

let userFlashcards = [];
let currentCardIndex = 0;

let currentLoadedChars = [];


const ROLE_READER = 1;
const ROLE_WRITER = 2;
const ROLE_MODERATOR = 3;
const ROLE_ADMIN = 4;

// ---------- НАВИГАЦИЯ ----------

function navigate(viewId) {
    if (!canOpenView(viewId)) {
        return;
    }

    document.querySelectorAll(".view-screen").forEach(view => {
        view.classList.remove("active");
    });

    const target = document.getElementById(viewId);

    if (target) {
        target.classList.add("active");
    }

    closeAllDrawers();
    setPageType(viewId);

    if (viewId === "catalog-view") {
        loadCatalogBooks();
    }

    if (viewId === "library-view") {
        loadUserLibrary("all");
    }

    if (viewId === "dictionary-view") {
        loadUserFlashcards();
    }

    if (viewId === "writer-view") {
        loadWriterBooks();
    }

    if (viewId === "chapter-create-view") {
    loadChapterCreatePage();
    loadWriterNotes();
    }

    if (viewId === "book-create-view") {
    loadBookCreatePage();
    }

    if (viewId === "book-edit-view") {
    loadBookEditPage();
    }

    if (viewId === "moderator-view") {
        loadModerationQueue();
    }

    if (viewId === "admin-view") {
        loadAdminTickets();
    }
}

function canOpenView(viewId) {
    if (!currentUser) {
        if ([
            "library-view",
            "dictionary-view",
            "writer-view",
            "moderator-view",
            "admin-view"
        ].includes(viewId)) {
            openGuestGuard();
            return false;
        }

        return true;
    }

    const role = Number(currentUser.role_id);

    if (viewId === "writer-view" && role !== ROLE_WRITER) {
        alert("Раздел «Мои книги» доступен только писателю.");
        return false;
    }

    if (
        viewId === "moderator-view" &&
        ![ROLE_MODERATOR, ROLE_ADMIN].includes(role)
    ) {
        alert("Раздел «Модерация авторства» доступен только модератору или администратору.");
        return false;
    }

    if (viewId === "admin-view" && role !== ROLE_ADMIN) {
        alert("Раздел «Администрация» доступен только администратору.");
        return false;
    }

    if (
        ["library-view", "support-view", "dictionary-view"].includes(viewId) &&
        ![ROLE_READER, ROLE_WRITER].includes(role)
    ) {
        alert("Этот раздел недоступен для вашей роли.");
        return false;
    }

    return true;
}

function setPageType(viewId) {
    const pageMap = {
        "catalog-view": "default",
    "category-view": "category",
    "book-page-view": "book-page",
    "reader-view": "reader",
    "dictionary-view": "dictionary",
    "library-view": "library",
    "profile-view": "profile",
    "support-view": "support",
    "writer-view": "writer",
    "editor-view": "editor",
    "moderator-view": "moderator",
    "admin-view": "admin",
    "book-create-view": "writer",
    "chapter-create-view": "writer"
    };

    document.body.setAttribute("data-page", pageMap[viewId] || "default");
}

function closeAllDrawers() {
    document.getElementById("app-sidebar").classList.remove("open");
    document.getElementById("sidebar-overlay").classList.remove("open");
    document.getElementById("categories-drawer").classList.remove("open");
    document.getElementById("categories-overlay").classList.remove("open");
    document.getElementById("writer-drawer").classList.remove("open");
    document.getElementById("writer-overlay").classList.remove("open");
}

function toggleSidebar() {
    document.getElementById("app-sidebar").classList.toggle("open");
    document.getElementById("sidebar-overlay").classList.toggle("open");
}

function toggleCategoriesDrawer() {
    document.getElementById("categories-drawer").classList.toggle("open");
    document.getElementById("categories-overlay").classList.toggle("open");
}

function toggleWriterDrawer() {
    if (!isWriter()) {
        alert("Раздел «Мои книги» доступен только писателю.");
        return;
    }

    document.getElementById("writer-drawer").classList.toggle("open");
    document.getElementById("writer-overlay").classList.toggle("open");
}

function isReader() {
    return currentUser && Number(currentUser.role_id) === ROLE_READER;
}

function isWriter() {
    return currentUser && Number(currentUser.role_id) === ROLE_WRITER;
}

function isModerator() {
    return currentUser && Number(currentUser.role_id) === ROLE_MODERATOR;
}

function isAdmin() {
    return currentUser && Number(currentUser.role_id) === ROLE_ADMIN;
}

// ---------- КАТЕГОРИИ ----------

const genresBySection = {
    1: [
        "Классическая проза",
        "Русская классика",
        "Зарубежная классика",
        "Фэнтези",
        "Детективы"
    ],
    2: [
        "Романтика",
        "Ангст",
        "Флафф",
        "Слэш",
        "AU (Альтернативная вселенная)",
        "Драббл"
    ],
    3: [
        "Сёнэн",
        "Сёдзё",
        "Манхва",
        "Маньхуа",
        "Исекай"
    ],
    4: [
        "Научные статьи",
        "Литературные журналы",
        "Исторические очерки"
    ]
};

function selectSection(sectionId, element) {
    if (element) {
        document.querySelectorAll(".cat-sec-item").forEach(item => {
            item.classList.remove("active");
        });

        element.classList.add("active");
    }

    const genresList = document.getElementById("genres-list");
    genresList.innerHTML = "";

    (genresBySection[sectionId] || []).forEach(genre => {
        const genreItem = document.createElement("div");
        genreItem.className = "genre-tag";
        genreItem.innerText = genre;
        genreItem.onclick = () => openCategoryPage(genre);
        genresList.appendChild(genreItem);
    });
}

function openCategoryPage(genreName) {
    document.getElementById("category-title").innerText = genreName;

    const grid = document.getElementById("category-books-grid");
    grid.innerHTML = "";

    const filteredBooks = allLoadedBooks.filter(
        book => book.genre === genreName
    );

    if (filteredBooks.length === 0) {
        grid.innerHTML = `<p style="color:var(--text-muted);">В жанре «${genreName}» пока нет книг.</p>`;
    } else {
        filteredBooks.forEach(book => {
            const card = document.createElement("div");
            card.className = "category-card";

            card.innerHTML = `
                <h4>${book.title}</h4>
                <p>${book.author}</p>
                <p style="color:var(--accent);">★ ${book.rating}</p>
                <button class="submit-action-btn" onclick="openBookPage(${book.id})">
                    Открыть
                </button>
            `;

            grid.appendChild(card);
        });
    }

    navigate("category-view");
}

// ---------- ПОИСК ----------

function handleSearch(query) {
    const dropdown = document.getElementById("search-suggestions-box");
    query = query.trim().toLowerCase();

    if (!query) {
        dropdown.style.display = "none";
        return;
    }

    const results = allLoadedBooks.filter(book => {
        const searchable = `
            ${book.title}
            ${book.author}
            ${book.genre}
            ${book.hashtags || ""}
        `.toLowerCase();

        return searchable.includes(query);
    });

    dropdown.innerHTML = "";
    dropdown.style.display = "block";

    if (results.length === 0) {
        dropdown.innerHTML = `<div class="search-empty">Такой книги нет</div>`;
        return;
    }

    results.forEach(book => {
        const item = document.createElement("div");
        item.className = "search-item";
        item.innerHTML = `
            <strong>${book.title}</strong> — ${book.author}
            <small>(${book.genre})</small>
        `;

        item.onclick = () => {
            dropdown.style.display = "none";
            openBookPage(book.id);
        };

        dropdown.appendChild(item);
    });
}

// ---------- КАТАЛОГ ----------
async function loadCatalogBooks() {
    const shelf = document.getElementById("shelf-books-row");
    shelf.innerHTML = `<div class="catalog-loading">Загрузка книг…</div>`;

    try {
        const response = await fetch("/api/books");
        allLoadedBooks = await response.json();
    } catch (error) {
        shelf.innerHTML = `<div class="catalog-loading">Не удалось загрузить каталог</div>`;
        return;
    }

    shelf.innerHTML = "";

    if (allLoadedBooks.length === 0) {
        shelf.innerHTML = `<div class="catalog-loading">Пока нет опубликованных книг</div>`;
        return;
    }

    allLoadedBooks.forEach(book => {
        const spine = document.createElement("div");
        spine.className = "spine-book";

        const isFavorite = Boolean(book.is_favorite);

        spine.innerHTML = `
            <span>${book.title}</span>

            <div class="spine-hover-card">
                <button
                    type="button"
                    class="fav-heart-btn ${isFavorite ? "is-active" : ""}"
                    data-book-id="${book.id}"
                    title="${isFavorite ? "Убрать из избранного" : "Добавить в избранное"}"
                    onclick="event.stopPropagation(); toggleFavoriteBook(${book.id}, this)"
                ></button>

                <div>
                    <h4 style="color:var(--accent); font-size:13px;">${book.title}</h4>
                    <p style="font-size:11px;">${book.author}</p>
                    <p style="font-size:10px; color:#FFB915;">★ ${book.rating}</p>
                </div>

                <button
                    type="button"
                    class="submit-action-btn"
                    style="padding:6px; font-size:12px;"
                    onclick="openBookPage(${book.id})"
                >Смотреть</button>
            </div>
        `;

        shelf.appendChild(spine);
    });
}

async function toggleFavoriteBook(bookId, button) {
    if (!currentUser) {
        openGuestGuard();
        return;
    }

    const wasActive = button.classList.contains("is-active");

    button.classList.toggle("is-active", !wasActive);

    try {
        const response = await fetch(
            `/api/library/toggle-favorite?book_id=${bookId}&user_id=${currentUser.user_id}`,
            { method: "POST" }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || "Не удалось изменить избранное");
        }

        const isFavorite = Boolean(result.is_favorite);

        document
            .querySelectorAll(`.fav-heart-btn[data-book-id="${bookId}"]`)
            .forEach(heart => {
                heart.classList.toggle("is-active", isFavorite);
                heart.title = isFavorite
                    ? "Убрать из избранного"
                    : "Добавить в избранное";
            });

        if (document.body.dataset.page === "library") {
            const favoritesTab = document
                .getElementById("lib-tab-fav")
                .classList.contains("active");

            if (favoritesTab) {
                await loadUserLibrary("fav");
            }
        }
    } catch (error) {
        button.classList.toggle("is-active", wasActive);
        alert("Не удалось изменить избранное. Попробуйте ещё раз.");
    }
}

// ---------- КАРТОЧКА КНИГИ ----------

async function openBookPage(bookId) {
    const book = allLoadedBooks.find(item => item.id === bookId);

    if (!book) {
        alert("Книга не найдена.");
        return;
    }

    currentBook = book;
    navigate("book-page-view");

    document.getElementById("bp-title").innerText = book.title;
    document.getElementById("bp-hashtags").innerText = book.hashtags || "#литература #чтение";
    document.getElementById("bp-description").innerText = book.description || "Описание отсутствует.";
    document.getElementById("bp-rating").innerText = `★ ${book.rating} / 5.0`;
    document.getElementById("bp-reads").innerText = `Отзывов: ${book.reviews_count || 0}`;
    document.getElementById("bp-downloads").innerText = `Прочтений: ${book.downloads || 0}`;
    document.getElementById("bp-purchases").innerText = `Куплено: ${book.purchases || 0}`;

    const buyButton = document.getElementById("bp-buy-btn");
    const priceTag = document.getElementById("bp-price-tag");
    const libraryButton = document.getElementById("bp-library-btn");

    if (libraryButton) {
        if (book.is_in_library) {
            libraryButton.innerText = "Уже в библиотеке";
            libraryButton.disabled = true;
        } else {
            libraryButton.innerText = "Добавить в библиотеку";
            libraryButton.disabled = false;
        }
    }

    if (book.price > 0) {
        priceTag.innerText = `${book.price} ₽`;
        buyButton.style.display = "block";
        buyButton.innerText = `Купить за ${book.price} ₽`;
    } else {
        priceTag.innerText = "Бесплатно";
        buyButton.style.display = "none";
    }

    const chaptersResponse = await fetch(
    `/api/books/${bookId}/chapters?user_id=${currentUser?.user_id || ""}`);
    currentBookChapters = await chaptersResponse.json();

    const chaptersList = document.getElementById("bp-chapters-list");
    chaptersList.innerHTML = "";

    if (currentBookChapters.length === 0) {
        chaptersList.innerHTML = `<p style="color:var(--text-muted);">Главы пока не добавлены.</p>`;
    } else {
        currentBookChapters.forEach(chapter => {
            const button = document.createElement("button");
            button.className = "nav-step-btn";
            button.innerText = `Глава ${chapter.number}. ${chapter.title}`;

            button.onclick = () => {
                tryOpenChapter(
                    chapter.id,
                    chapter.number,
                    chapter.title,
                    chapter.content
                );
            };

            chaptersList.appendChild(button);
        });
    }

    loadBookReviews(bookId);
}

async function handleBuyCurrentBook() {
    if (!currentUser) {
        openGuestGuard();
        return;
    }

    if (!isReader() && !isWriter()) {
        alert("Покупка книг доступна только читателю или писателю.");
        return;
    }

    const confirmed = confirm(
        `Подтвердить покупку книги «${currentBook.title}» за ${currentBook.price} ₽?`
    );

    if (!confirmed) {
        return;
    }

    const response = await fetch(
        `/api/books/${currentBook.id}/purchase?user_id=${currentUser.user_id}`,
        { method: "POST" }
    );

    const result = await response.json();

    if (!response.ok) {
        alert(result.detail || "Не удалось совершить покупку");
        return;
    }

    alert(result.message);
    openBookPage(currentBook.id);
}

async function addCurrentBookToLibrary() {
    if (!currentUser) {
        openGuestGuard();
        return;
    }

    if (!isReader() && !isWriter()) {
        alert("Добавление в библиотеку доступно читателю или писателю.");
        return;
    }

    const response = await fetch(
        `/api/library/add-book?book_id=${currentBook.id}&user_id=${currentUser.user_id}`,
        { method: "POST" }
    );

    const result = await response.json();

    if (!response.ok) {
        alert(result.detail || "Не удалось добавить книгу в библиотеку");
        return;
    }

    alert(result.message);
    openBookPage(currentBook.id);
}

// ---------- ЧИТАЛКА ----------

function tryOpenChapter(chapterId, chapterNumber, title, content) {
    if (!currentUser) {
        openGuestGuard();
        return;
    }

    fetch(`/api/books/${currentBook.id}/increment-read`, { method: "POST" });
    openReaderChapter(chapterId, chapterNumber, title, content);
}

function openReaderChapter(chapterId, chapterNumber, title, content) {
    currentChapterId = chapterId;
    currentChapterIndex = chapterNumber;

    document.getElementById("rp-book-name").innerText = currentBook.title;
    document.getElementById("rp-chapter-title").innerText = title || `Глава ${chapterNumber}`;

    document.getElementById("rp-text-content").innerHTML = content
        ? `<p>${content}</p>`
        : `<p>Текст главы пока не добавлен.</p>`;

    loadChapterNotes(chapterId);
    navigate("reader-view");
}

function stepChapter(step) {
    const nextChapter = currentChapterIndex + step;

    if (nextChapter < 1) {
        alert("Это первая глава.");
        return;
    }

    const chapter = currentBookChapters.find(
        item => item.number === nextChapter
    );

    if (chapter) {
        openReaderChapter(
            chapter.id,
            chapter.number,
            chapter.title,
            chapter.content
        );
    } else {
        alert("Такой главы пока нет.");
    }
}

function handleSelectionForNotes(event) {
    setTimeout(() => {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        const bubble = document.getElementById("selection-action-bubble");

        if (selectedText.length > 0) {
            savedSelectionText = selectedText;
            currentSelectedRange = selection.getRangeAt(0).cloneRange();

            bubble.style.position = "fixed";
            bubble.style.left = `${event.clientX}px`;
            bubble.style.top = `${event.clientY - 45}px`;
            bubble.style.display = "flex";
        } else {
            bubble.style.display = "none";
        }
    }, 10);
}

// ---------- ЗАМЕТКИ, ВЫДЕЛЕНИЯ, ПЕРЕВОД, КАРТОЧКИ ----------

function hideSelectionBubble() {
    const bubble = document.getElementById("selection-action-bubble");

    if (bubble) {
        bubble.style.display = "none";
    }
}

function findNoteByQuote(quote) {
    return (currentChapterNotes || []).find(
        note => note.text === quote
    );
}

async function deleteNoteById(noteId) {
    if (!noteId || !currentChapterId) {
        return;
    }

    await fetch(
        `/api/chapters/${currentChapterId}/notes/${noteId}?user_id=${currentUser.user_id}`,
        { method: "DELETE" }
    );
}

async function loadChapterNotes(chapterId) {
    const notesList = document.getElementById("chapter-notes-list");
    notesList.innerHTML = "Загрузка заметок…";

    try {
        const response = await fetch(
            `/api/chapters/${chapterId}/notes?user_id=${currentUser.user_id}`
        );

        if (!response.ok) {
            notesList.innerHTML = "";
            currentChapterNotes = [];
            renderSavedAnnotations();
            return;
        }

        const notes = await response.json();
        currentChapterNotes = notes;

        notesList.innerHTML = "";

        if (notes.length === 0) {
            notesList.innerHTML = `<p style="color:var(--text-muted);">К этой главе пока нет заметок.</p>`;
            renderSavedAnnotations();
            return;
        }

        notes.forEach(note => {
            const noteCard = document.createElement("div");
            noteCard.style.cssText = `
                border-left: 4px solid ${getNoteColor(note.color)};
                background: rgba(0,0,0,0.25);
                padding: 8px 12px;
                margin-bottom: 8px;
                border-radius: 4px;
            `;

            noteCard.innerHTML = `
                <strong>Цитата:</strong> «${note.text}»
                ${note.comment ? `<br><small style="color:var(--accent);">Заметка: ${note.comment}</small>` : ""}
            `;

            notesList.appendChild(noteCard);
        });

        renderSavedAnnotations();
    } catch (error) {
        notesList.innerHTML = "";
        currentChapterNotes = [];
    }
}

function getNoteColor(color) {
    if (
        color === "underline" ||
        color === "wavy" ||
        color === "comment"
    ) {
        return "var(--accent)";
    }

    return color || "var(--accent)";
}

function getAnnotationClass(color) {
    const colors = {
        "#FFB915": "yellow",
        "#2A9D8F": "green",
        "#E63946": "red",
        "underline": "underline",
        "wavy": "wavy"
    };

    return colors[color] || "yellow";
}

function clearVisualAnnotations() {
    const readerText = document.getElementById("rp-text-content");

    readerText.querySelectorAll(".annotation-mark").forEach(mark => {
        const parent = mark.parentNode;

        while (mark.firstChild) {
            parent.insertBefore(mark.firstChild, mark);
        }

        parent.removeChild(mark);
        parent.normalize();
    });
}

function highlightQuote(quote, style) {
    const readerText = document.getElementById("rp-text-content");

    if (!readerText || !quote) {
        return;
    }

    const walker = document.createTreeWalker(
        readerText,
        NodeFilter.SHOW_TEXT,
        null
    );

    let node;

    while ((node = walker.nextNode())) {
        const index = node.textContent.indexOf(quote);

        if (index === -1) {
            continue;
        }

        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + quote.length);

        const mark = document.createElement("span");
        mark.className = `annotation-mark annotation-${style}`;
        mark.textContent = quote;

        try {
            range.deleteContents();
            range.insertNode(mark);
        } catch (error) {
            console.warn("Не удалось подсветить фрагмент:", error);
        }

        return;
    }
}

function renderSavedAnnotations() {
    clearVisualAnnotations();

    (currentChapterNotes || []).forEach(note => {
        if (note.color === "comment") {
            return;
        }

        highlightQuote(
            note.text,
            getAnnotationClass(note.color)
        );
    });
}

async function applyAnnotation(style) {
    const quote = savedSelectionText;

    if (!quote) {
        alert("Сначала выделите текст.");
        return;
    }

    if (!currentUser) {
        openGuestGuard();
        return;
    }

    if (!currentChapterId) {
        alert("Сначала откройте главу.");
        return;
    }

    const colorHex = {
        yellow: "#FFB915",
        green: "#2A9D8F",
        red: "#E63946",
        underline: "underline",
        wavy: "wavy"
    }[style];

    const oldNote = findNoteByQuote(quote);

    if (oldNote) {
        await deleteNoteById(oldNote.id);
    }

    const response = await fetch(
        `/api/notes?user_id=${currentUser.user_id}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chapter_id: currentChapterId,
                selected_text: quote,
                comment: "",
                color_hex: colorHex
            })
        }
    );

    if (!response.ok) {
        alert("Не удалось сохранить выделение.");
        return;
    }

    hideSelectionBubble();
    await loadChapterNotes(currentChapterId);
}

async function removeAnnotation() {
    const quote = savedSelectionText;

    if (!quote) {
        alert("Сначала выделите текст, который хотите очистить.");
        return;
    }

    const note = findNoteByQuote(quote);

    if (!note) {
        hideSelectionBubble();
        return;
    }

    await deleteNoteById(note.id);

    hideSelectionBubble();
    await loadChapterNotes(currentChapterId);
}

function openCommentModal() {
    const quote = savedSelectionText;

    if (!quote) {
        alert("Сначала выделите фрагмент текста.");
        return;
    }

    document.getElementById("comment-preview").textContent = quote;
    document.getElementById("comment-text").value = "";

    document.getElementById("comment-modal").style.display = "flex";
    hideSelectionBubble();
}

async function saveComment() {
    const quote = document.getElementById("comment-preview").textContent;
    const comment = document.getElementById("comment-text").value.trim();

    if (!comment) {
        alert("Напишите комментарий.");
        return;
    }

    if (!currentChapterId) {
        alert("Сначала откройте главу.");
        return;
    }

    const oldNote = findNoteByQuote(quote);

    if (oldNote) {
        await deleteNoteById(oldNote.id);
    }

    const response = await fetch(
        `/api/notes?user_id=${currentUser.user_id}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chapter_id: currentChapterId,
                selected_text: quote,
                comment: comment,
                color_hex: "comment"
            })
        }
    );

    if (!response.ok) {
        alert("Не удалось сохранить комментарий.");
        return;
    }

    closeModal("comment-modal");
    await loadChapterNotes(currentChapterId);
}

async function openTranslationPopup() {
    const quote = savedSelectionText;

    if (!quote) {
        alert("Сначала выделите слово или фразу.");
        return;
    }

    const card = document.getElementById("translation-card");
    const original = document.getElementById("tc-original");
    const content = document.getElementById("tc-content");

    original.textContent = quote;
    content.textContent = "Переводим...";

    if (currentSelectedRange) {
        const rect = currentSelectedRange.getBoundingClientRect();

        card.style.left = `${rect.left}px`;
        card.style.top = `${rect.bottom + 10}px`;
    }

    card.style.display = "block";

    try {
        const response = await fetch(
            `/api/translate?text=${encodeURIComponent(quote)}&pair=en|ru`
        );
        const result = await response.json();

        content.textContent = result.translation || "Перевод не найден.";
    } catch (error) {
        content.textContent = "Не удалось получить перевод.";
    }

    hideSelectionBubble();
}

function closeTranslation() {
    document.getElementById("translation-card").style.display = "none";
}

function openFlashcardModal() {
    const quote = savedSelectionText;

    if (!quote) {
        alert("Сначала выделите слово или фразу.");
        return;
    }

    document.getElementById("flashcard-front").value = quote;
    document.getElementById("flashcard-back").value = "";

    document.getElementById("flashcard-create-modal").style.display = "flex";
    hideSelectionBubble();
}

async function saveFlashcardFromModal() {
    const word = document.getElementById("flashcard-front").value.trim();
    const translation = document.getElementById("flashcard-back").value.trim();

    if (!word || !translation) {
        alert("Заполните обе стороны карточки.");
        return;
    }

    const response = await fetch(
        `/api/dictionary/cards?user_id=${currentUser.user_id}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                word: word,
                translation: translation,
                context_sentence: ""
            })
        }
    );

    if (!response.ok) {
        alert("Не удалось сохранить карточку.");
        return;
    }

    closeModal("flashcard-create-modal");
    alert("Карточка добавлена.");
}

// ---------- ПЕРЕВОД И КАРТОЧКИ ----------

async function loadUserFlashcards() {
    if (!currentUser) {
        openGuestGuard();
        return;
    }

    const response = await fetch(
        `/api/dictionary/cards?user_id=${currentUser.user_id}`
    );

    userFlashcards = await response.json();
    currentCardIndex = 0;

    if (userFlashcards.length === 0) {
        document.getElementById("fc-word").innerText = "В словаре пока нет сохранённых слов.";
        document.getElementById("fc-context").innerText = "Выделяйте слова в читалке и добавляйте их в карточки.";
        document.getElementById("fc-start-btn").style.display = "none";
        return;
    }

    document.getElementById("fc-word").innerText = `Готово к изучению слов: ${userFlashcards.length}`;
    document.getElementById("fc-context").innerText = "Нажмите «Начать повторение».";
    document.getElementById("fc-start-btn").style.display = "block";
}

function startFlashcardReview() {
    if (userFlashcards.length === 0) {
        return;
    }

    document.getElementById("fc-start-btn").style.display = "none";
    displayCurrentFlashcard();
}

function displayCurrentFlashcard() {
    if (currentCardIndex >= userFlashcards.length) {
        document.getElementById("fc-word").innerText = "Все слова повторены.";
        document.getElementById("fc-context").innerText = "";
        document.getElementById("fc-reveal-btn").style.display = "none";
        document.getElementById("fc-translation").style.display = "none";
        document.getElementById("fc-action-ratings").style.display = "none";
        return;
    }

    const card = userFlashcards[currentCardIndex];

    document.getElementById("fc-word").innerText = card.word;
    document.getElementById("fc-context").innerText = card.context ? `«${card.context}»` : "";
    document.getElementById("fc-translation").innerText = card.translation;
    document.getElementById("fc-translation").style.display = "none";
    document.getElementById("fc-reveal-btn").style.display = "block";
    document.getElementById("fc-action-ratings").style.display = "none";
}

function revealFlashcardTranslation() {
    document.getElementById("fc-reveal-btn").style.display = "none";
    document.getElementById("fc-translation").style.display = "block";
    document.getElementById("fc-action-ratings").style.display = "flex";
}

function nextFlashcard() {
    currentCardIndex++;
    displayCurrentFlashcard();
}

// ---------- БИБЛИОТЕКА ----------

async function loadUserLibrary(mode = "all") {
    const shelf = document.getElementById("user-shelf-books");

    if (!currentUser) {
        openGuestGuard();
        return;
    }

    shelf.innerHTML = `<div class="catalog-loading">Загрузка библиотеки…</div>`;

    const response = await fetch(
        `/api/library?user_id=${currentUser.user_id}&mode=${mode}`
    );

    if (!response.ok) {
        shelf.innerHTML = `<div class="catalog-loading">Библиотека недоступна для вашей роли</div>`;
        return;
    }

    const books = await response.json();
    shelf.innerHTML = "";

    if (books.length === 0) {
        shelf.innerHTML = `<div class="catalog-loading">На этой полке пока нет книг</div>`;
        return;
    }

    books.forEach(book => {
        const spine = document.createElement("div");
        spine.className = "spine-book";

        const isFavorite = Boolean(book.is_favorite);

        spine.innerHTML = `
            <span>${book.title}</span>

            <div class="spine-hover-card">
                <button
                    type="button"
                    class="fav-heart-btn ${isFavorite ? "is-active" : ""}"
                    data-book-id="${book.id}"
                    title="${isFavorite ? "Убрать из избранного" : "Добавить в избранное"}"
                    onclick="event.stopPropagation(); toggleFavoriteBook(${book.id}, this)"
                ></button>

                <div>
                    <h4 style="color:var(--accent); font-size:13px;">${book.title}</h4>
                    <p style="font-size:11px;">${book.author}</p>
                </div>

                <button
                    type="button"
                    class="submit-action-btn"
                    style="padding:6px; font-size:12px;"
                    onclick="openBookPage(${book.id})"
                >Читать</button>
            </div>
        `;

        shelf.appendChild(spine);
    });
}

function switchLibraryTab(mode) {
    document.getElementById("lib-tab-all").classList.toggle("active", mode === "all");
    document.getElementById("lib-tab-fav").classList.toggle("active", mode === "fav");

    loadUserLibrary(mode);
}

// ---------- АУДИО ----------

function playBookTrack(trackType) {
    if (!currentUser) {
        openGuestGuard();
        return;
    }

    const player = document.getElementById("global-ipod-player");
    const audio = document.getElementById("global-audio-source");
    const trackTitle = document.getElementById("ipod-track-title");

    if (!player || !audio) {
        return;
    }

    player.style.display = "block";

    if (trackType === "audiobook") {
        audio.src = currentBook.audiobook_url || "/static/uploads/audio/01%20fail.mp3";
        trackTitle.innerText = `Озвучка: ${currentBook.title}`;
    } else {
        audio.src = currentBook.playlist_url || "/static/uploads/audio/02%20fail.mp3";
        trackTitle.innerText = `Саундтрек: ${currentBook.title}`;
    }

    audio.load();

    audio.play().then(() => {
        syncAudioButton();
    }).catch(error => {
        console.error("Ошибка аудио:", error);

        if (audio.error) {
            if (audio.error.code === 4) {
                alert(
                    "Аудиофайл не найден или его формат не поддерживается браузером.\n\n" +
                    "Проверьте путь: " + audio.currentSrc
                );
            } else {
                alert(
                    "Не удалось воспроизвести аудио.\n\n" +
                    "Код ошибки: " + audio.error.code
                );
            }
        } else if (error.name === "NotAllowedError") {
            alert(
                "Браузер заблокировал автозапуск звука. " +
                "Нажмите кнопку воспроизведения ещё раз."
            );
        } else {
            alert("Не удалось включить аудио. Проверьте файл и путь к нему.");
        }
    });
}

function syncAudioButton() {
    const audio = document.getElementById("global-audio-source");
    const button = document.getElementById("ipod-play-btn");

    if (!audio || !button) {
        return;
    }

    const isPlaying = !audio.paused && !audio.ended;

    button.classList.toggle("is-playing", isPlaying);
    button.title = isPlaying ? "Пауза" : "Продолжить";
    button.setAttribute("aria-label", button.title);
}

async function toggleAudio(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const audio = document.getElementById("global-audio-source");

    if (!audio || !audio.getAttribute("src")) {
        alert("Сначала выберите аудиокнигу или музыку.");
        return;
    }

    if (!audio.paused) {
        audio.pause();
        syncAudioButton();
        return;
    }

    try {
        await audio.play();
    } catch (error) {
        console.error("Не удалось включить аудио:", error);

        if (error.name !== "AbortError") {
            alert("Не удалось включить аудио. Проверьте доступность файла.");
        }
    }

    syncAudioButton();
}

function stopAudio() {
    const audio = document.getElementById("global-audio-source");

    if (!audio) {
        return;
    }

    audio.pause();
    audio.currentTime = 0;
    syncAudioButton();
}

function seekAudio(seconds) {
    const audio = document.getElementById("global-audio-source");

    if (audio) {
        audio.currentTime += seconds;
    }
}

function updateAudioProgress() {
    const audio = document.getElementById("global-audio-source");

    if (!audio.duration) {
        return;
    }

    const progress = (audio.currentTime / audio.duration) * 100;
    document.getElementById("ipod-progress-fill").style.width = `${progress}%`;
}

function closeGlobalPlayer() {
    stopAudio();
    document.getElementById("global-ipod-player").style.display = "none";
}

function adjustAmbientSound(soundType, volumePercent) {
    const audio = document.getElementById(`ambient-${soundType}`);
    const volume = parseFloat(volumePercent) / 100;

    if (!audio) {
        return;
    }

    audio.volume = volume;

    if (volume > 0) {
        audio.play().catch(() => {
            alert(
                "Браузер заблокировал автозапуск звука. " +
                "Нажмите в любом месте страницы и попробуйте снова."
            );
        });
    } else {
        audio.pause();
    }
}

// ---------- ПЕРСОНАЖИ ----------

async function openCharacterTreeModal() {
    document.getElementById("tree-modal").style.display = "flex";

    const deck = document.getElementById("tree-characters-deck");
    deck.innerHTML = "Загрузка персонажей…";

    const bookId = currentBook ? currentBook.id : 1;

    try {
        const response = await fetch(
            `/api/books/${bookId}/character-tree?current_chapter=${currentChapterIndex}`
        );
        const result = await response.json();

        currentLoadedChars = result.characters || [];
        deck.innerHTML = "";

        if (currentLoadedChars.length === 0) {
            deck.innerHTML = `<p style="padding:20px;">Персонажи пока не добавлены.</p>`;
            return;
        }

        currentLoadedChars.forEach(character => {
            const characterCard = document.createElement("div");
            characterCard.style.cssText = `
                background: rgba(0,0,0,0.3);
                padding: 14px;
                border-radius: 8px;
                margin-bottom: 12px;
                border-left: 4px solid var(--accent);
            `;

            const timeline = character.bio_timeline
                .map(event => `<li>Глава ${event.chapter}: ${event.snippet}</li>`)
                .join("");

            characterCard.innerHTML = `
                <h4 style="color:var(--accent);">${character.name}</h4>
                <ul style="margin-left:20px;">${timeline || "<li>Факты пока не добавлены.</li>"}</ul>
            `;

            deck.appendChild(characterCard);
        });
    } catch (error) {
        deck.innerHTML = "Не удалось загрузить персонажей.";
    }
}

function switchTreeMode(mode) {
    const isList = mode === "list";

    document.getElementById("tree-characters-deck").style.display = isList ? "block" : "none";
    document.getElementById("tree-canvas-container").style.display = isList ? "none" : "block";

    document.getElementById("btn-tree-mode-list").className = isList
        ? "submit-action-btn"
        : "back-link-btn";

    document.getElementById("btn-tree-mode-canvas").className = isList
        ? "back-link-btn"
        : "submit-action-btn";

    if (!isList) {
        renderCharacterCanvasGraph();
    }
}

function renderCharacterCanvasGraph() {
    const canvas = document.getElementById("char-graph-canvas");
    const context = canvas.getContext("2d");

    context.clearRect(0, 0, canvas.width, canvas.height);

    if (currentLoadedChars.length === 0) {
        context.fillStyle = "#8ea8c3";
        context.font = "14px sans-serif";
        context.textAlign = "center";
        context.fillText("Нет персонажей для построения схемы", canvas.width / 2, canvas.height / 2);
        return;
    }

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 110;
    const positions = [];

    currentLoadedChars.forEach((character, index) => {
        const angle = (index * 2 * Math.PI) / currentLoadedChars.length;
        positions.push({
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle),
            character
        });
    });

    context.strokeStyle = "rgba(255, 185, 21, 0.4)";
    context.lineWidth = 2;

    for (let first = 0; first < positions.length; first++) {
        for (let second = first + 1; second < positions.length; second++) {
            context.beginPath();
            context.moveTo(positions[first].x, positions[first].y);
            context.lineTo(positions[second].x, positions[second].y);
            context.stroke();
        }
    }

    positions.forEach(position => {
        context.beginPath();
        context.arc(position.x, position.y, 24, 0, 2 * Math.PI);
        context.fillStyle = "#002A45";
        context.fill();
        context.strokeStyle = "#FFB915";
        context.lineWidth = 2;
        context.stroke();

        context.fillStyle = "#FFFFFF";
        context.font = "bold 11px sans-serif";
        context.textAlign = "center";
        context.fillText(position.character.name.split(" ")[0], position.x, position.y + 4);
    });
}

// ---------- ПИСАТЕЛЬ ----------

async function loadWriterBooks() {
    const container = document.getElementById("writer-shelves");

    if (!isWriter()) {
        container.innerHTML = `<p style="padding:20px;">Раздел доступен только писателю.</p>`;
        return;
    }

    container.innerHTML = `<div class="catalog-loading">Загрузка книг…</div>`;

    try {
        const response = await fetch(
            `/api/writer/books?user_id=${currentUser.user_id}`
        );

        if (!response.ok) {
            container.innerHTML = `<p style="padding:20px;">Не удалось загрузить ваши книги.</p>`;
            return;
        }

        const books = await response.json();
        container.innerHTML = "";

        if (books.length === 0) {
            container.innerHTML = `
                <div class="writer-shelf-block">
                    <div class="books-row">
                        <div class="writer-empty-shelf">
                            У вас пока нет книг. Нажмите «Писать», чтобы создать первую.
                        </div>
                    </div>

                    <div class="wood-shelf">
                        <div class="shelf-left-edge"></div>
                        <div class="shelf-front-wood"></div>
                        <div class="shelf-right-edge"></div>
                    </div>
                </div>
            `;
            return;
        }

        const booksPerShelf = 6;

        for (let i = 0; i < books.length; i += booksPerShelf) {
            const shelfBooks = books.slice(i, i + booksPerShelf);

            const shelfBlock = document.createElement("div");
            shelfBlock.className = "writer-shelf-block";

            const booksRow = document.createElement("div");
            booksRow.className = "books-row";

            shelfBooks.forEach(book => {
                const spine = document.createElement("div");
                spine.className = "spine-book";

                spine.innerHTML = `
                    <span>${book.title}</span>

                    <div class="spine-hover-card">
                        <h4 style="color:var(--accent); font-size:13px;">${book.title}</h4>
                        <p style="font-size:11px;">Статус: ${book.status}</p>
                    </div>
                `;

                booksRow.appendChild(spine);
            });

            const woodShelf = document.createElement("div");
            woodShelf.className = "wood-shelf";
            woodShelf.innerHTML = `
                <div class="shelf-left-edge"></div>
                <div class="shelf-front-wood"></div>
                <div class="shelf-right-edge"></div>
            `;

            shelfBlock.appendChild(booksRow);
            shelfBlock.appendChild(woodShelf);
            container.appendChild(shelfBlock);
        }
    } catch (error) {
        container.innerHTML = `<p style="padding:20px;">Не удалось загрузить ваши книги.</p>`;
    }
}

function openNewBookModal() {
    if (!isWriter()) {
        alert("Создание книг доступно только писателю.");
        return;
    }

    toggleWriterDrawer();
    document.getElementById("new-book-modal").style.display = "flex";
}

function openCharacterBuilderModal() {
    if (!isWriter()) {
        alert("Создание персонажей доступно только писателю.");
        return;
    }

    toggleWriterDrawer();
    document.getElementById("char-builder-modal").style.display = "flex";
}

function openFullscreenEditor() {
    if (!isWriter()) {
        alert("Редактор глав доступен только писателю.");
        return;
    }

    toggleWriterDrawer();
    navigate("editor-view");
}

async function handleCreateChar(event) {
    event.preventDefault();

    if (!isWriter()) {
        alert("Создание персонажей доступно только писателю.");
        return;
    }

    const name = document.getElementById("cb-name").value;
    const role = document.getElementById("cb-role").value;
    const chapter = parseInt(document.getElementById("cb-chapter").value);
    const bio = document.getElementById("cb-bio").value;

    const characterResponse = await fetch(
        `/api/characters?user_id=${currentUser.user_id}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                book_id: currentBook ? currentBook.id : 1,
                name,
                role_title: role
            })
        }
    );

    const characterResult = await characterResponse.json();

    if (!characterResponse.ok) {
        alert(characterResult.detail || "Не удалось добавить персонажа");
        return;
    }

    await fetch(`/api/characters/bio-event?user_id=${currentUser.user_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            character_id: characterResult.character_id,
            chapter_number: chapter,
            bio_snippet: bio
        })
    });

    alert("Персонаж добавлен в древо.");
    closeCharacterBuilderModal();
}

function closeCharacterBuilderModal() {
    document.getElementById("char-builder-modal").style.display = "none";
}

function loadBookCreatePage() {
    if (!isWriter()) {
        alert("Создание книг доступно только писателю.");
        navigate("writer-view");
        return;
    }
}

async function handleCreateBookWithFiles() {
    if (!isWriter()) {
        alert("Создание книг доступно только писателю.");
        return;
    }

    const title = document.getElementById("bc-title").value.trim();
    const genreId = document.getElementById("bc-genre").value;
    const price = document.getElementById("bc-price").value;
    const hashtags = document.getElementById("bc-tags").value;
    const description = document.getElementById("bc-desc").value.trim();

    const documentFile = document.getElementById("bc-document-file").files[0];
    const coverFile = document.getElementById("bc-cover-file").files[0];
    const audioFile = document.getElementById("bc-audio-file").files[0];
    const musicFile = document.getElementById("bc-music-file").files[0];

    if (!title || !description) {
        alert("Заполните название и описание книги.");
        return;
    }

    if (!documentFile) {
        alert("Прикрепите Word-файл с информацией и первой главой.");
        return;
    }

    const formData = new FormData();

    formData.append("title", title);
    formData.append("genre_id", genreId);
    formData.append("price", price);
    formData.append("hashtags", hashtags);
    formData.append("description", description);
    formData.append("document_file", documentFile);

    if (coverFile) {
        formData.append("cover_file", coverFile);
    }

    if (audioFile) {
        formData.append("audio_file", audioFile);
    }

    if (musicFile) {
        formData.append("music_file", musicFile);
    }

    const response = await fetch(
        `/api/writer/upload-book?user_id=${currentUser.user_id}`,
        { method: "POST", body: formData }
    );

    const result = await response.json();

    if (!response.ok) {
        alert(result.detail || "Не удалось загрузить книгу");
        return;
    }

    alert(`Книга отправлена на модерацию. Оригинальность: ${result.originality}%`);
    navigate("writer-view");
}

async function handleUploadBookWithFiles(event) {
    event.preventDefault();

    if (!isWriter()) {
        alert("Загрузка книг доступна только писателю.");
        return;
    }

    const formData = new FormData();

    formData.append("title", document.getElementById("nb-title").value);
    formData.append("genre_id", document.getElementById("nb-genre").value);
    formData.append("price", document.getElementById("nb-price").value);
    formData.append("hashtags", document.getElementById("nb-tags").value);
    formData.append("description", document.getElementById("nb-desc").value);

    const documentFile = document.getElementById("nb-document-file").files[0];

    if (documentFile) {
        formData.append("document_file", documentFile);
    }

    const coverFile = document.getElementById("nb-cover-file").files[0];

    if (coverFile) {
        formData.append("cover_file", coverFile);
    }

    const audioFile = document.getElementById("nb-audio-file").files[0];

    if (audioFile) {
        formData.append("audio_file", audioFile);
    }

    const musicFile = document.getElementById("nb-music-file").files[0];

    if (musicFile) {
        formData.append("music_file", musicFile);
    }

    const response = await fetch(
        `/api/writer/upload-book?user_id=${currentUser.user_id}`,
        { method: "POST", body: formData }
    );

    const result = await response.json();

    if (!response.ok) {
        alert(result.detail || "Не удалось загрузить книгу");
        return;
    }

    alert(`Книга отправлена на модерацию. Оригинальность: ${result.originality}%`);
    closeNewBookModal();
    loadWriterBooks();
}

function closeNewBookModal() {
    document.getElementById("new-book-modal").style.display = "none";
}

async function loadChapterCreatePage() {
    const bookSelect = document.getElementById("cc-book-select");

    if (!isWriter()) {
        bookSelect.innerHTML = `<option value="">Раздел доступен только писателю</option>`;
        return;
    }

    bookSelect.innerHTML = `<option value="">Загрузка книг…</option>`;

    const response = await fetch(
        `/api/writer/books?user_id=${currentUser.user_id}`
    );

    if (!response.ok) {
        bookSelect.innerHTML = `<option value="">Не удалось загрузить книги</option>`;
        return;
    }

    const books = await response.json();

    bookSelect.innerHTML = "";

    if (books.length === 0) {
        bookSelect.innerHTML = `<option value="">Сначала создайте книгу</option>`;
        return;
    }

    books.forEach(book => {
        const option = document.createElement("option");
        option.value = book.id;
        option.textContent = book.title;
        bookSelect.appendChild(option);
    });
}

async function handleCreateChapter() {
    if (!isWriter()) {
        alert("Добавление глав доступно только писателю.");
        return;
    }

    const bookId = document.getElementById("cc-book-select").value;
    const chapterNumber = parseInt(
        document.getElementById("cc-chapter-number").value
    );
    const title = document.getElementById("cc-chapter-title").value.trim();
    const content = document.getElementById("cc-chapter-content").value.trim();

    if (!bookId) {
        alert("Выберите книгу.");
        return;
    }

    if (!chapterNumber || chapterNumber < 1) {
        alert("Укажите номер главы.");
        return;
    }

    if (!title || !content) {
        alert("Заполните название и текст главы.");
        return;
    }

    const response = await fetch(
        `/api/chapters?user_id=${currentUser.user_id}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                book_id: parseInt(bookId),
                chapter_number: chapterNumber,
                title,
                content
            })
        }
    );

    if (!response.ok) {
        alert("Не удалось опубликовать главу.");
        return;
    }

    alert("Глава опубликована.");
    navigate("writer-view");
}

async function saveCurrentChapter() {
    if (!isWriter()) {
        alert("Сохранение глав доступно только писателю.");
        return;
    }

    const title = document.getElementById("ed-chap-title").value;
    const content = document.getElementById("ed-chap-body").value;

    if (!title || !content) {
        alert("Заполните заголовок и текст главы.");
        return;
    }

    const response = await fetch(`/api/chapters?user_id=${currentUser.user_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            book_id: currentBook ? currentBook.id : 1,
            chapter_number: currentChapterIndex + 1,
            title,
            content
        })
    });

    if (!response.ok) {
        alert("Не удалось сохранить главу.");
        return;
    }

    alert("Глава сохранена.");
    navigate("writer-view");
}

function exportAuthorAnalytics() {
    if (!isWriter()) {
        alert("Экспорт отчёта доступен только писателю.");
        return;
    }

    window.location.href = `/api/writer/export-stats?user_id=${currentUser.user_id}`;
}

// ---------- ОТЗЫВЫ ----------

async function loadBookReviews(bookId) {
    const reviewsList = document.getElementById("bp-reviews-list");
    reviewsList.innerHTML = "Загрузка отзывов…";

    try {
        const response = await fetch(`/api/books/${bookId}/reviews`);
        const reviews = await response.json();
        reviewsList.innerHTML = "";

        if (reviews.length === 0) {
            reviewsList.innerHTML = `<p style="color:var(--text-muted);">Пока нет отзывов.</p>`;
            return;
        }

        reviews.forEach(review => {
            const reviewCard = document.createElement("div");
            reviewCard.className = "review-card";

            reviewCard.innerHTML = `
                <div style="display:flex; justify-content:space-between;">
                    <strong>${review.user}</strong>
                    <span style="color:#FFB915;">${"★".repeat(review.rating)}</span>
                </div>
                <p style="font-size:14px;">${review.text}</p>
                <small style="color:var(--text-muted);">${review.date}</small>
            `;

            reviewsList.appendChild(reviewCard);
        });
    } catch (error) {
        reviewsList.innerHTML = "";
    }
}

async function handleSendReview(event) {
    event.preventDefault();

    if (!currentUser) {
        openGuestGuard();
        return;
    }

    if (!isReader() && !isWriter()) {
        alert("Оставлять отзывы могут только читатель или писатель.");
        return;
    }

    const rating = parseInt(document.getElementById("rev-rating-input").value);
    const reviewText = document.getElementById("rev-text-input").value;

    const response = await fetch(
        `/api/books/reviews?user_id=${currentUser.user_id}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                book_id: currentBook.id,
                rating,
                review_text: reviewText
            })
        }
    );

    if (!response.ok) {
        alert("Не удалось отправить отзыв.");
        return;
    }

    document.getElementById("rev-text-input").value = "";
    alert("Спасибо за отзыв!");
    loadBookReviews(currentBook.id);
}

// ---------- МОДЕРАЦИЯ ----------

async function loadModerationQueue() {
    const list = document.getElementById("mod-items-list");

    if (!isModerator() && !isAdmin()) {
        list.innerHTML = `<p style="padding:20px;">Раздел доступен только модератору или администратору.</p>`;
        return;
    }

    list.innerHTML = `<div class="catalog-loading">Загрузка заявок…</div>`;

    const response = await fetch(
        `/api/moderator/queue?user_id=${currentUser.user_id}`
    );

    if (!response.ok) {
        list.innerHTML = `<p style="padding:20px;">Нет доступа к очереди модерации.</p>`;
        return;
    }

    const queue = await response.json();
    list.innerHTML = "";

    if (queue.length === 0) {
        list.innerHTML = `<p style="padding:20px;">Нет книг, ожидающих модерации.</p>`;
        return;
    }

    queue.forEach(item => {
        const card = document.createElement("div");
        card.className = "panel-box";

        card.innerHTML = `
            <h3>${item.title}</h3>
            <p>Автор: <strong>${item.author}</strong></p>
            <p>${item.description || ""}</p>
            <p style="color:var(--accent); font-weight:bold;">${item.antiplag || "Оригинальность: 100%"}</p>

            <div style="margin-top:12px; display:flex; gap:10px;">
                <button class="submit-action-btn" style="width:auto;" onclick="decideModeration(${item.book_id}, 'Published')">
                    Одобрить
                </button>
                <button class="back-link-btn" onclick="decideModeration(${item.book_id}, 'Rejected')">
                    Отклонить
                </button>
            </div>
        `;

        list.appendChild(card);
    });
}

async function decideModeration(bookId, status) {
    if (!isModerator() && !isAdmin()) {
        alert("Действие доступно только модератору или администратору.");
        return;
    }

    const response = await fetch(
        `/api/moderator/decide?user_id=${currentUser.user_id}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                book_id: bookId,
                status
            })
        }
    );

    if (!response.ok) {
        alert("Не удалось изменить статус книги.");
        return;
    }

    loadModerationQueue();
}

// ---------- АДМИНИСТРАТОР ----------

async function loadAdminTickets() {
    const list = document.getElementById("admin-tickets-list");

    if (!isAdmin()) {
        list.innerHTML = `<p style="padding:20px;">Раздел доступен только администратору.</p>`;
        return;
    }

    list.innerHTML = `<div class="catalog-loading">Загрузка жалоб…</div>`;

    const response = await fetch(
        `/api/admin/reports?user_id=${currentUser.user_id}`
    );

    if (!response.ok) {
        list.innerHTML = `<p style="padding:20px;">Нет доступа к жалобам.</p>`;
        return;
    }

    const reports = await response.json();
    list.innerHTML = "";

    if (reports.length === 0) {
        list.innerHTML = `<p style="padding:20px;">Открытых жалоб нет.</p>`;
        return;
    }

    reports.forEach(report => {
        const card = document.createElement("div");
        card.className = "panel-box";

        card.innerHTML = `
            <h3 style="color:#e63946;">Жалоба на «${report.title}»</h3>
            <p><strong>От пользователя:</strong> ${report.reporter}</p>
            <p><strong>Причина:</strong> ${report.reason}</p>

            <button
                class="submit-action-btn"
                style="background:#e63946; color:#fff; width:auto; margin-top:10px;"
                onclick="blockBookAdmin(${report.book_id})"
            >Заблокировать книгу</button>
        `;

        list.appendChild(card);
    });
}

async function blockBookAdmin(bookId) {
    if (!isAdmin()) {
        alert("Блокировка доступна только администратору.");
        return;
    }

    if (!confirm("Заблокировать эту книгу?")) {
        return;
    }

    const response = await fetch(
        `/api/admin/books/${bookId}/block?user_id=${currentUser.user_id}`,
        { method: "POST" }
    );

    if (!response.ok) {
        alert("Не удалось заблокировать книгу.");
        return;
    }

    alert("Книга заблокирована.");
    loadAdminTickets();
}

// ---------- ПОДДЕРЖКА ----------

async function handleSendSupportTicket(event) {
    event.preventDefault();

    if (!currentUser) {
        openGuestGuard();
        return;
    }

    if (!isReader() && !isWriter()) {
        alert("Отправка обращений доступна только читателю или писателю.");
        return;
    }

    const category = document.getElementById("sup-category").value;
    const bookTitle = document.getElementById("sup-book-title").value;
    const bookLink = document.getElementById("sup-book-link").value;
    const description = document.getElementById("sup-description").value;

    const response = await fetch(
        `/api/reports?user_id=${currentUser.user_id}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                book_id: currentBook ? currentBook.id : 1,
                reason: `[${category}] Книга: ${bookTitle}. Ссылка: ${bookLink}. Описание: ${description}`
            })
        }
    );

    if (!response.ok) {
        alert("Не удалось отправить обращение.");
        return;
    }

    alert("Обращение отправлено администрации.");
    navigate("catalog-view");
}

// ---------- АВТОРИЗАЦИЯ ----------

function updateAuthUI() {
    const headerStatus = document.getElementById("header-user-status");
    const sidebarProfile = document.getElementById("sidebar-profile-info");
    const logoutButton = document.getElementById("logout-button");

    if (!currentUser) {
        headerStatus.innerHTML = `
            <button
                type="button"
                class="submit-action-btn"
                style="padding:6px 14px; margin:0;"
                onclick="openAuthModal('login')"
            >
                Вход
            </button>
        `;

        sidebarProfile.innerHTML = `
            <div class="sidebar-profile-box" onclick="openAuthModal('login')">
                <h4>Гость</h4>
                <p>Нажмите для входа или регистрации</p>
            </div>
        `;

        if (logoutButton) {
            logoutButton.style.display = "none";
        }

        setMenuVisibility(null);
        return;
    }

    headerStatus.innerHTML = `
        <span
            style="font-weight:bold; color:var(--accent); cursor:pointer;"
            onclick="navigate('profile-view')"
        >
            ${currentUser.username}
        </span>
    `;

    sidebarProfile.innerHTML = `
        <div class="sidebar-profile-box" onclick="navigate('profile-view')">
            <h4>${currentUser.username}</h4>
            <p>Роль: ${currentUser.role_name}</p>
        </div>
    `;

    if (logoutButton) {
        logoutButton.style.display = "block";
    }

    updateProfileDetails();
    setMenuVisibility(currentUser.role_id);
}

function logoutAccount() {
    if (!confirm("Выйти из аккаунта?")) {
        return;
    }

    currentUser = null;
    updateAuthUI();
    navigate("catalog-view");
    alert("Вы вышли из аккаунта.");
}

function setMenuVisibility(roleId) {
    const isGuest = roleId === null || roleId === undefined;

    const menuItems = {
        "nav-dictionary-btn": isGuest || roleId === ROLE_READER || roleId === ROLE_WRITER,
        "nav-writer-books": roleId === ROLE_WRITER,
        "nav-mod-btn": roleId === ROLE_MODERATOR || roleId === ROLE_ADMIN,
        "nav-admin-btn": roleId === ROLE_ADMIN,

        "nav-library-btn": isGuest || roleId === ROLE_READER || roleId === ROLE_WRITER,
        "nav-support-btn": isGuest || roleId === ROLE_READER || roleId === ROLE_WRITER,
        "nav-rules-btn": isGuest || roleId === ROLE_READER || roleId === ROLE_WRITER
    };

    Object.entries(menuItems).forEach(([elementId, isVisible]) => {
        const element = document.getElementById(elementId);

        if (element) {
            element.style.display = isVisible ? "block" : "none";
        }
    });
}

function openAuthModal(tab) {
    document.getElementById("auth-modal").style.display = "flex";
    switchAuthTab(tab);
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = "none";
}

function openGuestGuard() {
    document.getElementById("guest-guard-modal").style.display = "flex";
}

function switchAuthTab(tab) {
    document.getElementById("auth-tab-l").classList.toggle("active", tab === "login");
    document.getElementById("auth-tab-r").classList.toggle("active", tab === "reg");

    document.getElementById("form-login").style.display = tab === "login" ? "block" : "none";
    document.getElementById("form-reg").style.display = tab === "reg" ? "block" : "none";
}

function togglePasswordEye(inputId, button) {
    const input = document.getElementById(inputId);
    input.type = input.type === "password" ? "text" : "password";
    button.style.opacity = input.type === "text" ? "1" : "0.6";
}

async function handleLoginSubmit(event) {
    event.preventDefault();

    const email = document.getElementById("log-email").value;
    const password = document.getElementById("log-pass").value;

    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || "Ошибка авторизации");
        }

        currentUser = result;
        updateAuthUI();
        closeModal("auth-modal");
        navigate("catalog-view");
        loadCatalogBooks();
        alert(`Добро пожаловать, ${currentUser.username}!`);
    } catch (error) {
        alert(error.message);
    }
}

async function handleRegisterSubmit(event) {
    event.preventDefault();

    const password = document.getElementById("reg-pass1").value;
    const repeatedPassword = document.getElementById("reg-pass2").value;

    if (password !== repeatedPassword) {
        alert("Пароли не совпадают.");
        return;
    }

    const payload = {
        username: document.getElementById("reg-name").value,
        email: document.getElementById("reg-email").value,
        password,
        role_id: parseInt(document.getElementById("reg-role-select").value),
        agree_terms: document.getElementById("reg-agree-check").checked
    };

    const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
        alert(result.detail || "Ошибка регистрации");
        return;
    }

    alert("Регистрация выполнена. Теперь войдите в аккаунт.");
    switchAuthTab("login");
}

// ---------- НАСТРОЙКИ ----------

function toggleReaderSettings() {
    const panel = document.getElementById("reader-settings-panel");
    panel.style.display = panel.style.display === "none" ? "block" : "none";
}

function setReadingTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
}

function setAppTheme(theme) {
    const selectedTheme = theme === "light" ? "light" : "dark";

    document.documentElement.setAttribute("data-theme", selectedTheme);

    try {
        localStorage.setItem("foliant_app_theme", selectedTheme);
    } catch (error) {
        console.warn("Не удалось сохранить тему оформления.", error);
    }

    document.querySelectorAll("[data-app-theme]").forEach(button => {
        const isSelected = button.dataset.appTheme === selectedTheme;
        button.setAttribute("aria-pressed", String(isSelected));
    });
}

function adjustFontSize(step) {
    const readerText = document.getElementById("rp-text-content");
    const currentSize = parseInt(window.getComputedStyle(readerText).fontSize);
    const newSize = Math.max(14, Math.min(30, currentSize + step));

    readerText.style.fontSize = `${newSize}px`;
}

function copyBookLink() {
    navigator.clipboard.writeText(window.location.href);
    alert("Ссылка скопирована.");
}

function openRulesModal() {
    document.getElementById("rules-modal").style.display = "flex";
}

// ---------- СМАРТ ТВ ----------

let tvFocusableElements = [];
let currentTvFocusIndex = 0;

function initTvKeyNavigation() {
    window.addEventListener("keydown", event => {
        const supportedKeys = [
            "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Enter"
        ];

        if (!supportedKeys.includes(event.key)) {
            return;
        }

        tvFocusableElements = Array.from(
            document.querySelectorAll(
                ".view-screen.active button, .view-screen.active input, .view-screen.active .spine-book"
            )
        ).filter(element => element.offsetParent !== null);

        if (tvFocusableElements.length === 0) {
            return;
        }

        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            currentTvFocusIndex = (currentTvFocusIndex + 1) % tvFocusableElements.length;
            tvFocusableElements[currentTvFocusIndex].focus();
        }

        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            currentTvFocusIndex = (currentTvFocusIndex - 1 + tvFocusableElements.length) % tvFocusableElements.length;
            tvFocusableElements[currentTvFocusIndex].focus();
        }

        if (event.key === "Enter" && document.activeElement) {
            document.activeElement.click();
        }
    });
}

function updateProfileDetails() {
    const roleNames = {
        1: "Читатель",
        2: "Писатель",
        3: "Модератор",
        4: "Администратор"
    };

    const values = {
        "pf-name": currentUser?.username || "—",
        "pf-role": currentUser
            ? roleNames[Number(currentUser.role_id)] || "Неизвестная роль"
            : "—",
        "pf-email": currentUser?.email || "—"
    };

    Object.entries(values).forEach(([id, value]) => {
        const element = document.getElementById(id);

        if (element) {
            element.textContent = value;
        }
    });
}

// ---------- ЗАМЕТКИ ПИСАТЕЛЯ ----------

function switchChapterCreateTab(mode) {
    const isChapter = mode === "chapter";

    document.getElementById("tab-chapter").classList.toggle("active", isChapter);
    document.getElementById("tab-notes").classList.toggle("active", !isChapter);

    document.getElementById("chapter-create-form").style.display = isChapter ? "block" : "none";
    document.getElementById("writer-notes-panel").style.display = isChapter ? "none" : "block";
}

async function loadWriterNotes() {
    if (!isWriter()) {
        return;
    }

    const editor = document.getElementById("writer-notes-editor");

    try {
        const response = await fetch(
            `/api/writer/notes?user_id=${currentUser.user_id}`
        );

        if (!response.ok) {
            return;
        }

        const result = await response.json();
        editor.innerHTML = result.content || "";
    } catch (error) {
        console.warn("Не удалось загрузить заметки писателя.", error);
    }
}

async function saveWriterNotes() {
    if (!isWriter()) {
        alert("Заметки доступны только писателю.");
        return;
    }

    const content = document.getElementById("writer-notes-editor").innerHTML;

    const response = await fetch(
        `/api/writer/notes?user_id=${currentUser.user_id}`,
        {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                content: content
            })
        }
    );

    if (!response.ok) {
        alert("Не удалось сохранить заметки.");
        return;
    }

    alert("Заметки сохранены.");
}

function applyWriterNoteStyle(style) {
    const editor = document.getElementById("writer-notes-editor");
    editor.focus();

    const selection = window.getSelection();

    if (!selection || selection.isCollapsed) {
        alert("Сначала выделите текст в заметках.");
        return;
    }

    const colors = {
        yellow: "#FFB915",
        green: "#2A9D8F",
        red: "#E63946"
    };

    if (style === "underline") {
        document.execCommand("underline", false, null);
        return;
    }

    const color = colors[style];

    if (!color) {
        return;
    }

    document.execCommand("hiliteColor", false, color);
}

function clearWriterNoteStyle() {
    const editor = document.getElementById("writer-notes-editor");
    editor.focus();

    document.execCommand("removeFormat", false, null);
}

// ---------- РЕДАКТИРОВАНИЕ КНИГИ ----------

let editingBook = null;
let editingChapter = null;

async function loadBookEditPage() {
    const bookSelect = document.getElementById("be-book-select");

    if (!isWriter()) {
        bookSelect.innerHTML = `<option value="">Раздел доступен только писателю</option>`;
        return;
    }

    bookSelect.innerHTML = `<option value="">Загрузка книг…</option>`;

    const response = await fetch(
        `/api/writer/books?user_id=${currentUser.user_id}`
    );

    if (!response.ok) {
        bookSelect.innerHTML = `<option value="">Не удалось загрузить книги</option>`;
        return;
    }

    const books = await response.json();

    bookSelect.innerHTML = "";

    if (books.length === 0) {
        bookSelect.innerHTML = `<option value="">У вас пока нет книг</option>`;
        return;
    }

    books.forEach(book => {
        const option = document.createElement("option");
        option.value = book.id;
        option.textContent = book.title;
        bookSelect.appendChild(option);
    });
}

async function loadBookForEditing() {
    const bookId = document.getElementById("be-book-select").value;

    if (!bookId) {
        return;
    }

    const chaptersResponse = await fetch(
    `/api/books/${bookId}/chapters?user_id=${currentUser?.user_id || ""}`);
    const chapters = await response.json();

    editingBook = {
        id: parseInt(bookId),
        chapters
    };

    const book = allLoadedBooks.find(item => item.id === editingBook.id);

    document.getElementById("book-edit-fields").style.display = "block";
    document.getElementById("chapter-edit-block").style.display = "none";

    document.getElementById("be-hashtags").value = book?.hashtags || "";
    document.getElementById("be-description").value = book?.description || "";

    const chaptersList = document.getElementById("book-edit-chapters");
    chaptersList.innerHTML = "";

    if (chapters.length === 0) {
        chaptersList.innerHTML = `<p style="color:var(--text-muted);">Главы пока не добавлены.</p>`;
        return;
    }

    chapters.forEach(chapter => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `Глава ${chapter.number}. ${chapter.title}`;

        button.onclick = () => openChapterForEditing(chapter);

        chaptersList.appendChild(button);
    });
}

function openChapterForEditing(chapter) {
    editingChapter = chapter;

    document.getElementById("chapter-edit-block").style.display = "block";
    document.getElementById("chapter-edit-title").innerText =
        `Редактирование главы ${chapter.number}`;

    document.getElementById("ce-chapter-title").value = chapter.title;
    document.getElementById("ce-chapter-content").value = chapter.content;
}

function closeChapterEditor() {
    editingChapter = null;

    document.getElementById("chapter-edit-block").style.display = "none";
}

async function updateChapter() {
    if (!editingChapter) {
        return;
    }

    const title = document.getElementById("ce-chapter-title").value.trim();
    const content = document.getElementById("ce-chapter-content").value.trim();

    if (!title || !content) {
        alert("Заполните название и текст главы.");
        return;
    }

    const response = await fetch(
        `/api/chapters/${editingChapter.id}?user_id=${currentUser.user_id}`,
        {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title,
                content
            })
        }
    );

    if (!response.ok) {
        alert("Не удалось обновить главу.");
        return;
    }

    alert("Глава обновлена.");
    loadBookForEditing();
}

async function updateBookInfo() {
    if (!editingBook) {
        alert("Сначала выберите книгу.");
        return;
    }

    const hashtags = document.getElementById("be-hashtags").value;
    const description = document.getElementById("be-description").value;

    const response = await fetch(
        `/api/books/${editingBook.id}?user_id=${currentUser.user_id}`,
        {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                hashtags,
                description
            })
        }
    );

    if (!response.ok) {
        alert("Не удалось обновить книгу.");
        return;
    }

    alert("Книга обновлена.");
    loadCatalogBooks(true);
}

// ---------- ЗАПУСК ----------

window.addEventListener("DOMContentLoaded", () => {
    let savedTheme = "dark";

    try {
        savedTheme = localStorage.getItem("foliant_app_theme") || "dark";
    } catch (error) {
        console.warn("Не удалось прочитать сохранённую тему.", error);
    }

    setAppTheme(savedTheme);
    setPageType("catalog-view");
    loadCatalogBooks();
    updateAuthUI();
    initTvKeyNavigation();

    const audio = document.getElementById("global-audio-source");

    if (audio) {
        ["play", "pause", "ended", "error", "emptied"].forEach(eventName => {
            audio.addEventListener(eventName, syncAudioButton);
        });

        syncAudioButton();
    }
});