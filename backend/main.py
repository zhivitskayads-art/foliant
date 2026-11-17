import os
import shutil
import requests
import re
import csv
import io
from docx import Document
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form, Query, Depends
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from passlib.context import CryptContext
from pydantic import BaseModel
from typing import Optional, List

from backend.db import get_db_connection

app = FastAPI(title="Фолиант", version="4.0.0")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("static/uploads/covers", exist_ok=True)
os.makedirs("static/uploads/audio", exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Роли: 1 — Читатель, 2 — Писатель, 3 — Модератор, 4 — Администратор
READER = 1
WRITER = 2
MODERATOR = 3
ADMIN = 4


def require_roles(*allowed_roles):
    """Проверяет роль пользователя на сервере перед выполнением запроса."""
    def role_checker(user_id: int = Query(...)):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT r.RoleId
            FROM Users u
            JOIN Roles r ON u.RoleId = r.RoleId
            WHERE u.UserId = ?
            """,
            user_id
        )
        row = cursor.fetchone()
        conn.close()

        if not row:
            raise HTTPException(status_code=401, detail="Пользователь не найден")

        if row.RoleId not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail="У вашей роли нет доступа к этому действию"
            )

        return user_id

    return role_checker


# ---------- СХЕМЫ ДАННЫХ ----------

class UserRegister(BaseModel):
    username: str
    email: str
    password: str
    role_id: int = READER
    agree_terms: bool


class UserLogin(BaseModel):
    email: str
    password: str


class ChapterCreate(BaseModel):
    book_id: int
    chapter_number: int
    title: str
    content: str


class ReviewCreate(BaseModel):
    book_id: int
    rating: int
    review_text: str


class NoteCreate(BaseModel):
    chapter_id: int
    selected_text: str
    comment: Optional[str] = None
    color_hex: str = "#FFB915"


class ReportCreate(BaseModel):
    book_id: int
    reason: str


class ModerationDecision(BaseModel):
    book_id: int
    status: str


class CharacterAdd(BaseModel):
    book_id: int
    name: str
    role_title: str


class BioEventAdd(BaseModel):
    character_id: int
    chapter_number: int
    bio_snippet: str


class CardAdd(BaseModel):
    word: str
    translation: str
    context_sentence: Optional[str] = None

class WriterNoteUpdate(BaseModel):
    content: str

class ChapterUpdate(BaseModel):
    title: str
    content: str


class BookUpdate(BaseModel):
    hashtags: str
    description: str
# ---------- АНТИПЛАГИАТ ----------

def calculate_originality(new_text: str, existing_texts: List[str]) -> float:
    if not existing_texts or not new_text.strip():
        return 100.0

    def tokenize(text):
        return set(re.findall(r"\b\w{4,}\b", text.lower()))

    new_words = tokenize(new_text)
    if not new_words:
        return 100.0

    max_overlap = 0.0
    for existing in existing_texts:
        existing_words = tokenize(existing)
        if existing_words:
            overlap = len(new_words.intersection(existing_words)) / len(new_words)
            max_overlap = max(max_overlap, overlap)

    return max(0.0, min(100.0, round((1 - max_overlap) * 100, 1)))


# ---------- СТРАНИЦЫ ----------

@app.get("/", response_class=HTMLResponse)
def index_page(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")


# ---------- АВТОРИЗАЦИЯ ----------

@app.post("/api/auth/register")
def register(user: UserRegister):
    if user.role_id not in [READER, WRITER]:
        raise HTTPException(
            status_code=403,
            detail="Через регистрацию можно создать только аккаунт читателя или писателя"
        )

    if not user.agree_terms:
        raise HTTPException(status_code=400, detail="Необходимо согласие с правилами сервиса")

    hashed_password = pwd_context.hash(user.password)

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO Users (Username, Email, PasswordHash, RoleId)
            VALUES (?, ?, ?, ?)
            """,
            user.username,
            user.email,
            hashed_password,
            user.role_id
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise HTTPException(status_code=400, detail="Пользователь с таким email уже существует")
    finally:
        conn.close()

    return {"status": "success", "message": "Регистрация выполнена"}


@app.post("/api/auth/login")
def login(user: UserLogin):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT u.UserId, u.Username, u.Email, u.PasswordHash, u.RoleId, r.RoleName
        FROM Users u
        JOIN Roles r ON u.RoleId = r.RoleId
        WHERE u.Email = ?
        """,
        user.email
    )
    row = cursor.fetchone()
    conn.close()

    if not row or not pwd_context.verify(user.password, row.PasswordHash):
        raise HTTPException(status_code=401, detail="Неверная почта или пароль")

    return {
        "user_id": row.UserId,
        "username": row.Username,
        "email": row.Email,
        "role_id": row.RoleId,
        "role_name": row.RoleName
    }


# ---------- КАТАЛОГ ----------
@app.get("/api/books")
def get_books(user_id: Optional[int] = None):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT
            b.BookId, b.Title, b.Description, b.Hashtags, b.CoverUrl,
            b.AudiobookUrl, b.PlaylistUrl, b.Price,
            b.DownloadCount, b.PurchaseCount,
            u.Username AS AuthorName,
            g.GenreName,
            ISNULL((
                SELECT AVG(CAST(rv.Rating AS FLOAT))
                FROM Reviews rv
                WHERE rv.BookId = b.BookId
            ), 5.0) AS AvgRating,
            (
                SELECT COUNT(rv.ReviewId)
                FROM Reviews rv
                WHERE rv.BookId = b.BookId
            ) AS ReviewCount,
            CASE
                WHEN ? IS NOT NULL AND EXISTS (
                    SELECT 1
                    FROM Notes fav
                    WHERE fav.UserId = ?
                      AND fav.ChapterId = b.BookId
                      AND fav.SelectedText = 'FAVORITE_BOOK'
                )
                THEN 1
                ELSE 0
            END AS IsFavorite,
            CASE
                WHEN ? IS NOT NULL AND EXISTS (
                    SELECT 1
                    FROM Notes lib
                    WHERE lib.UserId = ?
                      AND lib.ChapterId = b.BookId
                      AND lib.SelectedText = 'LIBRARY_BOOK'
                )
                THEN 1
                ELSE 0
            END AS IsInLibrary
        FROM Books b
        JOIN Users u ON b.AuthorId = u.UserId
        JOIN Genres g ON b.GenreId = g.GenreId
        WHERE b.PublicationStatus = 'Published'
        """,
        user_id,
        user_id,
        user_id,
        user_id
    )

    books = []
    for row in cursor.fetchall():
        books.append({
            "id": row.BookId,
            "title": row.Title,
            "description": row.Description,
            "hashtags": row.Hashtags,
            "cover_url": row.CoverUrl,
            "audiobook_url": row.AudiobookUrl,
            "playlist_url": row.PlaylistUrl,
            "price": float(row.Price),
            "downloads": row.DownloadCount,
            "purchases": row.PurchaseCount,
            "author": row.AuthorName,
            "genre": row.GenreName,
            "rating": round(row.AvgRating, 1),
            "reviews_count": row.ReviewCount,
            "is_favorite": bool(row.IsFavorite),
            "is_in_library": bool(row.IsInLibrary)
        })

    conn.close()
    return books

