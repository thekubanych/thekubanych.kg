import hashlib
import hmac
import mimetypes
import time
import requests
from datetime import datetime, timedelta, timezone as datetime_timezone
from pathlib import Path
from django.conf import settings
from django.core import signing
from django.core.mail import send_mail
from django.http import FileResponse, Http404
from django.utils import timezone
from django.views.decorators.http import require_safe
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Skill, Project, ContactMessage, PageView, TelegramUser, WorkExperience, ResumeFile
from .serializers import (
    SkillSerializer, ProjectSerializer, ContactMessageSerializer,
    WorkExperienceSerializer, TelegramAuthSerializer,
)
from .client_ip import get_client_ip
from .rate_limits import allow_contact

TELEGRAM_TOKEN_SALT = 'portfolio.telegram-auth'
TELEGRAM_AUTH_MAX_AGE = 86400


# ── Skills ──
@api_view(['GET'])
def skills_list(request):
    return Response(SkillSerializer(Skill.objects.filter(is_active=True), many=True).data)


# ── Projects ──
@api_view(['GET'])
def projects_list(request):
    return Response(ProjectSerializer(Project.objects.filter(is_active=True), many=True).data)

@api_view(['GET'])
def project_detail(request, pk):
    try:
        project = Project.objects.get(pk=pk, is_active=True)
    except Project.DoesNotExist:
        return Response({'error': 'Не найден'}, status=status.HTTP_404_NOT_FOUND)
    return Response(ProjectSerializer(project).data)


# ── Telegram Auth ──
@api_view(['POST'])
def telegram_auth(request):
    """
    Принимает данные от Telegram Login Widget,
    проверяет подпись и сохраняет/обновляет пользователя.
    """
    serializer = TelegramAuthSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    received_hash = data['hash']

    # Проверяем что данные свежие (не старше 24 часов)
    auth_date = data['auth_date']
    age = time.time() - auth_date
    if age < 0 or age > TELEGRAM_AUTH_MAX_AGE:
        return Response({'error': 'Недопустимая дата авторизации'}, status=status.HTTP_400_BAD_REQUEST)

    # Проверяем подпись Telegram
    bot_token = settings.TELEGRAM_BOT_TOKEN
    if not bot_token:
        return Response({'error': 'Бот не настроен'}, status=status.HTTP_400_BAD_REQUEST)

    secret_key = hashlib.sha256(bot_token.encode()).digest()
    # Verify the original values: validation may trim text or coerce numbers.
    check_string = '\n'.join(
        f'{key}={request.data[key]}' for key in sorted(request.data) if key != 'hash'
    )
    expected_hash = hmac.new(secret_key, check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected_hash, received_hash):
        return Response({'error': 'Неверная подпись'}, status=status.HTTP_403_FORBIDDEN)

    # Сохраняем пользователя
    tg_user, created = TelegramUser.objects.update_or_create(
        telegram_id=data['id'],
        defaults={
            'first_name': data.get('first_name', ''),
            'last_name': data.get('last_name', ''),
            'username': data.get('username', ''),
            'photo_url': data.get('photo_url', ''),
            'auth_date': datetime.fromtimestamp(auth_date, tz=datetime_timezone.utc),
            'last_login_at': timezone.now(),
        }
    )

    return Response({
        'success': True,
        'token': signing.dumps({'telegram_id': tg_user.telegram_id}, salt=TELEGRAM_TOKEN_SALT),
        'user': {
            'id': tg_user.telegram_id,
            'name': tg_user.full_name,
            'username': tg_user.username,
            'photo_url': tg_user.photo_url,
        }
    })


