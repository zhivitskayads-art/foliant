import pyodbc
# Пробуем универсальные параметры подключения
def get_db_connection():
    drivers = [
        '{ODBC Driver 17 for SQL Server}',
        '{ODBC Driver 18 for SQL Server}',
        '{SQL Server}'
    ]

    # Список возможных вариантов имени сервера
    server_names = ["localhost\\SQLEXPRESS", ".", "(local)", "localhost"]

    last_err = None
    for driver in drivers:
        for srv in server_names:
            try:
                conn_str = (
                    f"DRIVER={driver};"
                    f"SERVER={srv};"
                    f"DATABASE=FoliantDB;"
                    f"Trusted_Connection=yes;"
                    f"TrustServerCertificate=yes;"
                )
                conn = pyodbc.connect(conn_str, timeout=3)
                return conn
            except Exception as e:
                last_err = e
                continue

    raise RuntimeError(f"Не удалось подключиться к базе данных FoliantDB: {last_err}")