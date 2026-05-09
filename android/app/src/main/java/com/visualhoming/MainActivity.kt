package com.visualhoming

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.Button
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AlertDialog

class MainActivity : AppCompatActivity() {
    
    private lateinit var webView: WebView
    private var piHost = "visual-homing.local"
    private var piPort = 5000
    
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        webView = findViewById(R.id.webView)
        
        // Configure WebView
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            builtInZoomControls = true
            displayZoomControls = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }
        
        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedError(
                view: WebView?,
                errorCode: Int,
                description: String?,
                failingUrl: String?
            ) {
                runOnUiThread {
                    showConnectionDialog()
                }
            }
        }
        
        // Setup buttons
        findViewById<Button>(R.id.btnConnect).setOnClickListener {
            showConnectionDialog()
        }
        
        findViewById<Button>(R.id.btnRefresh).setOnClickListener {
            webView.reload()
        }
        
        // Load Pi interface
        loadPiInterface()
    }
    
    private fun loadPiInterface() {
        val url = "http://$piHost:$piPort"
        webView.loadUrl(url)
        Toast.makeText(this, "Connecting to $url", Toast.LENGTH_SHORT).show()
    }
    
    private fun showConnectionDialog() {
        val dialogView = layoutInflater.inflate(R.layout.dialog_connect, null)
        val editHost = dialogView.findViewById<EditText>(R.id.editHost)
        val editPort = dialogView.findViewById<EditText>(R.id.editPort)
        
        editHost.setText(piHost)
        editPort.setText(piPort.toString())
        
        AlertDialog.Builder(this)
            .setTitle("Connect to Raspberry Pi")
            .setView(dialogView)
            .setPositiveButton("Connect") { _, _ ->
                piHost = editHost.text.toString()
                piPort = editPort.text.toString().toIntOrNull() ?: 5000
                loadPiInterface()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
    
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