@app.post("/api/books/{book_id}/increment-read")
def increment_read(book_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE Books SET DownloadCount = DownloadCount + 1 WHERE BookId = ?",
        book_id
    )
    conn.commit()
    conn.close()
    return {"status": "success"}


@app.post("/api/books/{book_id}/purchase")
def purchase_book(
    book_id: int,
    user_id: int = Depends(require_roles(READER, WRITER))
):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT Price
        FROM Books
        WHERE BookId = ?
        """,
        book_id
    )

    book = cursor.fetchone()

    if not book:
        conn.close()
        raise HTTPException(status_code=404, detail="Книга не найдена")

    price = float(book.Price or 0)

    if price <= 0:
        conn.close()
        return {
            "status": "free",
            "message": "Эта книга бесплатная."
        }

    cursor.execute(
        """
        SELECT PurchaseId
        FROM Purchases
        WHERE UserId = ? AND BookId = ?
        """,
        user_id,
        book_id
    )

    if cursor.fetchone():
        conn.close()
        return {
            "status": "already_purchased",
            "message": "Эта книга уже куплена."
        }

    cursor.execute(
        """
        INSERT INTO Purchases (UserId, BookId)
        VALUES (?, ?)
        """,
        user_id,
        book_id
    )

    cursor.execute(
        """
        UPDATE Books
        SET PurchaseCount = PurchaseCount + 1
        WHERE BookId = ?
        """,
        book_id
    )

    conn.commit()
    conn.close()

    return {
        "status": "success",
        "message": "Оплата успешно проведена. Книга добавлена в личную библиотеку."
    }


# ---------- ГЛАВЫ ----------

@app.get("/api/books/{book_id}/chapters")
def get_chapters(
    book_id: int,
    user_id: Optional[int] = None
):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT Price
        FROM Books
        WHERE BookId = ?
        """,
        book_id
    )

    book = cursor.fetchone()

    if not book:
        conn.close()
        raise HTTPException(status_code=404, detail="Книга не найдена")

    price = float(book.Price or 0)

    if price > 0:
        if not user_id:
            conn.close()
            raise HTTPException(
                status_code=403,
                detail="Оплатите книгу, чтобы читать."
            )

        cursor.execute(
            """
            SELECT PurchaseId
            FROM Purchases
            WHERE UserId = ? AND BookId = ?
            """,
            user_id,
            book_id
        )

        if not cursor.fetchone():
            conn.close()
            raise HTTPException(
                status_code=403,
                detail="Оплатите книгу, чтобы читать."
            )

    cursor.execute(
        """
        SELECT ChapterId, ChapterNumber, Title, Content
        FROM Chapters
        WHERE BookId = ?
        ORDER BY ChapterNumber ASC
        """,
        book_id
    )

    chapters = [
        {
            "id": row.ChapterId,
            "number": row.ChapterNumber,
            "title": row.Title,
            "content": row.Content
        }
        for row in cursor.fetchall()
    ]

    conn.close()
    return chapters

