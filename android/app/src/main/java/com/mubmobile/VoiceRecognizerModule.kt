package com.mubmobile

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.mubmobile.specs.NativeVoiceRecognizerSpec
import java.util.Locale

@ReactModule(name = VoiceRecognizerModule.NAME)
class VoiceRecognizerModule(reactContext: ReactApplicationContext) :
    NativeVoiceRecognizerSpec(reactContext) {

    private var speechRecognizer: SpeechRecognizer? = null
    private var pendingPromise: Promise? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var timeoutRunnable: Runnable? = null
    private var resolved = false

    override fun getName(): String = NAME

    private fun safeResolve(text: String) {
        if (resolved) return
        resolved = true
        timeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        timeoutRunnable = null
        try { speechRecognizer?.destroy() } catch (_: Throwable) {}
        speechRecognizer = null
        pendingPromise?.resolve(text)
        pendingPromise = null
    }

    private fun safeReject(code: String, message: String) {
        if (resolved) return
        resolved = true
        timeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        timeoutRunnable = null
        try { speechRecognizer?.destroy() } catch (_: Throwable) {}
        speechRecognizer = null
        pendingPromise?.reject(code, message)
        pendingPromise = null
    }

    override fun startListening(languageCode: String, promise: Promise) {
        if (!SpeechRecognizer.isRecognitionAvailable(reactApplicationContext)) {
            promise.reject("NOT_AVAILABLE", "Speech recognition not available")
            return
        }
        if (pendingPromise != null) {
            promise.reject("BUSY", "Recognition already in progress")
            return
        }

        pendingPromise = promise
        resolved = false

        mainHandler.post {
            try {
                speechRecognizer?.destroy()
                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(reactApplicationContext)

                speechRecognizer?.setRecognitionListener(object : RecognitionListener {
                    override fun onReadyForSpeech(params: Bundle?) {
                        Log.d(NAME, "ready - mic is capturing")
                    }
                    override fun onBeginningOfSpeech() { Log.d(NAME, "begin") }
                    override fun onRmsChanged(rmsdB: Float) {}
                    override fun onBufferReceived(buffer: ByteArray?) {}
                    override fun onEndOfSpeech() { Log.d(NAME, "end") }
                    override fun onPartialResults(partialResults: Bundle?) {
                        // Log partial results for debugging
                        val partialMatches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        if (partialMatches != null && partialMatches.isNotEmpty()) {
                            Log.d(NAME, "Partial result: ${partialMatches.firstOrNull()}")
                        }
                    }
                    override fun onEvent(eventType: Int, params: Bundle?) {}

                    override fun onError(error: Int) {
                        val msg = when (error) {
                            SpeechRecognizer.ERROR_AUDIO -> "Audio error"
                            SpeechRecognizer.ERROR_CLIENT -> "Client error"
                            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission not granted"
                            SpeechRecognizer.ERROR_NETWORK -> "Network error"
                            SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout"
                            SpeechRecognizer.ERROR_NO_MATCH -> "I did not hear anything"
                            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Recognizer busy"
                            SpeechRecognizer.ERROR_SERVER -> "Server error"
                            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech detected"
                            else -> "Recognition error $error"
                        }
                        Log.e(NAME, "onError code=$error msg=$msg")
                        safeReject("RECOGNITION_ERROR", msg)
                    }

                    override fun onResults(results: Bundle?) {
                        val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        if (matches != null && matches.isNotEmpty()) {
                            Log.d(NAME, "All results: $matches")
                            // Pick the best match: prefer shorter results (likely names over phrases)
                            // and prefer results without filler words
                            val best = matches.minByOrNull { it.length } ?: matches.firstOrNull()
                            Log.d(NAME, "Selected result: $best")
                            safeResolve(best ?: "")
                        } else {
                            Log.d(NAME, "No results")
                            safeResolve("")
                        }
                    }
                })

                // Enhanced intent for better name recognition accuracy
                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    // Use WEB_SEARCH model for better accuracy with names
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_WEB_SEARCH)
                    // Force English US for consistent recognition
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
                    // Get multiple results to pick the best match
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
                    // Reduced minimum speech length to allow short confirmations like "yes"
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 500L)
                    // Allow partial results for faster feedback
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    // Enable prefer offline for better accuracy when available
                    putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                }

                Log.d(NAME, "startListening with MINIMAL intent")
                speechRecognizer?.startListening(intent)

                timeoutRunnable = Runnable {
                    Log.e(NAME, "TIMEOUT after 20s")
                    safeReject("TIMEOUT", "No speech detected within 20 seconds")
                }
                mainHandler.postDelayed(timeoutRunnable!!, 20000)

            } catch (e: Throwable) {
                Log.e(NAME, "start failed: ${e.message}")
                safeReject("START_FAILED", e.message ?: "Failed to start recognizer")
            }
        }
    }

    override fun stopListening() {
        mainHandler.post {
            try { speechRecognizer?.stopListening() } catch (_: Throwable) {}
        }
    }

    override fun cancel() {
        safeReject("CANCELLED", "Cancelled")
    }

    override fun invalidate() {
        super.invalidate()
        try { speechRecognizer?.destroy() } catch (_: Throwable) {}
        speechRecognizer = null
        pendingPromise = null
    }

    companion object {
        const val NAME = "VoiceRecognizer"
    }
}
