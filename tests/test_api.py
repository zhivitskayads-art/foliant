import sys
import os

# Автоматическое добавление корня проекта в пути Python
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_01_index_page_loads():
    """Проверка отдачи HTML-шаблона приложения."""
    response = client.get("/")
    assert response.status_code == 200
    assert "Фолиант" in response.text

def test_02_get_books_catalog():
    """Проверка доступности каталога и корректности структуры книг."""
    response = client.get("/api/books")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    if len(data) > 0:
        book = data[0]
        assert "id" in book
        assert "title" in book
        assert "author" in book
        assert "rating" in book

def test_03_login_validation():
    """Проверка отказа в доступе при неверных данных."""
    response = client.post(
        "/api/auth/login",
        json={"email": "non_existent_user@foliant.ru", "password": "wrongpassword"}
    )
    assert response.status_code == 401
    assert "Неверная почта или пароль" in response.json()["detail"]

def test_04_character_tree_spoiler_filter():
    """Проверка фильтрации фактов персонажей по текущей главе."""
    response = client.get("/api/books/1/character-tree?current_chapter=1")
    assert response.status_code == 200
    data = response.json()
    assert "characters" in data
    # Убеждаемся, что спойлерные факты из 3 главы не попали читателю 1 главы
    for char in data["characters"]:
        for fact in char["bio_timeline"]:
            assert fact["chapter"] <= 1

def test_05_translator_api():
    """Проверка работы встроенного MyMemory переводчика."""
    response = client.get("/api/translate?text=book&pair=en|ru")
    assert response.status_code == 200
    data = response.json()
    assert data["original"] == "book"
    assert "книга" in data["translation"].lower()

def test_06_add_reader_note():
    """Проверка сохранения цитат и заметок в БД."""
    note_payload = {
        "chapter_id": 1,
        "selected_text": "Тестовая цитата из главы",
        "comment": "Заметка создана автотестом",
        "color_hex": "#FFB915"
    }
    response = client.post("/api/notes?user_id=1", json=note_payload)
    assert response.status_code == 200
    assert response.json()["status"] == "success"

def test_07_chapters_retrieval():
    """Проверка получения списка глав книги."""
    response = client.get("/api/books/1/chapters")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_08_writer_analytics_export():
    """Проверка генерации аналитического отчёта писателя в CSV."""
    response = client.get("/api/writer/export-stats?user_id=1")
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert "ID Книги" in response.text