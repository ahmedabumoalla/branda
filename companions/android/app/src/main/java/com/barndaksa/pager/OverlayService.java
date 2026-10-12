package com.barndaksa.pager;

import android.app.*;
import android.content.*;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.view.inputmethod.InputMethodManager;
import android.webkit.*;
import android.widget.*;

public final class OverlayService extends Service {
    private WindowManager manager;
    private WindowManager.LayoutParams params;
    private LinearLayout panel;
    private WebView web;
    private TextView message;
    private Button collapseButton;
    private AlertDialog activeDialog;
    private boolean owner, collapsed, receiverRegistered;
    private final BroadcastReceiver screenOff = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) { if (Intent.ACTION_SCREEN_OFF.equals(i.getAction())) stopSelf(); }
    };
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || "close".equals(intent.getAction()) || !Settings.canDrawOverlays(this)) { stopSelf(); return START_NOT_STICKY; }
        if (panel != null) return START_NOT_STICKY;
        owner = intent.getBooleanExtra("owner",false);
        NotificationManager notifications = getSystemService(NotificationManager.class);
        notifications.createNotificationChannel(new NotificationChannel("pager", "نافذة نداء برندة", NotificationManager.IMPORTANCE_LOW));
        PendingIntent close = PendingIntent.getService(this, 1, new Intent(this,OverlayService.class).setAction("close"), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent reopen = PendingIntent.getActivity(this,2,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        startForeground(1,new Notification.Builder(this,"pager").setSmallIcon(R.drawable.ic_pager).setContentTitle("نافذة نداء برندة تعمل").setContentText("اضغط لفتح الإعدادات أو أغلق النافذة عند انتهاء العمل").setContentIntent(reopen).addAction(new Notification.Action.Builder(null,"إغلاق النافذة",close).build()).setOngoing(true).build());
        manager = getSystemService(WindowManager.class);
        try { createPanel(); }
        catch (RuntimeException ex) { Toast.makeText(this,"تعذر عرض النافذة تحقق من صلاحية الظهور فوق التطبيقات",Toast.LENGTH_LONG).show(); stopSelf(); }
        return START_NOT_STICKY;
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private String home() { return owner ? "https://barndaksa.com/dashboard/pager" : "https://barndaksa.com/pager"; }
    private Button button(String label, Runnable action) {
        Button b = new Button(this); b.setText(label); b.setTextSize(13); b.setMinWidth(dp(48)); b.setMinimumWidth(dp(48)); b.setPadding(dp(8),0,dp(8),0); b.setOnClickListener(v -> action.run()); return b;
    }
    private void createPanel() {
        params = new WindowManager.LayoutParams(dp(380),dp(640),WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.START; params.x = dp(12); params.y = dp(40);
        params.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
        panel = new LinearLayout(this) {
            @Override public boolean dispatchTouchEvent(MotionEvent event) { if (event.getAction()==MotionEvent.ACTION_OUTSIDE) unfocus(); return super.dispatchTouchEvent(event); }
        }; panel.setOrientation(LinearLayout.VERTICAL); panel.setLayoutDirection(View.LAYOUT_DIRECTION_RTL); panel.setBackgroundColor(Color.rgb(247,245,239)); panel.setElevation(dp(12));
        LinearLayout header = new LinearLayout(this); header.setGravity(Gravity.CENTER_VERTICAL); header.setBackgroundColor(Color.rgb(38,67,53));
        final float[] touch = new float[4];
        TextView drag = new TextView(this) {
            @Override public boolean onTouchEvent(MotionEvent e) {
                if(e.getAction()==MotionEvent.ACTION_DOWN){touch[0]=e.getRawX();touch[1]=e.getRawY();touch[2]=params.x;touch[3]=params.y;return true;}
                if(e.getAction()==MotionEvent.ACTION_MOVE){params.x=(int)(touch[2]-(e.getRawX()-touch[0]));params.y=(int)(touch[3]+e.getRawY()-touch[1]);resize();return true;}
                if(e.getAction()==MotionEvent.ACTION_UP){if(Math.abs(e.getRawX()-touch[0])+Math.abs(e.getRawY()-touch[1])<dp(8))performClick();return true;}return super.onTouchEvent(e);
            }
            @Override public boolean performClick(){super.performClick();showPositions();return true;}
        };
        drag.setText("نداء برندة ↔"); drag.setContentDescription("تحريك النافذة بالسحب أو اختيار الموضع"); drag.setFocusable(true); drag.setClickable(true); drag.setTextSize(16); drag.setTextColor(Color.WHITE); drag.setPadding(dp(8),0,dp(8),0); header.addView(drag,new LinearLayout.LayoutParams(0,dp(52),1));
        collapseButton=button("تصغير",()->{collapsed=!collapsed;collapseButton.setText(collapsed?"تكبير":"تصغير");web.setVisibility(collapsed?View.GONE:View.VISIBLE);message.setVisibility(View.GONE);unfocus();resize();});header.addView(collapseButton);
        header.addView(button("إغلاق",this::stopSelf)); panel.addView(header);
        LinearLayout toolbar=new LinearLayout(this);
        toolbar.addView(button("النداء",()->web.loadUrl(home())));
        toolbar.addView(button("تحديث",()->web.reload()));
        toolbar.addView(button("الدخول",()->web.loadUrl(owner?"https://barndaksa.com/login":"https://barndaksa.com/cashier/login")));
        panel.addView(toolbar);
        message=new TextView(this);message.setTextSize(14);message.setPadding(dp(12),dp(8),dp(12),dp(8));message.setVisibility(View.GONE);panel.addView(message);
        web=new WebView(this) {
            @Override public boolean dispatchTouchEvent(MotionEvent e){if(e.getAction()==MotionEvent.ACTION_DOWN)focusPanel();return super.dispatchTouchEvent(e);}
            @Override public boolean performAccessibilityAction(int action,Bundle arguments){focusPanel();return super.performAccessibilityAction(action,arguments);}
        };
        // The trusted Next.js console requires JavaScript; there is no native JS bridge.
        web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);web.getSettings().setAllowContentAccess(false);web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.getSettings().setUserAgentString(web.getSettings().getUserAgentString()+" BrandaPagerNative/1.0");
        CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return !TrustedNavigation.allowed(r.getUrl().toString());}
            @Override public void onPageFinished(WebView v,String url){CookieManager.getInstance().flush();}
            @Override public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError e){if(r.isForMainFrame()){message.setText("تعذر الاتصال بالمنصة تحقق من الإنترنت ثم اضغط تحديث");message.setVisibility(View.VISIBLE);}}
            @Override public void onPageStarted(WebView v,String url,android.graphics.Bitmap icon){message.setVisibility(View.GONE);}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onJsConfirm(WebView v,String url,String text,JsResult result){
                if(!TrustedNavigation.allowed(url)){result.cancel();return true;}
                AlertDialog dialog=new AlertDialog.Builder(new ContextThemeWrapper(OverlayService.this,android.R.style.Theme_Material_Light_Dialog_Alert)).setMessage(text).setPositiveButton("تأكيد",(d,w)->result.confirm()).setNegativeButton("رجوع",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).create();
                showDialog(dialog);return true;
            }
        });
        panel.addView(web,new LinearLayout.LayoutParams(-1,0,1));
        clampBounds(); manager.addView(panel,params);
        if(Build.VERSION.SDK_INT>=33)registerReceiver(screenOff,new IntentFilter(Intent.ACTION_SCREEN_OFF),Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(screenOff,new IntentFilter(Intent.ACTION_SCREEN_OFF));
        receiverRegistered=true;
        web.loadUrl(owner?"https://barndaksa.com/login":home());
    }
    private void showPositions(){
        AlertDialog dialog=new AlertDialog.Builder(new ContextThemeWrapper(this,android.R.style.Theme_Material_Light_Dialog_Alert)).setTitle("موضع النافذة").setItems(new String[]{"أعلى اليمين","أعلى اليسار","أسفل اليمين","أسفل اليسار"},(d,which)->{params.x=(which%2==0)?0:getResources().getDisplayMetrics().widthPixels;params.y=which<2?dp(24):getResources().getDisplayMetrics().heightPixels;resize();}).create();
        showDialog(dialog);
    }
    private void showDialog(AlertDialog dialog){if(activeDialog!=null)activeDialog.dismiss();activeDialog=dialog;dialog.getWindow().setType(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY);dialog.show();}
    private void unfocus(){
        if(panel==null)return;
        getSystemService(InputMethodManager.class).hideSoftInputFromWindow(panel.getWindowToken(),0);
        params.flags|=WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;manager.updateViewLayout(panel,params);
    }
    private void focusPanel(){if(panel!=null&&panel.isAttachedToWindow()&&(params.flags&WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE)!=0){params.flags&=~WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;manager.updateViewLayout(panel,params);}}
    private void clampBounds(){
        int width=getResources().getDisplayMetrics().widthPixels, height=getResources().getDisplayMetrics().heightPixels;
        params.width=Math.min(dp(380),width-dp(16));params.height=collapsed?dp(108):Math.min(dp(640),height-dp(80));
        params.x=Math.max(0,Math.min(params.x,width-params.width));params.y=Math.max(dp(24),Math.min(params.y,height-params.height-dp(24)));
    }
    private void resize(){if(panel!=null){clampBounds();manager.updateViewLayout(panel,params);}}
    @Override public void onConfigurationChanged(Configuration c){super.onConfigurationChanged(c);resize();}
    @Override public void onDestroy(){
        if(activeDialog!=null)activeDialog.dismiss();
        if(receiverRegistered)unregisterReceiver(screenOff);
        if(panel!=null&&panel.isAttachedToWindow())manager.removeView(panel);
        if(web!=null){web.stopLoading();web.destroy();}
        stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy();
    }
}
