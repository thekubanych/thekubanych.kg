from django.contrib import admin
from django.http import HttpResponse
from django.shortcuts import render
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
from api.models import WorkExperience


def home_view(request):
    """Главная с опыт работы — рендерим на сервере, чтобы не было пусто."""
    from api.serializers import WorkExperienceSerializer
    experience = WorkExperience.objects.filter(is_active=True)
    experience_data = WorkExperienceSerializer(
        experience, many=True, context={'request': request}
    ).data
    return render(request, 'index.html', {'experience': experience_data})


def robots_txt(request):
    content = "User-agent: *\nAllow: /\n\nSitemap: {}/sitemap.xml\n".format(request.build_absolute_uri('/').rstrip('/'))
    return HttpResponse(content, content_type="text/plain")


def sitemap_xml(request):
    base = request.build_absolute_uri('/').rstrip('/')
    content = f'''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>{base}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
</urlset>'''
    return HttpResponse(content, content_type="application/xml")


def projects_view(request):
    """Простая страница с проектами, рендерится на сервере."""
    from api.serializers import ProjectSerializer
    from api.models import Project

    projects = Project.objects.filter(is_active=True).order_by('-updated_at')
    projects_data = ProjectSerializer(projects, many=True, context={'request': request}).data
    return render(request, 'projects.html', {'projects': projects_data})


urlpatterns = [
    path('', home_view, name='home'),
    path('robots.txt', robots_txt),
    path('sitemap.xml', sitemap_xml),
    path('projects/', projects_view, name='projects'),
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

admin.site.site_header = "TheKubanych Portfolio"
admin.site.site_title = "Portfolio Admin"
admin.site.index_title = "Управление портфолио"
