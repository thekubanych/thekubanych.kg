from django.urls import path
from . import views

urlpatterns = [
    path('skills/', views.skills_list),
    path('projects/', views.projects_list),
    path('projects/<int:pk>/', views.project_detail),
    path('experience/', views.experience_list),
    path('cv/', views.cv_download),
    path('contact/', views.contact_send),
    path('stats/', views.page_views_stats),
    path('auth/telegram/', views.telegram_auth),
]
