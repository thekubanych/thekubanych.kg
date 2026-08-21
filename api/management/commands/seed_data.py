import base64
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from api.models import Skill, Project, WorkExperience

OPTIMA_LOGO_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAOEAAADhCAMAAAAJbSJIAAAA/FBMVEX///8AAADjBxrjBxjjBxne"
    "CxffChfYERncDBjaEBg8PDs1NTQ4ODcvLy4sLCsbHBkYGRbhAAApKSgkJCPjAA3VBg8gIB/kQEnX"
    "AAAVFhLUAADz8/Pm5ubiAAD98PHg4OD85+jv7+//+PmUlJSJiYn4yMv1uLv85ObW1tbNzc2Xl5ew"
    "sLBeXl68vLz72Nv0sLPqbXGio6Jra2tRUlHCwsJOTk7pf4FRUVHwmZxoaGh3d3fwjpT4wsXoN0Tm"
    "KjjjESTpSFXubnfiMjDuiY3nWl7ypqqrtLPnYWTqdnvdKyvcMzfham3fV1ndMzbXREbpQE3cyszt"
    "ZXLqQ1bLlpasAAAMQ0lEQVR4nO2da1viuhaAKeWOXKIVCmgtjICODqAzshlBYHsZ0JlzPb8//9yU"
    "lCuLV1JVqj7PH0/7GePIvA+6VpJVtI0EPDx8fHx8fHx8fHx8flA1CoVwzTrFNM0DPovr78QOo1ar"
    "/t61B8EB/79/d6vNnZXNdkalUjFMs25hGkbF+HdlFR8fHx8fHx8fHx8fn/97/gc2V8evqbt0agAAA"
    "ABJRU5ErkJggg=="
)


class Command(BaseCommand):
    help = 'Начальные данные'

    def handle(self, *args, **kwargs):
        skills = [
            {'name': 'Python', 'icon': '🐍', 'percent': 75, 'category': 'backend', 'order': 1},
            {'name': 'FastAPI', 'icon': '⚡', 'percent': 65, 'category': 'backend', 'order': 2},
            {'name': 'Django', 'icon': '🎸', 'percent': 60, 'category': 'backend', 'order': 3},
            {'name': 'PostgreSQL', 'icon': '🗄️', 'percent': 60, 'category': 'database', 'order': 4},
            {'name': 'Git', 'icon': '🐙', 'percent': 70, 'category': 'tools', 'order': 5},
            {'name': 'Linux', 'icon': '🐧', 'percent': 55, 'category': 'tools', 'order': 6},
        ]
        for s in skills:
            Skill.objects.get_or_create(name=s['name'], defaults=s)

        projects = [
            {
                'title': 'Backend API приложение', 'order': 1, 'is_featured': True,
                'description': 'Серверная часть с авторизацией, БД и Swagger документацией.',
                'stack': ['Python', 'FastAPI', 'PostgreSQL'], 'status': 'active',
            },
            {
                'title': 'Telegram Bot', 'order': 2,
                'description': 'Бот на aiogram с inline-кнопками и внешними API.',
                'stack': ['Python', 'aiogram'], 'status': 'done',
            },
            {
                'title': 'Портфолио сайт', 'order': 3,
                'description': 'Этот сайт — фронтенд + Django бэкенд с API.',
                'stack': ['Django', 'HTML', 'CSS', 'JS'], 'status': 'done',
            },
        ]
        for p in projects:
            Project.objects.get_or_create(title=p['title'], defaults=p)

        experience = [
            {'company': 'Optima Bank', 'role': 'Backend Developer', 'period': '2025 — н.в.', 'description': 'Банковская разработка, backend-системы.', 'order': 0},
            {'company': 'SoftJol', 'role': 'Студент', 'period': '2023 — н.в.', 'description': 'Программирование, backend разработка.', 'order': 1},
            {'company': 'Фриланс', 'role': 'Backend Developer', 'period': '2024 — н.в.', 'description': 'Pet-проекты, телеграм боты.', 'order': 2},
        ]
        for e in experience:
            exp, _ = WorkExperience.objects.get_or_create(
                company=e['company'], role=e['role'], defaults=e
            )
            # Логотип для Optima Bank
            if exp.company == 'Optima Bank' and not exp.logo:
                try:
                    data = base64.b64decode(OPTIMA_LOGO_B64)
                    exp.logo.save('optima.jpeg', ContentFile(data), save=True)
                except Exception:
                    pass

        self.stdout.write(self.style.SUCCESS('✅ Данные загружены!'))
