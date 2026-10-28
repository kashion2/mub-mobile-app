# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# ─── React Native ───
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# ─── react-native-voice-to-text ───
-keep class com.voicetotext.** { *; }
-keep class com.voicetotext.VoiceToTextModule { *; }
-keep class com.voicetotext.VoiceToTextPackage { *; }
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod <methods>;
}

# ─── Android Speech Recognizer (built-in) ───
-keep class android.speech.** { *; }
-keep class android.speech.RecognitionService { *; }

# ─── Firebase ───
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# ─── Notifee ───
-keep class io.invertase.notifee.** { *; }
-keep class app.notifee.** { *; }
-keep class app.notifee.core.** { *; }
-keep class app.notifee.notification.** { *; }
-dontwarn app.notifee.**

# ─── ML Kit Text Recognition ───
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_text.** { *; }
-keep class com.rnmlkit.textrecognition.** { *; }
-dontwarn com.google.mlkit.**

# ─── Geolocation ───
-keep class com.reactnativecommunity.geolocation.** { *; }

# ─── TTS ───
-keep class net.no_mad.tts.** { *; }

# ─── Image Picker ───
-keep class com.imagepicker.** { *; }

# ─── AsyncStorage ───
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# ─── General safety for native modules ───
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
}
-keep class * extends com.facebook.react.bridge.ReactContextBaseJavaModule { *; }
-keep class * implements com.facebook.react.bridge.NativeModule { *; }

# ─── Keep React Native Libraries ───
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}

# ─── Hermes ───
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }

# ─── Custom Voice Recognizer ───
-keep class com.mubmobile.VoiceRecognizerModule { *; }
-keep class com.mubmobile.VoiceRecognizerPackage { *; }
-keep class android.speech.** { *; }
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod <methods>;
}
