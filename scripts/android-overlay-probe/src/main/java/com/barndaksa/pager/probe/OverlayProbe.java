package com.barndaksa.pager.probe;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Instrumentation;
import android.app.UiAutomation;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;

/** Test-only helper: inspect interactive native windows, never WebView contents. */
public final class OverlayProbe extends Instrumentation {
    private String label;
    @Override public void onCreate(Bundle args) { label = args.getString("label", ""); start(); }
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            if (!"تصغير".equals(label) && !"تكبير".equals(label)) throw new AssertionError("Unexpected control");
            UiAutomation automation = getUiAutomation();
            AccessibilityServiceInfo info = automation.getServiceInfo();
            info.flags |= AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
            automation.setServiceInfo(info);
            for (int attempt = 0; attempt < 10; attempt++) {
                for (AccessibilityWindowInfo window : automation.getWindows()) {
                    AccessibilityNodeInfo root = window.getRoot();
                    if (root != null && "com.barndaksa.pager".contentEquals(root.getPackageName()) && click(root)) {
                        result.putString("stream", "PASS native overlay control"); finish(-1, result); return;
                    }
                }
                SystemClock.sleep(500);
            }
            throw new AssertionError("Interactive native control missing: " + label);
        } catch (Throwable error) {
            result.putString("stream", "FAIL " + error); finish(0, result);
        }
    }
    private boolean click(AccessibilityNodeInfo node) {
        if ("android.webkit.WebView".contentEquals(node.getClassName())) return false;
        if (label.contentEquals(node.getText() == null ? "" : node.getText()) && node.isVisibleToUser() && node.isClickable())
            return node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null && click(child)) return true;
        }
        return false;
    }
}
