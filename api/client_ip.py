from ipaddress import ip_address, ip_network

from django.conf import settings


def get_client_ip(request):
    """Only accept forwarded addresses from explicitly trusted proxy networks."""
    try:
        peer = ip_address(request.META.get('REMOTE_ADDR', ''))
    except ValueError:
        return None

    trusted = [ip_network(value) for value in settings.TRUSTED_PROXY_IPS]

    def is_trusted(address):
        return any(address in network for network in trusted)

    if is_trusted(peer):
        forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
        if forwarded:
            try:
                chain = [ip_address(value.strip()) for value in forwarded.split(',')]
            except ValueError:
                return str(peer)
            # Proxies append the actual peer to the right of any client-supplied values.
            for address in reversed(chain):
                if not is_trusted(address):
                    return str(address)
            return str(chain[0])
    return str(peer)
