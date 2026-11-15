import logging

from django.db import DatabaseError

from .client_ip import get_client_ip

logger = logging.getLogger(__name__)


class PageViewMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        skip = (
            request.method != 'GET' or
            request.path.startswith('/api/') or
            request.path.startswith('/admin/') or
            request.path.startswith('/static/') or
            request.path.startswith('/media/')
        )
        if not skip:
            self._record(request)
        return response

    def _record(self, request):
        try:
            from .models import PageView
            PageView.record(get_client_ip(request))
        except DatabaseError:
            logger.exception('Could not record page view')