@app.post("/api/chapters")
def create_chapter(
    chapter: ChapterCreate,
    user_id: int = Depends(require_roles(WRITER))
):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO Chapters (BookId, ChapterNumber, Title, Content)
        VALUES (?, ?, ?, ?)
        """,
        chapter.book_id,
        chapter.chapter_number,
        chapter.title,
        chapter.content
    )
    conn.commit()
    conn.close()
    return {"status": "success"}


# ---------- ПИСАТЕЛЬ ----------

@app.get("/api/writer/books")
def get_writer_books(user_id: int = Depends(require_roles(WRITER))):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT BookId, Title, PublicationStatus, RejectionReason, CreatedAt
        FROM Books
        WHERE AuthorId = ?
        """,
        user_id
    )

    books = [
        {
            "id": row.BookId,
            "title": row.Title,
            "status": row.PublicationStatus,
            "note": row.RejectionReason,
            "date": row.CreatedAt.strftime("%d.%m.%Y")
        }
        for row in cursor.fetchall()
    ]

    conn.close()
    return books

@app.post("/api/writer/upload-book")
async def upload_book_with_media(
    user_id: int = Depends(require_roles(WRITER)),
    title: str = Form(...),
    genre_id: int = Form(...),
    description: str = Form(""),
    hashtags: str = Form(""),
    price: float = Form(0.0),
    document_file: Optional[UploadFile] = File(None),
    cover_file: Optional[UploadFile] = File(None),
    audio_file: Optional[UploadFile] = File(None),
    music_file: Optional[UploadFile] = File(None)
):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT Content FROM Chapters")
    existing_texts = [row.Content for row in cursor.fetchall()]

    document_text = ""

    if document_file and document_file.filename:
        try:
            document_content = await document_file.read()
            word_document = Document(io.BytesIO(document_content))

            document_text = "\n".join(
                paragraph.text
                for paragraph in word_document.paragraphs
                if paragraph.text.strip()
            )
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Не удалось прочитать Word-файл. Загрузите документ в формате .docx"
            )

    originality = calculate_originality(document_text, existing_texts)

    cover_url = None
    audiobook_url = None
    playlist_url = None

    if cover_file and cover_file.filename:
        filename = f"cover_{user_id}_{cover_file.filename}"
        path = os.path.join("static/uploads/covers", filename)

        with open(path, "wb") as buffer:
            shutil.copyfileobj(cover_file.file, buffer)

        cover_url = f"/static/uploads/covers/{filename}"

    if audio_file and audio_file.filename:
        filename = f"audio_{user_id}_{audio_file.filename}"
        path = os.path.join("static/uploads/audio", filename)

        with open(path, "wb") as buffer:
            shutil.copyfileobj(audio_file.file, buffer)

        audiobook_url = f"/static/uploads/audio/{filename}"

    if music_file and music_file.filename:
        filename = f"music_{user_id}_{music_file.filename}"
        path = os.path.join("static/uploads/audio", filename)

        with open(path, "wb") as buffer:
            shutil.copyfileobj(music_file.file, buffer)

        playlist_url = f"/static/uploads/audio/{filename}"

    antiplagiarism_note = f"Оригинальность текста: {originality}%"

    cursor.execute(
        """
        INSERT INTO Books
            (AuthorId, GenreId, Title, Description, Hashtags, CoverUrl,
             AudiobookUrl, PlaylistUrl, Price, PublicationStatus, RejectionReason)
        OUTPUT INSERTED.BookId
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PendingModeration', ?)
        """,
        user_id,
        genre_id,
        title,
        description,
        hashtags,
        cover_url,
        audiobook_url,
        playlist_url,
        price,
        antiplagiarism_note
    )

    book_id = cursor.fetchone()[0]

    if document_text.strip():
        cursor.execute(
            """
            INSERT INTO Chapters (BookId, ChapterNumber, Title, Content)
            VALUES (?, 1, N'Глава 1', ?)
            """,
            book_id,
            document_text
        )

    conn.commit()
    conn.close()

    return {
        "status": "success",
        "book_id": book_id,
        "originality": originality
    }

