from config import normalize_database_url


def test_bare_postgres_schemes_get_the_psycopg_driver():
    # Render, Heroku and others hand out postgres:// URLs, which SQLAlchemy rejects.
    assert normalize_database_url("postgres://u:p@h:5432/db") == "postgresql+psycopg://u:p@h:5432/db"
    assert normalize_database_url("postgresql://u:p@h/db") == "postgresql+psycopg://u:p@h/db"


def test_explicit_drivers_and_sqlite_are_unchanged():
    assert normalize_database_url("postgresql+psycopg://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    assert normalize_database_url("postgresql+asyncpg://u:p@h/db") == "postgresql+asyncpg://u:p@h/db"
    assert normalize_database_url("sqlite:///data/documind.db") == "sqlite:///data/documind.db"
