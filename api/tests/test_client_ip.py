from django.test import RequestFactory, SimpleTestCase, override_settings

from api.client_ip import get_client_ip


class ClientIPTests(SimpleTestCase):
    def request(self, peer, forwarded=''):
        return RequestFactory().get('/', REMOTE_ADDR=peer, HTTP_X_FORWARDED_FOR=forwarded)

    @override_settings(TRUSTED_PROXY_IPS=[])
    def test_untrusted_peer_cannot_override_ip(self):
        self.assertEqual(get_client_ip(self.request('203.0.113.1', '198.51.100.99')), '203.0.113.1')

    @override_settings(TRUSTED_PROXY_IPS=['127.0.0.1', '10.0.0.0/24', '::1'])
    def test_trusted_proxy_chain_is_read_from_right_to_left(self):
        request = self.request('127.0.0.1', '198.51.100.99, 203.0.113.1, 10.0.0.2')
        self.assertEqual(get_client_ip(request), '203.0.113.1')
        self.assertEqual(get_client_ip(self.request('::1', '2001:db8::1')), '2001:db8::1')

    @override_settings(TRUSTED_PROXY_IPS=['127.0.0.1'])
    def test_malformed_header_falls_back_to_peer(self):
        self.assertEqual(get_client_ip(self.request('127.0.0.1', 'not-an-ip')), '127.0.0.1')
        self.assertIsNone(get_client_ip(self.request('not-an-ip', '203.0.113.1')))