@app.get("/api/writer/export-stats")
def export_writer_stats(user_id: int = Depends(require_roles(WRITER))):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT
            b.BookId, b.Title, g.GenreName, b.Price,
            b.DownloadCount, b.PurchaseCount,
            (b.Price * b.PurchaseCount) AS TotalRevenue,
            ISNULL((
                SELECT AVG(CAST(rv.Rating AS FLOAT))
                FROM Reviews rv
                WHERE rv.BookId = b.BookId
            ), 5.0) AS AvgRating
        FROM Books b
        JOIN Genres g ON b.GenreId = g.GenreId
        WHERE b.AuthorId = ?
        """,
        user_id
    )
    rows = cursor.fetchall()
    conn.close()

    output = io.StringIO()
    output.write("﻿")
    writer = csv.writer(output, delimiter=";")
    writer.writerow([
        "ID книги", "Название", "Жанр", "Цена",
        "Прочтений", "Покупок", "Выручка", "Средний рейтинг"
    ])

    for row in rows:
        writer.writerow([
            row.BookId,
            row.Title,
            row.GenreName,
            float(row.Price),
            row.DownloadCount,
            row.PurchaseCount,
            float(row.TotalRevenue),
            round(row.AvgRating, 2)
        ])

    output.seek(0)
    response = StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8-sig")),
        media_type="text/csv"
    )
    response.headers["Content-Disposition"] = "attachment; filename=author_sales_report.csv"
    return response


# ---------- ПЕРСОНАЖИ ----------

@app.post("/api/characters")
def add_character(
    character: CharacterAdd,
    user_id: int = Depends(require_roles(WRITER))
):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO Characters (BookId, Name, RoleTitle)
        OUTPUT INSERTED.CharacterId
        VALUES (?, ?, ?)
        """,
        character.book_id,
        character.name,
        character.role_title
    )
    character_id = cursor.fetchone()[0]
    conn.commit()
    conn.close()

    return {"status": "success", "character_id": character_id}


