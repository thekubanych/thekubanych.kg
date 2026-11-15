import hashlib
import hmac
import json
import tempfile
import time
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from django.core import signing
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone

from api.models import ContactMessage, ContactRateLimit, ResumeFile, TelegramUser, WorkExperience
from api.views import TELEGRAM_TOKEN_SALT


@override_settings(TELEGRAM_BOT_TOKEN='test-bot-token', TELEGRAM_CHAT_ID='', EMAIL_HOST_USER='')
class ContactAndAuthTests(TestCase):
    message = {'name': 'Visitor', 'subject': 'Project', 'message': 'Hello there!'}

    def post(self, path, data, **headers):
        return self.client.post(path, data=json.dumps(data), content_type='application/json', **headers)

    def telegram_payload(self, **overrides):
        data = {'id': 12345, 'first_name': 'Test user', 'auth_date': int(time.time())}
        data.update(overrides)
        check = '\n'.join(f'{key}={value}' for key, value in sorted(data.items()))
        key = hashlib.sha256(b'test-bot-token').digest()
        data['hash'] = hmac.new(key, check.encode(), hashlib.sha256).hexdigest()
        return data

    def login_telegram(self):
        response = self.post('/api/auth/telegram/', self.telegram_payload())
        self.assertEqual(response.status_code, 200)
        return response.json()['token']

    def test_anonymous_contact_still_works(self):
        response = self.post('/api/contact/', self.message)
        self.assertEqual(response.status_code, 201)
        message = ContactMessage.objects.get()
        self.assertEqual(message.source, 'site')
        self.assertIsNone(message.telegram_user)

    def test_honeypot_is_validated_before_saving(self):
        response = self.post('/api/contact/', dict(self.message, website='spam.example'))
        self.assertEqual(response.status_code, 400)
        self.assertIn('website', response.json())
        self.assertFalse(ContactMessage.objects.exists())
        self.assertFalse(ContactRateLimit.objects.exists())

    def test_telegram_id_without_token_cannot_claim_an_identity(self):
        TelegramUser.objects.create(telegram_id=12345, first_name='Victim')
        response = self.post('/api/contact/', dict(self.message, telegram_user_id=12345))
        self.assertEqual(response.status_code, 403)
        self.assertFalse(ContactMessage.objects.exists())

    def test_verified_login_can_send_contact(self):
        token = self.login_telegram()
        response = self.post('/api/contact/', dict(self.message, telegram_user_id=12345, telegram_token=token))
        self.assertEqual(response.status_code, 201)
        message = ContactMessage.objects.get()
        self.assertEqual(message.telegram_user.telegram_id, 12345)
        self.assertEqual(message.source, 'telegram')
        self.assertIsNotNone(message.telegram_user.auth_date)
        self.assertIsNotNone(message.telegram_user.last_login_at)

    def test_token_cannot_be_used_for_another_user(self):
        token = self.login_telegram()
        TelegramUser.objects.create(telegram_id=54321, first_name='Other')
        response = self.post('/api/contact/', dict(self.message, telegram_user_id=54321, telegram_token=token))
        self.assertEqual(response.status_code, 403)
        self.assertFalse(ContactMessage.objects.exists())

    def test_expired_and_tampered_tokens_are_rejected(self):
        token = self.login_telegram()
        with patch('django.core.signing.time.time', return_value=time.time() - 86401):
            expired = signing.dumps({'telegram_id': 12345}, salt=TELEGRAM_TOKEN_SALT)
        for invalid in [expired, token + 'tampered']:
            with self.subTest(token=invalid):
                response = self.post('/api/contact/', dict(self.message, telegram_token=invalid))
                self.assertEqual(response.status_code, 403)
        self.assertFalse(ContactMessage.objects.exists())

    def test_telegram_rejects_stale_future_and_wrong_signatures(self):
        cases = [
            (self.telegram_payload(auth_date=int(time.time()) - 86401), 400),
            (self.telegram_payload(auth_date=int(time.time()) + 600), 400),
            (dict(self.telegram_payload(), hash='0' * 64), 403),
        ]
        for data, expected in cases:
            with self.subTest(data=data):
                self.assertEqual(self.post('/api/auth/telegram/', data).status_code, expected)
        self.assertFalse(TelegramUser.objects.exists())

    def test_form_encoded_telegram_signature_uses_scalar_values(self):
        response = self.client.post('/api/auth/telegram/', self.telegram_payload(first_name=' Test '))
        self.assertEqual(response.status_code, 200)

    def test_invalid_inputs_return_400_instead_of_500(self):
        for path in ['/api/contact/', '/api/auth/telegram/']:
            for data in [[], ['wrong'], None, 123, 'wrong']:
                with self.subTest(path=path, data=data):
                    self.assertEqual(self.post(path, data).status_code, 400)
        for invalid in ['abc', None, [], -1, 10**100]:
            with self.subTest(id=invalid):
                self.assertEqual(self.post('/api/contact/', dict(self.message, telegram_user_id=invalid)).status_code, 400)
        for field in ['id', 'auth_date', 'hash']:
            for invalid in ['abc', None, [], {}, 10**400]:
                with self.subTest(field=field, invalid=invalid):
                    data = dict(self.telegram_payload(), **{field: invalid})
                    self.assertEqual(self.post('/api/auth/telegram/', data).status_code, 400)

    def test_chat_endpoint_is_gone(self):
        self.assertEqual(self.post('/api/chat/', {'message': 'Привет'}).status_code, 404)

    def test_limit_survives_cache_clear_and_spoofed_forwarded_header(self):
        for i in range(4):
            cache.clear()
            response = self.post('/api/contact/', self.message, HTTP_X_FORWARDED_FOR=f'198.51.100.{i}')
            self.assertEqual(response.status_code, 201 if i < 3 else 429)
        self.assertEqual(ContactMessage.objects.count(), 3)

    @override_settings(TRUSTED_PROXY_IPS=['127.0.0.1'])
    def test_proxy_uses_actual_peer_not_spoofed_leftmost_ip(self):
        for i in range(4):
            response = self.post('/api/contact/', self.message,
                                 HTTP_X_FORWARDED_FOR=f'198.51.100.{i}, 203.0.113.1')
            self.assertEqual(response.status_code, 201 if i < 3 else 429)
        self.assertEqual(set(ContactMessage.objects.values_list('ip_address', flat=True)), {'203.0.113.1'})

    def test_expired_window_resets_and_other_ips_have_separate_limits(self):
        for _ in range(3):
            self.assertEqual(self.post('/api/contact/', self.message).status_code, 201)
        self.assertEqual(self.post('/api/contact/', self.message).status_code, 429)
        self.assertEqual(self.post('/api/contact/', self.message, REMOTE_ADDR='203.0.113.2').status_code, 201)
        ContactRateLimit.objects.update(window_start=timezone.now() - timedelta(seconds=601))
        self.assertEqual(self.post('/api/contact/', self.message).status_code, 201)


