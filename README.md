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
# Сгенерируй ключ, скопируй результат в SECRET_KEY в .env:
python -c "import secrets; print(secrets.token_urlsafe(64))"
# Для локальной разработки выставь DEBUG=True в .env.

# 3. Миграции
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
# Локальная проверка по HTTP:
docker run --name portfolio -p 127.0.0.1:8000:8000 --env-file .env \
  -e DEBUG=True -v portfolio-data:/data portfolio:latest
```

При запуске контейнер выполняет миграции, `collectstatic` и настройку администратора,
затем запускает Gunicorn. Секреты и локальная база не попадают в образ.
База SQLite и загруженные файлы хранятся в именованном томе `portfolio-data`.
Для переноса существующего сайта сначала скопируй `db.sqlite3` и каталог `media/`
в этот том; пустой том создаёт новый сайт без прежних данных.

Для автоматического создания администратора укажи уникальный `ADMIN_PASSWORD`
длиной не менее 12 символов. Пустое значение не создаёт администратора;
можно выполнить `docker exec -it portfolio python manage.py createsuperuser`.
Повторный запуск сохраняет существующий пароль. Исключение — старые пароли
`admin123` и `change-me-to-strong-password`: для них необходима замена через
`ADMIN_PASSWORD`, иначе запуск остановится. Другие пароли меняются командой
`python manage.py changepassword <username>`.

Демонстрационные записи создаются только при `SEED_DATA=true`.
CV и логотипы активных записей доступны через `/media/` даже при `DEBUG=False`.

Для продакшна используй `DEBUG=False`, случайный `SECRET_KEY` минимум из 50 символов,
реальный домен в `ALLOWED_HOSTS` и HTTPS на обратном прокси. Для nginx на том же
сервере укажи `TRUSTED_PROXY_IPS=127.0.0.1,::1`; в других схемах укажи только адреса
или сети доверенных прокси. Без этой настройки `X-Forwarded-For` игнорируется,
а посетители за одним прокси делят лимит. Прямой доступ к Gunicorn извне нужно
закрыть. Пример `deploy/nginx/portfolio.site.conf` требует настройки домена и TLS.

Если Docker не используется, `DATA_DIR` по умолчанию равен каталогу проекта.
При изменении `DATA_DIR` каталог должен существовать и быть доступен для записи.

## Деплой на Railway

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
4. При использовании Docker подключи постоянный том в `/data` и настрой HTTPS.

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

Telegram Login возвращает `token` после проверки подписи Telegram. Для отправки
сообщения от этого пользователя передай его как `telegram_token` в `/api/contact/`.
Необязательный `telegram_user_id` должен совпадать с пользователем из токена;
одного ID недостаточно. Токен действует 24 часа. Обычные сообщения без Telegram
по-прежнему принимаются. Заполненное поле-ловушка `website` возвращает 400.

Форма принимает до 3 сообщений с одного IP за фиксированное окно 10 минут.
Лимит хранится в базе и общий для всех процессов Gunicorn. Неверные данные
возвращают 400, неверная Telegram-авторизация — 403, превышение лимита — 429.

## Проверка и обновление

```bash
python manage.py test api
python manage.py check
python manage.py makemigrations --check --dry-run
```

Перед обновлением сделай резервную копию базы. Затем выполни `python manage.py migrate`
и перезапусти приложение (в Docker миграции выполняются при старте).
Миграция `0005` объединяет просмотры за одинаковые даты, сохраняя сумму просмотров
и список уникальных IP, затем запрещает новые дубли. Старые дубли обратно не разделяются.