@app.post("/api/characters/bio-event")
def add_bio_event(
    event: BioEventAdd,
    user_id: int = Depends(require_roles(WRITER))
):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO CharacterBioEvents
            (CharacterId, AppearInChapterNumber, BioSnippet)
        VALUES (?, ?, ?)
        """,
        event.character_id,
        event.chapter_number,
        event.bio_snippet
    )
    conn.commit()
    conn.close()
    return {"status": "success"}


@app.get("/api/books/{book_id}/character-tree")
def character_tree(book_id: int, current_chapter: int = 1):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT CharacterId, Name, RoleTitle
        FROM Characters
        WHERE BookId = ?
        """,
        book_id
    )

    characters = {
        row.CharacterId: {
            "id": row.CharacterId,
            "name": row.Name,
            "role": row.RoleTitle,
            "bio_timeline": []
        }
        for row in cursor.fetchall()
    }

    cursor.execute(
        """
        SELECT e.CharacterId, e.AppearInChapterNumber, e.BioSnippet
        FROM CharacterBioEvents e
        JOIN Characters c ON e.CharacterId = c.CharacterId
        WHERE c.BookId = ? AND e.AppearInChapterNumber <= ?
        ORDER BY e.AppearInChapterNumber ASC
        """,
        book_id,
        current_chapter
    )

    for row in cursor.fetchall():
        if row.CharacterId in characters:
            characters[row.CharacterId]["bio_timeline"].append({
                "chapter": row.AppearInChapterNumber,
                "snippet": row.BioSnippet
            })

    conn.close()
    return {"characters": list(characters.values())}


# ---------- БИБЛИОТЕКА И ИЗБРАННОЕ ----------

@app.post("/api/library/toggle-favorite")
def toggle_favorite(
    book_id: int,
    user_id: int = Depends(require_roles(READER, WRITER))
):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT 1 FROM Notes
        WHERE UserId = ? AND ChapterId = ? AND SelectedText = 'FAVORITE_BOOK'
        """,
        user_id,
        book_id
    )
    exists = cursor.fetchone()

    if exists:
        cursor.execute(
            """
            DELETE FROM Notes
            WHERE UserId = ? AND ChapterId = ? AND SelectedText = 'FAVORITE_BOOK'
            """,
            user_id,
            book_id
        )
        is_favorite = False
    else:
        cursor.execute(
            """
            INSERT INTO Notes (UserId, ChapterId, SelectedText, Comment)
            VALUES (?, ?, 'FAVORITE_BOOK', 'FAV')
            """,
            user_id,
            book_id
        )
        is_favorite = True

    conn.commit()
    conn.close()

    return {
        "status": "success",
        "is_favorite": is_favorite
    }


@app.post("/api/library/add-book")
def add_book_to_library(
    book_id: int,
    user_id: int = Depends(require_roles(READER, WRITER))
):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT 1 FROM Notes
        WHERE UserId = ? AND ChapterId = ? AND SelectedText = 'LIBRARY_BOOK'
        """,
        user_id,
        book_id
    )
    exists = cursor.fetchone()

    if exists:
        conn.close()
        return {
            "status": "success",
            "message": "Эта книга уже есть в вашей библиотеке."
        }

    cursor.execute(
        """
        INSERT INTO Notes (UserId, ChapterId, SelectedText, Comment)
        VALUES (?, ?, 'LIBRARY_BOOK', 'LIBRARY')
        """,
        user_id,
        book_id
    )

    conn.commit()
    conn.close()

    return {
        "status": "success",
        "message": "Книга добавлена в вашу библиотеку."
    }


