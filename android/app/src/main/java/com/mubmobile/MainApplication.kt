package com.mubmobile

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.mubmobile.VoiceRecognizerPackage

class MainApplication : Application(), ReactApplication {

  override fun onCreate() {
    super.onCreate()
    android.util.Log.d("VoiceRecognizer", "MainApplication onCreate, adding package")
    loadReactNative(this)
  }

  override val reactHost: ReactHost by lazy {
    android.util.Log.d("VoiceRecognizer", "Building reactHost")
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          android.util.Log.d("VoiceRecognizer", "Adding VoiceRecognizerPackage")
          add(VoiceRecognizerPackage())
        },
    )
  }
}
