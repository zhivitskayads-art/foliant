from pydantic import BaseModel
from typing import Optional

class UserRegister(BaseModel):
    username: str
    email: str
    password: str
    role_id: int = 1  # 1 = Reader, 2 = Writer
    agree_terms: bool

class UserLogin(BaseModel):
    email: str
    password: str

class BookCreate(BaseModel):
    title: str
    genre_id: int
    description: Optional[str] = None
    hashtags: Optional[str] = None
    cover_url: Optional[str] = None
    audiobook_url: Optional[str] = None
    playlist_url: Optional[str] = None
    price: float = 0.0

class ChapterCreate(BaseModel):
    book_id: int
    chapter_number: int
    title: str
    content: str

class CharacterCreate(BaseModel):
    book_id: int
    name: str
    role_title: Optional[str] = None
    avatar_url: Optional[str] = None

class BioEventCreate(BaseModel):
    character_id: int
    appear_in_chapter: int
    bio_snippet: str

class ModerationDecision(BaseModel):
    book_id: int
    status: str  # 'Published' или 'Rejected'
    rejection_reason: Optional[str] = None

class ReportCreate(BaseModel):
    book_id: int
    reason: str

class NoteCreate(BaseModel):
    chapter_id: int
    selected_text: str
    comment: Optional[str] = None
    color_hex: str = "#FFB915"
    reaction_emoji: Optional[str] = None
    is_underlined: bool = False