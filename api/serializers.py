from rest_framework import serializers
from .models import Skill, Project, ContactMessage, WorkExperience


class SkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = Skill
        fields = ['id', 'name', 'icon', 'percent', 'category', 'order']


class ProjectSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    class Meta:
        model = Project
        fields = ['id', 'title', 'short_description', 'description', 'stack', 'status', 'status_display',
                  'github_url', 'demo_url', 'is_featured', 'order', 'created_at']


class ContactMessageSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(required=False, allow_blank=True, default='')
    # Honeypot — боты заполняют, люди нет
    website = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = ContactMessage
        fields = ['name', 'email', 'subject', 'message', 'website']

    def validate_message(self, value):
        if len(value) < 5:
            raise serializers.ValidationError("Сообщение слишком короткое")
        return value

    def validate_website(self, value):
        if value:
            raise serializers.ValidationError("Спам")
        return value


class WorkExperienceSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = WorkExperience
        fields = ['id', 'company', 'role', 'period', 'description', 'logo_url', 'order']

    def get_logo_url(self, obj):
        if obj.logo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.logo.url)
            return obj.logo.url
        return None