@override_settings(DEBUG=False, SECURE_SSL_REDIRECT=False)
class PublicMediaTests(TestCase):
    def setUp(self):
        root = tempfile.TemporaryDirectory()
        self.addCleanup(root.cleanup)
        self.root = Path(root.name)
        self.override = override_settings(MEDIA_ROOT=self.root)
        self.override.enable()
        self.addCleanup(self.override.disable)

    def write_file(self, name, contents=b'test file'):
        file = self.root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(contents)

    def test_cv_url_downloads_when_debug_is_false(self):
        self.write_file('resume/test.pdf', b'%PDF-test')
        ResumeFile.objects.create(file='resume/test.pdf')
        response = self.client.get('/api/cv/')
        self.assertEqual(response.status_code, 200)
        download = self.client.get(response.json()['url'])
        self.assertEqual(download.status_code, 200)
        self.assertEqual(b''.join(download.streaming_content), b'%PDF-test')
        self.assertIn('attachment', download['Content-Disposition'])
        download.close()

    def test_active_logo_is_served_inline(self):
        self.write_file('company_logos/test.png')
        WorkExperience.objects.create(company='Test', role='Dev', period='2026', logo='company_logos/test.png')
        response = self.client.get('/media/company_logos/test.png')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'image/png')
        self.assertIn('inline', response['Content-Disposition'])
        response.close()

    def test_inactive_unregistered_and_missing_files_are_404(self):
        for name in ['resume/inactive.pdf', 'unregistered.txt']:
            self.write_file(name)
        ResumeFile.objects.create(file='resume/inactive.pdf', is_active=False)
        ResumeFile.objects.create(file='resume/missing.pdf')
        for url in ['/media/resume/inactive.pdf', '/media/unregistered.txt',
                    '/media/resume/missing.pdf', '/media/../.env', '/api/cv/']:
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 404)

    def test_active_html_upload_is_downloaded_instead_of_executed(self):
        self.write_file('company_logos/test.html')
        WorkExperience.objects.create(company='Test', role='Dev', period='2026', logo='company_logos/test.html')
        response = self.client.get('/media/company_logos/test.html')
        self.assertEqual(response.status_code, 200)
        self.assertIn('attachment', response['Content-Disposition'])
        response.close()
