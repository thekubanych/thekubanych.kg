from django.contrib import admin
from django.utils.html import format_html
from .models import Skill, Project, ContactMessage, PageView, WorkExperience, ResumeFile, TelegramUser


@admin.register(Skill)
class SkillAdmin(admin.ModelAdmin):
    list_display = ['icon', 'name', 'bar', 'category', 'order', 'is_active']
    list_editable = ['order', 'is_active']
    list_filter = ['category']

    def bar(self, obj):
        color = '#6c47ff' if obj.percent >= 70 else '#00ffb3'
        return format_html(
            '<div style="width:100px;background:#222;border-radius:4px">'
            '<div style="width:{}%;background:{};height:8px;border-radius:4px"></div>'
            '</div> {}%', obj.percent, color, obj.percent)
    bar.short_description = 'Уровень'


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ['title', 'status_badge', 'is_featured', 'order', 'is_active']
    list_editable = ['is_featured', 'order', 'is_active']
    list_filter = ['status', 'is_featured']
    search_fields = ['title']

    def status_badge(self, obj):
        colors = {'active': '#00ffb3', 'done': '#6c47ff', 'planned': '#ff3d6b'}
        return format_html(
            '<span style="background:{};color:#000;padding:2px 10px;border-radius:20px;font-size:11px">{}</span>',
            colors.get(obj.status, '#888'), obj.get_status_display())
    status_badge.short_description = 'Статус'


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ['name', 'email', 'subject', 'status', 'created_at']
    list_filter = ['status']
    readonly_fields = ['name', 'email', 'subject', 'message', 'ip_address', 'created_at']
    search_fields = ['name', 'email']

    def has_add_permission(self, request):
        return False


@admin.register(PageView)
class PageViewAdmin(admin.ModelAdmin):
    list_display = ['date', 'count', 'unique_count']
    readonly_fields = ['date', 'count', 'unique_ips']

    def unique_count(self, obj):
        return len(obj.unique_ips)
    unique_count.short_description = 'Уникальных'

    def has_add_permission(self, request):
        return False



@admin.register(TelegramUser)
class TelegramUserAdmin(admin.ModelAdmin):
    list_display = ['full_name', 'username_link', 'telegram_id', 'created_at']
    search_fields = ['first_name', 'last_name', 'username']
    readonly_fields = ['telegram_id', 'first_name', 'last_name', 'username', 'photo_url', 'created_at']

    def username_link(self, obj):
        if obj.username:
            return format_html('<a href="https://t.me/{0}" target="_blank">@{0}</a>', obj.username)
        return '—'
    username_link.short_description = 'Username'

    def full_name(self, obj):
        return obj.full_name
    full_name.short_description = 'Имя'


@admin.register(WorkExperience)
class WorkExperienceAdmin(admin.ModelAdmin):
    list_display = ['role', 'company', 'period', 'order', 'is_active', 'has_logo']
    list_editable = ['order', 'is_active']
    search_fields = ['company', 'role']

    def has_logo(self, obj):
        return bool(obj.logo)
    has_logo.boolean = True
    has_logo.short_description = 'Логотип'


@admin.register(ResumeFile)
class ResumeFileAdmin(admin.ModelAdmin):
    list_display = ['file', 'is_active', 'updated_at']
    list_editable = ['is_active']
