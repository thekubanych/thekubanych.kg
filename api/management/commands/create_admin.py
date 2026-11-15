from decouple import config
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password


class Command(BaseCommand):
    help = 'Create an admin using ADMIN_PASSWORD, or replace a legacy default password'

    def handle(self, *args, **kwargs):
        username = config('ADMIN_USERNAME', default='admin')
        password = config('ADMIN_PASSWORD', default='')
        email = config('ADMIN_EMAIL', default='admin@thekubanych.kg')
        user = User.objects.filter(username=username).first()
        legacy_passwords = ('admin123', 'change-me-to-strong-password')
        has_legacy_password = user and any(user.check_password(value) for value in legacy_passwords)

        if user and not user.is_superuser:
            raise CommandError('ADMIN_USERNAME belongs to a non-admin user. Choose another username.')
        if user and not has_legacy_password:
            self.stdout.write(f'Admin "{username}" already exists; password unchanged.')
            return
        if not password:
            if has_legacy_password:
                raise CommandError('The existing admin has a default password. Set a strong ADMIN_PASSWORD.')
            self.stdout.write('ADMIN_PASSWORD is unset; no admin created. Use createsuperuser to create one manually.')
            return
        if password in legacy_passwords or password.startswith('change-me'):
            raise CommandError('Set your own strong ADMIN_PASSWORD, not an example/default password.')
        try:
            validate_password(password, user=user or User(username=username, email=email))
        except ValidationError as exc:
            raise CommandError('Invalid ADMIN_PASSWORD: ' + '; '.join(exc.messages)) from exc

        if user:
            user.set_password(password)
            user.save(update_fields=['password'])
            self.stdout.write(self.style.SUCCESS(f'Legacy password replaced for "{username}".'))
        else:
            User.objects.create_superuser(username=username, email=email, password=password)
            self.stdout.write(self.style.SUCCESS(f'✅ Superuser "{username}" created!'))
