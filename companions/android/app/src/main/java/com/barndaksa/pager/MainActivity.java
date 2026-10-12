package com.barndaksa.pager;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private TextView status;
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        root.setGravity(Gravity.CENTER_VERTICAL);
        root.setPadding(32, 48, 32, 48);
        root.setBackgroundColor(Color.rgb(247,245,239));
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(32 + insets.getSystemWindowInsetLeft(), 32 + insets.getSystemWindowInsetTop(), 32 + insets.getSystemWindowInsetRight(), 32 + insets.getSystemWindowInsetBottom());
            return insets;
        });
        TextView title = new TextView(this); title.setText("نداء برندة"); title.setTextSize(30); title.setTextColor(Color.rgb(33,56,47)); root.addView(title);
        status = new TextView(this); status.setTextSize(17); status.setPadding(0,24,0,24); root.addView(status);
        addButton(root, "السماح بالظهور فوق التطبيقات", () -> {
            try { startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()))); }
            catch (RuntimeException ex) { Toast.makeText(this,"افتح إعدادات الجهاز ثم صلاحية الظهور فوق التطبيقات لنداء برندة",Toast.LENGTH_LONG).show(); }
        });
        addButton(root, "فتح نافذة الموظف", () -> open(false));
        addButton(root, "فتح نافذة المالك", () -> open(true));
        addButton(root, "إغلاق النافذة العائمة", () -> stopService(new Intent(this, OverlayService.class)));
        TextView note = new TextView(this); note.setText("تسجل الدخول بحسابك في المنصة ثم تنتقل إلى تطبيق الكاشير وتبقى نافذة النداء ظاهرة\nاسحب عنوان النافذة لتحريكها واستخدم زر التصغير لإخفاء التفاصيل\nقد تمنع بعض تطبيقات الدفع أو الأجهزة المدارة ظهور النوافذ فوقها"); note.setTextSize(15); note.setPadding(0,24,0,0); root.addView(note);
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
    }
    private void addButton(LinearLayout root, String text, Runnable action) {
        Button button = new Button(this); button.setText(text); button.setMinHeight(56); button.setOnClickListener(v -> action.run()); root.addView(button, new LinearLayout.LayoutParams(-1,-2));
    }
    @Override public void onResume() { super.onResume(); if (status != null) status.setText(Settings.canDrawOverlays(this) ? "الصلاحية مفعلة اختر حسابك لفتح النافذة" : "فعّل صلاحية الظهور فوق التطبيقات أولًا ثم ارجع هنا"); }
    private void open(boolean owner) {
        if (!Settings.canDrawOverlays(this)) { Toast.makeText(this,"فعّل صلاحية الظهور فوق التطبيقات أولًا",Toast.LENGTH_LONG).show(); return; }
        try { startForegroundService(new Intent(this, OverlayService.class).putExtra("owner",owner)); }
        catch (RuntimeException ex) { Toast.makeText(this,"تعذر تشغيل النافذة تحقق من صلاحيات التطبيق ثم حاول مجددًا",Toast.LENGTH_LONG).show(); }
    }
}
