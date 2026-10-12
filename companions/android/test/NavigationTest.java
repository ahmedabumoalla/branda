import com.barndaksa.pager.TrustedNavigation;

public final class NavigationTest {
    public static void main(String[] args) {
        String[] allowed = {"https://barndaksa.com/pager", "https://barndaksa.com:443/login", "https://barndaksa.com/dashboard/pager?source=native"};
        String[] denied = {"http://barndaksa.com/pager", "https://barndaksa.com.evil.test", "https://barndaksa.com@evil.test", "https://evil.test@barndaksa.com", "javascript:alert(1)", "file:///tmp/data", "content://private", "intent://open", "https://barndaksa.com:444", "https://barndaksa.com\\@evil.test", "", null};
        for (String value : allowed) if (!TrustedNavigation.allowed(value)) throw new AssertionError("Trusted URL rejected");
        for (String value : denied) if (TrustedNavigation.allowed(value)) throw new AssertionError("Untrusted URL accepted");
        System.out.println("15 navigation boundary checks passed");
    }
}