@app.get("/api/library")
def get_user_library(
    user_id: int = Depends(require_roles(READER, WRITER)),
    mode: str = "all"
):
    conn = get_db_connection()
    cursor = conn.cursor()

    if mode == "fav":
        cursor.execute(
            """
            SELECT
                b.BookId, b.Title, b.Description,
                u.Username AS AuthorName, g.GenreName,
                1 AS IsFavorite,
                CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM Notes lib
                        WHERE lib.UserId = ?
                          AND lib.ChapterId = b.BookId
                          AND lib.SelectedText = 'LIBRARY_BOOK'
                    )
                    THEN 1
                    ELSE 0
                END AS IsInLibrary
            FROM Books b
            JOIN Users u ON b.AuthorId = u.UserId
            JOIN Genres g ON b.GenreId = g.GenreId
            JOIN Notes fav ON
                fav.ChapterId = b.BookId
                AND fav.UserId = ?
                AND fav.SelectedText = 'FAVORITE_BOOK'
            WHERE b.PublicationStatus = 'Published'
            """,
            user_id,
            user_id
        )
    else:
        cursor.execute(
            """
            SELECT
                b.BookId, b.Title, b.Description,
                u.Username AS AuthorName, g.GenreName,
                CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM Notes fav
                        WHERE fav.UserId = ?
                          AND fav.ChapterId = b.BookId
                          AND fav.SelectedText = 'FAVORITE_BOOK'
                    )
                    THEN 1
                    ELSE 0
                END AS IsFavorite,
                1 AS IsInLibrary
            FROM Books b
            JOIN Users u ON b.AuthorId = u.UserId
            JOIN Genres g ON b.GenreId = g.GenreId
            JOIN Notes lib ON
                lib.ChapterId = b.BookId
                AND lib.UserId = ?
                AND lib.SelectedText = 'LIBRARY_BOOK'
            WHERE b.PublicationStatus = 'Published'
            """,
            user_id,
            user_id
        )

    books = [
        {
            "id": row.BookId,
            "title": row.Title,
            "description": row.Description,
            "author": row.AuthorName,
            "genre": row.GenreName,
            "is_favorite": bool(row.IsFavorite),
            "is_in_library": bool(row.IsInLibrary)
        }
        for row in cursor.fetchall()
    ]

    conn.close()
    return books

# ---------- ОТЗЫВЫ ----------

@app.get("/api/books/{book_id}/reviews")
def get_reviews(book_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT rv.Rating, rv.ReviewText, rv.CreatedAt, u.Username
        FROM Reviews rv
        JOIN Users u ON rv.UserId = u.UserId
        WHERE rv.BookId = ?
        ORDER BY rv.CreatedAt DESC
        """,
        book_id
    )

    reviews = [
        {
            "rating": row.Rating,
            "text": row.ReviewText,
            "date": row.CreatedAt.strftime("%d.%m.%Y"),
            "user": row.Username
        }
        for row in cursor.fetchall()
    ]

    conn.close()
    return reviews


@app.post("/api/books/reviews")
def add_review(
    review: ReviewCreate,
    user_id: int = Depends(require_roles(READER, WRITER))
):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO Reviews (BookId, UserId, Rating, ReviewText)
        VALUES (?, ?, ?, ?)
        """,
        review.book_id,
        user_id,
        review.rating,
        review.review_text
    )
    conn.commit()
    conn.close()
    return {"status": "success"}


# ---------- ЗАМЕТКИ ----------

