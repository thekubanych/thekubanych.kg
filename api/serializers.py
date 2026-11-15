from rest_framework import serializers
from .models import Skill, Project, ContactMessage, WorkExperience


class StrictCharField(serializers.CharField):
    def to_internal_value(self, data):
        if not isinstance(data, str):
            self.fail('invalid')
        return super().to_internal_value(data)


class TelegramAuthSerializer(serializers.Serializer):
    id = serializers.IntegerField(min_value=1, max_value=2**63 - 1)
    auth_date = serializers.IntegerField(min_value=1, max_value=2**63 - 1)
    hash = serializers.RegexField(r'\A[0-9a-f]{64}\Z')
    first_name = StrictCharField(max_length=100)
    last_name = StrictCharField(max_length=100, required=False, allow_blank=True)
    username = StrictCharField(max_length=100, required=False, allow_blank=True)
    photo_url = serializers.URLField(max_length=200, required=False, allow_blank=True)


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
    telegram_user_id = serializers.IntegerField(
        min_value=1, max_value=2**63 - 1, required=False, write_only=True
    )
    telegram_token = StrictCharField(max_length=1024, required=False, write_only=True)

    class Meta:
        model = ContactMessage
        fields = ['name', 'email', 'subject', 'message', 'website',
                  'telegram_user_id', 'telegram_token']

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