# ── Contact Form ──
@api_view(['POST'])
def contact_send(request):
    serializer = ContactMessageSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = dict(serializer.validated_data)
    data.pop('website', None)
    telegram_user_id = data.pop('telegram_user_id', None)
    telegram_token = data.pop('telegram_token', None)
    tg_user = None
    if telegram_user_id is not None or telegram_token:
        try:
            identity = signing.loads(
                telegram_token or '', salt=TELEGRAM_TOKEN_SALT,
                max_age=TELEGRAM_AUTH_MAX_AGE,
            )
            verified_id = identity['telegram_id']
            if telegram_user_id is not None and telegram_user_id != verified_id:
                raise signing.BadSignature('Telegram identity mismatch')
            tg_user = TelegramUser.objects.get(telegram_id=verified_id)
        except (signing.BadSignature, TelegramUser.DoesNotExist, KeyError, TypeError, ValueError):
            return Response({'error': 'Войди через Telegram заново.'}, status=status.HTTP_403_FORBIDDEN)

    ip = get_client_ip(request)
    if not allow_contact(ip):
        return Response(
            {'error': 'Слишком много сообщений. Подожди несколько минут.'},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    msg = ContactMessage.objects.create(
        ip_address=ip,
        telegram_user=tg_user,
        source='telegram' if tg_user else 'site',
        **data
    )

    _notify_telegram(msg)

    try:
        if data.get('email') and settings.EMAIL_HOST_USER:
            send_mail(
                subject=f'[Portfolio] {msg.subject}',
                message=f'От: {msg.name} <{msg.email}>\n\n{msg.message}',
                from_email=settings.EMAIL_HOST_USER,
                recipient_list=[settings.CONTACT_EMAIL],
                fail_silently=True,
            )
    except Exception:
        pass

    return Response(
        {'success': True, 'message': 'Сообщение отправлено! Отвечу как можно скорее 🚀'},
        status=status.HTTP_201_CREATED
    )


# ── Experience ──
@api_view(['GET'])
def experience_list(request):
    items = WorkExperience.objects.filter(is_active=True)
    return Response(WorkExperienceSerializer(items, many=True, context={'request': request}).data)


# ── CV Download ──
@api_view(['GET'])
def cv_download(request):
    """Возвращает URL активного CV или 404."""
    cv = ResumeFile.objects.filter(is_active=True).order_by('-updated_at').first()
    if not cv or not cv.file or not cv.file.storage.exists(cv.file.name):
        return Response({'url': None}, status=status.HTTP_404_NOT_FOUND)
    url = request.build_absolute_uri(cv.file.url)
    return Response({'url': url})


@require_safe
def public_media(request, file_name):
    """Serve published uploads with Gunicorn too, without exposing arbitrary files."""
    resume = ResumeFile.objects.filter(is_active=True, file=file_name).first()
    experience = None if resume else WorkExperience.objects.filter(
        is_active=True, logo=file_name,
    ).first()
    if not resume and not experience:
        raise Http404
    uploaded = resume.file if resume else experience.logo
    try:
        stream = uploaded.storage.open(uploaded.name, 'rb')
    except (FileNotFoundError, OSError):
        raise Http404
    content_type = mimetypes.guess_type(uploaded.name)[0] or 'application/octet-stream'
    inline_types = {'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/x-icon'}
    return FileResponse(
        stream,
        as_attachment=bool(resume) or content_type not in inline_types,
        filename=Path(uploaded.name).name,
        content_type=content_type,
    )


# ── Stats ──
@api_view(['GET'])
def page_views_stats(request):
    today = timezone.localdate()
    last_7 = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        try:
            count = PageView.objects.get(date=d).count
        except PageView.DoesNotExist:
            count = 0
        last_7.append({'date': str(d), 'views': count})
    try:
        today_views = PageView.objects.get(date=today).count
    except PageView.DoesNotExist:
        today_views = 0
    return Response({
        'total_views': PageView.get_total(),
        'unique_visitors': PageView.get_unique_total(),
        'today_views': today_views,
        'last_7_days': last_7,
    })


def _notify_telegram(msg):
    token = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_CHAT_ID
    if not token or not chat_id:
        return
    tg_info = ''
    if msg.telegram_user:
        u = msg.telegram_user
        tg_info = f'\n🔗 *Telegram:* [{u.full_name}](tg://user?id={u.telegram_id})'
        if u.username:
            tg_info += f' @{u.username}'
    text = (
        f"📬 *Новое сообщение с портфолио!*\n\n"
        f"👤 *Имя:* {msg.name}{tg_info}\n"
        f"📧 *Email:* {msg.email or '—'}\n"
        f"📝 *Тема:* {msg.subject}\n\n"
        f"💬 *Сообщение:*\n{msg.message}"
    )
    try:
        requests.post(
            f'https://api.telegram.org/bot{token}/sendMessage',
            json={'chat_id': chat_id, 'text': text, 'parse_mode': 'Markdown'},
            timeout=5
        )
    except Exception:
        pass