@app.get("/api/chapters/{chapter_id}/notes")
def get_chapter_notes(
    chapter_id: int,
    user_id: int = Depends(require_roles(READER, WRITER))
):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT NoteId, SelectedText, Comment, ColorHex
        FROM Notes
        WHERE ChapterId = ?
          AND UserId = ?
          AND SelectedText NOT LIKE 'FAVORITE%'
          AND SelectedText NOT LIKE 'FLASHCARD%'
        """,
        chapter_id,
        user_id
    )

    notes = [
        {
            "id": row.NoteId,
            "text": row.SelectedText,
            "comment": row.Comment,
            "color": row.ColorHex
        }
        for row in cursor.fetchall()
    ]

    conn.close()
    return notes


@app.post("/api/notes")
def add_note(
    note: NoteCreate,
    user_id: int = Depends(require_roles(READER, WRITER))
):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO Notes (UserId, ChapterId, SelectedText, Comment, ColorHex)
        VALUES (?, ?, ?, ?, ?)
        """,
        user_id,
        note.chapter_id,
        note.selected_text,
        note.comment,
        note.color_hex
    )
    conn.commit()
    conn.close()
    return {"status": "success"}

@app.delete("/api/chapters/{chapter_id}/notes/{note_id}")
def delete_note(
    chapter_id: int,
    note_id: int,
    user_id: int = Depends(require_roles(READER, WRITER))
):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        DELETE FROM Notes
        WHERE NoteId = ?
          AND ChapterId = ?
          AND UserId = ?
        """,
        note_id,
        chapter_id,
        user_id
    )

    conn.commit()
    conn.close()

    return {"status": "deleted"}
# ---------- ПЕРЕВОДЧИК ----------

@app.get("/api/translate")
def translate(text: str, pair: str = "en|ru"):
    try:
        url = f"https://api.mymemory.translated.net/get?q={text}&langpair={pair}"
        data = requests.get(url, timeout=5).json()
        translation = data.get("responseData", {}).get("translatedText", "Перевод не найден")
    except Exception:
        translation = "Словарь временно недоступен"

    return {"original": text, "translation": translation}


# ---------- КАРТОЧКИ ----------

@app.post("/api/dictionary/cards")
def add_flashcard(
    card: CardAdd,
    user_id: int = Depends(require_roles(READER, WRITER))
):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO Notes (UserId, ChapterId, SelectedText, Comment, ColorHex)
        VALUES (?, 1, ?, ?, '#2A9D8F')
        """,
        user_id,
        f"FLASHCARD:{card.word}",
        f"{card.translation} | {card.context_sentence or ''}"
    )
    conn.commit()
    conn.close()
    return {"status": "success"}


@app.get("/api/dictionary/cards")
def get_flashcards(user_id: int = Depends(require_roles(READER, WRITER))):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT NoteId, SelectedText, Comment
        FROM Notes
        WHERE UserId = ? AND SelectedText LIKE 'FLASHCARD:%'
        """,
        user_id
    )

    cards = []
    for row in cursor.fetchall():
        word = row.SelectedText.replace("FLASHCARD:", "")
        parts = row.Comment.split("|") if row.Comment else ["", ""]
        cards.append({
            "id": row.NoteId,
            "word": word,
            "translation": parts[0].strip(),
            "context": parts[1].strip() if len(parts) > 1 else ""
        })

    conn.close()
    return cards


# ---------- МОДЕРАТОР ----------

@app.get("/api/moderator/queue")
def moderation_queue(user_id: int = Depends(require_roles(MODERATOR, ADMIN))):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT b.BookId, b.Title, b.Description, b.RejectionReason, u.Username AS AuthorName
        FROM Books b
        JOIN Users u ON b.AuthorId = u.UserId
        WHERE b.PublicationStatus = 'PendingModeration'
        """
    )

    queue = [
        {
            "book_id": row.BookId,
            "title": row.Title,
            "description": row.Description,
            "antiplag": row.RejectionReason,
            "author": row.AuthorName
        }
        for row in cursor.fetchall()
    ]

    conn.close()
    return queue


@app.post("/api/moderator/decide")
def moderation_decision(
    decision: ModerationDecision,
    user_id: int = Depends(require_roles(MODERATOR, ADMIN))
):
    if decision.status not in ["Published", "Rejected"]:
        raise HTTPException(status_code=400, detail="Недопустимый статус")

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE Books SET PublicationStatus = ? WHERE BookId = ?",
        decision.status,
        decision.book_id
    )
    conn.commit()
    conn.close()
    return {"status": "success"}


