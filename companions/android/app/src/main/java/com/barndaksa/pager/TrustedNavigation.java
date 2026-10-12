package com.barndaksa.pager;

import java.net.URI;

public final class TrustedNavigation {
    public static boolean allowed(String value) {
        try {
            URI uri = new URI(value);
            return "https".equalsIgnoreCase(uri.getScheme()) && "barndaksa.com".equalsIgnoreCase(uri.getHost())
                && uri.getUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (Exception ex) { return false; }
    }
}
