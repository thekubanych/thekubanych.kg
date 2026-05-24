# TheKubanych Portfolio — Full Stack

Портфолио сайт с Django бэкендом. Фронтенд и бэкенд в одной папке.

## Структура проекта
```
thekubanych.github.io/
├── portfolio/          # Django настройки
│   ├── settings.py
│   └── urls.py
├── api/                # Бэкенд API
│   ├── models.py       # Модели БД
│   ├── views.py        # API эндпоинты
│   ├── admin.py        # Админ панель
│   ├── serializers.py
│   ├── middleware.py   # Счётчик просмотров
│   └── urls.py
├── templates/
│   └── index.html      # Фронтенд портфолио
├── requirements.txt
├── Procfile            # Для Railway деплоя
└── manage.py
```

## Локальный запуск

```bash
# 1. Установи зависимости
pip install -r requirements.txt

# 2. Настрой .env
cp .env.example .env

# 3. Миграции
python manage.py makemigrations
python manage.py migrate

# 4. Начальные данные
python manage.py seed_data

# 5. Суперпользователь для админки
python manage.py createsuperuser

# 6. Запуск
python manage.py runserver
```

Открой: http://localhost:8000
Админка: http://localhost:8000/admin

## Docker (быстрый старт)

Собрать и запустить контейнер:

```bash
docker build -t portfolio:latest .
docker run -p 8000:8000 --env-file .env portfolio:latest
```

Контейнер использует `gunicorn` и делает `collectstatic` при сборке.

## Деплой на Railway (бесплатно)

1. Загрузи на GitHub:
```bash
git init
git add .
git commit -m "Full stack portfolio"
git remote add origin https://github.com/thekubanych/portfolio.git
git push -u origin main
```

2. Зайди на railway.app → New Project → Deploy from GitHub
3. Добавь переменные из .env.example в Railway → Variables
4. Railway автоматически задеплоит!

## API эндпоинты

| Метод | URL | Описание |
|-------|-----|----------|
| GET | /api/skills/ | Навыки |
| GET | /api/projects/ | Проекты |
| GET | /api/experience/ | Опыт работы |
| GET | /api/cv/ | Ссылка на резюме |
| POST | /api/contact/ | Форма контакта |
| POST | /api/auth/telegram/ | Telegram Login |
| GET | /api/stats/ | Статистика |