# ---------- АДМИНИСТРАТОР ----------

@app.post("/api/reports")
def add_report(
    report: ReportCreate,
    user_id: int = Depends(require_roles(READER, WRITER))
):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO Reports (BookId, ReporterUserId, Reason)
        VALUES (?, ?, ?)
        """,
        report.book_id,
        user_id,
        report.reason
    )
    conn.commit()
    conn.close()
    return {"status": "success"}


@app.get("/api/admin/reports")
def admin_reports(user_id: int = Depends(require_roles(ADMIN))):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT r.ReportId, r.BookId, b.Title, r.Reason, u.Username AS Reporter
        FROM Reports r
        JOIN Books b ON r.BookId = b.BookId
        JOIN Users u ON r.ReporterUserId = u.UserId
        WHERE r.Status = 'Open'
        """
    )

    reports = [
        {
            "report_id": row.ReportId,
            "book_id": row.BookId,
            "title": row.Title,
            "reason": row.Reason,
            "reporter": row.Reporter
        }
        for row in cursor.fetchall()
    ]

    conn.close()
    return reports


@app.post("/api/admin/books/{book_id}/block")
def block_book(
    book_id: int,
    user_id: int = Depends(require_roles(ADMIN))
):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE Books SET PublicationStatus = 'Blocked' WHERE BookId = ?",
        book_id
    )
    cursor.execute(
        "UPDATE Reports SET Status = 'Resolved' WHERE BookId = ?",
        book_id
    )
    conn.commit()
    conn.close()
    return {"status": "success"}

@app.get("/api/writer/notes")
def get_writer_note(
    user_id: int = Depends(require_roles(WRITER))
):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT Content
        FROM WriterNotes
        WHERE UserId = ?
        """,
        user_id
    )

    row = cursor.fetchone()
    conn.close()

    return {
        "content": row.Content if row else ""
    }


@app.put("/api/writer/notes")
def update_writer_note(
    note: WriterNoteUpdate,
    user_id: int = Depends(require_roles(WRITER))
):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT NoteId
        FROM WriterNotes
        WHERE UserId = ?
        """,
        user_id
    )

    row = cursor.fetchone()

    if row:
        cursor.execute(
            """
            UPDATE WriterNotes
            SET Content = ?, UpdatedAt = SYSUTIMESTAMP
            WHERE UserId = ?
            """,
            note.content,
            user_id
        )
    else:
        cursor.execute(
            """
            INSERT INTO WriterNotes (UserId, Content)
            VALUES (?, ?)
            """,
            user_id,
            note.content
        )

    conn.commit()
    conn.close()

    return {"status": "success"}

@app.put("/api/chapters/{chapter_id}")
def update_chapter(
    chapter_id: int,
    chapter: ChapterUpdate,
    user_id: int = Depends(require_roles(WRITER))
):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT c.ChapterId
        FROM Chapters c
        JOIN Books b ON c.BookId = b.BookId
        WHERE c.ChapterId = ? AND b.AuthorId = ?
        """,
        chapter_id,
        user_id
    )

    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=403, detail="Это не ваша глава")

    cursor.execute(
        """
        UPDATE Chapters
        SET Title = ?, Content = ?
        WHERE ChapterId = ?
        """,
        chapter.title,
        chapter.content,
        chapter_id
    )

    conn.commit()
    conn.close()

    return {"status": "success"}


@app.put("/api/books/{book_id}")
def update_book(
    book_id: int,
    book: BookUpdate,
    user_id: int = Depends(require_roles(WRITER))
):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT BookId
        FROM Books
        WHERE BookId = ? AND AuthorId = ?
        """,
        book_id,
        user_id
    )

    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=403, detail="Это не ваша книга")

    cursor.execute(
        """
        UPDATE Books
        SET Hashtags = ?, Description = ?
        WHERE BookId = ?
        """,
        book.hashtags,
        book.description,
        book_id
    )

    conn.commit()
    conn.close()

    return {"status": "success"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)