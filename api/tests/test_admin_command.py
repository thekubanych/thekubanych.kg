import io
import os
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase


class AdminBootstrapTests(TestCase):
    password = 'Different-strong!2026-phrase'

    def bootstrap(self, password=''):
        with patch.dict(os.environ, {
            'ADMIN_USERNAME': 'bootstrap', 'ADMIN_PASSWORD': password,
            'ADMIN_EMAIL': 'bootstrap@example.com',
        }):
            call_command('create_admin', stdout=io.StringIO())

    def test_unconfigured_password_does_not_create_admin(self):
        self.bootstrap()
        self.assertFalse(User.objects.exists())

    def test_default_and_weak_passwords_are_rejected(self):
        for password in ['admin123', 'change-me-to-strong-password', 'short', '12345678901234']:
            with self.subTest(password=password):
                with self.assertRaises(CommandError):
                    self.bootstrap(password)
        self.assertFalse(User.objects.exists())

    def test_runtime_password_creates_superuser(self):
        self.bootstrap(self.password)
        user = User.objects.get(username='bootstrap')
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.check_password(self.password))

    def test_existing_secure_password_is_preserved(self):
        user = User.objects.create_superuser('bootstrap', password='Original-long!2026-phrase')
        self.bootstrap(self.password)
        user.refresh_from_db()
        self.assertTrue(user.check_password('Original-long!2026-phrase'))

    def test_legacy_default_requires_a_replacement(self):
        user = User.objects.create_superuser('bootstrap', password='admin123')
        with self.assertRaises(CommandError):
            self.bootstrap()
        self.bootstrap(self.password)
        user.refresh_from_db()
        self.assertFalse(user.check_password('admin123'))
        self.assertTrue(user.check_password(self.password))

    def test_regular_user_is_not_silently_promoted(self):
        user = User.objects.create_user('bootstrap', password=self.password)
        with self.assertRaises(CommandError):
            self.bootstrap(self.password)
        user.refresh_from_db()
        self.assertFalse(user.is_superuser)
