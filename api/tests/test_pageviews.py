from datetime import datetime, timezone as datetime_timezone
from unittest.mock import patch

from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from api.models import PageView


class PageViewTests(TestCase):
    def test_repeated_views_count_each_visit_and_deduplicate_ips(self):
        for ip in ['203.0.113.1', '203.0.113.2', '203.0.113.1']:
            self.assertEqual(self.client.get('/', REMOTE_ADDR=ip).status_code, 200)
        row = PageView.objects.get()
        self.assertEqual(row.count, 3)
        self.assertEqual(set(row.unique_ips), {'203.0.113.1', '203.0.113.2'})
        response = self.client.get('/api/stats/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['today_views'], 3)
        self.assertEqual(response.json()['unique_visitors'], 2)

    def test_duplicate_dates_are_rejected_by_database(self):
        PageView.objects.create()
        with self.assertRaises(IntegrityError), transaction.atomic():
            PageView.objects.create()

    @override_settings(TIME_ZONE='Asia/Bishkek')
    def test_record_and_stats_agree_around_local_midnight(self):
        instant = datetime(2026, 1, 1, 20, tzinfo=datetime_timezone.utc)
        with timezone.override('Asia/Bishkek'), patch('django.utils.timezone.now', return_value=instant):
            self.client.get('/')
            response = self.client.get('/api/stats/')
        self.assertEqual(str(PageView.objects.get().date), '2026-01-02')
        self.assertEqual(response.json()['today_views'], 1)
        self.assertEqual(response.json()['last_7_days'][-1]['date'], '2026-01-02')

    def test_concurrent_ip_update_is_preserved(self):
        row = PageView.objects.create(unique_ips=['203.0.113.1'])
        stale_row = PageView.objects.get(pk=row.pk)
        PageView.objects.filter(pk=row.pk).update(count=1, unique_ips=['203.0.113.1', '203.0.113.2'])
        with patch.object(PageView.objects, 'get_or_create', return_value=(stale_row, False)):
            PageView.record('203.0.113.3')
        row.refresh_from_db()
        self.assertEqual(row.count, 2)
        self.assertEqual(set(row.unique_ips), {'203.0.113.1', '203.0.113.2', '203.0.113.3'})


class PageViewMigrationTests(TransactionTestCase):
    old_target = [('api', '0004_add_workexperience_logo')]
    new_target = [('api', '0005_secure_contacts_and_pageviews')]

    def test_existing_duplicates_merge_without_losing_statistics(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.old_target)
        self.addCleanup(lambda: MigrationExecutor(connection).migrate(self.new_target))
        old_apps = executor.loader.project_state(self.old_target).apps
        OldPageView = old_apps.get_model('api', 'PageView')
        OldPageView.objects.create(count=3, unique_ips=['203.0.113.1'])
        OldPageView.objects.create(count=5, unique_ips=['203.0.113.1', '203.0.113.2'])
        executor = MigrationExecutor(connection)
        executor.migrate(self.new_target)
        row = PageView.objects.get()
        self.assertEqual(row.count, 8)
        self.assertEqual(set(row.unique_ips), {'203.0.113.1', '203.0.113.2'})
        self.assertEqual(self.client.get('/api/stats/').status_code, 200)
