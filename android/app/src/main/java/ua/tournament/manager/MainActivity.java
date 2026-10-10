package ua.tournament.manager;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.webkit.*;
import android.widget.FrameLayout;
import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends Activity {
 private WebView web;
 private FrameLayout container;
 private View fullscreen;
 private WebChromeClient.CustomViewCallback fullscreenCallback;
 private ValueCallback<Uri[]> fileCallback;
 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  container=new FrameLayout(this); web=new WebView(this); container.addView(web); setContentView(container);
  WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);settings.setMediaPlaybackRequiresUserGesture(true);
  WebViewAssetLoader loader=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
  web.setWebViewClient(new WebViewClient(){
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){return loader.shouldInterceptRequest(request.getUrl());}
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){Uri uri=request.getUrl();if("appassets.androidplatform.net".equals(uri.getHost()))return false;try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){}return true;}
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public void onShowCustomView(View view,CustomViewCallback callback){if(fullscreen!=null){callback.onCustomViewHidden();return;}fullscreen=view;fullscreenCallback=callback;web.setVisibility(View.GONE);container.addView(view,new FrameLayout.LayoutParams(-1,-1));}
   @Override public void onHideCustomView(){leaveFullscreen();}
   @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;try{startActivityForResult(params.createIntent(),100);return true;}catch(Exception e){fileCallback=null;return false;}}
  });
  if(state==null)web.loadUrl("https://appassets.androidplatform.net/assets/index.html");else web.restoreState(state);
 }
 private void leaveFullscreen(){if(fullscreen==null)return;container.removeView(fullscreen);fullscreen=null;web.setVisibility(View.VISIBLE);if(fullscreenCallback!=null){fullscreenCallback.onCustomViewHidden();fullscreenCallback=null;}}
 @Override public void onBackPressed(){if(fullscreen!=null){leaveFullscreen();return;}if(web.canGoBack())web.goBack();else super.onBackPressed();}
 @Override protected void onSaveInstanceState(Bundle state){super.onSaveInstanceState(state);web.saveState(state);}
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==100&&fileCallback!=null){fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));fileCallback=null;}}
}
